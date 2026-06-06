import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import {
  gitlabAvailableProjects,
  gitlabConnections,
  gitlabUsers,
  projectGitlabUsers,
  projects
} from '@/db/drizzle/schema/gitlab/schema';
import { logger } from '@/lib/loger';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type {
  GitlabProject,
  GitlabProjectMember
} from './types/gitlab-api.types';

import { buildClient } from './gitlab.service';

/**
 * Сервис discovery: после привязки PAT-токена админом обходит весь
 * GitLab-инстанс по этому токену и наполняет три таблицы:
 *  — gitlab_available_projects (пул проектов, из которого админ выберет);
 *  — gitlab_users (все участники всех видимых проектов);
 *  — project_gitlab_users (m2m project↔gitlab_user с access_level).
 *
 * Это отдельная сущность от sync.service: discovery работает на уровне
 * connection (без records по commits/MR), а sync — на уровне отдельного
 * подключённого проекта (метрики).
 *
 * Идемпотентность: все upsert через `onConflictDoUpdate` по unique-индексам.
 * Уже подключённые `projects` ре-линкуются: запись в `gitlab_available_projects`
 * получает `connectedProjectUid`, чтобы фронт видел «✓ Подключён».
 *
 * Триггеры запуска:
 *  1. Автоматически при `createConnection` (см. gitlab.service).
 *  2. Вручную: `POST /api/admin/gitlab/connections/:uid/discover`
 *     (для refresh когда в GitLab добавили проекты/людей).
 *  3. Перед `connectProject` (см. projects.service) — гарантирует, что
 *     участники подключаемого проекта актуальны.
 */

export interface DiscoveryReport {
  connectionUid: string;
  durationMs: number;
  /** Сколько строк в gitlab_users появилось ИЛИ обновилось */
  gitlabUsersUpserted: number;
  /** Сколько связей project↔gitlab_user апсёртнуто */
  projectMembershipsUpserted: number;
  /** Сколько проектов GitLab прочитано через /projects?membership */
  projectsSeen: number;
  /** Сколько строк, которых уже нет в GitLab, размечено как stale (deleted) */
  staleEntriesRemoved: number;
}

/**
 * Полный прогон discovery для одного connection.
 * Шаги:
 *  1. fetchProjects() — список всех видимых;
 *  2. upsert в gitlab_available_projects;
 *  3. для каждого проекта параллельно (батчем) — fetchProjectMembers();
 *  4. upsert уникальных gitlab_users + project_gitlab_users;
 *  5. синхронизация флага connectedProjectUid;
 *  6. mark-stale: проекты/участники, которых уже нет в ответе GitLab,
 *     получают помету (lastSeenAt не обновлён) — UI может фильтровать.
 *
 * Не бросает ошибку при сбое отдельного fetchProjectMembers — логгирует
 * и продолжает, чтобы один проект без прав не валил всю операцию.
 */
