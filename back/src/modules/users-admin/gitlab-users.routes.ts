import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as GitlabUsersController from './gitlab-users.controller';

/**
 * Admin endpoints /api/admin/gitlab-users — реестр GitLab-участников,
 * собранный discovery. Используется UI:
 *  — табличка «найденные пользователи проекта» с фильтрами;
 *  — кнопка «Создать аккаунты» (bulk-provision).
 *
 * Пагинация: query-параметры `limit` (max 500, default 50) и `offset`.
 * Фильтры: `connectionUid`, `projectUid`, `search`, `provisioned`.
 */
const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

router.get('/', GitlabUsersController.listGitlabUsers);
router.post('/provision/bulk', GitlabUsersController.provisionBulk);
router.post('/:uid/provision', GitlabUsersController.provisionOne);

export default router;
