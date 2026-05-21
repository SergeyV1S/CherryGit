import type { NextFunction, Request, Response } from 'express';

import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Проверка глобальной роли пользователя.
 * Реализует ВКР 2.2.3: «возврат 403 при попытке доступа вне зоны видимости роли».
 *
 * Должен вызываться ПОСЛЕ isAuthenticated.
 *
 * Пример: router.get('/admin', isAuthenticated, requireRole('ADMIN'), handler);
 */
export const requireRole =
  (...allowedRoles: RoleType[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const userRole = req.user?.role as RoleType | undefined;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return next(new CustomError(HttpStatus.FORBIDDEN));
    }

    next();
  };
