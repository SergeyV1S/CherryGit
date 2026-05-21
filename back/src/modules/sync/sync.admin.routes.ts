import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as SyncController from './sync.controller';

/** Ручное управление синхронизацией (только ADMIN). */
const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

router.post('/projects/:projectUid/run', SyncController.syncProject);
router.get('/projects/:projectUid/status', SyncController.getSyncStatus);
router.post('/projects/:projectUid/recalculate', SyncController.recalculateMetrics);

export default router;
