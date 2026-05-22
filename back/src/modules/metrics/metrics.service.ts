import { and, gte, inArray, lte } from 'drizzle-orm';

import type { CycleTimeMrValue } from '@/db/drizzle/schema/metrics/schema';

import { db } from '@/db/drizzle/connect';
import { mergeRequests } from '@/db/drizzle/schema/git-data/schema';
import { notImplemented } from '@/lib/not-implemented';

import {
  CycleTimeMrCalculator,
  type CycleTimeMrInput
} from './calculators/cycle-time-mr.calculator';
import { assertTeamAccess } from './lib/team-access';

/**
 * Сервис получения рассчитанных метрик из metrics_snapshots.
 *
 * Ролевая модель (ВКР 2.2.3, FR-07):
 *   — DEVELOPER → отдельные `/me/...` эндпоинты (не этот сервис);
 *   — LEAD      → командные агрегаты тех команд, где он лид (LEAD per-team);
 *   — HEAD      → команды своего отдела;
 *   — ADMIN     → любые команды (для отладки/аудита).
 *
 * Все команд-зависимые методы выполняют `assertTeamAccess` ПЕРЕД доступом
 * к БД, чтобы 403 возвращался до маршрутизации тяжёлых выборок.
 *
 * Текущий статус: реализованы методы из доработки 2.1 (Cycle Time MR).
 * Остальные — заглушки `notImplemented` до завершения 2.2-2.6.
 */

// ===== Team-scoped metrics =====

/**
 * Сводные метрики команды (парная визуализация скорости и качества — FR-06).
 * Возвращает: Lead Time, Deployment Frequency, Change Failure Rate, MR Size.
 */
export const getTeamMetrics = async (
  _actorUid: string,
  _teamUid: string,
  _periodStart: Date,
  _periodEnd: Date
) => {
  notImplemented('metrics.getTeamMetrics');
};

/**
 * Cycle Time MR с декомпозицией на 3 фазы (ВКР FR-09, доработка 2.1).
 *
 * Алгоритм (см. также cycle-time-mr.calculator.ts):
 *   1. assertTeamAccess(actor, team) — 403 если нет доступа, 404 если нет команды.
 *   2. Если у команды нет проектов — пустой результат (sampleSize=0).
 *   3. SELECT merged MRs по проектам команды, mergedAt ∈ [start, end].
 *   4. compute() — медиана и p90 на total + 3 фазы, отброс draft/WIP.
 *
 * Окно: фильтр по `mergedAt`. Это даёт стабильность — MR попадает в метрику
 * ровно того периода, в котором был замерджен (не «открыт», не «обновлён»).
 * Альтернативные окна (по `closedAt`, `gitlabCreatedAt`) могут быть полезны
 * для других дашбордов, но MVP-эндпоинт — по mergedAt.
 *
 * Доступ — LEAD команды / HEAD отдела / ADMIN.
 */
export interface TeamCycleTimeMrReport {
  metricType: 'cycle_time_mr';
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  value: CycleTimeMrValue;
  /** Список UID проектов, по которым шла выборка (прозрачность расчёта). */
  projectUids: string[];
}

export const getTeamCycleTimeMr = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamCycleTimeMrReport> => {
  if (periodEnd < periodStart) {
    // Контроллер пускает диапазон as-is — здесь страхуемся, чтобы не получить
    // пустую выборку из-за опечатки клиента.
    throw new Error('periodEnd must be ≥ periodStart');
  }

  const { projectUids } = await assertTeamAccess(actorUid, teamUid);

  const calculator = new CycleTimeMrCalculator();

  // Если у команды нет проектов — отдельная ветка: SELECT с inArray([]) в Drizzle
  // безопасен (вернёт пусто), но явная ранняя ветка читабельнее и экономит roundtrip.
  if (projectUids.length === 0) {
    return {
      metricType: 'cycle_time_mr',
      teamUid,
      periodStart,
      periodEnd,
      projectUids,
      value: calculator.compute([])
    };
  }

  // Выборка только merged-MR'ов с mergedAt в окне периода.
  // state='merged' исключает open/closed-без-мержа; mergedAt NOT NULL — там же.
  // Дополнительно фильтруем по target_branch != null уровнем выше (не нужно
  // тут — Cycle Time не зависит от ветки релиза, в отличие от Lead Time).
  const rows = await db
    .select({
      title: mergeRequests.title,
      gitlabCreatedAt: mergeRequests.gitlabCreatedAt,
      firstReviewAt: mergeRequests.firstReviewAt,
      approvedAt: mergeRequests.approvedAt,
      mergedAt: mergeRequests.mergedAt
    })
    .from(mergeRequests)
    .where(
      and(
        inArray(mergeRequests.projectUid, projectUids),
        gte(mergeRequests.mergedAt, periodStart),
        lte(mergeRequests.mergedAt, periodEnd)
      )
    );

  // Драйвер postgres возвращает timestamp как Date; типы Drizzle тоже.
  // Здесь ничего не парсим — отдаём как есть калькулятору.
  const input: CycleTimeMrInput[] = rows.map((r) => ({
    title: r.title,
    gitlabCreatedAt: r.gitlabCreatedAt,
    firstReviewAt: r.firstReviewAt,
    approvedAt: r.approvedAt,
    mergedAt: r.mergedAt
  }));

  return {
    metricType: 'cycle_time_mr',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    value: calculator.compute(input)
  };
};

/**
 * MR Size — распределение по бакетам (≤50, 51-200, 201-400, 401-800, >800).
 */
export const getTeamMrSize = async (
  _actorUid: string,
  _teamUid: string,
  _periodStart: Date,
  _periodEnd: Date
) => {
  notImplemented('metrics.getTeamMrSize');
};

/**
 * Bus Factor по модулям кодовой базы за 90 дней (FR-10).
 * Доступ — LEAD команды и HEAD.
 */
export const getTeamBusFactor = async (_actorUid: string, _teamUid: string) => {
  notImplemented('metrics.getTeamBusFactor');
};

/**
 * Сигналы аномалий командного флоу (FR-13).
 * Возвращает только description (без раскрытия индивидуальных значений).
 * Доступ — только LEAD команды.
 */
export const getTeamAnomalies = async (_actorUid: string, _teamUid: string) => {
  notImplemented('metrics.getTeamAnomalies');
};

export const dismissAnomaly = async (
  _actorUid: string,
  _teamUid: string,
  _anomalyUid: string
) => {
  notImplemented('metrics.dismissAnomaly');
};
