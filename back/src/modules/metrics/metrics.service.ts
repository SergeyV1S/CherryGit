import { notImplemented } from '@/lib/not-implemented';

/**
 * Сервис получения рассчитанных метрик из metrics_snapshots.
 * Проверка ролевого доступа на уровне сервиса (ВКР 2.2.3, FR-07):
 * — DEVELOPER из чужой команды → 403
 * — LEAD не из этой команды → 403
 * — HEAD из другого отдела → 403
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
 * Cycle Time MR с декомпозицией на три фазы (FR-09).
 * Доступ — только LEAD команды.
 */
export const getTeamCycleTimeMr = async (
  _actorUid: string,
  _teamUid: string,
  _periodStart: Date,
  _periodEnd: Date
) => {
  notImplemented('metrics.getTeamCycleTimeMr');
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
