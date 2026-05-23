import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { db } from '@/db/drizzle/connect';
import { departments } from '@/db/drizzle/schema/departments/schema';
import { teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type {
  AssignHeadDto,
  AttachTeamDto,
  CreateDepartmentDto,
  UpdateDepartmentDto
} from './dto/department.dto';

/**
 * Управление отделами разработки (ВКР 2.2.7, доработка 4.2).
 *
 * Назначение:
 *   — закрывает дыру 4.2 «departments были stub-501», блокировавшую сценарий
 *     HEAD: без отдела HEAD не получал ни одной команды через
 *     `listTeamsForUser` (см. teams.service.ts: HEAD-ветка фильтрует по
 *     `users.departmentUid === teams.departmentUid`);
 *   — даёт ADMIN'у полный REST-flow: создать отдел → привязать команды →
 *     назначить руководителя → HEAD сразу видит дашборд по командам отдела.
 *
 * Архитектурные решения:
 *
 *   1. **Cascade при удалении отдела**: при `DELETE /departments/:uid`
 *      все `teams.departmentUid` и `users.departmentUid`, указывающие на
 *      этот отдел, обнуляются (NULL) в той же транзакции. Это рабочая
 *      семантика «отдел расформирован», без сиротских FK-ссылок. Команды и
 *      пользователи сохраняются — никакая историческая метрика не теряется,
 *      просто HEAD перестаёт видеть свои бывшие команды (его departmentUid
 *      теперь NULL, и `listTeamsForUser` для HEAD без отдела возвращает
 *      пустой массив — это «свежий» рабочий fallback из 4.1).
 *
 *   2. **Назначение руководителя** делается ОТДЕЛЬНЫМ endpoint'ом, а не
 *      полем в DTO отдела. Причины:
 *        — у отдела может быть несколько HEAD'ов (co-leadership);
 *        — назначение HEAD — это мутация `users` таблицы (role +
 *          departmentUid), концептуально не CRUD отдела;
 *        — отдельный audit `department.head.assigned` явнее показывает кто
 *          и когда сделал такое назначение (важно для ВКР 2.2.3).
 *
 *   3. **`assignHead` по умолчанию поднимает глобальную роль до HEAD**
 *      (`setRoleToHead=true`). Это удобно: админу не нужно делать два
 *      запроса. Если админ хочет «привязать к отделу, но НЕ давать роль»
 *      (например, обычный сотрудник принадлежит отделу) — передать
 *      `setRoleToHead: false`.
 *
 *   4. **`attachTeam` идемпотентен**: повторная привязка той же команды к
 *      тому же отделу — no-op (возврат текущей команды без UPDATE и без
 *      audit). Если команда привязана к ДРУГОМУ отделу — операция
 *      перепривязывает (с audit'ом, отражающим переход).
 *
 *   5. **`name` НЕ уникальна** в БД (см. dto/department.dto.ts) — допустимы
 *      одноимённые отделы. Если в будущем потребуется уникальность —
 *      добавляется partial unique по `LOWER(name)` без потери совместимости.
 */

// ===========================================================================
// Helpers
// ===========================================================================

const assertDepartmentExists = async (uid: string): Promise<typeof departments.$inferSelect> => {
  const [row] = await db.select().from(departments).where(eq(departments.uid, uid));
  if (!row) throw new CustomError(HttpStatus.NOT_FOUND, 'Department not found');
  return row;
};

const assertTeamExists = async (uid: string): Promise<typeof teams.$inferSelect> => {
  const [row] = await db.select().from(teams).where(eq(teams.uid, uid));
  if (!row) throw new CustomError(HttpStatus.NOT_FOUND, 'Team not found');
  return row;
};

const assertUserExists = async (uid: string): Promise<typeof users.$inferSelect> => {
  const [row] = await db.select().from(users).where(eq(users.uid, uid));
  if (!row) throw new CustomError(HttpStatus.NOT_FOUND, 'User not found');
  return row;
};

// ===========================================================================
// CRUD departments
// ===========================================================================

/**
 * Все отделы — для admin-UI «список и счётчики». Сортировка по name ASC.
 * Дополнительно подгружаем COUNT(teams), COUNT(heads) одним SELECT'ом —
 * для UI бейджей «Backend · 3 команды · 1 руководитель».
 */
export const listDepartments = async () => {
  const teamsCount = db
    .select({
      departmentUid: teams.departmentUid,
      cnt: sql<number>`count(*)::int`.as('cnt')
    })
    .from(teams)
    .groupBy(teams.departmentUid)
    .as('teams_count');

  const headsCount = db
    .select({
      departmentUid: users.departmentUid,
      cnt: sql<number>`count(*)::int`.as('cnt')
    })
    .from(users)
    .where(eq(users.role, 'HEAD'))
    .groupBy(users.departmentUid)
    .as('heads_count');

  return db
    .select({
      uid: departments.uid,
      name: departments.name,
      description: departments.description,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
      teamCount: sql<number>`COALESCE(${teamsCount.cnt}, 0)::int`,
      headCount: sql<number>`COALESCE(${headsCount.cnt}, 0)::int`
    })
    .from(departments)
    .leftJoin(teamsCount, eq(teamsCount.departmentUid, departments.uid))
    .leftJoin(headsCount, eq(headsCount.departmentUid, departments.uid))
    .orderBy(asc(departments.name));
};

/**
 * Детальная карточка отдела с командами и руководителями (HEAD).
 * Используется в admin-UI при клике на отдел.
 */
export const getDepartment = async (uid: string) => {
  const dept = await assertDepartmentExists(uid);

  const [deptTeams, deptHeads] = await Promise.all([
    db
      .select({
        uid: teams.uid,
        name: teams.name,
        description: teams.description
      })
      .from(teams)
      .where(eq(teams.departmentUid, uid))
      .orderBy(asc(teams.name)),
    db
      .select({
        uid: users.uid,
        firstName: users.firstName,
        secondName: users.secondName,
        mail: users.mail,
        role: users.role
      })
      .from(users)
      .where(and(eq(users.departmentUid, uid), eq(users.role, 'HEAD')))
      .orderBy(asc(users.secondName))
  ]);

  return {
    ...dept,
    teams: deptTeams,
    heads: deptHeads
  };
};

export const createDepartment = async (actorUid: string, dto: CreateDepartmentDto) => {
  const [created] = await db
    .insert(departments)
    .values({
      name: dto.name,
      description: dto.description ?? null
    })
    .returning();

  await recordAuditLog({
    userUid: actorUid,
    action: 'department.created',
    entityType: 'department',
    entityId: created.uid,
    details: {
      name: created.name,
      description: created.description
    }
  });

  return created;
};

export const updateDepartment = async (actorUid: string, uid: string, dto: UpdateDepartmentDto) => {
  const before = await assertDepartmentExists(uid);

  const patch: Partial<typeof departments.$inferInsert> = {};
  if (dto.name !== undefined) patch.name = dto.name;
  if (dto.description !== undefined) patch.description = dto.description ?? null;

  if (Object.keys(patch).length === 0) return before;

  const [updated] = await db
    .update(departments)
    .set(patch)
    .where(eq(departments.uid, uid))
    .returning();
  // Защита от гонки SELECT vs UPDATE — отдел мог быть удалён параллельно.
  if (!updated) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Department not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'department.updated',
    entityType: 'department',
    entityId: uid,
    details: {
      before: { name: before.name, description: before.description },
      after: { name: updated.name, description: updated.description }
    }
  });

  return updated;
};

