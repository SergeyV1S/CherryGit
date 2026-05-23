import { hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';

import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { db } from '@/db/drizzle/connect';
import { departments } from '@/db/drizzle/schema/departments/schema';
import {
  gitlabConnections,
  userGitlabIdentities
} from '@/db/drizzle/schema/gitlab/schema';
import { teamMembers, teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { decryptSecret } from '@/lib/encryption';
import { logger } from '@/lib/loger';
import { queryString } from '@/lib/request-params';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { removeAllTokensByUid } from '@/modules/auth/jwt.service';
import { GitlabClient } from '@/modules/gitlab/gitlab-client.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type {
  AdminCreateUserDto,
  AdminUpdateUserDto,
  ChangeRoleDto,
  LinkGitlabIdentityDto,
  ResetPasswordDto
} from './dto/user-admin.dto';

/**
 * Управление пользователями системы (ВКР 2.2.7 — admin only, доработка 4.3).
 *
 * Назначение:
 *   — закрывает дыру 4.3 «users-admin был stub-501»: до этого админ не мог
 *     завести нового сотрудника, поменять роль или связать с GitLab через
 *     REST — только прямым SQL'ем;
 *   — даёт ADMIN'у безопасный полный CRUD: создание (с автогенерируемым
 *     паролем при необходимости), смена роли (с invalidation токенов),
 *     reset пароля, удаление (с защитой lockout), связывание с GitLab
 *     identity (с auto-резолвом `gitlabUserId` через GitLab API).
 *
 * Архитектурные решения:
 *
 *   1. **Смена роли — ОТДЕЛЬНЫЙ endpoint**, не через `updateUser`. Причины:
 *        — audit-trail чётко отделяет управление профилем (firstName, mail,
 *          phone) от управления привилегиями (role) — важно для ВКР 2.2.3;
 *        — `changeRole` инвалидирует все refresh-токены пользователя —
 *          обычный `updateUser` этого делать не должен (иначе при смене
 *          email юзеру пришлось бы релогиниться, что плохо для UX).
 *
 *   2. **Защиты от lockout'а** при changeRole/deleteUser:
 *        — нельзя понизить/удалить себя (`actorUid === targetUid` → 409);
 *        — нельзя оставить систему без ADMIN'а (`count(ADMIN)=1 + target
 *          last admin + операция убирает ADMIN-роль → 409`).
 *      Без этих защит один неверный клик → потеря доступа к админке,
 *      восстановление только прямым UPDATE SQL'ем.
 *
 *   3. **Reset пароля и changeRole инвалидируют refresh-токены целевого
 *      юзера** через `jwtService.removeAllTokensByUid`. Access-токен
 *      продолжит работать до истечения (15 мин по конфигу), но новый
 *      refresh выдан не будет — юзер вынужден залогиниться повторно с
 *      новой ролью / новым паролем. Это компромисс между мгновенной
 *      инвалидацией (требует JWT-blacklist в Redis на каждый запрос) и
 *      eventual consistency (15 мин лаг приемлем для админа).
 *
 *   4. **Auto-resolve `gitlabUserId`** при `linkGitlabIdentity`: если DTO
 *      содержит только `gitlabUsername`, сервис расшифровывает PAT
 *      connection'а и зовёт `GitlabClient.fetchUserByUsername`. Без этого
 *      админу пришлось бы вручную лезть в GitLab UI узнавать числовой ID —
 *      неудобно. С auto-resolve сценарий «связать Васю с gitlab-аккаунтом
 *      vasya» — одна форма с двумя полями.
 *
 *   5. **Audit для всех 8 типов мутаций** (закрывает доработку 9.2.8 в части
 *      users-admin):
 *        user.created, user.updated, user.deleted,
 *        user.role_changed (с before/after), user.password_reset (БЕЗ
 *        plaintext пароля), user.gitlab_identity.linked,
 *        user.gitlab_identity.unlinked.
 *
 *   6. **Generated password** при createUser без password: используется
 *      `crypto.randomBytes(12).toString('base64url')` — 16 символов
 *      base64url, ~96 бит энтропии (выше требований OWASP). Возвращается
 *      В ОТВЕТЕ ОДИН РАЗ — админ копирует и сообщает out-of-band.
 *      В audit details сохраняется флаг `passwordGenerated: true` (без
 *      самого значения).
 *
 *   7. **Hard delete с защитой FK**: `gitlabConnections.ownerUid` —
 *      NOT NULL FK на `users.uid`, поэтому если у юзера есть GitLab-
 *      подключения — удаление блокируется (409 с пояснением).
 *      `team_members` и `user_gitlab_identities` каскадно снимаются
 *      в одной транзакции (как в `teams.deleteTeam`).
 *      `commits.authorUid` / `mr_reviews.userUid` / `merge_requests.authorUid` —
 *      nullable, поэтому исторические данные сохраняются с authorUid=NULL.
 *      `auditLogs.userUid` тоже nullable — журнал не теряет историю
 *      «кто и когда сделал то-то», даже если юзер удалён.
 */

const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === PG_UNIQUE_VIOLATION || e.cause?.code === PG_UNIQUE_VIOLATION;
};

