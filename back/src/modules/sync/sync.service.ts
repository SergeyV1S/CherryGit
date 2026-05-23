import { and, asc, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm';

import type { ReviewState } from '@/db/drizzle/schema/git-data/types/review-state.type';
import type {
  GitlabCommit,
  GitlabMergeRequest,
  GitlabNote,
  GitlabTag
} from '@/modules/gitlab/types/gitlab-api.types';

import { db } from '@/db/drizzle/connect';
import {
  commits,
  deploymentMergeRequests,
  deployments,
  mergeRequests,
  mrCommits,
  mrReviews
} from '@/db/drizzle/schema/git-data/schema';
import {
  gitlabConnections,
  projects,
  syncStatuses,
  userGitlabIdentities
} from '@/db/drizzle/schema/gitlab/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { decryptSecret } from '@/lib/encryption';
import { logger } from '@/lib/loger';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { GitlabClient } from '@/modules/gitlab/gitlab-client.service';
import * as SnapshotService from '@/modules/snapshots/snapshot.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import { matchGlob } from './glob-match';

/**
 * Сервис инкрементальной синхронизации с GitLab
 * (BPMN основной процесс, ВКР раздел 3.4, FR-02).
 *
 * Архитектура (ВКР 3.5.2):
 *   syncProject(projectUid)
 *     1. lock          — sync_statuses.status = 'syncing' (мягкий лок, чтобы
 *                        планировщик и ручной триггер не конкурировали);
 *     2. fetchCommits   — since=lastSyncAt, ref=defaultBranch → upsert в commits;
 *     3. fetchMergeRequests — updated_after=lastSyncAt → upsert в merge_requests;
 *         для каждого изменившегося MR:
 *           — fetchMergeRequestCommits → upsert mr_commits,
 *           — fetchMergeRequestNotes   → firstReviewAt + upsert mr_reviews,
 *           — fetchMergeRequestApprovals → approvedAt,
 *           — fetchMergeRequestChanges → linesAdded/Removed/filesChangedCount;
 *     4. fetchTags     → классификация по releaseTagPattern (glob) → upsert deployments;
 *     5. status='idle', lastSyncAt=now(), запись в audit_logs.
 *
 * Идемпотентность: все upsert через `ON CONFLICT (unique_constraint) DO UPDATE`.
 * При ошибке — sync_statuses.status='error', errorMessage сохраняется.
 * Парциальный прогресс (часть данных уже залилась) сохраняется в БД, следующий
 * запуск продолжит с того же `lastSyncAt`.
 */

/** Результат прогона sync для одного проекта (возвращается контроллеру). */
export interface SyncReport {
  commitsUpserted: number;
  /**
   * Сколько строк `deployment_merge_requests` создано или подтверждено
   * на шаге `linkDeploymentsToMergeRequests` (доработка 1.4 / 2.3 prep).
   */
  deploymentMrLinks: number;
  deploymentsUpserted: number;
  durationMs: number;
  mergeRequestsUpserted: number;
  projectUid: string;
  reviewsUpserted: number;
}

// ===========================================================================
// Public API (используется контроллером и планировщиком)
// ===========================================================================

/**
 * Запустить sync для одного проекта.
 * Бросает 404 если проекта нет, 409 если уже идёт sync.
 */
export const syncProject = async (
  actorUid: string | undefined,
  projectUid: string
): Promise<SyncReport> => {
  const project = await loadProject(projectUid);
  const connection = await loadConnection(project.gitlabConnectionUid);
  const status = await loadOrCreateSyncStatus(projectUid);

  if (status.status === 'syncing') {
    throw new CustomError(
      HttpStatus.CONFLICT,
      `Sync for project ${projectUid} is already running`
    );
  }

  // Захват мягкого лока. Гонка между двумя одновременными вызовами разрешится
  // unique constraint на projectUid в sync_statuses (запись 1:1) — параллельный
  // UPDATE второго exit'нет позже на проверке status выше при следующей загрузке.
  await db
    .update(syncStatuses)
    .set({ status: 'syncing', errorMessage: null })
    .where(eq(syncStatuses.projectUid, projectUid));

  const start = Date.now();
  const client = new GitlabClient(connection.baseUrl, decryptSecret(connection.encryptedToken));
  const report: SyncReport = {
    projectUid,
    commitsUpserted: 0,
    mergeRequestsUpserted: 0,
    reviewsUpserted: 0,
    deploymentsUpserted: 0,
    deploymentMrLinks: 0,
    durationMs: 0
  };

  try {
    const since = status.lastSyncAt ?? undefined;

    // ---- Шаг 1: коммиты ----
    const remoteCommits = await client.fetchCommits(
      project.gitlabProjectId,
      since,
      project.defaultBranch ?? undefined
    );
    report.commitsUpserted = await upsertCommits(project.uid, remoteCommits, connection.uid);

    // ---- Шаг 2: merge requests ----
    // upsertMergeRequest возвращает уже загруженные notes — переиспользуем
    // их для upsertReviews, чтобы не дёргать GitLab дважды.
    const remoteMrs = await client.fetchMergeRequests(project.gitlabProjectId, since);
    for (const remoteMr of remoteMrs) {
      const { uid: mrUid, notes } = await upsertMergeRequest(
        project,
        remoteMr,
        client,
        connection.uid
      );
      report.mergeRequestsUpserted += 1;
      report.reviewsUpserted += await upsertReviews(
        mrUid,
        notes,
        remoteMr.author.username,
        connection.uid
      );
    }

    // ---- Шаг 3: деплои (теги, подходящие под release_tag_pattern) ----
    const remoteTags = await client.fetchTags(project.gitlabProjectId);
    report.deploymentsUpserted = await upsertDeploymentsFromTags(
      project.uid,
      remoteTags,
      project.releaseTagPattern
    );

    // ---- Шаг 4: классификация деплоев и привязка MR (FR-03, доработка 1.4) ----
    // Без default_branch не можем определить окно «релизные MR» (target_branch);
    // в этом случае пропускаем и просим админа подключить проект заново
    // или вызвать /resync после миграции schema (см. ДОРАБОТКИ.md, 1.2).
    if (project.defaultBranch) {
      report.deploymentMrLinks = await linkDeploymentsToMergeRequests(
        project.uid,
        project.defaultBranch
      );
    } else {
      logger.warn(
        `Sync project=${projectUid}: defaultBranch is null, skipping deployment↔MR linking`
      );
    }

    // ---- Финал: разблокировать, обновить закладку ----
    // GitLab возвращает commits отсортированными DESC по committed_date —
    // самый свежий первым; для MR — sort=asc, самый свежий последним.
    const now = new Date();
    await db
      .update(syncStatuses)
      .set({
        status: 'idle',
        lastSyncAt: now,
        errorMessage: null,
        ...(remoteCommits.length > 0 && { lastCommitSha: remoteCommits[0].id }),
        ...(remoteMrs.length > 0 && { lastMrIid: remoteMrs.at(-1)!.iid })
      })
      .where(eq(syncStatuses.projectUid, projectUid));

    report.durationMs = Date.now() - start;
    logger.info(
      `Sync OK project=${projectUid} commits=${report.commitsUpserted} mrs=${report.mergeRequestsUpserted} reviews=${report.reviewsUpserted} deploys=${report.deploymentsUpserted} deployMrLinks=${report.deploymentMrLinks} in ${report.durationMs}ms`
    );

    await recordAuditLog({
      userUid: actorUid,
      action: 'sync.completed',
      entityType: 'project',
      entityId: projectUid,
      details: { ...report }
    });

    // Snapshot writer (доработка 2.7) — fire-and-forget. Пересчитываем
    // снепшоты только команд, связанных с этим проектом. Ошибка writer'а
    // НЕ ломает sync-operation: snapshot — производный артефакт, его
    // отсутствие в этом tick'е лечится следующим успешным tick'ом.
    void SnapshotService.writeSnapshotsForProjectTeams(projectUid).catch((err: Error) => {
      logger.warn(
        `snapshot.writeForProjectTeams skipped for project ${projectUid}: ${err.message}`
      );
    });

    return report;
  } catch (error) {
    const message = (error as Error).message || String(error);
    await db
      .update(syncStatuses)
      .set({ status: 'error', errorMessage: message })
      .where(eq(syncStatuses.projectUid, projectUid));
    logger.error(`Sync FAILED project=${projectUid}: ${message}`);
    await recordAuditLog({
      userUid: actorUid,
      action: 'sync.failed',
      entityType: 'project',
      entityId: projectUid,
      details: { error: message, partialReport: report }
    });
    throw error;
  }
};

/**
 * Запуск sync для всех активных проектов.
 * Используется планировщиком (sync.scheduler.ts).
 * Ошибка одного проекта не останавливает обход остальных.
 */
export const syncAllProjects = async (): Promise<{ total: number; ok: number; failed: number }> => {
  const allProjects = await db
    .select({ uid: projects.uid })
    .from(projects)
    .innerJoin(gitlabConnections, eq(gitlabConnections.uid, projects.gitlabConnectionUid))
    .where(eq(gitlabConnections.status, 'active'));

  let ok = 0;
  let failed = 0;

  for (const p of allProjects) {
    try {
      // actorUid=undefined: audit пишется как «системное событие»
      // (auditLogs.userUid nullable). Передавать строку 'SYSTEM' нельзя —
      // FK на users.uid и тип uuid отбракуют.
      await syncProject(undefined, p.uid);
      ok += 1;
    } catch (err) {
      failed += 1;
      logger.warn(`syncAllProjects: project ${p.uid} failed: ${(err as Error).message}`);
    }
  }

  return { total: allProjects.length, ok, failed };
};

/** Текущее состояние sync для проекта (используется UI и контроллером). */
export const getSyncStatus = async (projectUid: string) => {
  const [row] = await db
    .select()
    .from(syncStatuses)
    .where(eq(syncStatuses.projectUid, projectUid));
  if (!row) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Sync status not found for project');
  }
  return row;
};

