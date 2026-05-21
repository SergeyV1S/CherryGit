import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { HttpStatus } from '@/utils/enums/http-status';

import * as MeService from './me.service';

export async function getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await MeService.getCurrentUser(req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getMyMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const periodStart = new Date(String(req.query.periodStart));
    const periodEnd = new Date(String(req.query.periodEnd));
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
