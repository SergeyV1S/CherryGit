import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { queryString } from '@/lib/request-params';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import * as MeService from './me.service';

/**
 * Контроллеры `/api/me/*` (доработка 3.2). actorUid берётся из cookie —
 * клиент не может запросить чужие данные подменой параметра (см. me.service
 * для архитектурного обоснования).
 */

/**
 * Парсинг периода — те же дефолты, что в metrics.controller (30 дней).
 * Валидация ISO-даты: невалидное значение → 400 с поясняющим сообщением.
 */
const parsePeriod = (req: Request): { periodStart: Date; periodEnd: Date } => {
  const endStr = queryString(req, 'periodEnd');
  const startStr = queryString(req, 'periodStart');
  const periodEnd = endStr ? new Date(endStr) : new Date();
  if (Number.isNaN(periodEnd.getTime())) {
    throw new CustomError(HttpStatus.BAD_REQUEST, 'periodEnd is not a valid ISO date');
  }
  const periodStart = startStr
    ? new Date(startStr)
    : new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(periodStart.getTime())) {
    throw new CustomError(HttpStatus.BAD_REQUEST, 'periodStart is not a valid ISO date');
  }
  return { periodStart, periodEnd };
};

export async function getCurrentUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await MeService.getCurrentUser(req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getMyMetrics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { periodStart, periodEnd } = parsePeriod(req);
    const result = await MeService.getMyMetrics(req.user!.uid, periodStart, periodEnd);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getMyMetricsHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await MeService.getMyMetricsHistory(req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getMyGitlabIdentities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await MeService.getMyGitlabIdentities(req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}