/**
 * Пересчёт метрик без обращения к GitLab (доработка 2.7).
 *
 * Делегирует в `SnapshotService.writeSnapshotsForProjectTeams` — для всех
 * команд, связанных с проектом, пересчитывает snapshots по 6 MVP-метрикам
 * (CT MR, MR Size, Lead Time, DF, CFR, Bus Factor) и апсёртит в БД.
 *
 * Используется когда:
 *   — админ изменил `code_modules` (Bus Factor поменялся);
 *   — админ поменял `hotfixLabels` после resync (CFR поменялся);
 *   — нужна ручная перепроверка метрик без полного GitLab-sync.
 *
 * НЕ обращается к GitLab — работает по уже собранным `merge_requests`/
 * `deployments`/`commits`. Поэтому быстрее полного `syncProject`.
 */
export const recalculateMetrics = async (
  actorUid: string,
  projectUid: string
): Promise<{ projectUid: string; report: Awaited<ReturnType<typeof SnapshotService.writeSnapshotsForProjectTeams>> }> => {
  // assertProjectExists через loadProject — даёт 404 при отсутствии.
  const project = await loadProject(projectUid);
  const report = await SnapshotService.writeSnapshotsForProjectTeams(project.uid, new Date());

  await recordAuditLog({
    userUid: actorUid,
    action: 'metrics.recalculated',
    entityType: 'project',
    entityId: projectUid,
    details: {
      ok: report.ok,
      failed: report.failed,
      total: report.total
    }
  });

  return { projectUid, report };
};

