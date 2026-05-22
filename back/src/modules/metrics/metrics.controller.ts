import type { NextFunction, Request, Response } from 'express';

import type { DeploymentFrequencyGranularity } from '@/db/drizzle/schema/metrics/schema';

import { sendResponse } from '@/lib/reponse';
import { param, queryString } from '@/lib/request-params';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import * as MetricsService from './metrics.service';

const parsePeriod = (req: Request): { periodStart: Date; periodEnd: Date } => {
  const endStr = queryString(req, 'periodEnd');
  const startStr = queryString(req, 'periodStart');
  const periodEnd = endStr ? new Date(endStr) : new Date();
  const periodStart = startStr
    ? new Date(startStr)
    : new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd };
};

/**
 * Парсинг query-параметра granularity для 2.4 (DF).
 * Whitelist whitelist'ов: `day` / `week` / `month`. Невалидное значение
 * → 400, чтобы клиент сразу увидел опечатку.
 */
const parseGranularity = (raw: string | undefined): DeploymentFrequencyGranularity => {
  if (!raw) return 'week';
  if (raw === 'day' || raw === 'week' || raw === 'month') return raw;
  throw new CustomError(
    HttpStatus.BAD_REQUEST,
    `granularity must be one of: day | week | month, got "${raw}"`
  );
};

export async function getTeamMetrics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { periodStart, periodEnd } = parsePeriod(req);
    const result = await MetricsService.getTeamMetrics(
      req.user!.uid,
      param(req, 'teamUid'),
      periodStart,
      periodEnd
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getTeamCycleTimeMr(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { periodStart, periodEnd } = parsePeriod(req);
    const result = await MetricsService.getTeamCycleTimeMr(
      req.user!.uid,
      param(req, 'teamUid'),
      periodStart,
      periodEnd
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getTeamMrSize(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { periodStart, periodEnd } = parsePeriod(req);
    const result = await MetricsService.getTeamMrSize(
      req.user!.uid,
      param(req, 'teamUid'),
      periodStart,
      periodEnd
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getTeamLeadTime(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { periodStart, periodEnd } = parsePeriod(req);
    const result = await MetricsService.getTeamLeadTime(
      req.user!.uid,
      param(req, 'teamUid'),
      periodStart,
      periodEnd
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getTeamDeploymentFrequency(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { periodStart, periodEnd } = parsePeriod(req);
    // Дефолт `week` — оптимальный масштаб для дашборда HEAD за 30-90 дней.
    // 'day' → много баров на длинном периоде; 'month' → теряем детализацию.
    const granularity = parseGranularity(queryString(req, 'granularity'));
    const result = await MetricsService.getTeamDeploymentFrequency(
      req.user!.uid,
      param(req, 'teamUid'),
      periodStart,
      periodEnd,
      granularity
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getTeamBusFactor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await MetricsService.getTeamBusFactor(req.user!.uid, param(req, 'teamUid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getTeamAnomalies(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await MetricsService.getTeamAnomalies(req.user!.uid, param(req, 'teamUid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function dismissAnomaly(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await MetricsService.dismissAnomaly(
      req.user!.uid,
      param(req, 'teamUid'),
      param(req, 'anomalyUid')
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}
