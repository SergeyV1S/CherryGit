import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as ProjectsController from './projects.controller';

const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

// CRUD проектов (/api/admin/projects — ВКР 2.2.7)
router.get('/', ProjectsController.listProjects);
router.post('/', ProjectsController.connectProject);
router.get('/:uid', ProjectsController.getProject);
router.patch('/:uid', ProjectsController.updateProject);
router.delete('/:uid', ProjectsController.deleteProject);

// Форсированный пересбор данных проекта (доработка 1.2 — UC-01 post-action)
router.post('/:uid/resync', ProjectsController.triggerResync);

// Разметка модулей кодовой базы (для Bus Factor — FR-10)
router.get('/:uid/code-modules', ProjectsController.listCodeModules);
router.post('/:uid/code-modules', ProjectsController.createCodeModule);
router.patch('/:uid/code-modules/:moduleUid', ProjectsController.updateCodeModule);
router.delete('/:uid/code-modules/:moduleUid', ProjectsController.deleteCodeModule);

export default router;