const isFkViolation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === PG_FK_VIOLATION || e.cause?.code === PG_FK_VIOLATION;
};

// ===========================================================================
// Helpers
// ===========================================================================

const PUBLIC_USER_FIELDS = {
  uid: users.uid,
  firstName: users.firstName,
  secondName: users.secondName,
  mail: users.mail,
  phone: users.phone,
  role: users.role,
  departmentUid: users.departmentUid,
  birthDate: users.birthDate,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt
} as const;

const assertUserExists = async (uid: string) => {
  const [row] = await db.select(PUBLIC_USER_FIELDS).from(users).where(eq(users.uid, uid));
  if (!row) throw new CustomError(HttpStatus.NOT_FOUND, 'User not found');
  return row;
};

const assertDepartmentExists = async (uid: string): Promise<void> => {
  const [row] = await db
    .select({ uid: departments.uid })
    .from(departments)
    .where(eq(departments.uid, uid));
  if (!row) throw new CustomError(HttpStatus.NOT_FOUND, 'Department not found');
};

/**
 * Проверка «не последний ли это ADMIN в системе»: используется в changeRole
 * (понижение HEAD→DEVELOPER, ADMIN→...) и deleteUser. Без этой защиты один
 * SQL-запрос превратит систему в состояние «нет ни одного ADMIN'а», и
 * восстановить доступ к админке можно будет только прямым UPDATE в БД.
 *
 * Возвращает `true`, если `targetUid` сейчас ADMIN и кроме него ADMIN'ов
 * не осталось.
 */
const isLastAdmin = async (targetUid: string): Promise<boolean> => {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, 'ADMIN'));

  if (count > 1) return false;

  const [target] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.uid, targetUid));

  return target?.role === 'ADMIN';
};

/** Генерация криптостойкого временного пароля (16 chars, ~96 бит энтропии). */
const generateTemporaryPassword = (): string => randomBytes(12).toString('base64url');

const BCRYPT_ROUNDS = 10;

// ===========================================================================
// CRUD users
// ===========================================================================

/**
 * Список пользователей с фильтрами и поиском.
 * Query-параметры (через express request):
 *   - role: ADMIN|HEAD|LEAD|DEVELOPER
 *   - departmentUid: uuid
 *   - search: substring matched against firstName/secondName/mail (ILIKE)
 *   - limit, offset (пагинация; defaults 100/0)
 *
 * Сортировка: secondName ASC, firstName ASC — стабильный порядок для UI.
 * Password НИКОГДА не селектится.
 */
export interface ListUsersFilter {
  departmentUid?: string;
  limit?: number;
  offset?: number;
  role?: RoleType;
  search?: string;
}