// ===========================================================================
// Helpers: загрузка контекста
// ===========================================================================

const loadProject = async (projectUid: string) => {
  const [row] = await db.select().from(projects).where(eq(projects.uid, projectUid));
  if (!row) throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
  return row;
};

const loadConnection = async (connectionUid: string) => {
  const [row] = await db
    .select()
    .from(gitlabConnections)
    .where(eq(gitlabConnections.uid, connectionUid));
  if (!row) throw new CustomError(HttpStatus.NOT_FOUND, 'GitLab connection not found');
  if (row.status !== 'active') {
    throw new CustomError(HttpStatus.CONFLICT, 'GitLab connection is not active');
  }
  return row;
};

/**
 * Гарантирует наличие записи sync_statuses (для проектов, подключённых до
 * того как connectProject стал создавать запись автоматически).
 */
const loadOrCreateSyncStatus = async (projectUid: string) => {
  const [existing] = await db
    .select()
    .from(syncStatuses)
    .where(eq(syncStatuses.projectUid, projectUid));
  if (existing) return existing;
  const [created] = await db
    .insert(syncStatuses)
    .values({ projectUid, status: 'idle' })
    .returning();
  return created;
};

// ===========================================================================
// Маппинг GitLab username → CherryGit userUid
// ===========================================================================