/**
 * Удаление отдела. Каскадно обнуляет `teams.departmentUid` и
 * `users.departmentUid`, указывающие на этот отдел. Команды и пользователи
 * сохраняются — историческая аналитика не теряется.
 *
 * Audit details показывают, СКОЛЬКО сущностей было отвязано — это нужно для
 * восстановления состояния при ошибке («админ удалил Backend, в нём было 5
 * команд и 2 head'а; UI показывает «отдел расформирован, привязки сняты»»).
 */
export const deleteDepartment = async (actorUid: string, uid: string) => {
  const before = await assertDepartmentExists(uid);

  const affected = await db.transaction(async (tx) => {
    const detachedTeams = await tx
      .update(teams)
      .set({ departmentUid: null })
      .where(eq(teams.departmentUid, uid))
      .returning({ uid: teams.uid });

    const unassignedUsers = await tx
      .update(users)
      .set({ departmentUid: null })
      .where(eq(users.departmentUid, uid))
      .returning({ uid: users.uid, role: users.role });

    await tx.delete(departments).where(eq(departments.uid, uid));

    return {
      teamsDetached: detachedTeams.map((t) => t.uid),
      usersUnassigned: unassignedUsers.map((u) => ({ uid: u.uid, role: u.role }))
    };
  });

  await recordAuditLog({
    userUid: actorUid,
    action: 'department.deleted',
    entityType: 'department',
    entityId: uid,
    details: {
      name: before.name,
      teamsDetached: affected.teamsDetached,
      usersUnassigned: affected.usersUnassigned
    }
  });
};

