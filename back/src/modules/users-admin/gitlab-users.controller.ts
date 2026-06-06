import type { NextFunction, Request, Response } from 'express';

import { z } from 'zod';

import { sendResponse } from '@/lib/reponse';
import { param, queryString } from '@/lib/request-params';
import { HttpStatus } from '@/utils/enums/http-status';

import * as GitlabUsersService from './gitlab-users.service';
import * as ProvisioningService from './provisioning.service';

const provisionBulkSchema = z.object({
  gitlabUserUids: z.array(z.string().uuid()).min(1).max(500)
});

export async function listGitlabUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await GitlabUsersService.listGitlabUsers({
      connectionUid: queryString(req, 'connectionUid'),
      projectUid: queryString(req, 'projectUid'),
      search: queryString(req, 'search'),
      provisioned: queryString(req, 'provisioned'),
      limit: Number.parseInt(queryString(req, 'limit') ?? '50', 10),
      offset: Number.parseInt(queryString(req, 'offset') ?? '0', 10)
    });
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function provisionOne(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await ProvisioningService.provisionByUids(
      req.user!.uid,
      [param(req, 'uid')],
      'manual'
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

export async function provisionBulk(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = provisionBulkSchema.parse(req.body);
    const result = await ProvisioningService.provisionByUids(
      req.user!.uid,
      dto.gitlabUserUids,
      'manual'
    );
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}
