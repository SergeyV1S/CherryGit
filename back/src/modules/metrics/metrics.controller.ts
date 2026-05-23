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

/**
 * Парсинг query-параметра `windowDays` для 2.6 (Bus Factor).
 * Дефолт — 90 (CLAUDE.md / концепция CherryGit «последние 90 дней»).
 * Допустимый диапазон 1..365: меньше дня бессмысленно, больше года —
 * выходит за пределы «активной» доменной интерпретации Bus Factor.
 */
const parseWindowDays = (raw: string | undefined): number => {
  if (!raw) return 90;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 365) {
    throw new CustomError(
      HttpStatus.BAD_REQUEST,
      `windowDays must be an integer in [1, 365], got "${raw}"`
    );
  }
  return n;
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

export async function getTeamChangeFailureRate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { periodStart, periodEnd } = parsePeriod(req);
    // Тот же granularity-whitelist, что и у DF — гарантирует совпадение
    // временных шкал при парной визуализации (ВКР FR-06).
    const granularity = parseGranularity(queryString(req, 'granularity'));
    const result = await MetricsService.getTeamChangeFailureRate(
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
    // Bus Factor работает в фиксированном окне `сейчас - windowDays` (90 по
    // умолчанию, как в CLAUDE.md / концепции CherryGit). Параметр оставлен
    // настраиваемым для отладки и потенциальных дашбордов «за 30 дней».
    const windowDays = parseWindowDays(queryString(req, 'windowDays'));
    const result = await MetricsService.getTeamBusFactor(
      req.user!.uid,
      param(req, 'teamUid'),
      windowDays
    );
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
