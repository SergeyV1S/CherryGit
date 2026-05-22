import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import { gitlabConnections, projects, syncStatuses } from '@/db/drizzle/schema/gitlab/schema';
import { teamProjects, teams } from '@/db/drizzle/schema/teams/schema';
import { logger } from '@/lib/loger';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { buildClient } from '@/modules/gitlab/gitlab.service';
import * as SyncService from '@/modules/sync/sync.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type { ConnectProjectDto, UpdateProjectDto } from './dto/connect-project.dto';

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

/** Список проектов с привязанными командами (агрегация). */
export const listProjects = async () => {
  const rows = await db
    .select({
      project: projects,
      team: teams
    })
    .from(projects)
    .leftJoin(teamProjects, eq(teamProjects.projectUid, projects.uid))
    .leftJoin(teams, eq(teams.uid, teamProjects.teamUid));

  // Сворачиваем строки в `project + teams[]` (group by project.uid).
  const grouped = new Map<string, { project: typeof projects.$inferSelect; teams: { uid: string; name: string }[] }>();
  for (const row of rows) {
    const existing = grouped.get(row.project.uid);
    if (existing) {
      if (row.team) existing.teams.push({ uid: row.team.uid, name: row.team.name });
    } else {
      grouped.set(row.project.uid, {
        project: row.project,
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

  const [syncStatus] = await db
    .select()
    .from(syncStatuses)
    .where(eq(syncStatuses.projectUid, uid));

  return { project, teams: teamsRows, syncStatus: syncStatus ?? null };
};

/**
 * Подключение проекта GitLab к CherryGit (UC-01 шаги 6–10).
 *
 * Алгоритм:
 *  1. Проверка существования GitLab-подключения.
 *  2. Запрос метаданных проекта с GitLab (имя, namespace, description, defaultBranch).
 *  3. Insert в projects — unique constraint ловит повторное подключение.
 *  4. Привязка к указанным командам через team_projects.
 *  5. Создание sync_statuses (status='idle').
 *  6. Запись события в журнал аудита (project.connected).
 *  7. Fire-and-forget — попытка первичного sync (бутстрап).
 */
export const connectProject = async (actorUid: string, dto: ConnectProjectDto) => {
  // 1. Проверка существования подключения.
  const [connection] = await db
    .select()
    .from(gitlabConnections)
    .where(eq(gitlabConnections.uid, dto.gitlabConnectionUid));
  if (!connection) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'GitLab connection not found');
  }

  // 2. Валидация команд (если переданы — должны все существовать).
  if (dto.teamUids && dto.teamUids.length > 0) {
    const found = await db
      .select({ uid: teams.uid })
      .from(teams)
      .where(inArray(teams.uid, dto.teamUids));
    if (found.length !== dto.teamUids.length) {
      throw new CustomError(HttpStatus.BAD_REQUEST, 'Одна или несколько teamUids не существуют');
    }
  }

  // 3. Метаданные проекта с GitLab.
  const client = await buildClient(dto.gitlabConnectionUid);
  const remote = await client.fetchProject(dto.gitlabProjectId);

  // 4. Транзакция: project + team_projects + sync_statuses.
  let created: typeof projects.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({
          gitlabConnectionUid: dto.gitlabConnectionUid,
          gitlabProjectId: dto.gitlabProjectId,
          name: remote.name,
          description: remote.description,
          namespace: remote.namespace.full_path,
          defaultBranch: remote.default_branch,
          ...(dto.releaseTagPattern !== undefined && { releaseTagPattern: dto.releaseTagPattern }),
          ...(dto.hotfixLabel !== undefined && { hotfixLabel: dto.hotfixLabel }),
          ...(dto.revertLabel !== undefined && { revertLabel: dto.revertLabel })
        })
        .returning();

      if (dto.teamUids && dto.teamUids.length > 0) {
        await tx.insert(teamProjects).values(
          dto.teamUids.map((teamUid) => ({
            teamUid,
            projectUid: project.uid
          }))
        );
      }

      await tx.insert(syncStatuses).values({
        projectUid: project.uid,
        status: 'idle'
      });

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

  // 5. Audit.
  await recordAuditLog({
    userUid: actorUid,
    action: 'project.connected',
    entityType: 'project',
    entityId: created.uid,
    details: {
      gitlabConnectionUid: dto.gitlabConnectionUid,
      gitlabProjectId: dto.gitlabProjectId,
      name: created.name,
      namespace: created.namespace,
      teamUids: dto.teamUids ?? []
    }
  });

  // 6. Бутстрап-задача: запускаем первичный sync в фоне.
  // Когда модуль sync будет реализован (доработка 1.3) — это автоматически
  // загрузит коммиты/MR/теги проекта. До тех пор вызов вернёт 501 и
  // мы лишь логируем warning, не ломая операцию подключения.
  void SyncService.syncProject(actorUid, created.uid).catch((err: Error) => {
    logger.warn(
      `Initial sync skipped for project ${created.uid} (${remote.path_with_namespace}): ${err.message}`
    );
  });

  return created;
};

/**
 * Обновление настроек проекта. Допустимые изменения:
 *  — releaseTagPattern (glob тегов деплоя)
 *  — hotfixLabel / revertLabel (метки MR для CFR)
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
  if (dto.hotfixLabel !== undefined) patch.hotfixLabel = dto.hotfixLabel;
  if (dto.revertLabel !== undefined) patch.revertLabel = dto.revertLabel;

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
 * Отключение проекта от системы. Снимает связи с командами и удаляет
 * запись sync_statuses; связанные commits/merge_requests/deployments
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
 * Форсированный пересбор данных проекта (admin tool).
 * Вызывает SyncService.syncProject синхронно и возвращает результат.
 * Используется когда админ изменил releaseTagPattern / hotfixLabel и
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