export const listUsers = async (filter: ListUsersFilter = {}) => {
  const conditions = [];
  if (filter.role) conditions.push(eq(users.role, filter.role));
  if (filter.departmentUid) conditions.push(eq(users.departmentUid, filter.departmentUid));
  if (filter.search && filter.search.trim().length > 0) {
    const pattern = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(users.firstName, pattern),
        ilike(users.secondName, pattern),
        ilike(users.mail, pattern)
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select(PUBLIC_USER_FIELDS)
    .from(users)
    .where(where)
    .orderBy(asc(users.secondName), asc(users.firstName))
    .limit(Math.min(filter.limit ?? 100, 500))
    .offset(filter.offset ?? 0);
};

/**
 * Парсер query-фильтра из Express Request (используется контроллером).
 * Невалидное значение `role` → 400 с пояснением (на whitelist).
 */
const VALID_ROLES = new Set<RoleType>(['ADMIN', 'HEAD', 'LEAD', 'DEVELOPER']);

export const parseListUsersFilter = (req: import('express').Request): ListUsersFilter => {
  const filter: ListUsersFilter = {};
  const roleStr = queryString(req, 'role');
  if (roleStr) {
    if (!VALID_ROLES.has(roleStr as RoleType)) {
      throw new CustomError(
        HttpStatus.BAD_REQUEST,
        `unknown role "${roleStr}". Valid: ${[...VALID_ROLES].join(', ')}`
      );
    }
    filter.role = roleStr as RoleType;
  }
  const deptStr = queryString(req, 'departmentUid');
  if (deptStr) filter.departmentUid = deptStr;
  const searchStr = queryString(req, 'search');
  if (searchStr) filter.search = searchStr;
  const limitStr = queryString(req, 'limit');
  if (limitStr) {
    const n = Number(limitStr);
    if (Number.isFinite(n) && n > 0) filter.limit = Math.floor(n);
  }
  const offsetStr = queryString(req, 'offset');
  if (offsetStr) {
    const n = Number(offsetStr);
    if (Number.isFinite(n) && n >= 0) filter.offset = Math.floor(n);
  }
  return filter;
};

/**
 * Детальная карточка пользователя для admin UI: профиль + команды
 * (per-team role) + identities (linked GitLab-аккаунты).
 * Используется на странице «Пользователь Х» в админке.
 */
export const getUser = async (uid: string) => {
  const user = await assertUserExists(uid);

  const [memberships, identities, dept] = await Promise.all([
    db
      .select({
        memberUid: teamMembers.uid,
        teamUid: teams.uid,
        teamName: teams.name,
        teamRole: teamMembers.role,
        joinedAt: teamMembers.joinedAt
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.uid, teamMembers.teamUid))
      .where(eq(teamMembers.userUid, uid))
      .orderBy(asc(teams.name)),
    db
      .select({
        uid: userGitlabIdentities.uid,
        gitlabConnectionUid: userGitlabIdentities.gitlabConnectionUid,
        gitlabConnectionName: gitlabConnections.name,
        gitlabBaseUrl: gitlabConnections.baseUrl,
        gitlabUsername: userGitlabIdentities.gitlabUsername,
        gitlabUserId: userGitlabIdentities.gitlabUserId,
        createdAt: userGitlabIdentities.createdAt
      })
      .from(userGitlabIdentities)
      .innerJoin(
        gitlabConnections,
        eq(gitlabConnections.uid, userGitlabIdentities.gitlabConnectionUid)
      )
      .where(eq(userGitlabIdentities.userUid, uid))
      .orderBy(asc(gitlabConnections.name)),
    user.departmentUid
      ? db
          .select({ uid: departments.uid, name: departments.name })
          .from(departments)
          .where(eq(departments.uid, user.departmentUid))
      : Promise.resolve([])
  ]);

  return {
    ...user,
    department: dept[0] ?? null,
    teams: memberships,
    gitlabIdentities: identities
  };
};

/**
 * Admin-создание пользователя.
 *
 * Если `password` не передан — генерируется временный криптостойкий
 * (`crypto.randomBytes`). Возвращается в ответе ОДИН РАЗ как
 * `temporaryPassword`, чтобы админ скопировал и сообщил юзеру
 * out-of-band. Сохраняется в БД в bcrypt-хеше.
 *
 * Audit details содержит флаг `passwordGenerated`, но НЕ само значение.
 */
export const createUser = async (actorUid: string, dto: AdminCreateUserDto) => {
  if (dto.departmentUid) await assertDepartmentExists(dto.departmentUid);

  // Проверка дубликата по mail ДО insert — даёт чистый 409 без зависимости от
  // того, какое именно constraint сработает первым (mail unique vs phone).
  const [existing] = await db
    .select({ uid: users.uid })
    .from(users)
    .where(eq(users.mail, dto.mail));
  if (existing) {
    throw new CustomError(HttpStatus.CONFLICT, 'пользователь с таким email уже существует');
  }

  const rawPassword = dto.password ?? generateTemporaryPassword();
  const passwordGenerated = dto.password === undefined;
  const passwordHash = await hash(rawPassword, BCRYPT_ROUNDS);

  let created;
  try {
    [created] = await db
      .insert(users)
      .values({
        firstName: dto.firstName,
        secondName: dto.secondName,
        mail: dto.mail,
        phone: dto.phone ?? null,
        password: passwordHash,
        role: dto.role ?? 'DEVELOPER',
        departmentUid: dto.departmentUid ?? null,
        birthDate: dto.birthDate ?? null
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CustomError(
        HttpStatus.CONFLICT,
        'пользователь с таким email или телефоном уже существует'
      );
    }
    throw error;
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'user.created',
    entityType: 'user',
    entityId: created.uid,
    details: {
      mail: created.mail,
      role: created.role,
      departmentUid: created.departmentUid,
      passwordGenerated
    }
  });

  // password убираем из возврата; temporaryPassword отдаём ТОЛЬКО если
  // он был сгенерирован системой (админ его не задавал).
  const { password: _omitPassword, ...publicUser } = created;
  return {
    ...publicUser,
    ...(passwordGenerated ? { temporaryPassword: rawPassword } : {})
  };
};

/**
 * Патч профиля. НЕ позволяет менять role/password — для этого отдельные
 * endpoints. См. шапку файла, design choice #1.
 */
export const updateUser = async (
  actorUid: string,
  uid: string,
  dto: AdminUpdateUserDto
) => {
  const before = await assertUserExists(uid);

  if (dto.departmentUid !== undefined && dto.departmentUid !== null) {
    await assertDepartmentExists(dto.departmentUid);
  }

  const patch: Partial<typeof users.$inferInsert> = {};
  if (dto.firstName !== undefined) patch.firstName = dto.firstName;
  if (dto.secondName !== undefined) patch.secondName = dto.secondName;
  if (dto.mail !== undefined) patch.mail = dto.mail;
  if (dto.phone !== undefined) patch.phone = dto.phone ?? null;
  if (dto.departmentUid !== undefined) patch.departmentUid = dto.departmentUid;
  if (dto.birthDate !== undefined) patch.birthDate = dto.birthDate ?? null;

  if (Object.keys(patch).length === 0) return before;

  let updated;
  try {
    [updated] = await db.update(users).set(patch).where(eq(users.uid, uid)).returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CustomError(
        HttpStatus.CONFLICT,
        'указанный email или телефон уже занят другим пользователем'
      );
    }
    throw error;
  }
  if (!updated) {
    // Гонка SELECT vs UPDATE
    throw new CustomError(HttpStatus.NOT_FOUND, 'User not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'user.updated',
    entityType: 'user',
    entityId: uid,
    details: {
      before: {
        firstName: before.firstName,
        secondName: before.secondName,
        mail: before.mail,
        phone: before.phone,
        departmentUid: before.departmentUid,
        birthDate: before.birthDate
      },
      after: {
        firstName: updated.firstName,
        secondName: updated.secondName,
        mail: updated.mail,
        phone: updated.phone,
        departmentUid: updated.departmentUid,
        birthDate: updated.birthDate
      }
    }
  });

  const { password: _omitPassword, ...publicUser } = updated;
  return publicUser;
};

