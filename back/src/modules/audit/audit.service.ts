import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import { auditLogs } from '@/db/drizzle/schema/metrics/schema';
import { logger } from '@/lib/loger';

/**
 * Журнал аудита (ВКР 2.2.3, 2.2.7).
 * Доступ к чтению — только ADMIN.
 *
 * Принцип: запись в журнал НЕ должна ломать бизнес-операцию.
 * recordAuditLog внутри ловит ошибки и логирует warning — операция
 * (подключение проекта, изменение команды и т.п.) считается успешной
 * даже если запись аудита не прошла.
 */

export interface AuditQueryFilter {
  action?: string;
  entityType?: string;
  from?: Date;
  limit?: number;
  offset?: number;
  to?: Date;
  userUid?: string;
}

export interface AuditLogEntry {
  action: string;
  details?: Record<string, unknown>;
  entityId?: string;
  entityType: string;
  userUid?: string;
}

/**
 * Записать событие в журнал аудита.
 * Никогда не пробрасывает исключение — аудит не критичнее бизнес-операции.
 */
export const recordAuditLog = async (data: AuditLogEntry): Promise<void> => {
  try {
    await db.insert(auditLogs).values({
      userUid: data.userUid,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      details: data.details
    });
  } catch (error) {
    logger.warn(
      `Failed to record audit log (action=${data.action}, entity=${data.entityType}): ${(error as Error).message}`
    );
  }
};

/**
 * Прочитать журнал аудита с фильтрацией и пагинацией.
 * Сортировка по occurredAt DESC (свежие сверху).
 */
export const listAuditLogs = async (filter: AuditQueryFilter) => {
  const conditions = [];
  if (filter.userUid) conditions.push(eq(auditLogs.userUid, filter.userUid));
  if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
  if (filter.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType));
  if (filter.from) conditions.push(gte(auditLogs.occurredAt, filter.from));
  if (filter.to) conditions.push(lte(auditLogs.occurredAt, filter.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.occurredAt))
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0);
};
