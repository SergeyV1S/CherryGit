import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core';

import type { MRState } from './types/mr-state.type';
import type { ReviewState } from './types/review-state.type';

import { baseSchema } from '../base.schema';
import { projects } from '../gitlab/schema';
import { users } from '../user/schema';

// ---------------------------------------------------------------------------
// Вспомогательные типы для JSONB-полей
// ---------------------------------------------------------------------------

/** Изменённый файл в коммите (filesChanged) */
export interface CommitFileChange {
  /** Тип изменения: A=added, M=modified, D=deleted, R=renamed */
  changeType: 'A' | 'D' | 'M' | 'R';
  linesAdded: number;
  linesRemoved: number;
  path: string;
}

// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------

/**
 * Коммиты, собранные из GitLab.
 * authorUid — nullable: не все авторы коммитов зарегистрированы в системе.
 * Сопоставление происходит по gitlabUsername через team_members.
 */
export const commits = pgTable(
  'commits',
  {
    ...baseSchema,
    projectUid: uuid('project_uid')
      .references(() => projects.uid)
      .notNull(),
    /** FK на пользователя системы; null если автор не найден в team_members */
    authorUid: uuid('author_uid').references(() => users.uid),
    /** GitLab-логин автора — первичный ключ для сопоставления */
    authorGitlabUsername: text('author_gitlab_username').notNull(),
    sha: text('sha').notNull(),
    message: text('message').notNull(),
    committedAt: timestamp('committed_at').notNull(),
    /** Список изменённых файлов из GitLab diff stats */
    filesChanged: jsonb('files_changed').$type<CommitFileChange[]>().default([]).notNull()
  },
  (t) => ({
    /** SHA уникален в рамках одного проекта */
    uniqueShаPerProject: unique('uq_sha_per_project').on(t.projectUid, t.sha)
  })
);

export type InsertCommit = typeof commits.$inferInsert;
export type SelectCommit = typeof commits.$inferSelect;

// ---------------------------------------------------------------------------
// Merge Requests
// ---------------------------------------------------------------------------

/**
 * Merge Requests из GitLab.
 * Хранит все временны́е метки фаз жизненного цикла MR
 * для расчёта Cycle Time с декомпозицией по фазам.
 */
export const mergeRequests = pgTable(
  'merge_requests',
  {
    ...baseSchema,
    projectUid: uuid('project_uid')
      .references(() => projects.uid)
      .notNull(),
    /** FK на пользователя системы; null если автор не найден */
    authorUid: uuid('author_uid').references(() => users.uid),
    authorGitlabUsername: text('author_gitlab_username').notNull(),
    /** IID MR в контексте проекта GitLab (не глобальный ID) */
    gitlabMrIid: integer('gitlab_mr_iid').notNull(),
    title: text('title').notNull(),
    sourceBranch: text('source_branch').notNull(),
    targetBranch: text('target_branch').notNull(),
    state: text('state').$type<MRState>().notNull(),
    /** Время открытия MR на GitLab (не совпадает с createdAt записи в БД) */
    gitlabCreatedAt: timestamp('gitlab_created_at').notNull(),
    /** Момент первого комментария ревьюера — начало фазы ревью */
    firstReviewAt: timestamp('first_review_at'),
    /** Момент получения апрува */
    approvedAt: timestamp('approved_at'),
    mergedAt: timestamp('merged_at'),
    closedAt: timestamp('closed_at'),
    linesAdded: integer('lines_added').default(0).notNull(),
    linesRemoved: integer('lines_removed').default(0).notNull(),
    filesChangedCount: integer('files_changed_count').default(0).notNull(),
    /**
     * Пути файлов, изменённых в MR (`changes[].new_path`), дедуплицированные.
     * Нужно для Bus Factor (доработка 2.6) — на этих путях резолвится модуль
     * через `code_modules.pathPattern` либо через fallback «первая директория».
     *
     * Источник заполнения — `client.fetchMergeRequestChanges` в `sync.service.ts`
     * (уже вызывается ради MR Size; здесь дополнительно собирается список
     * путей, без отдельного GitLab-запроса).
     *
     * Default `[]` — при ранних sync до доработки 2.6 поле останется пустым,
     * Bus Factor для этого периода покажет «нет данных».
     */
    filePaths: text('file_paths').array().default([]).notNull(),
    /** true = MR имеет хотя бы одну метку из projects.hotfixLabels */
    hasHotfixLabel: boolean('has_hotfix_label').default(false).notNull(),
    /** true = MR имеет хотя бы одну метку из projects.revertLabels */
    hasRevertLabel: boolean('has_revert_label').default(false).notNull()
  },
  (t) => ({
    uniqueMrPerProject: unique('uq_mr_iid_per_project').on(t.projectUid, t.gitlabMrIid)
  })
);