/**
 * Удаление пользователя. С защитами от lockout.
 *
 * Каскадно (в одной транзакции):
 *   — DELETE FROM team_members WHERE user_uid = uid;
 *   — DELETE FROM user_gitlab_identities WHERE user_uid = uid;
 *   — DELETE FROM users WHERE uid = uid.
 *
 * `gitlabConnections.ownerUid` (NOT NULL FK) НЕ обнуляется: если у юзера
 * есть подключения — удаление блокируется 409 с пояснением «передайте
 * GitLab-подключения другому админу или удалите их перед удалением юзера».
 * Это не падение FK — мы это проверяем заранее SELECT-ом, чтобы дать
 * понятное сообщение, а не stack-trace.
 *
 * `commits.authorUid`, `merge_requests.authorUid`, `mr_reviews.userUid`,
 * `auditLogs.userUid` — nullable, исторические данные сохраняются без
 * привязки к удалённому юзеру.
 */
export const deleteUser = async (actorUid: string, uid: string) => {
  if (actorUid === uid) {
    throw new CustomError(
      HttpStatus.CONFLICT,
      'нельзя удалить собственную учётную запись'
    );
  }

  const before = await assertUserExists(uid);

  // Защита от lockout'а: не оставлять систему без ADMIN'а.
  if (await isLastAdmin(uid)) {
    throw new CustomError(
      HttpStatus.CONFLICT,
      'нельзя удалить последнего ADMIN-пользователя'
    );
  }

  // Проверка наличия GitLab-подключений — блокируем удаление, чтобы не
  // получить непонятный FK error.
  const [{ count: ownedConnections }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gitlabConnections)
    .where(eq(gitlabConnections.ownerUid, uid));
  if (ownedConnections > 0) {
    throw new CustomError(
      HttpStatus.CONFLICT,
      `у пользователя есть ${ownedConnections} GitLab-подключений; передайте их другому администратору или удалите перед удалением учётной записи`
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(teamMembers).where(eq(teamMembers.userUid, uid));
      await tx.delete(userGitlabIdentities).where(eq(userGitlabIdentities.userUid, uid));
      await tx.delete(users).where(eq(users.uid, uid));
    });
  } catch (error) {
    if (isFkViolation(error)) {
      throw new CustomError(
        HttpStatus.CONFLICT,
        'удаление невозможно: на пользователя ссылаются другие сущности (FK violation)'
      );
    }
    throw error;
  }

  // Инвалидация всех активных сессий удалённого юзера — даже если access JWT
  // ещё валиден, refresh не сработает.
  try {
    await removeAllTokensByUid(uid);
  } catch (err) {
    logger.warn(`deleteUser: failed to invalidate tokens for ${uid}: ${(err as Error).message}`);
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'user.deleted',
    entityType: 'user',
    entityId: uid,
    details: {
      mail: before.mail,
      role: before.role,
      departmentUid: before.departmentUid
    }
  });
};

