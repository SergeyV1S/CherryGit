import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import * as UsersAdminService from './users-admin.service';

export async function listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await UsersAdminService.listUsers();
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await UsersAdminService.getUser(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await UsersAdminService.createUser(req.user!.uid, req.body);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await UsersAdminService.updateUser(
      req.user!.uid,
      param(req, 'uid'),
      req.body
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await UsersAdminService.deleteUser(req.user!.uid, param(req, 'uid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}

export async function linkGitlabIdentity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { gitlabConnectionUid, gitlabUsername, gitlabUserId } = req.body;
    const result = await UsersAdminService.linkGitlabIdentity(
      param(req, 'uid'),
      gitlabConnectionUid,
      gitlabUsername,
      gitlabUserId
    );
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function unlinkGitlabIdentity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await UsersAdminService.unlinkGitlabIdentity(param(req, 'identityUid'));
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}
