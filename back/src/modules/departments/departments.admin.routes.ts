import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as DepartmentsController from './departments.controller';

/**
 * Admin CRUD для отделов (/api/admin/departments) — ВКР 2.2.7, доработка 4.2.
 *
 * Структура endpoint'ов:
 *   GET    /                            — список отделов с счётчиками teams/heads
 *   POST   /                            — создать отдел
 *   GET    /unassigned-teams            — глобально «свободные» команды (без отдела)
 *                                         ⚠ MUST идти ДО `/:uid`, иначе express
 *                                         распарсит «unassigned-teams» как `uid`.
 *   GET    /:uid                        — детальная карточка отдела
 *   PATCH  /:uid                        — обновить отдел
 *   DELETE /:uid                        — расформировать отдел (cascade NULL)
 *
 *   GET    /:uid/teams                  — команды отдела
 *   POST   /:uid/teams                  — привязать команду к отделу
 *   DELETE /:uid/teams/:teamUid         — отвязать команду
 *
 *   GET    /:uid/heads                  — руководители отдела
 *   POST   /:uid/heads                  — назначить руководителя
 *   DELETE /:uid/heads/:userUid         — снять руководителя
 */
const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

// Static-route ДО динамического `/:uid` — иначе express матчит `unassigned-teams`
// как значение param `uid` и зовёт getDepartment с битым uid.
router.get('/unassigned-teams', DepartmentsController.listUnassignedTeams);

router.get('/', DepartmentsController.listDepartments);
router.post('/', DepartmentsController.createDepartment);
router.get('/:uid', DepartmentsController.getDepartment);
router.patch('/:uid', DepartmentsController.updateDepartment);
router.delete('/:uid', DepartmentsController.deleteDepartment);

// Teams attachment
router.get('/:uid/teams', DepartmentsController.listTeamsByDepartment);
router.post('/:uid/teams', DepartmentsController.attachTeam);
router.delete('/:uid/teams/:teamUid', DepartmentsController.detachTeam);

// Heads (HEAD-role users assigned to department)
router.get('/:uid/heads', DepartmentsController.listHeads);
router.post('/:uid/heads', DepartmentsController.assignHead);
router.delete('/:uid/heads/:userUid', DepartmentsController.unassignHead);

export default router;
