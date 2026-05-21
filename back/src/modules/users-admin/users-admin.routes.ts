import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as UsersAdminController from './users-admin.controller';

const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

router.get('/', UsersAdminController.listUsers);
router.post('/', UsersAdminController.createUser);
router.get('/:uid', UsersAdminController.getUser);
router.patch('/:uid', UsersAdminController.updateUser);
router.delete('/:uid', UsersAdminController.deleteUser);

// Сопоставление с GitLab
router.post('/:uid/gitlab-identities', UsersAdminController.linkGitlabIdentity);
router.delete('/:uid/gitlab-identities/:identityUid', UsersAdminController.unlinkGitlabIdentity);

export default router;
