import type {
  BusFactorValue,
  ChangeFailureRateValue,
  CycleTimeMrValue,
  DeploymentFrequencyGranularity,
  DeploymentFrequencyValue,
  LeadTimeValue,
  MrSizeValue
} from '@/db/drizzle/schema/metrics/schema';

import { notImplemented } from '@/lib/not-implemented';
import { canViewTeamMetric } from '@/middleware/role-matrix';

import type { TeamAccessResult } from './lib/team-access';

import { BusFactorCalculator } from './calculators/bus-factor.calculator';
import {
  computeBusFactor,
  computeChangeFailureRate,
  computeCycleTimeMr,
  computeDeploymentFrequency,
  computeLeadTime,
  computeMrSize
} from './lib/compute-team';
import { assertTeamAccess } from './lib/team-access';

/**
 * Сервис получения рассчитанных метрик команды (ВКР 2.2.3, FR-07).
 *
 * Ролевая модель:
 *   — DEVELOPER → отдельные `/me/...` эндпоинты (не этот сервис);
 *   — LEAD      → командные агрегаты тех команд, где он лид (LEAD per-team);
 *   — HEAD      → команды своего отдела;
 *   — ADMIN     → любые команды (для отладки/аудита).
 *
 * Все команд-зависимые методы выполняют `assertTeamAccess` ПЕРЕД доступом
 * к БД, чтобы 403 возвращался до маршрутизации тяжёлых выборок.
 *
 * После доработки 2.7 сами вычисления вынесены в `lib/compute-team.ts` —
 * это позволяет snapshot-writer'у (system-context) использовать ту же
 * логику расчёта, без actorUid и authorization-checks. Гарантия —
 * snapshot всегда бит-в-бит идентичен on-demand-расчёту.
 */

// ===========================================================================
// Сводные метрики (доработка 3.2 — реализация).
//
// Собирает в один ответ все доступные роли actor'а метрики команды
// (CT MR, MR Size, Lead Time, DF, CFR, Bus Factor). Per-metric фильтр
// по `canRoleAccessMetric` (matrix из 3.1) — недоступные метрики
// возвращаются как `null`, чтобы UI знал «эта метрика существует, но
// тебе её нельзя».
//
// Использование:
//   — DEVELOPER-member своей команды → все 6 метрик (агрегаты, baseline);
//   — LEAD команды → все 6 (полный обзор);
//   — HEAD отдела → 4 DORA + Bus Factor (review-метрики null'нутся);
//   — ADMIN → все 6 (отладка).
//
// Все метрики считаются за ОДНО окно `[periodStart, periodEnd]` — это
// единая «срезка» команды на момент запроса (удобно для одностраничного
// дашборда). Для Bus Factor `windowDays = (periodEnd - periodStart) / day`,
// с защитой от выхода за рамки [1, 365].
//
// Парная визуализация (FR-06) на фронте: DF и CFR в этом ответе уже
// рядом, фронт рисует их парно без дополнительных запросов.
// ===========================================================================

export interface TeamMetricsBundle {
  /**
   * Способ доступа actor'а к команде (см. `team-access.ts`).
   * Прозрачно для фронта — UI может показать индикатор «вы member»
   * vs «вы лид» в верхней части дашборда.
   */
  accessMode: TeamAccessResult['accessMode'];
  /**
   * Per-metric ключи: либо `value`, либо `null` (роль не имеет доступа).
   * `null` — НЕ означает «нет данных»; это «у тебя нет права смотреть».
   * Различие критично для UI: на `null` показать сообщение «недоступно для
   * вашей роли», на пустой value (sampleSize=0) — «нет данных за период».
   */
  metrics: {
    cycle_time_mr: Awaited<ReturnType<typeof computeCycleTimeMr>> | null;
    mr_size: Awaited<ReturnType<typeof computeMrSize>> | null;
    lead_time: Awaited<ReturnType<typeof computeLeadTime>> | null;
    deployment_frequency: Awaited<ReturnType<typeof computeDeploymentFrequency>> | null;
    change_failure_rate: Awaited<ReturnType<typeof computeChangeFailureRate>> | null;
    bus_factor: Awaited<ReturnType<typeof computeBusFactor>> | null;
  };
  metricType: 'bundle';
  periodEnd: Date;
  periodStart: Date;
  projectUids: string[];
  teamUid: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const getTeamMetrics = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamMetricsBundle> => {
  if (periodEnd < periodStart) throw new Error('periodEnd must be ≥ periodStart');

  const { projectUids, accessMode } = await assertTeamAccess(actorUid, teamUid);

  // Bus Factor windowDays — производное от запрошенного периода.
  // Min 1 day (защита от деления на ноль), max 365 (потолок BusFactor).
  const periodDays = Math.max(
    1,
    Math.min(365, Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY))
  );

