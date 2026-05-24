import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import {
  gitlabAvailableProjects,
  gitlabConnections,
  projects,
  syncStatuses
} from '@/db/drizzle/schema/gitlab/schema';
import { teamProjects, teams } from '@/db/drizzle/schema/teams/schema';
import { logger } from '@/lib/loger';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { runDiscovery } from '@/modules/gitlab/discovery.service';
import { buildClient } from '@/modules/gitlab/gitlab.service';
import * as SyncService from '@/modules/sync/sync.service';
import * as ProvisioningService from '@/modules/users-admin/provisioning.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type {
  ConnectProjectDto,
  UpdateIncidentLabelsDto,
  UpdateProjectDto
} from './dto/connect-project.dto';

/**
 * Сервис проектов (UC-01: подключение проекта GitLab к CherryGit).
 *
 * Ключевые решения:
 *  — повторное подключение одного проекта к одному инстансу запрещено
 *    Postgres unique constraint `uq_project_per_connection`; нарушение
 *    отлавливается по коду 23505 и маппится в HTTP 409;
 *  — метаданные проекта (name/description/namespace) подтягиваются с GitLab
 *    в момент подключения, чтобы не доверять клиенту произвольным значениям;
 *  — sync_statuses создаётся одновременно с проектом (idle): следующий цикл
 *    планировщика подхватит проект автоматически. Дополнительно делаем
 *    fire-and-forget вызов SyncService.syncProject — это «бутстрап-задача»
 *    из требования 1.2; пока sync не реализован, вызов вернёт 501 и
 *    залогируется как warning, не ломая подключение проекта.
 */

/** Код PostgreSQL для нарушения unique constraint. */
const PG_UNIQUE_VIOLATION = '23505';

/** Список проектов с привязанными командами и временем последнего sync. */
export const listProjects = async () => {
  const rows = await db
    .select({
      project: projects,
      team: teams,
      lastSyncAt: syncStatuses.lastSyncAt
    })
    .from(projects)
    .leftJoin(teamProjects, eq(teamProjects.projectUid, projects.uid))
    .leftJoin(teams, eq(teams.uid, teamProjects.teamUid))
    .leftJoin(syncStatuses, eq(syncStatuses.projectUid, projects.uid));

  interface Item {
    createdAt: Date;
    defaultBranch: string | null;
    description: string | null;
    gitlabConnectionUid: string;
    gitlabProjectId: number;
    hotfixLabels: string[];
    lastSyncAt: Date | null;
    name: string;
    namespace: string | null;
    releaseTagPattern: string;
    revertLabels: string[];
    teams: { uid: string; name: string }[];
    uid: string;
    updatedAt: Date;
  }

  // Сворачиваем строки в плоский объект + teams[] (group by project.uid).
  const grouped = new Map<string, Item>();
  for (const row of rows) {
    const existing = grouped.get(row.project.uid);
    if (existing) {
      if (row.team && !existing.teams.some((t) => t.uid === row.team!.uid)) {
        existing.teams.push({ uid: row.team.uid, name: row.team.name });
      }
    } else {
      grouped.set(row.project.uid, {
        uid: row.project.uid,
        gitlabConnectionUid: row.project.gitlabConnectionUid,
        gitlabProjectId: row.project.gitlabProjectId,
        name: row.project.name,
        namespace: row.project.namespace,
        description: row.project.description,
        defaultBranch: row.project.defaultBranch,
        releaseTagPattern: row.project.releaseTagPattern,
        hotfixLabels: row.project.hotfixLabels,
        revertLabels: row.project.revertLabels,
        createdAt: row.project.createdAt,
        updatedAt: row.project.updatedAt,
        lastSyncAt: row.lastSyncAt,
        teams: row.team ? [{ uid: row.team.uid, name: row.team.name }] : []
      });
    }
  }

  return [...grouped.values()];
};

export const getProject = async (uid: string) => {
  const [project] = await db.select().from(projects).where(eq(projects.uid, uid));
  if (!project) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
  }

  const teamsRows = await db
    .select({ uid: teams.uid, name: teams.name })
    .from(teamProjects)
    .innerJoin(teams, eq(teams.uid, teamProjects.teamUid))
    .where(eq(teamProjects.projectUid, uid));

  const [syncStatus] = await db.select().from(syncStatuses).where(eq(syncStatuses.projectUid, uid));

  return { project, teams: teamsRows, syncStatus: syncStatus ?? null };
};

