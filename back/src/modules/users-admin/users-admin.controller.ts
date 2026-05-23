import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { param } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  changeRoleSchema,
  linkGitlabIdentitySchema,
  resetPasswordSchema
} from './dto/user-admin.dto';
import * as UsersAdminService from './users-admin.service';

/**
 * Контроллеры модуля users-admin (доработка 4.3).
 *
 * Все мутации:
 *   1. Парсят DTO через Zod (ZodError → 400 через глобальный handler);
 *   2. Прокидывают `req.user!.uid` как `actorUid` для audit-логов и
 *      lockout-защит (changeRole/deleteUser проверяют actor !== target).
 *
 * `listUsers` использует `parseListUsersFilter` сервиса для query-параметров
 * (role, departmentUid, search, limit, offset) — фильтр строго whitelist'ом.
 */

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filter = UsersAdminService.parseListUsersFilter(req);
    const result = await UsersAdminService.listUsers(filter);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function countByRole(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await UsersAdminService.countByRole();
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
    const dto = adminCreateUserSchema.parse(req.body);
    const result = await UsersAdminService.createUser(req.user!.uid, dto);
    sendResponse(res, HttpStatus.CREATED, result);
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = adminUpdateUserSchema.parse(req.body);
    const result = await UsersAdminService.updateUser(req.user!.uid, param(req, 'uid'), dto);
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

// ===== Role & password =====

export async function changeRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = changeRoleSchema.parse(req.body);
    const result = await UsersAdminService.changeRole(req.user!.uid, param(req, 'uid'), dto);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = resetPasswordSchema.parse(req.body);
    const result = await UsersAdminService.resetPassword(req.user!.uid, param(req, 'uid'), dto);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

// ===== GitLab reconcile (доработка 4.4) =====

/**
 * Bootstrap-резолв идентичностей: проходит всех users по всем активным
 * GitLab-подключениям и создаёт identity для совпавших по email.
 * Возвращает статистику {attempted, created, skipped, failed}.
 */
export async function reconcileGitlabIdentities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await UsersAdminService.reconcileGitlabIdentities(req.user!.uid);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

// ===== GitLab identities =====

export async function listUserIdentities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await UsersAdminService.listUserIdentities(param(req, 'uid'));
    sendResponse(res, HttpStatus.OK, result);
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
    const dto = linkGitlabIdentitySchema.parse(req.body);
    const result = await UsersAdminService.linkGitlabIdentity(
      req.user!.uid,
      param(req, 'uid'),
      dto
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
    await UsersAdminService.unlinkGitlabIdentity(
      req.user!.uid,
      param(req, 'uid'),
      param(req, 'identityUid')
    );
    sendResponse(res, HttpStatus.NO_CONTENT, null);
  } catch (error) {
    next(error);
  }
}
