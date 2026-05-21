import type { NextFunction, Request, Response } from 'express';

import config from '@/config';
import { sendResponse } from '@/lib/reponse';
import { HttpStatus } from '@/utils/enums/http-status';

import type { CreateUserDto } from '../user/dto/create-user.dto';
import type { LoginUserDto } from './dto/login.dto';

import * as authService from './auth.service';

export async function register(
  req: Request<object, object, CreateUserDto>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await authService.register(req.body);

    res.cookie(`${config.app.name}-access-token`, data.token, {
      expires: new Date(Date.now() + 5 * 60 * 1000),
      httpOnly: true
    });

    res.cookie(`${config.app.name}-refresh-token`, data.refresh, {
      expires: new Date(Date.now() + 30 * 60 * 60 * 1000),
      httpOnly: true
    });

    sendResponse(res, HttpStatus.CREATED, data.data);
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request<object, object, LoginUserDto>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await authService.login(req.body, req.ip);

    res.cookie(`${config.app.name}-access-token`, data.token, {
      expires: new Date(Date.now() + 5 * 60 * 1000),
      httpOnly: true
    });

    res.cookie(`${config.app.name}-refresh-token`, data.refresh, {
      expires: new Date(Date.now() + 30 * 60 * 60 * 1000),
      httpOnly: true
    });

    sendResponse(res, HttpStatus.OK, data.data);
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.cookie(`${config.app.name}-access-token`, '', {
      expires: new Date(0),
      httpOnly: true
    });
    res.cookie(`${config.app.name}-refresh-token`, '', {
      expires: new Date(0),
      httpOnly: true
    });

    if (!req.user) {
      res.status(500).json({ message: 'Something went wrong' });
      return;
    }

    await authService.logout(req.user.uid);

    sendResponse(res, HttpStatus.OK, null);
  } catch (error) {
    next(error);
  }
}

