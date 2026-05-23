import { z } from 'zod';

/**
 * Zod-схемы модуля audit (доработка 5).
 *
 * Все query-параметры валидируются через `safeParse` в контроллере; коэрция
 * строк (limit/offset/from/to) делается на уровне Zod через `.coerce.*`.
 * Невалидные значения → ZodError → 400 через глобальный error handler.
 */

const UUID = z.string().uuid();
const ENTITY_TYPE = z.string().min(1).max(64);
/**
 * Action: дотащим до 128 символов (текущие — `team.member.role_changed` ~26).
 * Не enum: action'ы расширяемые, новые модули могут добавлять без правки этой схемы.
 */
const ACTION = z.string().min(1).max(128);

export const listAuditLogsQuerySchema = z.object({
  userUid: UUID.optional(),
  action: ACTION.optional(),
  /** Префикс для action: `?actionPrefix=team.` → все события команды. */
  actionPrefix: ACTION.optional(),
  entityType: ENTITY_TYPE.optional(),
  entityId: UUID.optional(),
  /**
   * `coerce.date` поддерживает ISO-строки (`2026-05-23T10:00:00Z`) и
   * timestamp-числа. На невалидном вводе бросит ZodError → 400.
   */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

/**
 * `GET /admin/audit/entity/:entityType/:entityId` — параметры пути.
 * `entityId` обязателен как UUID (Audit писали через `entityId: uid`).
 */
export const entityHistoryParamsSchema = z.object({
  entityType: ENTITY_TYPE,
  entityId: UUID
});

export const statsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
export type EntityHistoryParams = z.infer<typeof entityHistoryParamsSchema>;
export type StatsQuery = z.infer<typeof statsQuerySchema>;
