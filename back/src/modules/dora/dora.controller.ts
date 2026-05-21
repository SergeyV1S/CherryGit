import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { HttpStatus } from '@/utils/enums/http-status';

import * as DoraService from './dora.service';

export async function getCrossTeamDora(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const periodEnd = req.query.periodEnd ? new Date(String(req.query.periodEnd)) : new Date();
    const periodStart = req.query.periodStart
      ? new Date(String(req.query.periodStart))
      : new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = await DoraService.getCrossTeamDora(req.user!.uid, periodStart, periodEnd);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getCrossTeamTrend(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const periodEnd = req.query.periodEnd ? new Date(String(req.query.periodEnd)) : new Date();
    const periodStart = req.query.periodStart
      ? new Date(String(req.query.periodStart))
      : new Date(periodEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const granularity = (req.query.granularity as 'day' | 'month' | 'week') ?? 'week';
    const result = await DoraService.getCrossTeamTrend(
      req.user!.uid,
      periodStart,
      periodEnd,
      granularity
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}
