import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as SnapshotController from './snapshot.controller';

/**
 * Admin-эндпоинты управления снепшотами (доработка 2.7).
 *
 *   POST /admin/teams/:teamUid/snapshots/recalculate
 *     — принудительный пересчёт снепшотов команды (после смены
 *       `code_modules` / `hotfixLabels` / ручной правки данных).
 *
 * Регулярный пересчёт делает `sync.service.syncProject` fire-and-forget.
 * Этот endpoint — только для ручного запуска админом.
 */
const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

router.post('/:teamUid/snapshots/recalculate', SnapshotController.recalculateTeamSnapshots);

export default router;
