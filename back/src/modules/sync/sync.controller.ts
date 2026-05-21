import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import * as SyncService from './sync.service';

export async function syncProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await SyncService.syncProject(req.user!.uid, param(req, 'projectUid'));
    sendResponse(res, HttpStatus.ACCEPTED, result);
  } catch (error) {
    next(error);
  }
}

export async function getSyncStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await SyncService.getSyncStatus(param(req, 'projectUid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function recalculateMetrics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await SyncService.recalculateMetrics(req.user!.uid, param(req, 'projectUid'));
    sendResponse(res, HttpStatus.ACCEPTED, result);
  } catch (error) {
    next(error);
  }
}
