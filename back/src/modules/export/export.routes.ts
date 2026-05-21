import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as ExportController from './export.controller';

/**
 * Экспорт CSV (ВКР 2.2.7).
 * Доступ — все аутентифицированные роли кроме ADMIN (ADMIN не видит значения метрик).
 */
const router = Router();

router.get(
  '/csv',
  isAuthenticated,
  requireRole('DEVELOPER', 'LEAD', 'HEAD'),
  ExportController.exportCsv
);

export default router;
