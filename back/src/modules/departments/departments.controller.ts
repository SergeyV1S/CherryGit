import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import * as DepartmentsService from './departments.service';
import {
  assignHeadSchema,
  attachTeamSchema,
  createDepartmentSchema,
  updateDepartmentSchema
} from './dto/department.dto';

/**
 * Контроллеры модуля departments (доработка 4.2).
 *
 * Все мутации:
 *   1. Парсят DTO через Zod (`.parse(...)` бросает ZodError → 400 через
 *      глобальный error handler в `main.ts`);
 *   2. Прокидывают `req.user!.uid` как `actorUid` для audit-логов;
 *   3. На успех возвращают результат сервиса.
 *
 * Эндпоинты-listы — без DTO, только тонкий wrapper над сервисом.
 */

// ===== CRUD =====

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

export async function getDepartment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await DepartmentsService.getDepartment(param(req, 'uid'));
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
    const dto = createDepartmentSchema.parse(req.body);
    const result = await DepartmentsService.createDepartment(req.user!.uid, dto);
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
    const dto = updateDepartmentSchema.parse(req.body);
    const result = await DepartmentsService.updateDepartment(
      req.user!.uid,
      param(req, 'uid'),
      dto
    );
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
    await DepartmentsService.deleteDepartment(req.user!.uid, param(req, 'uid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}

// ===== Teams attachment =====

export async function listTeamsByDepartment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await DepartmentsService.listTeamsByDepartment(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function attachTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = attachTeamSchema.parse(req.body);
    const result = await DepartmentsService.attachTeam(
      req.user!.uid,
      param(req, 'uid'),
      dto
    );
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function detachTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await DepartmentsService.detachTeam(
      req.user!.uid,
      param(req, 'uid'),
      param(req, 'teamUid')
    );
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}

export async function listUnassignedTeams(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await DepartmentsService.listUnassignedTeams();
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

// ===== Heads =====

export async function listHeads(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await DepartmentsService.listHeads(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function assignHead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = assignHeadSchema.parse(req.body);
    const result = await DepartmentsService.assignHead(
      req.user!.uid,
      param(req, 'uid'),
      dto
    );
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function unassignHead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await DepartmentsService.unassignHead(
      req.user!.uid,
      param(req, 'uid'),
      param(req, 'userUid')
    );
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}