export const runDiscovery = async (
  actorUid: string | undefined,
  connectionUid: string
): Promise<DiscoveryReport> => {
  const start = Date.now();

  const [connection] = await db
    .select()
    .from(gitlabConnections)
    .where(eq(gitlabConnections.uid, connectionUid));
  if (!connection) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'GitLab connection not found');
  }

  const client = await buildClient(connectionUid);

  // 1. fetch projects.
  let remoteProjects: GitlabProject[];
  try {
    remoteProjects = await client.fetchProjects();
  } catch (error) {
    await db
      .update(gitlabConnections)
      .set({ status: 'error', lastCheckedAt: new Date() })
      .where(eq(gitlabConnections.uid, connectionUid));
    throw error;
  }

  // 2. upsert проектов в пул.
  const projectsUpserted = await upsertAvailableProjects(connectionUid, remoteProjects);

  // 3. для каждого проекта подтягиваем участников.
  //    Лимитируем параллельность: GitLab rate-limit чувствителен к bursts.
  const membersByProject = new Map<number, GitlabProjectMember[]>();
  for (const project of remoteProjects) {
    try {
      const members = await client.fetchProjectMembers(project.id);
      membersByProject.set(project.id, members);
    } catch (error) {
      // Часто 403/404 на проектах, где у токена нет доступа к /members
      // (приватный проект без участия владельца токена). Не критично —
      // просто пропускаем.
      logger.warn(
        `discovery: skip members of project ${project.path_with_namespace ?? project.id}: ${(error as Error).message}`
      );
    }
  }

  // 4. собираем уникальных пользователей по connection (дедуп по gitlab_user_id).
  const uniqueMembers = new Map<number, GitlabProjectMember>();
  for (const members of membersByProject.values()) {
    for (const m of members) {
      if (!uniqueMembers.has(m.id)) uniqueMembers.set(m.id, m);
    }
  }

  // 4a. опционально обогащаем public_email через /users/:id (для тех, у
  //     кого его не было в /members). Дорого по запросам, поэтому делаем
  //     только для тех, у кого pulic_email/email отсутствует — это нужно
  //     для последующего provisioning (логин = email).
  for (const member of uniqueMembers.values()) {
    if (member.email || member.public_email) continue;
    try {
      const full = await client.fetchUserById(member.id);
      if (full.public_email) member.public_email = full.public_email;
      if (full.email) member.email = full.email;
    } catch (error) {
      logger.warn(
        `discovery: skip user details for ${member.username}: ${(error as Error).message}`
      );
    }
  }

  const gitlabUsersUpserted = await upsertGitlabUsers(connectionUid, [...uniqueMembers.values()]);

  // 5. m2m project↔gitlab_user.
  const projectMembershipsUpserted = await upsertProjectMemberships(
    connectionUid,
    remoteProjects,
    membersByProject
  );

  // 6. mark-stale (для UI: «этот участник больше не в GitLab, можно очистить»).
  const staleEntriesRemoved = await markStaleEntries(connectionUid, {
    seenProjectIds: remoteProjects.map((p) => p.id),
    seenUserIds: [...uniqueMembers.keys()]
  });

  // 7. финал.
  await db
    .update(gitlabConnections)
    .set({ status: 'active', lastCheckedAt: new Date() })
    .where(eq(gitlabConnections.uid, connectionUid));

  const report: DiscoveryReport = {
    connectionUid,
    projectsSeen: remoteProjects.length,
    gitlabUsersUpserted,
    projectMembershipsUpserted,
    staleEntriesRemoved,
    durationMs: Date.now() - start
  };

  logger.info(
    `discovery OK connection=${connectionUid} projects=${remoteProjects.length} ` +
      `users=${uniqueMembers.size} memberships=${projectMembershipsUpserted} stale=${staleEntriesRemoved} ` +
      `in ${report.durationMs}ms`
  );

  await recordAuditLog({
    userUid: actorUid,
    action: 'gitlab.discovery.completed',
    entityType: 'gitlab_connection',
    entityId: connectionUid,
    details: {
      projectsSeen: report.projectsSeen,
      gitlabUsersUpserted: report.gitlabUsersUpserted,
      projectMembershipsUpserted: report.projectMembershipsUpserted,
      projectsUpserted
    }
  });

  return report;
};

// ===========================================================================
// helpers
// ===========================================================================

const upsertAvailableProjects = async (
  connectionUid: string,
  remoteProjects: GitlabProject[]
): Promise<number> => {
  if (remoteProjects.length === 0) return 0;

  const now = new Date();

  // Сразу связать pool-запись с уже подключённым `projects` (если есть) —
  // нужно админу: UI рисует «✓ Подключён» против такой строки в списке пула.
  const connectedRows = await db
    .select({ uid: projects.uid, gitlabProjectId: projects.gitlabProjectId })
    .from(projects)
    .where(eq(projects.gitlabConnectionUid, connectionUid));
  const connectedByGitlabId = new Map(
    connectedRows.map((r) => [r.gitlabProjectId, r.uid] as const)
  );

  const values = remoteProjects.map((p) => ({
    gitlabConnectionUid: connectionUid,
    gitlabProjectId: p.id,
    name: p.name,
    namespace: p.namespace?.full_path ?? null,
    description: p.description,
    defaultBranch: p.default_branch,
    visibility: p.visibility,
    webUrl: p.web_url,
    lastActivityAt: p.last_activity_at ? new Date(p.last_activity_at) : null,
    connectedProjectUid: connectedByGitlabId.get(p.id) ?? null,
    lastSeenAt: now
  }));

  await db
    .insert(gitlabAvailableProjects)
    .values(values)
    .onConflictDoUpdate({
      target: [
        gitlabAvailableProjects.gitlabConnectionUid,
        gitlabAvailableProjects.gitlabProjectId
      ],
      set: {
        name: sql`excluded.name`,
        namespace: sql`excluded.namespace`,
        description: sql`excluded.description`,
        defaultBranch: sql`excluded.default_branch`,
        visibility: sql`excluded.visibility`,
        webUrl: sql`excluded.web_url`,
        lastActivityAt: sql`excluded.last_activity_at`,
        connectedProjectUid: sql`excluded.connected_project_uid`,
        lastSeenAt: sql`excluded.last_seen_at`
      }
    });

  return values.length;
};

