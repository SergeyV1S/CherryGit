import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as GitlabController from './gitlab.controller';

const router = Router();

// Все эндпоинты — только ADMIN (ВКР 2.2.7).
router.use(isAuthenticated, requireRole('ADMIN'));

router.get('/connections', GitlabController.listConnections);
router.post('/connections', GitlabController.createConnection);
router.patch('/connections/:uid', GitlabController.updateConnection);
router.delete('/connections/:uid', GitlabController.deleteConnection);

/** Получить список проектов с GitLab-инстанса для последующего подключения */
router.get('/connections/:uid/available-projects', GitlabController.fetchAvailableProjects);

export default router;