/**
 * Резолвинг GitLab-логинов в CherryGit-пользователей.
 * Используется user_gitlab_identities (per-connection): один пользователь
 * может иметь разные логины на разных инстансах.
 *
 * Запросы делаются батчем перед upsert'ом, чтобы не делать N+1 SELECT.
 */
const resolveAuthors = async (
  connectionUid: string,
  gitlabUsernames: string[]
): Promise<Map<string, string>> => {
  const unique = [...new Set(gitlabUsernames)].filter((u) => u.length > 0);
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({
      username: userGitlabIdentities.gitlabUsername,
      userUid: userGitlabIdentities.userUid
    })
    .from(userGitlabIdentities)
    .where(
      and(
        eq(userGitlabIdentities.gitlabConnectionUid, connectionUid),
        inArray(userGitlabIdentities.gitlabUsername, unique)
      )
    );

  return new Map(rows.map((r) => [r.username, r.userUid]));
};

/**
 * Резолвинг commit-авторов по email (доработка 4.4).
 *
 * GitLab `/repository/commits` НЕ возвращает username — только `author_email`.
 * Поэтому commits резолвятся отдельным механизмом — двухуровневой стратегией:
 *
 *   1. **Strong-match через `user_gitlab_identities.email`** (per-connection):
 *      email задан админом при `linkGitlabIdentity` либо подхвачен из
 *      GitLab API (для админ-PAT'ов). Это «крепкая» привязка.
 *
 *   2. **Implicit-match через `users.mail`** (cross-connection fallback):
 *      если `commit.author_email` совпадает с зарегистрированным
 *      `users.mail`, резолвим в этого пользователя БЕЗ создания identity.
 *      Это «авто-резолв при первом sync» из доработки 4.4: разработчик,
 *      зарегистрированный с корпоративной почтой, сразу попадает в свои
 *      коммиты — админу НЕ нужно вручную линковать каждого.
 *
 * **Почему НЕ создаём identity автоматически из sync**:
 *   — `user_gitlab_identities.gitlabUserId` — NOT NULL, sync не знает
 *     реальный ID GitLab-юзера (commit его не несёт);
 *   — если поставить sentinel `gitlabUserId=0`, последующий ручной
 *     `linkGitlabIdentity` упадёт на `uq_user_per_connection` (юзер
 *     уже привязан, хоть и фейково), и админу придётся отдельно чинить;
 *   — implicit-резолв без persist даёт ТОТ ЖЕ эффект для метрик
 *     (`commits.authorUid` заполняется), но не блокирует последующую
 *     корректную привязку через `linkGitlabIdentity`.
 *
 * Когда админ через `linkGitlabIdentity` создаст «крепкую» identity с
 * реальным username/id/email — strong-match начнёт работать ВМЕСТО
 * implicit'а; новые sync'и используют его автоматически, исторические
 * commits бэк-резолвятся через `backfillAuthorUidForIdentity` (users-admin).
 *
 * Возвращает Map<email_lower, userUid>. Возвращаются только email'ы, для
 * которых нашли userUid; «неизвестные» commit-emails в результат не
 * попадают — caller использует `?? null` для authorUid.
 */
const resolveCommitAuthorsByEmail = async (
  connectionUid: string,
  emails: string[]
): Promise<Map<string, string>> => {
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))].filter(
    (e) => e.length > 0
  );
  if (unique.length === 0) return new Map();

  const result = new Map<string, string>();

  // ----- 1. Strong-match через user_gitlab_identities.email -----
  // SELECT всех identity-записей connection'а — десятки-сотни max, дёшево.
  // Filter в памяти case-insensitive (Postgres ILIKE-вариант с inArray
  // не комбинируется естественно — проще in-memory).
  const identityRows = await db
    .select({
      email: userGitlabIdentities.email,
      userUid: userGitlabIdentities.userUid
    })
    .from(userGitlabIdentities)
    .where(
      and(
        eq(userGitlabIdentities.gitlabConnectionUid, connectionUid),
        isNotNull(userGitlabIdentities.email)
      )
    );
  for (const row of identityRows) {
    if (!row.email) continue;
    const lower = row.email.toLowerCase();
    if (unique.includes(lower) && !result.has(lower)) {
      result.set(lower, row.userUid);
    }
  }

  // ----- 2. Implicit-match через users.mail (cross-connection) -----
  const stillUnresolved = unique.filter((e) => !result.has(e));
  if (stillUnresolved.length === 0) return result;

  // Подгружаем все users.mail. Для CherryGit-MVP (десятки-сотни юзеров) —
  // приемлемо. При росте — заменить на inArray(lower(mail), unresolved)
  // (потребует `lower()` индекс).
  const userRows = await db
    .select({ uid: users.uid, mail: users.mail })
    .from(users);
  for (const u of userRows) {
    const lower = u.mail.toLowerCase();
    if (stillUnresolved.includes(lower) && !result.has(lower)) {
      result.set(lower, u.uid);
    }
  }

  return result;
};

