import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';

import * as MeController from './me.controller';

const router = Router();

// ВКР 2.2.7 матрица: /api/me доступна всем аутентифицированным,
// /api/me/metrics — всем кроме ADMIN.
router.get('/', isAuthenticated, MeController.getCurrentUser);
router.get('/metrics', isAuthenticated, MeController.getMyMetrics);
router.get('/metrics/history', isAuthenticated, MeController.getMyMetricsHistory);
router.get('/gitlab-identities', isAuthenticated, MeController.getMyGitlabIdentities);

export default router;