export type InsertMergeRequest = typeof mergeRequests.$inferInsert;
export type SelectMergeRequest = typeof mergeRequests.$inferSelect;

// ---------------------------------------------------------------------------
// MR ↔ Commit (связующая таблица)
// ---------------------------------------------------------------------------

/**
 * Коммиты, вошедшие в конкретный MR (many-to-many).
 */
export const mrCommits = pgTable(
  'mr_commits',
  {
    mergeRequestUid: uuid('merge_request_uid')
      .references(() => mergeRequests.uid)
      .notNull(),
    commitUid: uuid('commit_uid')
      .references(() => commits.uid)
      .notNull()
  },
  (t) => ({
    pk: unique('uq_mr_commit').on(t.mergeRequestUid, t.commitUid)
  })
);

// ---------------------------------------------------------------------------
// MR Reviews
// ---------------------------------------------------------------------------

/**
 * Ревью на merge requests.
 * Одна запись = одно действие ревьюера (комментарий, апрув, запрос изменений).
 */
export const mrReviews = pgTable('mr_reviews', {
  ...baseSchema,
  mergeRequestUid: uuid('merge_request_uid')
    .references(() => mergeRequests.uid)
    .notNull(),
  reviewerUid: uuid('reviewer_uid').references(() => users.uid),
  reviewerGitlabUsername: text('reviewer_gitlab_username').notNull(),
  state: text('state').$type<ReviewState>().notNull(),
  reviewedAt: timestamp('reviewed_at').notNull()
});

export type InsertMrReview = typeof mrReviews.$inferInsert;
export type SelectMrReview = typeof mrReviews.$inferSelect;

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

/**
 * Деплои в продакшен, определяемые по тегам GitLab.
 * Паттерн тегов задаётся в projects.releaseTagPattern.
 *
 * Связь с merge_requests — many-to-many через deploymentMergeRequests:
 * один релиз обычно агрегирует несколько MR, попавших в него
 * (ВКР раздел 3.5.1, агрегация Deployment ◇— MergeRequest).
 *
 * isFailed/isHotfix/isRevert вычисляются при синхронизации:
 * — isHotfix/isRevert — true, если хотя бы один связанный MR имеет
 *   соответствующую метку (hasHotfixLabel / hasRevertLabel).
 * — isFailed — reserved for future; в MVP = false (требует интеграции с мониторингом).
 */
export const deployments = pgTable(
  'deployments',
  {
    ...baseSchema,
    projectUid: uuid('project_uid')
      .references(() => projects.uid)
      .notNull(),
    /** Имя git-тега */
    tag: text('tag').notNull(),
    /** SHA коммита, на который указывает тег */
    commitSha: text('commit_sha').notNull(),
    deployedAt: timestamp('deployed_at').notNull(),
    isFailed: boolean('is_failed').default(false).notNull(),
    isHotfix: boolean('is_hotfix').default(false).notNull(),
    isRevert: boolean('is_revert').default(false).notNull()
  },
  (t) => ({
    uniqueTagPerProject: unique('uq_tag_per_project').on(t.projectUid, t.tag)
  })
);

export type InsertDeployment = typeof deployments.$inferInsert;
export type SelectDeployment = typeof deployments.$inferSelect;

// ---------------------------------------------------------------------------
// Deployment ↔ MergeRequest (связующая таблица)
// ---------------------------------------------------------------------------

/**
 * Merge requests, попавшие в конкретный релиз (many-to-many).
 * Используется для расчёта Lead Time: для каждого MR в деплое
 * берётся время первого его коммита, разница с deployedAt = lead time.
 */
export const deploymentMergeRequests = pgTable(
  'deployment_merge_requests',
  {
    deploymentUid: uuid('deployment_uid')
      .references(() => deployments.uid)
      .notNull(),
    mergeRequestUid: uuid('merge_request_uid')
      .references(() => mergeRequests.uid)
      .notNull()
  },
  (t) => ({
    pk: unique('uq_deployment_mr').on(t.deploymentUid, t.mergeRequestUid)
  })
);
