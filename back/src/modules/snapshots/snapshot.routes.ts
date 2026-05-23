import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { requireTeamAccess } from '@/middleware/team-access.middleware';

import * as SnapshotController from './snapshot.controller';

/**
 * Чтение снепшотов команды (доработка 2.7).
 * Монтируется поверх `/teams/:teamUid` (mergeParams).
 *
 * Защита (доработка 3.1, defense-in-depth):
 *   1. `isAuthenticated` — JWT/refresh cookie.
 *   2. `requireRole('LEAD','HEAD','ADMIN')` — глобальный role-фильтр.
 *      DEVELOPER ходит через `/api/me/*`, не сюда.
 *   3. `requireTeamAccess` — per-team scope (LEAD команды / HEAD отдела /
 *      ADMIN). Раньше эту проверку делал только контроллер; теперь —
 *      на уровне HTTP-стека (secure-by-default).
 *   4. Контроллер: `assertMetricAccessibleForRole(role, metricType)` —
 *      per-metric фильтр (HEAD не видит cycle_time_mr/mr_size).
 *
 * Матрица доступа:
 *   /snapshots/latest    — LEAD/HEAD/ADMIN + member team + metric-allowed.
 *   /snapshots/history   — то же самое.
 */
const router = Router({ mergeParams: true });

router.use(isAuthenticated, requireRole('LEAD', 'HEAD', 'ADMIN'), requireTeamAccess());

router.get('/snapshots/latest', SnapshotController.getLatestSnapshot);
router.get('/snapshots/history', SnapshotController.getSnapshotHistory);

export default router;
