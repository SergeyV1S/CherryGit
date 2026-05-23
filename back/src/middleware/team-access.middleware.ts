import type { NextFunction, Request, Response } from 'express';

import { param } from '@/lib/request-params';
import {
  assertTeamAccess,
  type TeamAccessResult
} from '@/modules/metrics/lib/team-access';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Middleware: проверка per-team scope ДО входа в контроллер
 * (доработка 3.1, ВКР 2.2.3 — defense in depth).
 *
 * Зачем:
 *   `assertTeamAccess` уже вызывается из всех team-сервисов; этот middleware
 *   дублирует проверку на УРОВНЕ HTTP-стека, чтобы:
 *     1. Сервис, забывший вызвать assertTeamAccess (новый разработчик —
 *        новый эндпоинт), всё равно не пускал чужие данные. Это политика
 *        «secure by default».
 *     2. 403 возвращался ДО любых дорогих операций (валидация DTO,
 *        load body parsing). Минимум потраченных ресурсов на atypical
 *        запросы (сканеры, угадывание UUID'ов).
 *     3. Контроллеры могли переиспользовать результат через `req.teamAccess`
 *        (см. тип-расширение в `types/express/index.d.ts`).
 *
 * Применять в маршрутах поверх `isAuthenticated` + `requireRole`:
 *
 *   router.get(
 *     '/snapshots/latest',
 *     requireTeamAccess(),
 *     SnapshotController.getLatestSnapshot
 *   );
 *
 * @param paramName — имя path-параметра c teamUid. По умолчанию `teamUid`
 *   (этот префикс используется в всех existing routes).
 */
export const requireTeamAccess = (paramName = 'teamUid') => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const teamUid = param(req, paramName);
      if (!teamUid) {
        return next(
          new CustomError(HttpStatus.BAD_REQUEST, `path param ${paramName} is required`)
        );
      }
      // assertTeamAccess сам бросает 403/404 в соответствии с правилами ВКР.
      const access = await assertTeamAccess(req.user!.uid, teamUid);
      req.teamAccess = access;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Хелпер: достать `req.teamAccess`, проверив, что middleware был вызван.
 * Бросает 500, если контроллер ожидает teamAccess, но middleware забыли
 * повесить. Это catches programmer error, а не пользовательский.
 */
export const expectTeamAccess = (req: Request): TeamAccessResult => {
  if (!req.teamAccess) {
    throw new CustomError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'requireTeamAccess middleware was not applied to this route'
    );
  }
  return req.teamAccess;
};
