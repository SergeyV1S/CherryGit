import { z } from 'zod';

/**
 * Zod-схемы для query-параметров экспорта (доработка 6).
 *
 * Все эндпоинты используют `coerce.date()` для period — поддерживает ISO
 * (`2026-05-01`) и timestamp. Невалидное → ZodError → 400.
 * `separator` whitelist — `;` или `,` (см. csv-writer.ts).
 */

const UUID = z.string().uuid();
const SEPARATOR = z.enum([';', ',']).optional();
const GRANULARITY = z.enum(['day', 'week', 'month']).optional();

/**
 * Базовый набор query: period + separator.
 * Используется team-metrics, team-merge-requests, department-dora.
 */
export const periodExportQuerySchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  separator: SEPARATOR
});

/** Для department-DORA дополнительно granularity для DF/CFR. */
export const departmentDoraQuerySchema = periodExportQuerySchema.extend({
  granularity: GRANULARITY
});

/** Path-параметры team-export'ов. */
export const teamParamsSchema = z.object({
  teamUid: UUID
});

/** Path-параметры department-export'а. */
export const departmentParamsSchema = z.object({
  departmentUid: UUID
});

/**
 * Audit-экспорт (admin-only) — те же фильтры что у /admin/audit, плюс separator.
 * Без cap'а на limit (экспорт может быть большим), но total ограничим в сервисе.
 */
export const auditExportQuerySchema = z.object({
  userUid: UUID.optional(),
  action: z.string().min(1).max(128).optional(),
  actionPrefix: z.string().min(1).max(128).optional(),
  entityType: z.string().min(1).max(64).optional(),
  entityId: UUID.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  separator: SEPARATOR
});

export type PeriodExportQuery = z.infer<typeof periodExportQuerySchema>;
export type DepartmentDoraQuery = z.infer<typeof departmentDoraQuerySchema>;
export type AuditExportQuery = z.infer<typeof auditExportQuerySchema>;