// ===========================================================================
// Upsert: commits
// ===========================================================================

const upsertCommits = async (
  projectUid: string,
  remoteCommits: GitlabCommit[],
  connectionUid: string
): Promise<number> => {
  if (remoteCommits.length === 0) return 0;

  // Резолв commit-авторов по email (доработка 4.4):
  //   GitLab /repository/commits НЕ возвращает username — только author_name
  //   ("Иван Иванов") и author_email. Резолв делается через
  //   `resolveCommitAuthorsByEmail` (strong-match по identities + implicit
  //   match по users.mail).
  //
  // В authorGitlabUsername по-прежнему пишем `author_email` — это **ключ
  // для бэк-резолва** при последующем `linkGitlabIdentity` (см.
  // `backfillAuthorUidForIdentity` в users-admin.service). Если в будущем
  // GitLab начнёт отдавать username для commits — переключимся на него,
  // схема не сломается.
  //
  // commits.stats отдаёт суммарные additions/deletions; per-file список GitLab
  // не возвращает на /repository/commits — для filesChanged JSONB пишем пустой
  // массив (его наполнит шаг merge_request_changes).
  const authorMap = await resolveCommitAuthorsByEmail(
    connectionUid,
    remoteCommits.map((c) => c.author_email)
  );

  const values = remoteCommits.map((c) => ({
    projectUid,
    authorUid: authorMap.get(c.author_email.toLowerCase()) ?? null,
    authorGitlabUsername: c.author_email,
    sha: c.id,
    message: c.message,
    committedAt: new Date(c.committed_date),
    filesChanged: []
  }));

  await db
    .insert(commits)
    .values(values)
    .onConflictDoUpdate({
      target: [commits.projectUid, commits.sha],
      set: {
        message: sql`excluded.message`,
        authorGitlabUsername: sql`excluded.author_gitlab_username`,
        // На каждом sync переучитываем authorUid — даёт корректное состояние
        // после ручного `linkGitlabIdentity` без отдельного бэк-резолва.
        authorUid: sql`excluded.author_uid`
      }
    });

  return values.length;
};

// ===========================================================================
// Upsert: merge requests (с фазами Cycle Time + MR Size)
// ===========================================================================

const MR_STATE_MAP: Record<GitlabMergeRequest['state'], 'closed' | 'merged' | 'opened'> = {
  opened: 'opened',
  closed: 'closed',
  merged: 'merged',
  locked: 'closed'
};

