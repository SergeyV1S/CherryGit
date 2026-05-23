import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import { auditLogs } from '@/db/drizzle/schema/metrics/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { logger } from '@/lib/loger';

/**
 * Журнал аудита (ВКР 2.2.3, 2.2.7, доработка 5).
 *
 * Доступ к чтению — только ADMIN (через `audit.admin.routes`).
 *
 * **Архитектурные принципы**:
 *
 *   1. **Запись в журнал НЕ должна ломать бизнес-операцию** —
 *      `recordAuditLog` внутри ловит ошибки и логирует warning. Операция
 *      (подключение проекта, изменение команды и т.п.) считается успешной
 *      даже если запись аудита не прошла. Это правильная семантика для
 *      observability-системы: основной flow не должен зависеть от
 *      второстепенного логирования.
 *
 *   2. **`userUid` nullable** — для системных событий (cron-sync,
 *      периодический snapshot writer) и событий безопасности до
 *      аутентификации (`auth.failed_login` — атакующий ещё не залогинен).
 *
 *   3. **Структура `action`** — `entity.subaction` (или
 *      `entity.subentity.subaction`). Пример: `team.member.role_changed`,
 *      `user.gitlab_identity.linked`. Это даёт читаемые prefix-фильтры
 *      («все события безопасности» = action LIKE 'auth.%').
 *
 *   4. **`details` — JSONB**, обычно содержит `before/after` для диффов или
 *      `id`-параметры затронутых сущностей. **НИКОГДА** не пишем сюда
 *      пароли, PAT-токены, payload-ы запросов (см. `user.password_reset`
 *      — детали показывают только флаг `tokensInvalidated: true`).
 *
 *   5. **`entityId` — UUID-сущности**, к которой относится событие.
 *      `null` для глобальных событий (`reconcileGitlabIdentities` —
 *      затрагивает всех юзеров) и pre-auth (`auth.failed_login`).
 *
 *   6. **Пагинация всегда с total**: list-endpoint возвращает
 *      `{items, total, limit, offset}` — UI рисует «показано 100 из 4523».
 */

export interface AuditQueryFilter {
  action?: string;
  /** Префикс action (LIKE 'team.%'). Удобно для фильтра «все события команды». */
  actionPrefix?: string;
  entityId?: string;
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
 * Внутренний хелпер — собирает WHERE-условия из фильтра.
 * Возвращает `undefined`, если ни одного условия не задано (drizzle принимает
 * `undefined` в `.where()` и отдаст все строки).
 */
const buildWhere = (filter: AuditQueryFilter) => {
  const conditions = [];
  if (filter.userUid) conditions.push(eq(auditLogs.userUid, filter.userUid));
  if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
  if (filter.actionPrefix) {
    // LIKE-prefix: action LIKE 'team.%'. ESCAPE НЕ обязателен — action
    // формируется из whitelist констант в сервисах, контролируемые
    // значения, спецсимволы не встречаются.
    conditions.push(sql`${auditLogs.action} LIKE ${filter.actionPrefix + '%'}`);
  }
  if (filter.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType));
  if (filter.entityId) conditions.push(eq(auditLogs.entityId, filter.entityId));
  if (filter.from) conditions.push(gte(auditLogs.occurredAt, filter.from));
  if (filter.to) conditions.push(lte(auditLogs.occurredAt, filter.to));
  return conditions.length > 0 ? and(...conditions) : undefined;
};

export interface AuditLogItem {
  action: string;
  actor: {
    firstName: string;
    mail: string;
    secondName: string;
    uid: string;
  } | null;
  /**
   * `createdAt` приходит как ISO-строка: в `baseSchema` это `date()`
   * (PG `DATE`), Drizzle сериализует в `YYYY-MM-DD`. Для точных меток
   * времени UI должен использовать `occurredAt` (timestamp).
   */
  createdAt: string;
  details: Record<string, unknown> | null;
  entityId: string | null;
  entityType: string;
  occurredAt: Date;
  uid: string;
}

export interface AuditLogListResult {
  items: AuditLogItem[];
  limit: number;
  offset: number;
  total: number;
}

/**
 * Прочитать журнал аудита с фильтрацией и пагинацией.
 *
 * Делает LEFT JOIN с `users`, чтобы UI сразу видел имя actor'а — без
 * этого фронт пришлось бы делать N+1 lookup'ов на /users/:uid. `null`
 * actor — это системное событие (cron-sync) или удалённый пользователь
 * (ON DELETE SET NULL'ом отмечать не обязательно — FK уже nullable, и
 * `deleteUser` в users-admin не каскадит userUid в auditLogs).
 *
 * Сортировка по `occurredAt DESC` — свежие сверху, стандарт для журналов.
 * Параллельно с SELECT items делается SELECT COUNT(*) с тем же WHERE,
 * чтобы UI показал «показано 100 из 4523» и нарисовал пагинацию.
 *
 * Дефолты: limit=100 (cap 500), offset=0.
 */
