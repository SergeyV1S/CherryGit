import type { NextFunction, Request, Response } from 'express';

import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { sendResponse } from '@/lib/reponse';
import { param, queryString } from '@/lib/request-params';
import { assertTeamAccess } from '@/modules/metrics/lib/team-access';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import * as SnapshotService from './snapshot.service';

/**
 * REST-эндпоинты чтения снепшотов метрик команды (доработка 2.7).
 *
 * Доступ:
 *   1. `assertTeamAccess` — стандартная проверка LEAD/HEAD/ADMIN per-team
 *      (см. `metrics/lib/team-access.ts`).
 *   2. `assertMetricAccessibleForRole` — дополнительная фильтрация по
 *      `metricType`: HEAD не должен видеть MR-level review-метрики
 *      (CT MR, MR Size). Это «архитектурная гарантия» из ВКР 2.2.3
 *      «индивидуальные метрики приватны от руководителя».
 *
 * Контракт ответа `latest`:
 *   { metricType, periodStart, periodEnd, calculatedAt, value, teamUid }
 * совпадает по форме с on-demand-эндпоинтами `/cycle-time-mr` и т.п. —
 * фронт может переключаться между snapshot-чтением и on-demand-расчётом
 * без адаптеров.
 */

/** Валидация query-параметра metricType (whitelist из ALL_TEAM_METRICS). */
const parseMetricType = (raw: string | undefined): MetricType => {
  if (!raw) {
    throw new CustomError(HttpStatus.BAD_REQUEST, 'query param `metricType` is required');
  }
  if (!SnapshotService.KNOWN_METRIC_TYPES.has(raw as MetricType)) {
    throw new CustomError(
      HttpStatus.BAD_REQUEST,
      `metricType must be one of: ${[...SnapshotService.KNOWN_METRIC_TYPES].join(', ')}`
    );
  }
  return raw as MetricType;
};

/** Валидация optional ISO-даты — `undefined` если не передана. */
const parseOptionalDate = (raw: string | undefined, name: string): Date | undefined => {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new CustomError(HttpStatus.BAD_REQUEST, `query param ${name} is not a valid ISO date`);
  }
  return d;
};

/**
 * GET /api/teams/:teamUid/snapshots/latest?metricType=...
 *
 * Возвращает последний снимок метрики (или null, если writer ещё не отработал).
 */
export async function getLatestSnapshot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamUid = param(req, 'teamUid');
    const metricType = parseMetricType(queryString(req, 'metricType'));

    // assertTeamAccess валидирует команду и роль (LEAD/HEAD/ADMIN).
    // Дополнительно — assertMetricAccessibleForRole (MR-level не для HEAD).
    await assertTeamAccess(req.user!.uid, teamUid);
    const role = await SnapshotService.loadActorRole(req.user!.uid);
    SnapshotService.assertMetricAccessibleForRole(role, metricType);

    const snapshot = await SnapshotService.getLatestSnapshot(teamUid, metricType);
    sendResponse(res, HttpStatus.OK, snapshot);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/teams/:teamUid/snapshots/history?metricType=...&from=...&to=...
 *
 * История снепшотов команды для рисования трендов (timeline).
 * Дефолт окна — последние 90 дней.
 */
export async function getSnapshotHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamUid = param(req, 'teamUid');
    const metricType = parseMetricType(queryString(req, 'metricType'));
    const from = parseOptionalDate(queryString(req, 'from'), 'from');
    const to = parseOptionalDate(queryString(req, 'to'), 'to');

    await assertTeamAccess(req.user!.uid, teamUid);
    const role = await SnapshotService.loadActorRole(req.user!.uid);
    SnapshotService.assertMetricAccessibleForRole(role, metricType);

    const history = await SnapshotService.getSnapshotHistory(teamUid, metricType, from, to);
    sendResponse(res, HttpStatus.OK, history);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/teams/:teamUid/snapshots/recalculate
 *
 * Принудительный пересчёт snapshots команды. ADMIN-only. Полезно после
 * массовой смены `code_modules`, `hotfixLabels`, или ручной правки данных.
 */
export async function recalculateTeamSnapshots(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamUid = param(req, 'teamUid');
    const report = await SnapshotService.writeSnapshotsForTeam(
      teamUid,
      new Date(),
      req.user!.uid
    );
    sendResponse(res, HttpStatus.OK, report);
  } catch (error) {
    next(error);
  }
}