const upsertMergeRequest = async (
  project: typeof projects.$inferSelect,
  remote: GitlabMergeRequest,
  client: GitlabClient,
  connectionUid: string
): Promise<{ notes: GitlabNote[]; uid: string }> => {
  // Параллельно подтягиваем детали: notes/approvals/changes — независимые запросы.
  const [notes, approvals, changes] = await Promise.all([
    client.fetchMergeRequestNotes(project.gitlabProjectId, remote.iid),
    client.fetchMergeRequestApprovals(project.gitlabProjectId, remote.iid),
    // Changes может вернуть 404 на очень старых MR без diff — оборачиваем.
    client
      .fetchMergeRequestChanges(project.gitlabProjectId, remote.iid)
      .catch(() => [])
  ]);

  const firstReviewAt = computeFirstReviewAt(notes, remote.author.username);
  const approvedAt = computeApprovedAt(approvals.approved_by);
  const size = GitlabClient.computeMrSize(changes);

  // Список путей файлов, изменённых в MR (нужен для Bus Factor по модулям —
  // доработка 2.6). Дедуплицируем по `new_path` (на rename берём текущее
  // расположение — модуль резолвится по нему). Изменения уже получены
  // ради MR Size, отдельного GitLab-запроса не делаем.
  const filePaths = [...new Set(changes.map((c) => c.new_path).filter(Boolean))];

  const authors = await resolveAuthors(connectionUid, [remote.author.username]);

  // Классификация инцидентов (FR-03, доработка 1.4): MR попадает под hotfix/
  // revert, если ХОТЯ БЫ одна его метка пересекается с соответствующим набором
  // проекта. Сравнение case-sensitive — GitLab labels case-sensitive.
  const labelSet = new Set(remote.labels);
  const hasHotfixLabel = project.hotfixLabels.some((l) => labelSet.has(l));
  const hasRevertLabel = project.revertLabels.some((l) => labelSet.has(l));

  const [row] = await db
    .insert(mergeRequests)
    .values({
      projectUid: project.uid,
      authorUid: authors.get(remote.author.username) ?? null,
      authorGitlabUsername: remote.author.username,
      gitlabMrIid: remote.iid,
      title: remote.title,
      sourceBranch: remote.source_branch,
      targetBranch: remote.target_branch,
      state: MR_STATE_MAP[remote.state],
      gitlabCreatedAt: new Date(remote.created_at),
      firstReviewAt,
      approvedAt,
      mergedAt: remote.merged_at ? new Date(remote.merged_at) : null,
      closedAt: remote.closed_at ? new Date(remote.closed_at) : null,
      linesAdded: size.linesAdded,
      linesRemoved: size.linesRemoved,
      filesChangedCount: size.filesChanged,
      filePaths,
      hasHotfixLabel,
      hasRevertLabel
    })
    .onConflictDoUpdate({
      target: [mergeRequests.projectUid, mergeRequests.gitlabMrIid],
      set: {
        title: sql`excluded.title`,
        state: sql`excluded.state`,
        firstReviewAt: sql`excluded.first_review_at`,
        approvedAt: sql`excluded.approved_at`,
        mergedAt: sql`excluded.merged_at`,
        closedAt: sql`excluded.closed_at`,
        linesAdded: sql`excluded.lines_added`,
        linesRemoved: sql`excluded.lines_removed`,
        filesChangedCount: sql`excluded.files_changed_count`,
        filePaths: sql`excluded.file_paths`,
        hasHotfixLabel: sql`excluded.has_hotfix_label`,
        hasRevertLabel: sql`excluded.has_revert_label`
      }
    })
    .returning({ uid: mergeRequests.uid });

  // mr_commits — связать с уже загруженными в БД commits через SHA.
  await linkMrCommits(project.uid, row.uid, await client.fetchMergeRequestCommits(
    project.gitlabProjectId,
    remote.iid
  ));

  return { uid: row.uid, notes };
};

/**
 * Время первого реального ревью: первый note от автора ≠ автор MR, с system=false.
 * system=true означает технические события («assigned», «label added») — это не ревью.
 */
const computeFirstReviewAt = (notes: GitlabNote[], mrAuthorUsername: string): Date | null => {
  const reviewNotes = notes
    .filter((n) => !n.system && n.author.username !== mrAuthorUsername)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const first = reviewNotes[0];
  return first ? new Date(first.created_at) : null;
};

/** Минимальное (самое раннее) время approve от любого ревьюера. */
const computeApprovedAt = (
  approvedBy: { approved_at: string; user: { username: string } }[]
): Date | null => {
  if (approvedBy.length === 0) return null;
  const times = approvedBy
    .filter((a) => Boolean(a.approved_at))
    .map((a) => new Date(a.approved_at).getTime());
  if (times.length === 0) return null;
  return new Date(Math.min(...times));
};

/**
 * Привязать commits, попавшие в MR, через mr_commits.
 * Если commit ещё не в БД (не в основной ветке) — пропускаем (FK не позволит вставить).
 */
