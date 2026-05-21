import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as DepartmentsController from './departments.controller';

const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

router.get('/', DepartmentsController.listDepartments);
router.post('/', DepartmentsController.createDepartment);
router.patch('/:uid', DepartmentsController.updateDepartment);
router.delete('/:uid', DepartmentsController.deleteDepartment);

export default router;
