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

/** Проверить валидность токена подключения без получения проектов (для UI-индикатора) */
router.post('/connections/:uid/test', GitlabController.testConnection);

/**
 * Список доступных проектов из пула discovery
 * (последний snapshot, не дёргает GitLab).
 */
router.get('/connections/:uid/available-projects', GitlabController.listAvailableProjects);

/**
 * Ручной запуск discovery (обновить пул проектов + список участников).
 * Возвращает отчёт `DiscoveryReport` синхронно.
 */
router.post('/connections/:uid/discover', GitlabController.triggerDiscovery);

export default router;