// ===========================================================================
// Смена роли и пароля
// ===========================================================================

/**
 * Смена глобальной роли. Защищена от lockout-сценариев + инвалидирует
 * refresh-токены целевого пользователя.
 *
 * См. шапку файла, design choice #2 (защиты) и #3 (invalidation).
 */
export const changeRole = async (
  actorUid: string,
  uid: string,
  dto: ChangeRoleDto
) => {
  const before = await assertUserExists(uid);

  if (before.role === dto.role) return before; // no-op

  // Защита #1: нельзя понизить себя.
  if (actorUid === uid && dto.role !== 'ADMIN') {
    throw new CustomError(
      HttpStatus.CONFLICT,
      'нельзя понизить собственную роль; попросите другого администратора'
    );
  }

  // Защита #2: нельзя оставить систему без ADMIN'а.
  if (dto.role !== 'ADMIN' && (await isLastAdmin(uid))) {
    throw new CustomError(
      HttpStatus.CONFLICT,
      'нельзя понизить последнего ADMIN-пользователя в системе'
    );
  }

  // Защита #3: HEAD без отдела бессмыслен (matrix-middleware всё равно его
  // не пустит). Но это не блокер — админ может назначить отдел отдельно через
  // departments.assignHead. Просто предупреждаем в audit details.
  const headWithoutDepartment = dto.role === 'HEAD' && !before.departmentUid;

  const [updated] = await db
    .update(users)
    .set({ role: dto.role })
    .where(eq(users.uid, uid))
    .returning(PUBLIC_USER_FIELDS);
  if (!updated) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'User not found');
  }

  // Force re-login: refresh-токены отозваны, при истечении access (15 мин)
  // юзер вынужден залогиниться. Новая роль попадёт в свежий JWT.
  try {
    await removeAllTokensByUid(uid);
  } catch (err) {
    logger.warn(`changeRole: failed to invalidate tokens for ${uid}: ${(err as Error).message}`);
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'user.role_changed',
    entityType: 'user',
    entityId: uid,
    details: {
      before: before.role,
      after: updated.role,
      headWithoutDepartment
    }
  });

  return updated;
};