  // Параллельный compute. Те метрики, к которым роль не имеет доступа,
  // пропускаются — Promise.resolve(null). Это экономит SQL: HEAD не делает
  // лишних SELECT'ов по cycle_time_mr и mr_size.
  //
  // Используем `canViewTeamMetric(accessMode, ...)` (не `canRoleAccessMetric`):
  // accessMode уже учитывает per-team scope, и DEVELOPER-member получает
  // ВСЕ 6 метрик командного baseline (FR-07). Эта семантика отличается от
  // отдельных эндпоинтов `/cycle-time-mr` (там requireRole='LEAD,ADMIN'
  // отбрасывает DEV глобально) — bundle более либеральный к member'ам.
  const [ct, sz, lt, df, cfr, bf] = await Promise.all([
    canViewTeamMetric(accessMode, 'cycle_time_mr')
      ? computeCycleTimeMr(projectUids, periodStart, periodEnd)
      : Promise.resolve(null),
    canViewTeamMetric(accessMode, 'mr_size')
      ? computeMrSize(projectUids, periodStart, periodEnd)
      : Promise.resolve(null),
    canViewTeamMetric(accessMode, 'lead_time')
      ? computeLeadTime(projectUids, periodStart, periodEnd)
      : Promise.resolve(null),
    canViewTeamMetric(accessMode, 'deployment_frequency')
      ? computeDeploymentFrequency(projectUids, periodStart, periodEnd, 'week')
      : Promise.resolve(null),
    canViewTeamMetric(accessMode, 'change_failure_rate')
      ? computeChangeFailureRate(projectUids, periodStart, periodEnd, 'week')
      : Promise.resolve(null),
    canViewTeamMetric(accessMode, 'bus_factor')
      ? computeBusFactor(projectUids, periodStart, periodEnd, periodDays)
      : Promise.resolve(null)
  ]);

  return {
    metricType: 'bundle',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    accessMode,
    metrics: {
      cycle_time_mr: ct,
      mr_size: sz,
      lead_time: lt,
      deployment_frequency: df,
      change_failure_rate: cfr,
      bus_factor: bf
    }
  };
};

// ===========================================================================
// 2.1 Cycle Time MR (ВКР FR-09)
// ===========================================================================

export interface TeamCycleTimeMrReport {
  metricType: 'cycle_time_mr';
  periodEnd: Date;
  periodStart: Date;
  projectUids: string[];
  teamUid: string;
  value: CycleTimeMrValue;
}

export const getTeamCycleTimeMr = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamCycleTimeMrReport> => {
  if (periodEnd < periodStart) throw new Error('periodEnd must be ≥ periodStart');
  const { projectUids } = await assertTeamAccess(actorUid, teamUid);
  const value = await computeCycleTimeMr(projectUids, periodStart, periodEnd);
  return { metricType: 'cycle_time_mr', teamUid, periodStart, periodEnd, projectUids, value };
};

// ===========================================================================
// 2.2 MR Size (ВКР FR-15)
// ===========================================================================

export interface TeamMrSizeReport {
  metricType: 'mr_size';
  periodEnd: Date;
  periodStart: Date;
  projectUids: string[];
  teamUid: string;
  value: MrSizeValue;
}

export const getTeamMrSize = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamMrSizeReport> => {
  if (periodEnd < periodStart) throw new Error('periodEnd must be ≥ periodStart');
  const { projectUids } = await assertTeamAccess(actorUid, teamUid);
  const value = await computeMrSize(projectUids, periodStart, periodEnd);
  return { metricType: 'mr_size', teamUid, periodStart, periodEnd, projectUids, value };
};