const linkMrCommits = async (
  projectUid: string,
  mergeRequestUid: string,
  mrCommitsRemote: GitlabCommit[]
): Promise<void> => {
  if (mrCommitsRemote.length === 0) return;

  const shas = mrCommitsRemote.map((c) => c.id);
  const existing = await db
    .select({ uid: commits.uid, sha: commits.sha })
    .from(commits)
    .where(and(eq(commits.projectUid, projectUid), inArray(commits.sha, shas)));

  if (existing.length === 0) return;

  await db
    .insert(mrCommits)
    .values(existing.map((c) => ({ mergeRequestUid, commitUid: c.uid })))
    .onConflictDoNothing();
};

// ===========================================================================
// Upsert: reviews (из notes + approvals)
// ===========================================================================

const upsertReviews = async (
  mergeRequestUid: string,
  notes: GitlabNote[],
  mrAuthorUsername: string,
  connectionUid: string
): Promise<number> => {
  // Ревью = note от не-автора, не системный.
  const reviewNotes = notes.filter((n) => !n.system && n.author.username !== mrAuthorUsername);
  if (reviewNotes.length === 0) return 0;

  const authors = await resolveAuthors(
    connectionUid,
    reviewNotes.map((n) => n.author.username)
  );

  // Эвристика state: всё в MVP помечаем как 'commented'. Real approve приходит
  // не через notes (system=true с note body 'approved this merge request'),
  // а через GET /merge_requests/:iid/approvals (обрабатывается отдельно
  // в computeApprovedAt).
  const values = reviewNotes.map((n) => ({
    mergeRequestUid,
    reviewerUid: authors.get(n.author.username) ?? null,
    reviewerGitlabUsername: n.author.username,
    state: 'commented' as ReviewState,
    reviewedAt: new Date(n.created_at)
  }));

  // Уникального ключа на mr_reviews нет — пересохраняем «как есть», но чтобы
  // не плодить дубликаты при повторном sync'е, сначала удаляем существующие
  // записи для этого MR. Это дешевле, чем выдумывать составной unique.
  await db.transaction(async (tx) => {
    await tx.delete(mrReviews).where(eq(mrReviews.mergeRequestUid, mergeRequestUid));
    if (values.length > 0) {
      await tx.insert(mrReviews).values(values);
    }
  });

  return values.length;
};

// ===========================================================================
// Upsert: deployments (теги, подошедшие под releaseTagPattern)
// ===========================================================================

const upsertDeploymentsFromTags = async (
  projectUid: string,
  tags: GitlabTag[],
  releaseTagPattern: string
): Promise<number> => {
  const matching = tags.filter((t) => matchGlob(releaseTagPattern, t.name));
  if (matching.length === 0) return 0;

  // Доработка 1.4: при upsert сбрасываем isHotfix/isRevert в false; фактические
  // признаки восстановит `linkDeploymentsToMergeRequests` ниже — иначе старая
  // классификация осталась бы «висеть» после удаления метки из проекта.
  // isFailed не трогаем — её владелец будущая интеграция с мониторингом.
  const values = matching.map((t) => ({
    projectUid,
    tag: t.name,
    commitSha: t.commit.id,
    deployedAt: new Date(t.commit.committed_date),
    isHotfix: false,
    isRevert: false
  }));

  await db
    .insert(deployments)
    .values(values)
    .onConflictDoUpdate({
      target: [deployments.projectUid, deployments.tag],
      set: {
        commitSha: sql`excluded.commit_sha`,
        deployedAt: sql`excluded.deployed_at`,
        isHotfix: sql`excluded.is_hotfix`,
        isRevert: sql`excluded.is_revert`
      }
    });

  return values.length;
};

// ===========================================================================
// Шаг 4: связь deployments ↔ merge_requests + классификация инцидентов
// (доработка 1.4, FR-03; необходима для Lead Time (2.3) и CFR (2.5))
// ===========================================================================

