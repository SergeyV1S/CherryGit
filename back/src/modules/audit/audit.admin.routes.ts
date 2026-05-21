import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as AuditController from './audit.controller';

const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

router.get('/', AuditController.listAuditLogs);

export default router;