// ===========================================================================
// 2.3 Lead Time for Changes (ВКР FR-04, DORA-throughput)
// ===========================================================================

export interface TeamLeadTimeReport {
  metricType: 'lead_time';
  periodEnd: Date;
  periodStart: Date;
  projectUids: string[];
  teamUid: string;
  value: LeadTimeValue;
}

export const getTeamLeadTime = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamLeadTimeReport> => {
  if (periodEnd < periodStart) throw new Error('periodEnd must be ≥ periodStart');
  const { projectUids } = await assertTeamAccess(actorUid, teamUid);
  const value = await computeLeadTime(projectUids, periodStart, periodEnd);
  return { metricType: 'lead_time', teamUid, periodStart, periodEnd, projectUids, value };
};

// ===========================================================================
// 2.4 Deployment Frequency (ВКР FR-04, DORA-throughput)
// ===========================================================================

export interface TeamDeploymentFrequencyReport {
  metricType: 'deployment_frequency';
  periodEnd: Date;
  periodStart: Date;
  projectUids: string[];
  teamUid: string;
  value: DeploymentFrequencyValue;
}

export const getTeamDeploymentFrequency = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date,
  granularity: DeploymentFrequencyGranularity = 'week'
): Promise<TeamDeploymentFrequencyReport> => {
  if (periodEnd < periodStart) throw new Error('periodEnd must be ≥ periodStart');
  const { projectUids } = await assertTeamAccess(actorUid, teamUid);
  const value = await computeDeploymentFrequency(projectUids, periodStart, periodEnd, granularity);
  return {
    metricType: 'deployment_frequency',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    value
  };
};

// ===========================================================================
// 2.5 Change Failure Rate (ВКР FR-04, DORA-instability)
// ===========================================================================

export interface TeamChangeFailureRateReport {
  metricType: 'change_failure_rate';
  periodEnd: Date;
  periodStart: Date;
  projectUids: string[];
  teamUid: string;
  value: ChangeFailureRateValue;
}

export const getTeamChangeFailureRate = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date,
  granularity: DeploymentFrequencyGranularity = 'week'
): Promise<TeamChangeFailureRateReport> => {
  if (periodEnd < periodStart) throw new Error('periodEnd must be ≥ periodStart');
  const { projectUids } = await assertTeamAccess(actorUid, teamUid);
  const value = await computeChangeFailureRate(projectUids, periodStart, periodEnd, granularity);
  return {
    metricType: 'change_failure_rate',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    value
  };
};

// ===========================================================================
// 2.6 Bus Factor (ВКР FR-10)
// ===========================================================================

export interface TeamBusFactorReport {
  metricType: 'bus_factor';
  projectUids: string[];
  teamUid: string;
  value: BusFactorValue;
  /** Конец окна. */
  windowEnd: Date;
  /** Начало окна (windowEnd − windowDays). */
  windowStart: Date;
}

export const getTeamBusFactor = async (
  actorUid: string,
  teamUid: string,
  windowDays: number = BusFactorCalculator.DEFAULT_WINDOW_DAYS,
  /**
   * `windowEnd` — параметр для snapshot-writer (доработка 2.7).
   * Дефолт `new Date()` сохраняет старое поведение on-demand-эндпоинта.
   */
  windowEnd: Date = new Date()
): Promise<TeamBusFactorReport> => {
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    throw new Error('windowDays must be a positive integer');
  }
  const { projectUids } = await assertTeamAccess(actorUid, teamUid);
  const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const value = await computeBusFactor(projectUids, windowStart, windowEnd, windowDays);
  return { metricType: 'bus_factor', teamUid, windowStart, windowEnd, projectUids, value };
};

// ===========================================================================
// FR-13 Anomalies (заглушки — за пределами MVP)
// ===========================================================================

export const getTeamAnomalies = async (_actorUid: string, _teamUid: string) => {
  notImplemented('metrics.getTeamAnomalies');
};

export const dismissAnomaly = async (_actorUid: string, _teamUid: string, _anomalyUid: string) => {
  notImplemented('metrics.dismissAnomaly');
};
