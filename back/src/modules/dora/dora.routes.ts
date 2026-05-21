import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as DoraController from './dora.controller';

/** Кросс-командные DORA-метрики (HEAD only — ВКР 2.2.7). */
const router = Router();

router.use(isAuthenticated, requireRole('HEAD', 'ADMIN'));

router.get('/cross-team', DoraController.getCrossTeamDora);
router.get('/cross-team/trend', DoraController.getCrossTeamTrend);

export default router;