const upsertGitlabUsers = async (
  connectionUid: string,
  members: GitlabProjectMember[]
): Promise<number> => {
  if (members.length === 0) return 0;

  const now = new Date();
  const values = members.map((m) => ({
    gitlabConnectionUid: connectionUid,
    gitlabUserId: m.id,
    gitlabUsername: m.username,
    name: m.name,
    // У админа PAT отдаёт `email`, у обычного — только `public_email` (если
    // юзер сам открыл). Берём первое непустое.
    email: m.email ?? m.public_email ?? null,
    avatarUrl: m.avatar_url ?? null,
    state: m.state,
    webUrl: m.web_url,
    lastSeenAt: now
  }));

  // ВНИМАНИЕ: не перетираем mapped_user_uid / is_provisioned — это решение
  // принимает provisioning.service. Discovery только обновляет «GitLab-сторону».
  await db
    .insert(gitlabUsers)
    .values(values)
    .onConflictDoUpdate({
      target: [gitlabUsers.gitlabConnectionUid, gitlabUsers.gitlabUserId],
      set: {
        gitlabUsername: sql`excluded.gitlab_username`,
        name: sql`excluded.name`,
        email: sql`excluded.email`,
        avatarUrl: sql`excluded.avatar_url`,
        state: sql`excluded.state`,
        webUrl: sql`excluded.web_url`,
        lastSeenAt: sql`excluded.last_seen_at`
      }
    });

  return values.length;
};

const upsertProjectMemberships = async (
  connectionUid: string,
  remoteProjects: GitlabProject[],
  membersByProject: Map<number, GitlabProjectMember[]>
): Promise<number> => {
  if (membersByProject.size === 0) return 0;

  // Для маппинга project_id (gitlab) → projects.uid нужно знать,
  // какие проекты на этом connection реально ПОДКЛЮЧЕНЫ (в нашей таблице
  // `projects`). Те, что только в pool (gitlab_available_projects), не имеют
  // FK-целиков для `project_gitlab_users.project_uid`. Это by-design:
  // memberships связаны только с подключёнными проектами.
  const connectedRows = await db
    .select({ uid: projects.uid, gitlabProjectId: projects.gitlabProjectId })
    .from(projects)
    .where(eq(projects.gitlabConnectionUid, connectionUid));
  const projectUidByGitlabId = new Map(
    connectedRows.map((r) => [r.gitlabProjectId, r.uid] as const)
  );

  if (projectUidByGitlabId.size === 0) {
    // Ни один проект ещё не подключён — связывать нечего.
    return 0;
  }

  // gitlab_users.uid по gitlab_user_id (для FK).
  const userIds = new Set<number>();
  for (const members of membersByProject.values()) {
    for (const m of members) userIds.add(m.id);
  }
  const userRows = await db
    .select({ uid: gitlabUsers.uid, gitlabUserId: gitlabUsers.gitlabUserId })
    .from(gitlabUsers)
    .where(
      and(
        eq(gitlabUsers.gitlabConnectionUid, connectionUid),
        inArray(gitlabUsers.gitlabUserId, [...userIds])
      )
    );
  const userUidByGitlabId = new Map(userRows.map((r) => [r.gitlabUserId, r.uid] as const));

  const now = new Date();
  const values: (typeof projectGitlabUsers.$inferInsert)[] = [];
  for (const remoteProject of remoteProjects) {
    const projectUid = projectUidByGitlabId.get(remoteProject.id);
    if (!projectUid) continue;
    const members = membersByProject.get(remoteProject.id) ?? [];
    for (const m of members) {
      const gitlabUserUid = userUidByGitlabId.get(m.id);
      if (!gitlabUserUid) continue;
      values.push({
        projectUid,
        gitlabUserUid,
        accessLevel: m.access_level ?? 30,
        lastSeenAt: now
      });
    }
  }

  if (values.length === 0) return 0;

  await db
    .insert(projectGitlabUsers)
    .values(values)
    .onConflictDoUpdate({
      target: [projectGitlabUsers.projectUid, projectGitlabUsers.gitlabUserUid],
      set: {
        accessLevel: sql`excluded.access_level`,
        lastSeenAt: sql`excluded.last_seen_at`
      }
    });

  return values.length;
};

/**
 * Stale-cleanup: удаляем из пула / membership записи, которых уже нет в GitLab.
 *
 * Для `gitlab_available_projects`: проекты, чьи gitlab_project_id не пришли в
 * этом discovery, удаляем — кроме тех, что связаны с подключённым `projects`
 * (если админ уже подключил, не теряем pool-запись даже если token потерял
 * доступ).
 *
 * Для `gitlab_users`: НЕ удаляем — могут оставаться в исторических commits/MR.
 * Только обновляем state в discovery (см. upsertGitlabUsers), фронт фильтрует
 * по `state='blocked'` или `lastSeenAt`.
 *
 * Возвращает суммарное число удалённых строк (только проекты).
 */
const markStaleEntries = async (
  connectionUid: string,
  seen: { seenProjectIds: number[]; seenUserIds: number[] }
): Promise<number> => {
  if (seen.seenProjectIds.length === 0) return 0;

  // Сначала — удалить из пула проекты, которые НЕ пришли и НЕ подключены.
  const result = await db
    .delete(gitlabAvailableProjects)
    .where(
      and(
        eq(gitlabAvailableProjects.gitlabConnectionUid, connectionUid),
        notInArray(gitlabAvailableProjects.gitlabProjectId, seen.seenProjectIds),
        isNull(gitlabAvailableProjects.connectedProjectUid)
      )
    )
    .returning({ uid: gitlabAvailableProjects.uid });

  return result.length;
};
