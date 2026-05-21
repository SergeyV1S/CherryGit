import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import type { EntityType } from './types/entity-type.type';
import type { MetricType } from './types/metric-type.type';

import { baseSchema } from '../base.schema';
import { users } from '../user/schema';

// ---------------------------------------------------------------------------
// Metric value shapes (хранятся в JSONB-поле value)
// ---------------------------------------------------------------------------

/** Lead Time: медиана и 90-й перцентиль в секундах */
export interface LeadTimeValue {
  medianSeconds: number;
  p90Seconds: number;
  sampleSize: number;
}

/** Deployment Frequency: число деплоев и рассчитанная категория */
export interface DeploymentFrequencyValue {
  /** elite | high | medium | low */
  category: string;
  count: number;
  perDay: number;
}

/** Change Failure Rate: доля неудачных деплоев */
export interface ChangeFailureRateValue {
  failedDeploys: number;
  ratePercent: number;
  totalDeploys: number;
}

/** Cycle Time MR: фазы в секундах */
export interface CycleTimeMrValue {
  medianTotalSeconds: number;
  p90TotalSeconds: number;
  phases: {
    timeToFirstReviewMedianSeconds: number;
    timeInReviewMedianSeconds: number;
    timeToMergeAfterApprovalMedianSeconds: number;
  };
  sampleSize: number;
}

/** MR Size: распределение по бакетам */
export interface MrSizeValue {
  buckets: {
    /** ≤50 | 51-200 | 201-400 | 401-800 | >800 */
    label: string;
    count: number;
    percent: number;
  }[];
  medianLinesChanged: number;
}

/** Bus Factor: число активных контрибьюторов по модулям */
export interface BusFactorValue {
  modules: {
    path: string;
    activeContributors: number;
    authors: string[];
  }[];
  overallBusFactor: number;
}

export type MetricValue =
  | BusFactorValue
  | ChangeFailureRateValue
  | CycleTimeMrValue
  | DeploymentFrequencyValue
  | LeadTimeValue
  | MrSizeValue;

// ---------------------------------------------------------------------------
// MetricSnapshot
// ---------------------------------------------------------------------------

/**
 * Рассчитанный снимок метрики за период.
 * entityId ссылается на project.uid, team.uid или user.uid в зависимости от entityType.
 * Индексируется по (metricType, entityType, entityId, periodStart, periodEnd).
 *
 * Ролевая модель:
 *   entityType='user'    → доступен только самому пользователю (DEVELOPER)
 *   entityType='team'    → доступен LEAD и выше
 *   entityType='project' → доступен MANAGER
 */
export const metricsSnapshots = pgTable('metrics_snapshots', {
  ...baseSchema,
  metricType: text('metric_type').$type<MetricType>().notNull(),
  entityType: text('entity_type').$type<EntityType>().notNull(),
  /** UUID сущности: project.uid | team.uid | user.uid */
  entityId: uuid('entity_id').notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  /** Рассчитанное значение; структура зависит от metricType (см. типы выше) */
  value: jsonb('value').$type<MetricValue>().notNull(),
  calculatedAt: timestamp('calculated_at').notNull()
});

export type InsertMetricSnapshot = typeof metricsSnapshots.$inferInsert;
export type SelectMetricSnapshot = typeof metricsSnapshots.$inferSelect;

// ---------------------------------------------------------------------------
// AuditLog
// ---------------------------------------------------------------------------

/**
 * Журнал действий пользователей в системе.
 * Пишется при: подключении проекта, изменении команды, ручном запуске синхронизации.
 */
export const auditLogs = pgTable('audit_logs', {
  ...baseSchema,
  /** Пользователь, совершивший действие; null для системных событий */
  userUid: uuid('user_uid').references(() => users.uid),
  action: text('action').notNull(),
  /** Тип сущности, над которой выполнено действие */
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  /** Дополнительный контекст (diff, старые значения и т.п.) */
  details: jsonb('details').$type<Record<string, unknown>>(),
  occurredAt: timestamp('occurred_at').defaultNow().notNull()
});

export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type SelectAuditLog = typeof auditLogs.$inferSelect;
