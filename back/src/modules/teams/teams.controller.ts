import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import {
  addTeamMemberSchema,
  attachProjectSchema,
  createTeamSchema,
  updateTeamMemberSchema,
  updateTeamSchema
} from './dto/team.dto';
import * as TeamsService from './teams.service';

/**
 * Контроллеры модуля teams (доработка 4.1).
 *
 * Все мутации:
 *   1. Парсят DTO через Zod (`.parse(...)` бросает ZodError → 400 через
 *      глобальный error handler в `main.ts`);
 *   2. Прокидывают `req.user!.uid` как `actorUid` для audit-логов.
 */

// ===== User-facing =====

export async function listTeamsForUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await TeamsService.listTeamsForUser(req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await TeamsService.getTeam(req.user!.uid, param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

// ===== Admin CRUD =====

export async function listAllTeams(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await TeamsService.listAllTeams();
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function createTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = createTeamSchema.parse(req.body);
    const result = await TeamsService.createTeam(req.user!.uid, dto);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = updateTeamSchema.parse(req.body);
    const result = await TeamsService.updateTeam(param(req, 'uid'), dto, req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await TeamsService.deleteTeam(req.user!.uid, param(req, 'uid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}

// ===== Members =====

export async function listMembers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await TeamsService.listMembers(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function addMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = addTeamMemberSchema.parse(req.body);
    const result = await TeamsService.addMember(req.user!.uid, param(req, 'uid'), dto);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = updateTeamMemberSchema.parse(req.body);
    const result = await TeamsService.updateMember(
      req.user!.uid,
      param(req, 'uid'),
      param(req, 'memberUid'),
      dto
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function removeMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await TeamsService.removeMember(req.user!.uid, param(req, 'uid'), param(req, 'memberUid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}

// ===== Project attachment =====

export async function listTeamProjects(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await TeamsService.listTeamProjects(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function attachProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = attachProjectSchema.parse(req.body);
    await TeamsService.attachProject(req.user!.uid, param(req, 'uid'), dto);
    sendResponse(res, HttpStatus.CREATED, null);
  } catch (error) {
    next(error);
  }
}

export async function detachProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await TeamsService.detachProject(
      req.user!.uid,
      param(req, 'uid'),
      param(req, 'projectUid')
    );
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}
