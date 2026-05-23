import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import type { GitLabConnectionStatus } from './types/gitlab-connection-status.type';
import type { RawPayloadType } from './types/raw-payload-type.type';
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
  /** Personal Access Token, зашифрован перед сохранением (ВКР 2.2.3) */
  encryptedToken: text('encrypted_token').notNull(),
  status: text('status').$type<GitLabConnectionStatus>().default('active').notNull(),
  lastCheckedAt: timestamp('last_checked_at')
});

export type InsertGitlabConnection = typeof gitlabConnections.$inferInsert;
export type SelectGitlabConnection = typeof gitlabConnections.$inferSelect;

/**
 * Сопоставление учётной записи CherryGit с учётной записью GitLab.
 * Один пользователь может иметь разные GitLab-аккаунты на разных инстансах,
 * поэтому идентификация per-connection (UC-03 в ВКР).
 *
 * `email` (доработка 4.4) — нужен для резолва commit-авторов:
 * GitLab `/repository/commits` НЕ возвращает username, только `author_email`.
 * Без этой колонки `commits.authorUid` всегда null, и Bus Factor по
 * авторам коммитов деградирует до группировки по email-строкам.
 * Email опционален: identity может быть зарегистрирована вручную
 * (только по username, без email — тогда commit-author резолвиться не будет,
 * только MR/review-author).
 */
export const userGitlabIdentities = pgTable(
  'user_gitlab_identities',
  {
    ...baseSchema,
    userUid: uuid('user_uid')
      .references(() => users.uid)
      .notNull(),
    gitlabConnectionUid: uuid('gitlab_connection_uid')
      .references(() => gitlabConnections.uid)
      .notNull(),
    gitlabUsername: text('gitlab_username').notNull(),
    /**
     * Email пользователя на стороне GitLab. Используется sync'ом для резолва
     * `commits.authorUid` через `commit.author_email`. Nullable, потому что
     * GitLab API `/users?username=` возвращает email только если запрашивает
     * админ инстанса (для обычного PAT — public_email или null).
     *
     * Уникальность не enforce'им на уровне БД: разные CherryGit-юзеры могут
     * иметь одинаковый email на разных GitLab-инстансах. На уровне сервиса
     * проверяется per-connection.
     */
    email: text('email'),
    /** Численный ID пользователя на стороне GitLab */
    gitlabUserId: integer('gitlab_user_id').notNull()
  },
  (t) => ({
    uniqueUserPerConnection: unique('uq_user_per_connection').on(t.userUid, t.gitlabConnectionUid),
    uniqueUsernamePerConnection: unique('uq_username_per_connection').on(
      t.gitlabConnectionUid,
      t.gitlabUsername
    )
  })
);

export type InsertUserGitlabIdentity = typeof userGitlabIdentities.$inferInsert;
export type SelectUserGitlabIdentity = typeof userGitlabIdentities.$inferSelect;

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
    /** Дефолтная ветка проекта (берётся из GitLab при подключении). Используется sync-пайплайном для fetchCommits */
    defaultBranch: text('default_branch'),
    /** Glob-паттерн тегов, означающих деплой в продакшен, напр. "v*" */
    releaseTagPattern: text('release_tag_pattern').default('v*').notNull(),
    /**
     * Метки MR, обозначающие хотфикс (для CFR, FR-03 / ВКР 2.5).
     * MR с ЛЮБОЙ из этих меток помечается как hotfix; если такой MR
     * попадает в окно деплоя — деплой помечается `isHotfix=true`.
     * По умолчанию `{hotfix, rollback}`.
     */
    hotfixLabels: text('hotfix_labels').array().default(['hotfix', 'rollback']).notNull(),
    /**
     * Метки MR, обозначающие откат изменений (для CFR).
     * Семантически парный набор к `hotfixLabels`, но хранится отдельно,
     * т.к. `merge_requests.hasHotfixLabel` и `hasRevertLabel` — разные колонки.
     * По умолчанию `{revert}`.
     */
    revertLabels: text('revert_labels').array().default(['revert']).notNull()
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

/**
 * Разметка модулей кодовой базы для расчёта Bus Factor по модулям (ВКР 2.2.2, FR-10).
 * Администратор задаёт логические модули через glob-паттерны путей файлов;
 * BusFactorCalculator группирует коммиты по path_pattern.
 *
 * Пример: name="auth", pathPattern="src/auth/**" — все коммиты, затрагивающие
 * файлы в src/auth/, относятся к модулю "auth".
 */
export const codeModules = pgTable(
  'code_modules',
  {
    ...baseSchema,
    projectUid: uuid('project_uid')
      .references(() => projects.uid)
      .notNull(),
    name: text('name').notNull(),
    /** Glob-паттерн пути файла, относящегося к модулю */
    pathPattern: text('path_pattern').notNull(),
    description: text('description')
  },
  (t) => ({
    uniqueModulePerProject: unique('uq_module_per_project').on(t.projectUid, t.name)
  })
);

export type InsertCodeModule = typeof codeModules.$inferInsert;
export type SelectCodeModule = typeof codeModules.$inferSelect;

/**
 * Staging-таблица сырых payload-ов от GitLab API (ВКР 2.2.5).
 * Используется как буфер: cron-джоб сохраняет ответы GitLab «как есть»
 * в jsonb, затем парсер маппит их в нормализованные сущности
 * и проставляет processedAt.
 *
 * Назначение:
 *  — устойчивость к сбоям парсера (можно перезапустить обработку);
 *  — отладка расхождений между ожидаемым и фактическим payload-ом GitLab;
 *  — соответствие требованию ВКР о хранении сырых данных в JSONB до обработки.
 */
export const gitlabRawPayloads = pgTable('gitlab_raw_payloads', {
  ...baseSchema,
  projectUid: uuid('project_uid')
    .references(() => projects.uid)
    .notNull(),
  payloadType: text('payload_type').$type<RawPayloadType>().notNull(),
  /** ID объекта на стороне GitLab (для дедупликации при ретраях) */
  gitlabId: text('gitlab_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  /** null = ещё не обработан; timestamp = успешно смапплен в нормализованные таблицы */
  processedAt: timestamp('processed_at'),
  /** Сообщение об ошибке парсера, если processedAt = null и было исключение */
  processingError: text('processing_error')
});

export type InsertGitlabRawPayload = typeof gitlabRawPayloads.$inferInsert;
export type SelectGitlabRawPayload = typeof gitlabRawPayloads.$inferSelect;