/**
 * Сброс пароля пользователя админом. См. design choice #3 (invalidation).
 *
 * НИКОГДА не пишет plaintext password в audit/log — только флаг события.
 */
export const resetPassword = async (
  actorUid: string,
  uid: string,
  dto: ResetPasswordDto
) => {
  await assertUserExists(uid);

  const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
  const [updated] = await db
    .update(users)
    .set({ password: passwordHash })
    .where(eq(users.uid, uid))
    .returning(PUBLIC_USER_FIELDS);
  if (!updated) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'User not found');
  }

  try {
    await removeAllTokensByUid(uid);
  } catch (err) {
    logger.warn(
      `resetPassword: failed to invalidate tokens for ${uid}: ${(err as Error).message}`
    );
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: uid,
    details: {
      // ВАЖНО: НИКОГДА не логируем сам пароль (даже хеш).
      tokensInvalidated: true
    }
  });

  return updated;
};

// ===========================================================================
// GitLab identities (связь CherryGit-юзера с GitLab-аккаунтами)
// ===========================================================================

/**
 * Список GitLab-идентичностей пользователя.
 * Используется UI «вкладка GitLab» в карточке юзера.
 */
export const listUserIdentities = async (uid: string) => {
  await assertUserExists(uid);
  return db
    .select({
      uid: userGitlabIdentities.uid,
      gitlabConnectionUid: userGitlabIdentities.gitlabConnectionUid,
      gitlabConnectionName: gitlabConnections.name,
      gitlabBaseUrl: gitlabConnections.baseUrl,
      gitlabUsername: userGitlabIdentities.gitlabUsername,
      gitlabUserId: userGitlabIdentities.gitlabUserId,
      createdAt: userGitlabIdentities.createdAt
    })
    .from(userGitlabIdentities)
    .innerJoin(
      gitlabConnections,
      eq(gitlabConnections.uid, userGitlabIdentities.gitlabConnectionUid)
    )
    .where(eq(userGitlabIdentities.userUid, uid))
    .orderBy(asc(gitlabConnections.name));
};

/**
 * Связать пользователя с GitLab-аккаунтом.
 *
 * Если `gitlabUserId` не передан — резолвится через GitLab API
 * (`GitlabClient.fetchUserByUsername`) с использованием PAT'а connection'а.
 * Это даёт удобный UX: admin вводит только username.
 *
 * Возможные ошибки:
 *   — 404 user/connection не найдены;
 *   — 404 GitLab username не найден на этом инстансе;
 *   — 409 identity уже существует (uq_user_per_connection или
 *     uq_username_per_connection).
 *
 * См. шапку файла, design choice #4.
 */
