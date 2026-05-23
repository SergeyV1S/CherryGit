/* eslint-disable */

import * as express from 'express';

import type { TeamAccessResult } from '@/modules/metrics/lib/team-access';

declare global {
  namespace Express {
    export interface Request {
      user?: {
        uid: string;
        role: string;
        iat: number;
        exp: number;
        subject: string;
      };
      /**
       * Результат `requireTeamAccess` middleware (доработка 3.1).
       * Заполнен только на маршрутах, где middleware повешен.
       */
      teamAccess?: TeamAccessResult;
    }
  }
}
