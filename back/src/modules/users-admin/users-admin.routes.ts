import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as UsersAdminController from './users-admin.controller';

/**
 * Admin CRUD пользователей (/api/admin/users) — ВКР 2.2.7, доработка 4.3.
 *
 * Структура endpoint'ов:
 *   GET    /                            — список (с фильтрами role, departmentUid, search, limit, offset)
 *   GET    /stats/by-role               — счётчики {ADMIN, HEAD, LEAD, DEVELOPER} для admin-дашборда
 *                                         ⚠ MUST идти ДО `/:uid`, иначе express
 *                                         распарсит «stats» как `uid`.
 *   POST   /                            — создать (с опциональным password / autogen)
 *   GET    /:uid                        — детально + teams + gitlabIdentities
 *   PATCH  /:uid                        — патч профиля (без role/password)
 *   DELETE /:uid                        — удалить (с защитой от lockout)
 *
 *   POST   /:uid/role                   — сменить роль (с invalidation refresh-токенов)
 *   POST   /:uid/password               — сбросить пароль (с invalidation)
 *
 *   GET    /:uid/gitlab-identities      — список привязок к GitLab
 *   POST   /:uid/gitlab-identities      — привязать (с auto-resolve gitlabUserId)
 *   DELETE /:uid/gitlab-identities/:identityUid — снять привязку
 */
const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

// Static-route ДО динамического `/:uid`.
router.get('/stats/by-role', UsersAdminController.countByRole);

router.get('/', UsersAdminController.listUsers);
router.post('/', UsersAdminController.createUser);
router.get('/:uid', UsersAdminController.getUser);
router.patch('/:uid', UsersAdminController.updateUser);
router.delete('/:uid', UsersAdminController.deleteUser);

// Role & password — отдельные endpoints (audit + invalidation, см. service.ts)
router.post('/:uid/role', UsersAdminController.changeRole);
router.post('/:uid/password', UsersAdminController.resetPassword);

// GitLab identities
router.get('/:uid/gitlab-identities', UsersAdminController.listUserIdentities);
router.post('/:uid/gitlab-identities', UsersAdminController.linkGitlabIdentity);
router.delete('/:uid/gitlab-identities/:identityUid', UsersAdminController.unlinkGitlabIdentity);

export default router;
