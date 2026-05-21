import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import * as TeamsService from './teams.service';

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

// ===== Admin =====

export async function listAllTeams(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await TeamsService.listAllTeams();
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function createTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await TeamsService.createTeam(req.user!.uid, req.body);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await TeamsService.updateTeam(param(req, 'uid'), req.body);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await TeamsService.deleteTeam(req.user!.uid, param(req, 'uid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}

// ===== Members =====

export async function listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await TeamsService.listMembers(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await TeamsService.addMember(param(req, 'uid'), req.body);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await TeamsService.updateMember(
      param(req, 'uid'),
      param(req, 'memberUid'),
      req.body
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await TeamsService.removeMember(param(req, 'uid'), param(req, 'memberUid'));
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
    const result = await TeamsService.attachProject(param(req, 'uid'), req.body);
    sendResponse(res, HttpStatus.CREATED, result);
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
    await TeamsService.detachProject(param(req, 'uid'), param(req, 'projectUid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}