// ===========================================================================
// Привязка команд к отделу
// ===========================================================================

/**
 * Команды отдела (тот же набор, что в `getDepartment.teams`, но отдельным
 * endpoint'ом для удобства UI «таб команд»).
 */
export const listTeamsByDepartment = async (departmentUid: string) => {
  await assertDepartmentExists(departmentUid);
  return db
    .select({
      uid: teams.uid,
      name: teams.name,
      description: teams.description
    })
    .from(teams)
    .where(eq(teams.departmentUid, departmentUid))
    .orderBy(asc(teams.name));
};

/**
 * Привязать команду к отделу.
 *
 * Семантика:
 *   — `teams.departmentUid === departmentUid` уже → no-op (возврат текущей
 *     команды без UPDATE и без audit);
 *   — команда без отдела → привязка (audit `before=null`);
 *   — команда в ДРУГОМ отделе → перепривязка (audit показывает переход).
 *
 * Удобно для admin-UI: повторное нажатие «Прикрепить» не плодит дубли в
 * журнале аудита и не вызывает фиктивных мутаций.
 */
export const attachTeam = async (actorUid: string, departmentUid: string, dto: AttachTeamDto) => {
  await assertDepartmentExists(departmentUid);
  const team = await assertTeamExists(dto.teamUid);

  if (team.departmentUid === departmentUid) {
    return team; // no-op
  }

  const previousDepartmentUid = team.departmentUid;
  const [updated] = await db
    .update(teams)
    .set({ departmentUid })
    .where(eq(teams.uid, dto.teamUid))
    .returning();
  if (!updated) {
    // Гонка: команда удалена параллельно
    throw new CustomError(HttpStatus.NOT_FOUND, 'Team not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'department.team.attached',
    entityType: 'department',
    entityId: departmentUid,
    details: {
      teamUid: dto.teamUid,
      previousDepartmentUid
    }
  });

  return updated;
};

/**
 * Отвязать команду от отдела (set `teams.departmentUid = NULL`).
 *
 * Возвращает 404 если:
 *   — отдела с таким uid нет;
 *   — команды с таким uid нет;
 *   — команда привязана к ДРУГОМУ отделу (защита от misclick'а:
 *     «отвязал команду от Backend, но она была в Frontend» — это явная
 *     ошибка в URL, лучше 404 чем тихая no-op).
 */
export const detachTeam = async (actorUid: string, departmentUid: string, teamUid: string) => {
  await assertDepartmentExists(departmentUid);

  const result = await db
    .update(teams)
    .set({ departmentUid: null })
    .where(and(eq(teams.uid, teamUid), eq(teams.departmentUid, departmentUid)))
    .returning({ uid: teams.uid });

  if (result.length === 0) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Team is not attached to this department');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'department.team.detached',
    entityType: 'department',
    entityId: departmentUid,
    details: { teamUid }
  });
};

// ===========================================================================
// Назначение руководителей отдела (HEAD)
// ===========================================================================

/**
 * Список руководителей отдела (роль HEAD + departmentUid === thisDept).
 * Пользователи с departmentUid=this и ДРУГОЙ ролью (DEVELOPER/LEAD) НЕ
 * попадают — это просто «принадлежат отделу», а не его руководители.
 */
