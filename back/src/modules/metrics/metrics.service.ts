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
// Сводные метрики (заглушка — этот эндпоинт собирает шесть метрик в один
// ответ, удобно для дашборда тимлида одним запросом). Реализация —
// в snapshot-эндпоинтах (доработка 2.7): фронт дёргает /snapshots/latest.
// ===========================================================================

export const getTeamMetrics = async (
  _actorUid: string,
  _teamUid: string,
  _periodStart: Date,
  _periodEnd: Date
) => {
  notImplemented('metrics.getTeamMetrics');
};

// ===========================================================================
// 2.1 Cycle Time MR (ВКР FR-09)
// ===========================================================================

export interface TeamCycleTimeMrReport {
  metricType: 'cycle_time_mr';
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  projectUids: string[];
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
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  projectUids: string[];
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
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  projectUids: string[];
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
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  projectUids: string[];
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
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  projectUids: string[];
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
  /** Конец окна. */
  windowEnd: Date;
  /** Начало окна (windowEnd − windowDays). */
  windowStart: Date;
  teamUid: string;
  projectUids: string[];
  value: BusFactorValue;
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

export const dismissAnomaly = async (
  _actorUid: string,
  _teamUid: string,
  _anomalyUid: string
) => {
  notImplemented('metrics.dismissAnomaly');
};