/**
 * Подключение проекта GitLab к CherryGit (новый флоу).
 *
 * Принимает `availableProjectUid` — UID записи из пула discovery
 * (`gitlab_available_projects`). Эта запись хранит `gitlab_connection_uid`
 * и `gitlab_project_id`, поэтому клиенту не нужно передавать их отдельно.
 *
 * Алгоритм:
 *  1. Загрузка pool-записи + её connection; 404 если пуло-запись не найдена.
 *  2. 409, если запись уже подключена (connectedProjectUid != null).
 *  3. Запрос актуальных метаданных проекта с GitLab (defaultBranch, имя
 *     могли поменяться с момента discovery).
 *  4. INSERT в `projects` + `sync_statuses` (idle) + обновление
 *     `gitlab_available_projects.connectedProjectUid`.
 *  5. Повторный discovery — обновляет membership этого проекта в
 *     `project_gitlab_users` (за время с discovery в GitLab могли
 *     добавиться/уйти участники).
 *  6. **Синхронный provisioning** всех новых gitlab_users этого проекта —
 *     создаются CherryGit-юзера с временными паролями. Результат
 *     `ProvisionReport` возвращается админу в HTTP-ответе (один раз!).
 *  7. Fire-and-forget syncProject — фоновый сбор commits/MR/tags для метрик.
 *  8. Audit.
 */
export interface ConnectProjectResult {
  project: typeof projects.$inferSelect;
  /**
   * Отчёт о провижининге участников проекта.
   * Включает plaintext-пароли (только для status='created') — UI должен
   * показать их ОДИН раз: после reload они уже недоступны.
   */
  provisioning: Awaited<ReturnType<typeof ProvisioningService.provisionForProject>>;
}

export const connectProject = async (
  actorUid: string,
  dto: ConnectProjectDto
): Promise<ConnectProjectResult> => {
  // 1. Загрузка pool-записи.
  const [available] = await db
    .select()
    .from(gitlabAvailableProjects)
    .where(eq(gitlabAvailableProjects.uid, dto.availableProjectUid));
  if (!available) {
    throw new CustomError(
      HttpStatus.NOT_FOUND,
      'проект не найден в пуле discovery; запустите discovery подключения заново'
    );
  }
  if (available.connectedProjectUid) {
    throw new CustomError(HttpStatus.CONFLICT, 'этот проект уже подключён');
  }

  const [connection] = await db
    .select()
    .from(gitlabConnections)
    .where(eq(gitlabConnections.uid, available.gitlabConnectionUid));
  if (!connection) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'GitLab connection not found');
  }

  // 2. Метаданные проекта (через client — берём актуальный default_branch и пр.).
  const client = await buildClient(available.gitlabConnectionUid);
  const remote = await client.fetchProject(available.gitlabProjectId);

  // 3. Создание `projects` + `sync_statuses` + обновление пула.
  let created: typeof projects.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({
          gitlabConnectionUid: available.gitlabConnectionUid,
          gitlabProjectId: available.gitlabProjectId,
          name: remote.name,
          description: remote.description,
          namespace: remote.namespace.full_path,
          defaultBranch: remote.default_branch,
          ...(dto.releaseTagPattern !== undefined && { releaseTagPattern: dto.releaseTagPattern }),
          ...(dto.hotfixLabels !== undefined && { hotfixLabels: dto.hotfixLabels }),
          ...(dto.revertLabels !== undefined && { revertLabels: dto.revertLabels })
        })
        .returning();

      await tx.insert(syncStatuses).values({ projectUid: project.uid, status: 'idle' });

      await tx
        .update(gitlabAvailableProjects)
        .set({ connectedProjectUid: project.uid })
        .where(eq(gitlabAvailableProjects.uid, available.uid));

      return project;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CustomError(
        HttpStatus.CONFLICT,
        'Этот проект уже подключён к данному GitLab-инстансу'
      );
    }
    throw error;
  }

  // 4. Повторный discovery — обновит project_gitlab_users этого проекта.
  //    Делаем синхронно, иначе provisioning ниже не увидит участников.
  try {
    await runDiscovery(actorUid, available.gitlabConnectionUid);
  } catch (err) {
    logger.warn(
      `connectProject: discovery refresh failed for connection ${available.gitlabConnectionUid}: ${(err as Error).message}`
    );
  }

  // 5. Provisioning — синхронно. Чем быстрее админ получит ответ с
  //    временными паролями, тем лучше; provision-цикл укладывается в
  //    миллисекунды на проект-команду размером десятки людей.
  let provisioning: ConnectProjectResult['provisioning'];
  try {
    provisioning = await ProvisioningService.provisionForProject(actorUid, created.uid);
  } catch (err) {
    logger.warn(
      `connectProject: provisioning failed for project ${created.uid}: ${(err as Error).message}`
    );
    provisioning = { attempted: 0, created: 0, reused: 0, skipped: 0, records: [] };
  }

  // 6. Audit.
  await recordAuditLog({
    userUid: actorUid,
    action: 'project.connected',
    entityType: 'project',
    entityId: created.uid,
    details: {
      gitlabConnectionUid: available.gitlabConnectionUid,
      gitlabProjectId: available.gitlabProjectId,
      availableProjectUid: available.uid,
      name: created.name,
      namespace: created.namespace,
      provisioning: {
        attempted: provisioning.attempted,
        created: provisioning.created,
        reused: provisioning.reused,
        skipped: provisioning.skipped
      }
    }
  });

  // 7. Бутстрап-задача: запускаем первичный sync в фоне.
  void SyncService.syncProject(actorUid, created.uid).catch((err: Error) => {
    logger.warn(
      `Initial sync skipped for project ${created.uid} (${remote.path_with_namespace}): ${err.message}`
    );
  });

  return { project: created, provisioning };
};