export const listHeads = async (departmentUid: string) => {
  await assertDepartmentExists(departmentUid);
  return db
    .select({
      uid: users.uid,
      firstName: users.firstName,
      secondName: users.secondName,
      mail: users.mail,
      role: users.role
    })
    .from(users)
    .where(and(eq(users.departmentUid, departmentUid), eq(users.role, 'HEAD')))
    .orderBy(asc(users.secondName));
};

/**
 * Назначить пользователя руководителем отдела.
 *
 * Поведение по умолчанию (`setRoleToHead=true`):
 *   1. `users.departmentUid = departmentUid`;
 *   2. `users.role = 'HEAD'`.
 *
 * Если `setRoleToHead=false` — только привязка к отделу, роль не трогаем.
 * Это для случая, когда админ ВРУЧНУЮ уже сделал пользователя HEAD'ом
 * через users-admin (4.3), а здесь хочет явный audit «привязали к отделу X».
 *
 * Если пользователь уже HEAD ЭТОГО отдела (`departmentUid === target`
 * и `role === 'HEAD'`) — no-op (возврат пользователя без UPDATE и audit).
 *
 * Если пользователь уже HEAD ДРУГОГО отдела — переназначение
 * (audit показывает `previousDepartmentUid`).
 */
export const assignHead = async (actorUid: string, departmentUid: string, dto: AssignHeadDto) => {
  await assertDepartmentExists(departmentUid);
  const user = await assertUserExists(dto.userUid);

  const wantRole: RoleType = dto.setRoleToHead ? 'HEAD' : (user.role as RoleType);

  if (user.departmentUid === departmentUid && user.role === wantRole) {
    return user; // no-op
  }

  const patch: Partial<typeof users.$inferInsert> = {
    departmentUid
  };
  if (dto.setRoleToHead) patch.role = 'HEAD';

  const [updated] = await db.update(users).set(patch).where(eq(users.uid, dto.userUid)).returning();
  if (!updated) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'User not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'department.head.assigned',
    entityType: 'department',
    entityId: departmentUid,
    details: {
      userUid: dto.userUid,
      previousDepartmentUid: user.departmentUid,
      previousRole: user.role,
      newRole: updated.role,
      setRoleToHead: dto.setRoleToHead ?? true
    }
  });

  return updated;
};

/**
 * Снять пользователя с поста руководителя отдела.
 *
 * Что делает:
 *   — `users.departmentUid = NULL`;
 *   — глобальная роль НЕ меняется (остаётся 'HEAD' — может быть назначен
 *     в другой отдел). Если ADMIN хочет понизить до DEVELOPER —
 *     это отдельная операция в users-admin (4.3).
 *
 * Возвращает 404 если:
 *   — отдела нет;
 *   — пользователя нет;
 *   — пользователь НЕ привязан к этому отделу (защита от misclick'а
 *     «снял Васю с Backend, но Вася в Frontend»).
 */
export const unassignHead = async (actorUid: string, departmentUid: string, userUid: string) => {
  await assertDepartmentExists(departmentUid);

  const result = await db
    .update(users)
    .set({ departmentUid: null })
    .where(and(eq(users.uid, userUid), eq(users.departmentUid, departmentUid)))
    .returning({ uid: users.uid, role: users.role });

  if (result.length === 0) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'User is not assigned to this department');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'department.head.unassigned',
    entityType: 'department',
    entityId: departmentUid,
    details: {
      userUid,
      previousRole: result[0].role
    }
  });
};

// ===========================================================================
// Утилиты, используемые другими модулями
// ===========================================================================

/**
 * Список «свободных» команд — без отдела. Удобно для admin-UI «привязать
 * команду к отделу»: dropdown показывает только реально свободные.
 *
 * Не привязан к конкретному отделу — это «глобальный» список для модального
 * окна выбора. Используется в admin-UI 7.5.
 */
export const listUnassignedTeams = async () =>
  db
    .select({
      uid: teams.uid,
      name: teams.name,
      description: teams.description
    })
    .from(teams)
    .where(isNull(teams.departmentUid))
    .orderBy(asc(teams.name));
