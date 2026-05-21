import { notImplemented } from '@/lib/not-implemented';

/**
 * Чтение журнала аудита (ВКР 2.2.3, 2.2.7).
 * Доступ — только ADMIN.
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

export const listAuditLogs = async (_filter: AuditQueryFilter) => {
  notImplemented('audit.listAuditLogs');
};

/** Запись события в журнал. Вызывается из других сервисов после успешного действия. */
export const recordAuditLog = async (_data: {
  userUid?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) => {
  notImplemented('audit.recordAuditLog');
};
