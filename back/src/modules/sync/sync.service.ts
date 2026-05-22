import { and, eq, inArray, sql } from 'drizzle-orm';

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
import { decryptSecret } from '@/lib/encryption';
import { logger } from '@/lib/loger';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { GitlabClient } from '@/modules/gitlab/gitlab-client.service';
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
      `Sync OK project=${projectUid} commits=${report.commitsUpserted} mrs=${report.mergeRequestsUpserted} reviews=${report.reviewsUpserted} deploys=${report.deploymentsUpserted} in ${report.durationMs}ms`
    );

    await recordAuditLog({
      userUid: actorUid,
      action: 'sync.completed',
      entityType: 'project',
      entityId: projectUid,
      details: { ...report }
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
 * Сейчас заглушка — будет реализован в snapshot-writer.
 */
export const recalculateMetrics = async (
  _actorUid: string,
  _projectUid: string
): Promise<void> => {
  throw new CustomError(
    HttpStatus.NOT_IMPLEMENTED,
    'recalculateMetrics будет реализован в доработке 2.7'
  );
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

// ===========================================================================
// Upsert: commits
// ===========================================================================

const upsertCommits = async (
  projectUid: string,
  remoteCommits: GitlabCommit[],
  _connectionUid: string
): Promise<number> => {
  if (remoteCommits.length === 0) return 0;

  // ВАЖНО про резолв автора:
  //   GitLab /repository/commits НЕ возвращает username — только author_name
  //   ("Иван Иванов") и author_email. Резолв через user_gitlab_identities
  //   по username здесь невозможен. Поэтому:
  //     — в authorGitlabUsername пишем `author_email` (стабильный ID, совпадает
  //       с git config user.email);
  //     — authorUid оставляем null — резолв будет выполнен в доработке 4.4
  //       (commit-author by email mapping), когда в user_gitlab_identities
  //       появится колонка email.
  //
  // commits.stats отдаёт суммарные additions/deletions; per-file список GitLab
  // не возвращает на /repository/commits — для filesChanged JSONB пишем пустой
  // массив (его наполнит шаг merge_request_changes).
  const values = remoteCommits.map((c) => ({
    projectUid,
    authorUid: null,
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
        authorGitlabUsername: sql`excluded.author_gitlab_username`
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

  const authors = await resolveAuthors(connectionUid, [remote.author.username]);

  const labelSet = new Set(remote.labels);

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
      hasHotfixLabel: labelSet.has(project.hotfixLabel),
      hasRevertLabel: labelSet.has(project.revertLabel)
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

  const values = matching.map((t) => ({
    projectUid,
    tag: t.name,
    commitSha: t.commit.id,
    deployedAt: new Date(t.commit.committed_date)
    // isFailed/isHotfix/isRevert — namespaced для доработки 1.4 (классификация инцидентов)
  }));

  await db
    .insert(deployments)
    .values(values)
    .onConflictDoUpdate({
      target: [deployments.projectUid, deployments.tag],
      set: {
        commitSha: sql`excluded.commit_sha`,
        deployedAt: sql`excluded.deployed_at`
      }
    });

  return values.length;
};
