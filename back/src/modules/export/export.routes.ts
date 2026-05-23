import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as ExportController from './export.controller';

/**
 * Экспорт CSV (ВКР FR-12, доработка 6).
 *
 * **Структура endpoints** (под префиксом `/api/export`):
 *
 *   GET /teams/:teamUid/metrics?periodStart=...&periodEnd=...
 *     — все 6 метрик команды (long-формат, JSON-value).
 *     Роли: ADMIN, HEAD, LEAD, DEVELOPER (scope через assertTeamAccess в сервисе).
 *
 *   GET /teams/:teamUid/merge-requests?periodStart=...&periodEnd=...
 *     — сырые merged-MR команды за период (для retro / аналитики).
 *     Роли: те же, scope через assertTeamAccess.
 *
 *   GET /departments/:departmentUid/dora?periodStart=...&periodEnd=...&granularity=week
 *     — DORA по командам отдела (wide-формат: одна строка = одна команда).
 *     Роли: ADMIN, HEAD. HEAD — только свой отдел (проверка в сервисе).
 *
 * **Audit-export** (для compliance) лежит в `audit.admin.routes.ts`
 * под `/api/admin/audit/export` — admin-only, рядом с list-endpoint'ом.
 *
 * **`requireRole`** на route'ах — первая линия защиты. Сервис делает
 * `assertTeamAccess` ВТОРОЙ линией — даже если route потерял role-middleware,
 * сервис отдаст 403 (defence-in-depth).
 *
 * Все роли (включая ADMIN) допускаются — концепция CherryGit разделяет:
 *   — ADMIN не должен видеть метрики ОБЫЧНО (UI-дашборды);
 *   — но для отладки / compliance — экспорт ему доступен.
 * Это согласовано с `metrics.routes.ts`, который тоже добавляет 'ADMIN' в whitelist.
 */
const router = Router();

router.use(isAuthenticated);

// Team-level: scope через assertTeamAccess в сервисе. Role-whitelist широкий —
// DEV-member должен иметь возможность выгрузить метрики СВОЕЙ команды.
router.get(
  '/teams/:teamUid/metrics',
  requireRole('ADMIN', 'HEAD', 'LEAD', 'DEVELOPER'),
  ExportController.exportTeamMetrics
);
router.get(
  '/teams/:teamUid/merge-requests',
  requireRole('ADMIN', 'HEAD', 'LEAD', 'DEVELOPER'),
  ExportController.exportTeamMergeRequests
);

// Department-level: только HEAD/ADMIN. HEAD-scope проверяется в сервисе.
router.get(
  '/departments/:departmentUid/dora',
  requireRole('ADMIN', 'HEAD'),
  ExportController.exportDepartmentDora
);

export default router;
