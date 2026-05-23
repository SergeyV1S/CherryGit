import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import * as ExportController from '@/modules/export/export.controller';

import * as AuditController from './audit.controller';

/**
 * Admin endpoints журнала аудита (`/api/admin/audit`) — ВКР 2.2.3, доработка 5.
 *
 * Структура:
 *   GET /                                  — список с фильтрами и пагинацией
 *   GET /actions                           — словарь известных action'ов
 *   GET /entity-types                      — словарь известных entityType'ов
 *   GET /stats                             — агрегаты для admin-дашборда
 *   GET /entity/:entityType/:entityId      — история конкретной сущности
 *
 * Static-routes (actions, entity-types, stats, entity) смонтированы ЯВНО
 * без collision'а с `/` — express matcher выбирает по точному префиксу.
 *
 * Все endpoint'ы под ADMIN, потому что audit-log содержит PII (mail
 * атакующего при `auth.failed_login`, before/after-диффы профилей
 * пользователей и т.п.). Согласовано с ВКР 2.2.3 «минимизация обработки
 * персональных данных»: журнал — закрытый артефакт для расследования,
 * не публичный.
 */
const router = Router();

router.use(isAuthenticated, requireRole('ADMIN'));

// Словари для UI-фильтров — лёгкие SELECT DISTINCT, кешировать на фронте.
router.get('/actions', AuditController.listKnownActions);
router.get('/entity-types', AuditController.listKnownEntityTypes);
router.get('/stats', AuditController.getStats);

// CSV-экспорт audit-логов (доработка 6) — те же фильтры что у `/`,
// без пагинации, hard-cap 100k строк. Под admin (router-level requireRole).
router.get('/export', ExportController.exportAuditLogs);

// История конкретной сущности (для UI «вкладка История» в карточке).
router.get('/entity/:entityType/:entityId', AuditController.listAuditLogsForEntity);

// Основной list с фильтрами — последним, чтобы static-routes выше не
// перехватились.
router.get('/', AuditController.listAuditLogs);

export default router;
