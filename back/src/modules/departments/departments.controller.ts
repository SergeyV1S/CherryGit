import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import * as DepartmentsService from './departments.service';

export async function listDepartments(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await DepartmentsService.listDepartments();
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function createDepartment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await DepartmentsService.createDepartment(req.body);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateDepartment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await DepartmentsService.updateDepartment(param(req, 'uid'), req.body);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteDepartment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await DepartmentsService.deleteDepartment(param(req, 'uid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}