/**
 * Обновление настроек проекта. Допустимые изменения:
 *  — releaseTagPattern (glob тегов деплоя)
 *  — hotfixLabels / revertLabels (наборы меток MR для CFR, FR-03)
 *  — teamUids (полная замена набора команд)
 */
export const updateProject = async (uid: string, dto: UpdateProjectDto, actorUid: string) => {
  const [existing] = await db.select().from(projects).where(eq(projects.uid, uid));
  if (!existing) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
  }

  // Валидация команд: все uid должны существовать.
  if (dto.teamUids && dto.teamUids.length > 0) {
    const found = await db
      .select({ uid: teams.uid })
      .from(teams)
      .where(inArray(teams.uid, dto.teamUids));
    if (found.length !== dto.teamUids.length) {
      throw new CustomError(HttpStatus.BAD_REQUEST, 'Одна или несколько teamUids не существуют');
    }
  }

  const patch: Partial<typeof projects.$inferInsert> = {};
  if (dto.releaseTagPattern !== undefined) patch.releaseTagPattern = dto.releaseTagPattern;
  if (dto.hotfixLabels !== undefined) patch.hotfixLabels = dto.hotfixLabels;
  if (dto.revertLabels !== undefined) patch.revertLabels = dto.revertLabels;

  const updated = await db.transaction(async (tx) => {
    let result = existing;
    if (Object.keys(patch).length > 0) {
      const [row] = await tx.update(projects).set(patch).where(eq(projects.uid, uid)).returning();
      result = row;
    }

    // Полная замена команд: удалить все и вставить новые.
    if (dto.teamUids !== undefined) {
      await tx.delete(teamProjects).where(eq(teamProjects.projectUid, uid));
      if (dto.teamUids.length > 0) {
        await tx
          .insert(teamProjects)
          .values(dto.teamUids.map((teamUid) => ({ teamUid, projectUid: uid })));
      }
    }

    return result;
  });

  await recordAuditLog({
    userUid: actorUid,
    action: 'project.updated',
    entityType: 'project',
    entityId: uid,
    details: {
      changedFields: Object.keys(patch),
      teamsChanged: dto.teamUids !== undefined,
      newTeamUids: dto.teamUids
    }
  });

  return updated;
};