export const listAuditLogs = async (
  filter: AuditQueryFilter
): Promise<AuditLogListResult> => {
  const where = buildWhere(filter);
  const limit = Math.min(filter.limit ?? 100, 500);
  const offset = filter.offset ?? 0;

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        uid: auditLogs.uid,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        occurredAt: auditLogs.occurredAt,
        createdAt: auditLogs.createdAt,
        actorUid: users.uid,
        actorFirstName: users.firstName,
        actorSecondName: users.secondName,
        actorMail: users.mail
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.uid, auditLogs.userUid))
      .where(where)
      .orderBy(desc(auditLogs.occurredAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(auditLogs)
      .where(where)
  ]);

  return {
    items: items.map((r) => ({
      uid: r.uid,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.details,
      occurredAt: r.occurredAt,
      createdAt: r.createdAt,
      actor: r.actorUid
        ? {
            uid: r.actorUid,
            firstName: r.actorFirstName!,
            secondName: r.actorSecondName!,
            mail: r.actorMail!
          }
        : null
    })),
    total,
    limit,
    offset
  };
};

/**
 * История событий по одной сущности.
 *
 * Удобно для UI «карточка команды → вкладка История»:
 *   - кто создал, кто менял, когда подключал проекты;
 *   - какие labels поменяли админы на проекте;
 *   - последовательность смен ролей пользователя.
 *
 * Возвращает в хронологическом порядке (ASC — старые сверху, новые внизу)
 * — это естественнее для «истории жизненного цикла». Список — не
 * страничный, потому что обычно у одной сущности десятки-сотни событий,
 * не тысячи.
 */
export const listAuditLogsForEntity = async (
  entityType: string,
  entityId: string,
  limit = 500
): Promise<AuditLogItem[]> => {
  const rows = await db
    .select({
      uid: auditLogs.uid,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      details: auditLogs.details,
      occurredAt: auditLogs.occurredAt,
      createdAt: auditLogs.createdAt,
      actorUid: users.uid,
      actorFirstName: users.firstName,
      actorSecondName: users.secondName,
      actorMail: users.mail
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.uid, auditLogs.userUid))
    .where(
      and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId))
    )
    .orderBy(asc(auditLogs.occurredAt))
    .limit(Math.min(limit, 1000));

  return rows.map((r) => ({
    uid: r.uid,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    details: r.details,
    occurredAt: r.occurredAt,
    createdAt: r.createdAt,
    actor: r.actorUid
      ? {
          uid: r.actorUid,
          firstName: r.actorFirstName!,
          secondName: r.actorSecondName!,
          mail: r.actorMail!
        }
      : null
  }));
};

/**
 * Список уникальных `action` для UI-фильтра (dropdown).
 * Дёшевый запрос — `SELECT DISTINCT action FROM audit_logs ORDER BY action`.
 * Не кешируем — десятки action'ов max.
 */
export const listKnownActions = async (): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .orderBy(asc(auditLogs.action));
  return rows.map((r) => r.action);
};

/**
 * Список уникальных `entityType` для UI-фильтра.
 */
export const listKnownEntityTypes = async (): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ entityType: auditLogs.entityType })
    .from(auditLogs)
    .orderBy(asc(auditLogs.entityType));
  return rows.map((r) => r.entityType);
};

export interface AuditStats {
  byAction: { action: string; count: number }[];
  byEntityType: { count: number; entityType: string }[];
  byUser: { count: number; userUid: string | null }[];
  total: number;
}

/**
 * Статистика по журналу за указанный период (для admin-дашборда).
 *
 * Возвращает агрегаты в трёх разрезах. Для UI: «топ-5 actions», «топ-5
 * пользователей по активности», etc. Лимит на каждый разрез — топ-50.
 *
 * Параметр `from`/`to` оба опциональны; если не заданы — за всё время.
 * Для «последние 7 дней» UI передаёт `from=now-7d`.
 */
export const getAuditStats = async (
  from?: Date,
  to?: Date
): Promise<AuditStats> => {
  const conditions = [];
  if (from) conditions.push(gte(auditLogs.occurredAt, from));
  if (to) conditions.push(lte(auditLogs.occurredAt, to));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [byAction, byEntityType, byUser, [{ total }]] = await Promise.all([
    db
      .select({
        action: auditLogs.action,
        count: count()
      })
      .from(auditLogs)
      .where(where)
      .groupBy(auditLogs.action)
      .orderBy(desc(count()))
      .limit(50),
    db
      .select({
        entityType: auditLogs.entityType,
        count: count()
      })
      .from(auditLogs)
      .where(where)
      .groupBy(auditLogs.entityType)
      .orderBy(desc(count())),
    db
      .select({
        userUid: auditLogs.userUid,
        count: count()
      })
      .from(auditLogs)
      .where(where)
      .groupBy(auditLogs.userUid)
      .orderBy(desc(count()))
      .limit(50),
    db
      .select({ total: count() })
      .from(auditLogs)
      .where(where)
  ]);

  return { byAction, byEntityType, byUser, total };
};
