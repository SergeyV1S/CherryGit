import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import * as CodeModulesService from './code-modules.service';
import {
  connectProjectSchema,
  createCodeModuleSchema,
  updateIncidentLabelsSchema,
  updateProjectSchema
} from './dto/connect-project.dto';
import * as ProjectsService from './projects.service';

export async function listProjects(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await ProjectsService.listProjects();
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await ProjectsService.getProject(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function connectProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = connectProjectSchema.parse(req.body);
    const result = await ProjectsService.connectProject(req.user!.uid, dto);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = updateProjectSchema.parse(req.body);
    const result = await ProjectsService.updateProject(param(req, 'uid'), dto, req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ProjectsService.deleteProject(req.user!.uid, param(req, 'uid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}

export async function updateIncidentLabels(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = updateIncidentLabelsSchema.parse(req.body);
    const result = await ProjectsService.updateIncidentLabels(
      req.user!.uid,
      param(req, 'uid'),
      dto
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function triggerResync(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await ProjectsService.triggerResync(req.user!.uid, param(req, 'uid'));
    sendResponse(res, HttpStatus.ACCEPTED, result);
  } catch (error) {
    next(error);
  }
}

// ----- Code modules -----

export async function listCodeModules(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await CodeModulesService.listCodeModules(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function createCodeModule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = createCodeModuleSchema.parse(req.body);
    const result = await CodeModulesService.createCodeModule(param(req, 'uid'), dto, req.user!.uid);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateCodeModule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = createCodeModuleSchema.partial().parse(req.body);
    const result = await CodeModulesService.updateCodeModule(
      param(req, 'moduleUid'),
      dto,
      req.user!.uid
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteCodeModule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await CodeModulesService.deleteCodeModule(param(req, 'moduleUid'), req.user!.uid);
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}