/**
 * Отключение проекта от системы. Снимает связи с командами, удаляет
 * запись sync_statuses и снимает флаг connectedProjectUid в пуле discovery
 * (после этого pool-запись снова доступна для «подключить»).
 *
 * Связанные commits/merge_requests/deployments/project_gitlab_users
 * остаются в БД для исторических метрик (cascade-удаление НЕ применяется
 * намеренно — данные ценны и после отключения).
 */
export const deleteProject = async (actorUid: string, uid: string) => {
  const [existing] = await db.select().from(projects).where(eq(projects.uid, uid));
  if (!existing) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
  }

  await db.transaction(async (tx) => {
    await tx.delete(teamProjects).where(eq(teamProjects.projectUid, uid));
    await tx.delete(syncStatuses).where(eq(syncStatuses.projectUid, uid));
    await tx
      .update(gitlabAvailableProjects)
      .set({ connectedProjectUid: null })
      .where(eq(gitlabAvailableProjects.connectedProjectUid, uid));
    await tx.delete(projects).where(eq(projects.uid, uid));
  });

  await recordAuditLog({
    userUid: actorUid,
    action: 'project.disconnected',
    entityType: 'project',
    entityId: uid,
    details: {
      name: existing.name,
      namespace: existing.namespace,
      gitlabProjectId: existing.gitlabProjectId
    }
  });
};

/**
 * Точечное обновление наборов меток инцидентов (FR-03, доработка 1.4).
 *
 * Отдельный endpoint от общего PATCH удобен тем, что в журнале аудита
 * остаётся «срез до/после» именно по меткам, не размываясь другими
 * полями (releaseTagPattern, teamUids).
 *
 * После обновления админу следует вызвать `triggerResync` — текущие записи
 * `merge_requests.hasHotfixLabel`/`hasRevertLabel` и `deployments.isHotfix`/
 * `isRevert` пересчитаются на основе новых меток (см. sync.service:
 * upsertMergeRequest и linkDeploymentsToMergeRequests).
 */
export const updateIncidentLabels = async (
  actorUid: string,
  uid: string,
  dto: UpdateIncidentLabelsDto
) => {
  const [existing] = await db.select().from(projects).where(eq(projects.uid, uid));
  if (!existing) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
  }

  const patch: Partial<typeof projects.$inferInsert> = {};
  if (dto.hotfixLabels !== undefined) patch.hotfixLabels = dto.hotfixLabels;
  if (dto.revertLabels !== undefined) patch.revertLabels = dto.revertLabels;

  const [updated] = await db.update(projects).set(patch).where(eq(projects.uid, uid)).returning();

  // Защита от гонки: между SELECT (existing) и UPDATE проект мог быть удалён
  // конкурирующим запросом. Без проверки `updated.hotfixLabels` упал бы по
  // обращению к undefined.
  if (!updated) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'project.incident_labels_updated',
    entityType: 'project',
    entityId: uid,
    details: {
      before: {
        hotfixLabels: existing.hotfixLabels,
        revertLabels: existing.revertLabels
      },
      after: {
        hotfixLabels: updated.hotfixLabels,
        revertLabels: updated.revertLabels
      }
    }
  });

  return updated;
};

/**
 * Форсированный пересбор данных проекта (admin tool).
 * Вызывает SyncService.syncProject синхронно и возвращает результат.
 * Используется когда админ изменил releaseTagPattern / hotfixLabels и
 * нужно переклассифицировать существующие теги/MR.
 */
export const triggerResync = async (actorUid: string, uid: string) => {
  const [existing] = await db.select().from(projects).where(eq(projects.uid, uid));
  if (!existing) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'project.resync_triggered',
    entityType: 'project',
    entityId: uid
  });

  // Делегируем sync-модулю. Когда он будет реализован — вернёт счётчики;
  // сейчас выбросит 501 NOT_IMPLEMENTED, что корректно — клиент увидит,
  // что фича помечена как не готовая.
  return SyncService.syncProject(actorUid, uid);
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Проверка, что ошибка — это нарушение unique constraint Postgres.
 * Drizzle обычно пробрасывает ошибки `pg` как есть, но в случае оборачивания
 * (DrizzleError, AggregateError) реальный pg-error попадает в `cause`.
 * Проверяем оба варианта.
 */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === PG_UNIQUE_VIOLATION || e.cause?.code === PG_UNIQUE_VIOLATION;
}