export const linkGitlabIdentity = async (
  actorUid: string,
  userUid: string,
  dto: LinkGitlabIdentityDto
) => {
  await assertUserExists(userUid);

  const [connection] = await db
    .select()
    .from(gitlabConnections)
    .where(eq(gitlabConnections.uid, dto.gitlabConnectionUid));
  if (!connection) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'GitLab connection not found');
  }

  let gitlabUserId = dto.gitlabUserId;
  let resolvedUsername = dto.gitlabUsername;

  if (gitlabUserId === undefined) {
    // Auto-resolve через GitLab API. Расшифровываем PAT только для этого
    // запроса; токен живёт в замыкании client'а — не выходит из функции.
    let pat: string;
    try {
      pat = decryptSecret(connection.encryptedToken);
    } catch (error) {
      throw new CustomError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        `не удалось расшифровать PAT-токен connection'а: ${(error as Error).message}`
      );
    }
    const client = new GitlabClient(connection.baseUrl, pat);
    const gitlabUser = await client.fetchUserByUsername(dto.gitlabUsername);
    if (!gitlabUser) {
      throw new CustomError(
        HttpStatus.NOT_FOUND,
        `пользователь GitLab "${dto.gitlabUsername}" не найден на инстансе ${connection.baseUrl}`
      );
    }
    gitlabUserId = gitlabUser.id;
    // Используем username из ответа GitLab — на случай если админ ввёл с другим
    // регистром (GitLab сохраняет канонический).
    resolvedUsername = gitlabUser.username;
  }

  let created;
  try {
    [created] = await db
      .insert(userGitlabIdentities)
      .values({
        userUid,
        gitlabConnectionUid: dto.gitlabConnectionUid,
        gitlabUsername: resolvedUsername,
        gitlabUserId
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CustomError(
        HttpStatus.CONFLICT,
        'у пользователя уже есть привязка к этому GitLab-подключению, или указанный username уже занят другим CherryGit-юзером на этом инстансе'
      );
    }
    throw error;
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'user.gitlab_identity.linked',
    entityType: 'user',
    entityId: userUid,
    details: {
      identityUid: created.uid,
      gitlabConnectionUid: dto.gitlabConnectionUid,
      gitlabUsername: resolvedUsername,
      gitlabUserId,
      autoResolved: dto.gitlabUserId === undefined
    }
  });

  return created;
};

/**
 * Снять связь с GitLab-аккаунтом.
 *
 * Двойной фильтр `userUid + identityUid` защищает от cross-user manipulation:
 * нельзя удалить чужую identity, подменив userUid в URL.
 */
export const unlinkGitlabIdentity = async (
  actorUid: string,
  userUid: string,
  identityUid: string
) => {
  const result = await db
    .delete(userGitlabIdentities)
    .where(
      and(
        eq(userGitlabIdentities.uid, identityUid),
        eq(userGitlabIdentities.userUid, userUid)
      )
    )
    .returning({
      uid: userGitlabIdentities.uid,
      gitlabConnectionUid: userGitlabIdentities.gitlabConnectionUid,
      gitlabUsername: userGitlabIdentities.gitlabUsername
    });

  if (result.length === 0) {
    throw new CustomError(
      HttpStatus.NOT_FOUND,
      'GitLab identity не найдена или не принадлежит этому пользователю'
    );
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'user.gitlab_identity.unlinked',
    entityType: 'user',
    entityId: userUid,
    details: {
      identityUid,
      gitlabConnectionUid: result[0].gitlabConnectionUid,
      gitlabUsername: result[0].gitlabUsername
    }
  });
};

// ===========================================================================
// Утилиты для внешнего использования
// ===========================================================================

/**
 * Найти пользователя по mail (используется других модулей, напр. 4.4
 * auto-link by email). Возвращает только публичные поля (без password).
 */
export const findUserByMail = async (mail: string) => {
  const [row] = await db
    .select(PUBLIC_USER_FIELDS)
    .from(users)
    .where(eq(users.mail, mail));
  return row ?? null;
};

/**
 * Количество пользователей по роли (для статистики дашборда админа).
 * Используется в admin-UI «всего DEVELOPER'ов: 23».
 */
export const countByRole = async (): Promise<Record<RoleType, number>> => {
  const rows = await db
    .select({
      role: users.role,
      count: sql<number>`count(*)::int`
    })
    .from(users)
    .groupBy(users.role);

  const result: Record<RoleType, number> = {
    ADMIN: 0,
    HEAD: 0,
    LEAD: 0,
    DEVELOPER: 0
  };
  for (const row of rows) {
    result[row.role as RoleType] = row.count;
  }
  return result;
};

// Re-export type для совместимости (некоторые модули могут импортировать
// напрямую отсюда; ne unused-marker)
export type { RoleType };
void ne; // suppress unused import (зарезервировано для будущих фильтров «исключить себя»)
