import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as SnapshotController from './snapshot.controller';

/**
 * Чтение снепшотов команды (доработка 2.7).
 * Монтируется поверх `/teams/:teamUid` (mergeParams).
 *
 * Матрица доступа:
 *   /snapshots/latest    — LEAD/HEAD/ADMIN; внутри per-metric фильтр
 *                          (HEAD не видит cycle_time_mr/mr_size — это
 *                          `assertMetricAccessibleForRole` в контроллере).
 *   /snapshots/history   — то же самое; history по той же matrix.
 */
const router = Router({ mergeParams: true });

router.use(isAuthenticated, requireRole('LEAD', 'HEAD', 'ADMIN'));

router.get('/snapshots/latest', SnapshotController.getLatestSnapshot);
router.get('/snapshots/history', SnapshotController.getSnapshotHistory);

export default router;