/**
 * Для каждого деплоя проекта определяет, какие merged MRs «попали» в релиз,
 * и заполняет таблицу `deployment_merge_requests` (m2m).
 *
 * Алгоритм (ВКР раздел 3.5.2, BPMN «Основной процесс»):
 *  1. выбрать все deployments проекта, отсортированные ASC по deployedAt;
 *  2. для каждого deployment[i]:
 *     — окно = (deployment[i-1].deployedAt, deployment[i].deployedAt];
 *       для первого деплоя — (-∞, deployment[0].deployedAt];
 *     — выбрать merged MRs с `target_branch === defaultBranch`,
 *       `merged_at IS NOT NULL`, попадающие в окно;
 *     — bulk insert в deployment_merge_requests (ON CONFLICT DO NOTHING);
 *  3. на основе ЛЮБОГО связанного MR с has_hotfix_label/has_revert_label
 *     поднять флаг `deployments.isHotfix`/`isRevert` — это и есть CFR-сигнал.
 *
 * Идемпотентность: связь (deployment_uid, merge_request_uid) уникальна,
 * повторный sync не плодит дубликаты. Флаги isHotfix/isRevert сначала
 * сбрасываются в upsertDeploymentsFromTags, затем поднимаются здесь, что
 * корректно отрабатывает удаление меток из проекта.
 *
 * Производительность (внимание, N+1):
 *  — 1 SELECT всех deployments проекта;
 *  — N SELECT'ов merge_requests (по одному на каждый деплой);
 *  — N INSERT'ов в deployment_merge_requests (ON CONFLICT DO NOTHING);
 *  — до N UPDATE'ов deployments при поднятии isHotfix/isRevert.
 * Для MVP-проекта с десятками-сотнями деплоев — приемлемо. При росте до
 * тысяч деплоев и частых синков (10 минут) — оптимизация описана в
 * ДОРАБОТКИ.md (1.4 / 1.3): обрабатывать только НОВЫЕ деплои + last,
 * либо джойнить одним запросом через window-функции Postgres.
 *
 * @returns суммарное число пар (deployment, merge_request), затронутых
 *          в этом прогоне sync (включая уже существовавшие связи —
 *          ON CONFLICT DO NOTHING не даёт нам точное число «новых»).
 *          Для отчёта `SyncReport.deploymentMrLinks` менее важна точность,
 *          чем порядок величины («сколько связей итого процессим»).
 */
const linkDeploymentsToMergeRequests = async (
  projectUid: string,
  defaultBranch: string
): Promise<number> => {
  const projectDeployments = await db
    .select({
      uid: deployments.uid,
      deployedAt: deployments.deployedAt
    })
    .from(deployments)
    .where(eq(deployments.projectUid, projectUid))
    .orderBy(asc(deployments.deployedAt));

  if (projectDeployments.length === 0) return 0;

  let totalLinks = 0;

  for (let i = 0; i < projectDeployments.length; i += 1) {
    const current = projectDeployments[i];
    const prev = i > 0 ? projectDeployments[i - 1] : null;

    // Кандидаты — merged MRs c target_branch == defaultBranch в окне.
    // Для первого деплоя prev=null → берём все MRs с mergedAt ≤ current.
    const windowConditions = [
      eq(mergeRequests.projectUid, projectUid),
      eq(mergeRequests.targetBranch, defaultBranch),
      isNotNull(mergeRequests.mergedAt),
      lte(mergeRequests.mergedAt, current.deployedAt)
    ];
    if (prev) {
      windowConditions.push(gt(mergeRequests.mergedAt, prev.deployedAt));
    }

    const mrsInWindow = await db
      .select({
        uid: mergeRequests.uid,
        hasHotfixLabel: mergeRequests.hasHotfixLabel,
        hasRevertLabel: mergeRequests.hasRevertLabel
      })
      .from(mergeRequests)
      .where(and(...windowConditions));

    if (mrsInWindow.length === 0) {
      // Никаких MR в окне → деплой технический (или истории нет). Флаги
      // уже сброшены в upsertDeploymentsFromTags, ничего обновлять не нужно.
      continue;
    }

    await db
      .insert(deploymentMergeRequests)
      .values(
        mrsInWindow.map((m) => ({
          deploymentUid: current.uid,
          mergeRequestUid: m.uid
        }))
      )
      .onConflictDoNothing();

    totalLinks += mrsInWindow.length;

    // Поднять isHotfix/isRevert, если ХОТЯ БЫ один MR в окне помечен.
    const isHotfix = mrsInWindow.some((m) => m.hasHotfixLabel);
    const isRevert = mrsInWindow.some((m) => m.hasRevertLabel);
    if (isHotfix || isRevert) {
      await db
        .update(deployments)
        .set({ isHotfix, isRevert })
        .where(eq(deployments.uid, current.uid));
    }
  }

  return totalLinks;
};
