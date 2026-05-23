import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';

import metricsRouter from '../metrics/metrics.routes';
import snapshotRouter from '../snapshots/snapshot.routes';
import * as TeamsController from './teams.controller';

/**
 * User-facing endpoints для команд (/api/teams).
 * Метрики уровня команды смонтированы как nested-router под /:teamUid.
 */
const router = Router();

router.use(isAuthenticated);

router.get('/', TeamsController.listTeamsForUser);
router.get('/:uid', TeamsController.getTeam);

// /api/teams/:teamUid/metrics, /cycle-time-mr, /bus-factor, /anomalies, ...
router.use('/:teamUid', metricsRouter);

// /api/teams/:teamUid/snapshots/latest, /snapshots/history (доработка 2.7).
router.use('/:teamUid', snapshotRouter);

export default router;
