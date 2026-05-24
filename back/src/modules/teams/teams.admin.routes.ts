import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as TeamsController from './teams.controller';

/**
 * Admin CRUD для команд (/api/admin/teams) — ВКР 2.2.7.
 */
const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

router.get('/', TeamsController.listAllTeams);
router.post('/', TeamsController.createTeam);
router.patch('/:uid', TeamsController.updateTeam);
router.delete('/:uid', TeamsController.deleteTeam);

// Members
router.get('/:uid/members', TeamsController.listMembers);
// Кандидаты из синхронизированных GitLab-данных (commits/MRs/reviews проектов команды).
// MUST идти ДО `/:uid/members/:memberUid`, иначе express матчит «candidates» как memberUid.
router.get('/:uid/members/candidates', TeamsController.listCandidatesFromGitlab);
router.post('/:uid/members', TeamsController.addMember);
router.patch('/:uid/members/:memberUid', TeamsController.updateMember);
router.delete('/:uid/members/:memberUid', TeamsController.removeMember);

// Project attachment
router.get('/:uid/projects', TeamsController.listTeamProjects);
router.post('/:uid/projects', TeamsController.attachProject);
router.delete('/:uid/projects/:projectUid', TeamsController.detachProject);

export default router;
