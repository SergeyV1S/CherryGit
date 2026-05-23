import type { NextFunction, Request, Response } from 'express';

import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { param } from '@/lib/request-params';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Middleware: пускает только самого пользователя или ADMIN
 * (доработка 3.1, ВКР 2.2.3 «индивидуальные метрики приватны»).
 *
 * Архитектурная гарантия из CLAUDE.md:
 *   «запрос индивидуальных данных другого пользователя →
 *    HTTP 403 на уровне middleware (не скрывать на фронте)»
 *
 * Применяется на эндпоинтах вида `/users/:userUid/profile`,
 * `/users/:userUid/metrics` и т.п., где `:userUid` идентифицирует
 * целевого пользователя. Эндпоинты `/api/me/*` берут uid из cookie
 * и в этом middleware не нуждаются — для них достаточно `isAuthenticated`.
 *
 * Правила:
 *   — ADMIN → пропускается (для отладки/админ-просмотра);
 *   — actor.uid === req.params[paramName] → пропускается (своё);
 *   — иначе → 403.
 *
 * @param paramName — имя path-параметра с UID. По умолчанию `userUid`.
 */
export const requireSelfOrAdmin =
  (paramName = 'userUid') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.user?.role as RoleType | undefined;
    const actorUid = req.user?.uid;
    const targetUid = param(req, paramName);

    if (!actorUid || !role) {
      return next(new CustomError(HttpStatus.UNAUTHORIZED));
    }
    if (!targetUid) {
      return next(new CustomError(HttpStatus.BAD_REQUEST, `path param ${paramName} is required`));
    }
    if (role === 'ADMIN' || actorUid === targetUid) {
      return next();
    }
    // Намеренно НЕ leak'аем, существует ли targetUid: 403 одинаков для
    // «нет такого юзера» и «есть, но не твой» (избегаем enum-разведки).
    next(new CustomError(HttpStatus.FORBIDDEN, 'Access denied: individual data is private'));
  };
