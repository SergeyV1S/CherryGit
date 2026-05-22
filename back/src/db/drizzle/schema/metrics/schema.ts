import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import type { AnomalySeverity } from './types/anomaly-severity.type';
import type { AnomalySignalType } from './types/anomaly-signal-type.type';
import type { EntityType } from './types/entity-type.type';
import type { MetricType } from './types/metric-type.type';

import { baseSchema } from '../base.schema';
import { teams } from '../teams/schema';
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

/**
 * Cycle Time MR (ВКР FR-09, доработка 2.1) — целиком и по фазам в секундах.
 *
 * Все агрегаты — `number | null`:
 *   `null` означает «нет данных в выборке за период» (пустая выборка после
 *   фильтрации, например все MR без `approvedAt` → timeInReview = null).
 *   Это лучше чем `0`, потому что `0` ≠ «отсутствие наблюдения».
 *
 * Для прозрачности расчёта (ВКР: «формула в UI») возвращаются:
 *   — sampleSize:     сколько merged-MR попало в выборку;
 *   — excludedDrafts: сколько отброшено фильтром Draft/WIP;
 *   — sampleSizePerPhase: размер не-null выборки каждой фазы (фаза может быть
 *     меньше общей выборки, если у MR нет firstReviewAt/approvedAt).
 */
export interface CycleTimeMrValue {
  /** Время от открытия MR до мержа (`mergedAt - gitlabCreatedAt`). */
  medianTotalSeconds: number | null;
  p90TotalSeconds: number | null;
  phases: {
    /** firstReviewAt - gitlabCreatedAt */
    timeToFirstReviewMedianSeconds: number | null;
    timeToFirstReviewP90Seconds: number | null;
    /** approvedAt - firstReviewAt */
    timeInReviewMedianSeconds: number | null;
    timeInReviewP90Seconds: number | null;
    /** mergedAt - approvedAt */
    timeToMergeAfterApprovalMedianSeconds: number | null;
    timeToMergeAfterApprovalP90Seconds: number | null;
  };
  sampleSize: number;
  /** Сколько MR отфильтровано как draft/WIP по заголовку. */
  excludedDrafts: number;
  /** Не-null размеры выборок по фазам (MR без firstReview/approve → меньше). */
  sampleSizePerPhase: {
    timeToFirstReview: number;
    timeInReview: number;
    timeToMergeAfterApproval: number;
  };
}

/**
 * MR Size — распределение MR по бакетам размеров (ВКР FR-15, доработка 2.2).
 *
 * Бакеты фиксированные (по сумме `linesAdded + linesRemoved`):
 *   ≤50, 51-200, 201-400, 401-800, >800
 * Порядок бакетов в массиве — от меньшего к большему (для столбчатой
 * диаграммы это естественный X-axis: маленькие MR слева).
 *
 * Все агрегаты — `number | null`:
 *   `null` означает пустую выборку (после фильтрации Draft/WIP).
 *
 * Для прозрачности расчёта (ВКР: «формула в UI») возвращаются:
 *   — sampleSize:     сколько MR попало в выборку;
 *   — excludedDrafts: сколько отброшено фильтром Draft/WIP (как в 2.1).
 */
export interface MrSizeValue {
  buckets: {
    /** ≤50 | 51-200 | 201-400 | 401-800 | >800 */
    label: string;
    count: number;
    /** Доля бакета в выборке, 0..100, округлено до 2 знаков. 0 при пустой выборке. */
    percent: number;
  }[];
  /** Медиана суммы (linesAdded + linesRemoved) по MR в выборке. */
  medianLinesChanged: number | null;
  /** 90-й перцентиль той же выборки — показывает «хвост» крупных MR. */
  p90LinesChanged: number | null;
  sampleSize: number;
  /** Сколько MR отфильтровано как draft/WIP по заголовку. */
  excludedDrafts: number;
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

// ---------------------------------------------------------------------------
// Anomaly signals
// ---------------------------------------------------------------------------

/**
 * Сигналы аномалий командного флоу (ВКР FR-13, UC-02 шаг 8).
 *
 * Принципиальное ограничение: запись хранит ФАКТ устойчивого отклонения
 * на уровне команды, но НЕ раскрывает конкретные индивидуальные значения
 * метрик участников. Это обеспечивает соответствие ролевой модели:
 * тимлид видит сигнал «время в ревью у одного из участников устойчиво
 * выше командного флоу», но не видит, у кого именно и насколько.
 *
 * Подробные данные для отладки (включая участников) могут лежать в details,
 * но API-эндпоинт для роли LEAD должен возвращать только description
 * без раскрытия details.
 */
export const anomalySignals = pgTable('anomaly_signals', {
  ...baseSchema,
  teamUid: uuid('team_uid')
    .references(() => teams.uid)
    .notNull(),
  signalType: text('signal_type').$type<AnomalySignalType>().notNull(),
  severity: text('severity').$type<AnomalySeverity>().default('info').notNull(),
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  /** Человекочитаемое описание сигнала БЕЗ индивидуальных значений */
  description: text('description').notNull(),
  /**
   * Технические детали для системного анализа (содержат индивидуальные данные).
   * НЕ возвращаются через API роли LEAD — только для роли ADMIN/системных отчётов.
   */
  details: jsonb('details').$type<Record<string, unknown>>(),
  /** null = активный сигнал; timestamp = тимлид пометил как просмотренный */
  dismissedAt: timestamp('dismissed_at'),
  dismissedByUserUid: uuid('dismissed_by_user_uid').references(() => users.uid)
});

export type InsertAnomalySignal = typeof anomalySignals.$inferInsert;
export type SelectAnomalySignal = typeof anomalySignals.$inferSelect;
