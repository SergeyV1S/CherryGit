import { Router } from 'express';

import auditAdminRouter from '../audit/audit.admin.routes';
import departmentsAdminRouter from '../departments/departments.admin.routes';
import gitlabAdminRouter from '../gitlab/gitlab.admin.routes';
import projectsAdminRouter from '../projects/projects.admin.routes';
import snapshotAdminRouter from '../snapshots/snapshot.admin.routes';
import syncAdminRouter from '../sync/sync.admin.routes';
import teamsAdminRouter from '../teams/teams.admin.routes';
import usersAdminRouter from '../users-admin/users-admin.routes';

/**
 * Композитор admin-эндпоинтов под префиксом /api/admin.
 * Соответствует разделу 2.2.7 ВКР (матрица доступа админа).
 */
const router = Router();

router.use('/gitlab', gitlabAdminRouter);
router.use('/projects', projectsAdminRouter);
router.use('/teams', teamsAdminRouter);
// /api/admin/teams/:teamUid/snapshots/recalculate (доработка 2.7).
// Подмонтировано ПОСЛЕ teamsAdminRouter, чтобы базовый CRUD не перехватил префикс.
router.use('/teams', snapshotAdminRouter);
router.use('/users', usersAdminRouter);
router.use('/departments', departmentsAdminRouter);
router.use('/sync', syncAdminRouter);
router.use('/audit', auditAdminRouter);

export default router;
