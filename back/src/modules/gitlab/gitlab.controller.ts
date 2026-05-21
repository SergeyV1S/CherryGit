import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import * as GitlabService from './gitlab.service';

export async function listConnections(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await GitlabService.listConnections(req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function createConnection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await GitlabService.createConnection(req.user!.uid, req.body);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateConnection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await GitlabService.updateConnection(param(req, 'uid'), req.body);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteConnection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await GitlabService.deleteConnection(param(req, 'uid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}

export async function fetchAvailableProjects(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await GitlabService.fetchAvailableProjects(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}
