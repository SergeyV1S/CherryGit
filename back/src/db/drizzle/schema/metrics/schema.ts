import { jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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

/**
 * Lead Time for Changes (ВКР FR-04, DORA-throughput, доработка 2.3).
 *
 * Семантика DORA: время от первого коммита изменения до его выкатки в прод.
 * В нашей модели «изменение» = merge request, «выкатка» = deployment с тегом,
 * подошедшим под `releaseTagPattern`. Связка обеспечена таблицей
 * `deployment_merge_requests` (заполняется в 1.4).
 *
 * Формула на пару (deployment, MR):
 *   leadTime = deployedAt − MIN(commits.committedAt for c in mr_commits)
 *
 * Агрегаты — `number | null` (null = пустая выборка, как в 2.1/2.2). Для
 * прозрачности расчёта возвращаются три счётчика — UI рисует их рядом с
 * формулой в раскрывающемся блоке (ВКР: «формула в UI»).
 */
export interface LeadTimeValue {
  medianSeconds: number | null;
  p90Seconds: number | null;
  /** Сколько пар (deployment, MR) попало в выборку. */
  sampleSize: number;
  /** Сколько деплоев в окне периода рассмотрено (включая пустые). */
  deploymentsConsidered: number;
  /** Сколько MR пропущено из-за отсутствия mr_commits (см. ДОРАБОТКИ 2.3). */
  excludedMrsWithoutCommits: number;
}

/**
 * Deployment Frequency — DORA-throughput (ВКР FR-04, доработка 2.4).
 *
 * Семантика: средняя частота деплоев в продакшен за окно периода.
 * `count` — число successful-деплоев (с `isFailed=false`) в окне;
 * `perDay` = count / periodDays (для категоризации DORA).
 *
 * Категории (концепция CherryGit, согласовано с DORA State of DevOps):
 *   elite   — несколько в день         (perDay > 1)
 *   high    — день — неделя            (1/7 ≤ perDay ≤ 1)
 *   medium  — неделя — месяц           (1/30 ≤ perDay < 1/7)
 *   low     — реже (включая 0 deploys) (perDay < 1/30)
 *
 * `timeline` — распределение по бакетам времени для графика (`day` /
 * `week` / `month`); порядок — хронологический, ключ — ISO-строка
 * начала бакета (для week — понедельник 00:00 UTC).
 */
export type DeploymentFrequencyCategory = 'elite' | 'high' | 'low' | 'medium';
export type DeploymentFrequencyGranularity = 'day' | 'month' | 'week';

export interface DeploymentFrequencyValue {
  category: DeploymentFrequencyCategory;
  count: number;
  /** Среднее число деплоев в день за период (для UI: «X.Y deploys/day»). */
  perDay: number;
  /** Дней в окне периода (для прозрачности расчёта; ≥1 ради защиты от /0). */
  periodDays: number;
  granularity: DeploymentFrequencyGranularity;
  /**
   * Распределение по бакетам: ключ — ISO-дата начала бакета,
   * значение — число деплоев в бакет. Пустые бакеты НЕ дополняются
   * (UI решает, рисовать ли пропуски как нули).
   */
  timeline: { bucket: string; count: number }[];
}

/**
 * Change Failure Rate — DORA-instability (ВКР FR-04, доработка 2.5).
 *
 * Семантика (CherryGit MVP, согласовано с 1.4):
 *   CFR = count(deployments с isHotfix OR isRevert) / count(all deployments) × 100%
 *
 * Парная метрика к Deployment Frequency (ВКР FR-06: «парная визуализация
 * скорости и качества»). Эндпоинты разделены — фронт делает два запроса
 * параллельно и рендерит рядом; granularity у обоих метрик совпадает.
 *
 * Категоризация (DORA Accelerate 2023, упрощённые пороги для CherryGit):
 *   elite   — ≤ 15%
 *   high    — ≤ 30%
 *   medium  — ≤ 45%
 *   low     — > 45%
 *   `null`  — totalDeploys=0 (CFR не определён, не путать с «ideally 0%»)
 *
 * Намеренное упрощение MVP (см. ДОРАБОТКИ 1.4): помечается _fix_-deploy
 * (тот, что содержит hotfix-MR), а не _broken_-deploy (тот, что был
 * сломан перед хотфиксом). Числитель/знаменатель совпадают, но семантика
 * атрибуции отличается; для канонической DORA нужна интеграция с
 * системой инцидент-менеджмента (вне MVP).
 */
export type ChangeFailureRateCategory = 'elite' | 'high' | 'low' | 'medium';

export interface ChangeFailureRateValue {
  totalDeploys: number;
  /** Деплои с isHotfix=true OR isRevert=true (дедуплицированы — один deploy = одна 1). */
  failedDeploys: number;
  /** Процент 0..100 (округлено до 2 знаков), null-safe (0 при totalDeploys=0). */
  ratePercent: number;
  /** Категория DORA; null если totalDeploys=0 (CFR не определён). */
  category: ChangeFailureRateCategory | null;
  /**
   * Разбивка failed по типу метки. Сумма `hotfixDeploys + revertDeploys`
   * может быть БОЛЬШЕ `failedDeploys`, если один deploy одновременно
   * isHotfix=true И isRevert=true (например, MR имел и `hotfix`, и `rollback`
   * метки одновременно — это допустимо моделью).
   */
  breakdown: {
    hotfixDeploys: number;
    revertDeploys: number;
  };
  granularity: DeploymentFrequencyGranularity;
  /**
   * Распределение по бакетам времени, парное с DF.timeline.
   * Пустые бакеты НЕ дополняются (UI решает, рисовать ли пропуски).
   */
  timeline: {
    bucket: string;
    totalDeploys: number;
    failedDeploys: number;
    /** Процент 0..100 в бакете; 0 при totalDeploys=0 в бакете. */
    ratePercent: number;
  }[];
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

/**
 * Bus Factor по модулям кодовой базы (ВКР FR-10, доработка 2.6).
 *
 * Семантика (CherryGit концепция):
 *   BF(module) = count(distinct authors с merged MR'ом, затронувшим module,
 *                       за последние windowDays)
 *
 * Цветовая маркировка из концепции:
 *   red    — 1 автор  (один человек — носитель знаний по модулю);
 *   yellow — 2 автора (минимальная резервная пара);
 *   green  — ≥3 автора.
 *
 * Модуль определяется одним из двух способов:
 *   1) explicit — `code_modules.pathPattern` (glob) на проекте, заданный
 *      админом через `/api/admin/projects/:uid/code-modules`;
 *   2) implicit — первая директория из пути файла (`src/auth/foo.ts` → `auth`,
 *      `package.json` → `<root>`). Используется как fallback, чтобы Bus Factor
 *      работал и без явно настроенных модулей.
 *
 * `overallBusFactor` = `min(BF(module))` среди ВСЕХ модулей с активностью —
 * это «самое слабое звено» команды, ради чего метрика и считается.
 */
export type BusFactorColor = 'green' | 'red' | 'yellow';

export interface BusFactorValue {
  /**
   * Минимум `activeContributors` по всем модулям с активностью.
   * `null` означает «нет данных» — за окно не нашлось ни одного MR с filePaths
   * (пустая выборка либо MR ещё не пере-засинхрены после доработки 2.6).
   */
  overallBusFactor: number | null;
  /** Длина окна в днях (по умолчанию 90 — из CLAUDE.md / концепции). */
  windowDays: number;
  /** Сколько merged-MR попало в выборку (для UI tooltip «формула расчёта»). */
  sampleSize: number;
  /**
   * Сколько MR в выборке имеют пустой `filePaths`. Если велико — значит
   * MR засинхрены до доработки 2.6; админу нужен `POST /admin/projects/:uid/resync`
   * для пере-загрузки изменений.
   */
  excludedMrsWithoutPaths: number;
  modules: {
    /** Имя/путь модуля. Для explicit — `code_modules.name`, для implicit — первая директория. */
    name: string;
    /** Glob-паттерн (для explicit-модулей); null для implicit. */
    pathPattern: string | null;
    /** true = модуль выведен из первой директории пути файла (нет настройки в `code_modules`). */
    isImplicit: boolean;
    activeContributors: number;
    /** Идентификаторы авторов (`uid:<userUid>` либо `gitlab:<username>` для незарегистрированных). */
    authors: string[];
    color: BusFactorColor;
  }[];
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
export const metricsSnapshots = pgTable(
  'metrics_snapshots',
  {
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
  },
  (t) => ({
    /**
     * Бизнес-ключ снепшота (доработка 2.7).
     * `(metricType, entityType, entityId, periodStart, periodEnd)` идентифицирует
     * единственный снепшот для конкретной метрики, сущности и окна периода.
     * Используется в `snapshot.service.ts` для `ON CONFLICT DO UPDATE` —
     * повторный sync-tick в том же периоде заменяет `value` и `calculatedAt`,
     * не плодит дубликаты.
     */
    uniqueSnapshot: unique('uq_snapshot_per_period').on(
      t.metricType,
      t.entityType,
      t.entityId,
      t.periodStart,
      t.periodEnd
    )
  })
);

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
