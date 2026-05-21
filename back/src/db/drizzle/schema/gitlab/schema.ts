import { integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import type { GitLabConnectionStatus } from './types/gitlab-connection-status.type';
import type { SyncStatusType } from './types/sync-status.type';

import { baseSchema } from '../base.schema';
import { users } from '../user/schema';

/**
 * Подключения к GitLab-инстансам (self-hosted или cloud).
 * Один инстанс — одна запись, к нему могут быть привязаны несколько projects.
 */
export const gitlabConnections = pgTable('gitlab_connections', {
  ...baseSchema,
  ownerUid: uuid('owner_uid')
    .references(() => users.uid)
    .notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  /** Personal Access Token, зашифрован перед сохранением */
  encryptedToken: text('encrypted_token').notNull(),
  status: text('status').$type<GitLabConnectionStatus>().default('active').notNull(),
  lastCheckedAt: timestamp('last_checked_at')
});

export type InsertGitlabConnection = typeof gitlabConnections.$inferInsert;
export type SelectGitlabConnection = typeof gitlabConnections.$inferSelect;

/**
 * GitLab-проекты, подключённые к системе.
 * Один проект принадлежит одному GitLab-инстансу (через gitlabConnectionUid).
 */
export const projects = pgTable(
  'projects',
  {
    ...baseSchema,
    gitlabConnectionUid: uuid('gitlab_connection_uid')
      .references(() => gitlabConnections.uid)
      .notNull(),
    /** ID проекта на стороне GitLab */
    gitlabProjectId: integer('gitlab_project_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Пространство имён (group/subgroup) для отображения */
    namespace: text('namespace'),
    /** Glob-паттерн тегов, означающих деплой в продакшен, напр. "v*" */
    releaseTagPattern: text('release_tag_pattern').default('v*').notNull(),
    /** Метка MR, обозначающая хотфикс (для CFR) */
    hotfixLabel: text('hotfix_label').default('hotfix').notNull(),
    /** Метка MR, обозначающая откат (для CFR) */
    revertLabel: text('revert_label').default('revert').notNull()
  },
  (t) => ({
    /** Один проект GitLab не может быть подключён дважды к одному инстансу */
    uniqueProjectPerConnection: unique('uq_project_per_connection').on(
      t.gitlabConnectionUid,
      t.gitlabProjectId
    )
  })
);

export type InsertProject = typeof projects.$inferInsert;
export type SelectProject = typeof projects.$inferSelect;

/**
 * Состояние инкрементальной синхронизации с GitLab (1:1 с projects).
 * Хранит «закладку», с которой следующий cron-джоб продолжит сбор данных.
 */
export const syncStatuses = pgTable('sync_statuses', {
  ...baseSchema,
  projectUid: uuid('project_uid')
    .references(() => projects.uid)
    .notNull()
    .unique(),
  lastSyncAt: timestamp('last_sync_at'),
  /** SHA последнего собранного коммита */
  lastCommitSha: text('last_commit_sha'),
  /** IID последнего собранного MR на стороне GitLab */
  lastMrIid: integer('last_mr_iid'),
  status: text('status').$type<SyncStatusType>().default('idle').notNull(),
  errorMessage: text('error_message')
});

export type InsertSyncStatus = typeof syncStatuses.$inferInsert;
export type SelectSyncStatus = typeof syncStatuses.$inferSelect;
