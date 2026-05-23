import { and, asc, eq, inArray } from 'drizzle-orm';

import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { db } from '@/db/drizzle/connect';
import { departments } from '@/db/drizzle/schema/departments/schema';
import { projects } from '@/db/drizzle/schema/gitlab/schema';
import { teamMembers, teamProjects, teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { logger } from '@/lib/loger';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { loadActorRole } from '@/modules/metrics/lib/team-access';
import * as SnapshotService from '@/modules/snapshots/snapshot.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type {
  AddTeamMemberDto,
  AttachProjectDto,
  CreateTeamDto,
  UpdateTeamDto,
  UpdateTeamMemberDto
} from './dto/team.dto';

/**
 * Управление командами разработки (ВКР 2.2.7, доработка 4.1).
 *
 * Закрывает доработку 9.2.1 («без CRUD команд систему нельзя ввести в
 * эксплуатацию через REST»). Все методы пишут audit (доработка 9.2.8 —
 * «audit не подключён в teams»).
 *
 * Архитектурные решения:
 *   — DELETE команды каскадно снимает связи `team_members` и `team_projects`
 *     в одной транзакции, но НЕ удаляет `metrics_snapshots` команды — они
 *     остаются как «осиротевшая история» (entityId на удалённую команду);
 *     это позволяет восстановить аналитику если команду пересоздадут.
 *   — При смене состава команды (member/project) фоном пересчитывается
 *     snapshot — иначе следующий sync-tick (до 10 минут) показывал бы
 *     старые данные.
 *   — Уникальные ограничения PostgreSQL (`uq_member_per_team`,
 *     `uq_team_project`) ловятся через код 23505 → HTTP 409 (как в
 *     `projects.service.ts:isUniqueViolation`).
 */

const PG_UNIQUE_VIOLATION = '23505';

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === PG_UNIQUE_VIOLATION || e.cause?.code === PG_UNIQUE_VIOLATION;
};

// ===========================================================================
// Helpers: загрузка контекста
// ===========================================================================

const assertTeamExists = async (teamUid: string): Promise<typeof teams.$inferSelect> => {
  const [team] = await db.select().from(teams).where(eq(teams.uid, teamUid));
  if (!team) throw new CustomError(HttpStatus.NOT_FOUND, 'Team not found');
  return team;
};

const assertUserExists = async (userUid: string): Promise<void> => {
  const [user] = await db.select({ uid: users.uid }).from(users).where(eq(users.uid, userUid));
  if (!user) throw new CustomError(HttpStatus.NOT_FOUND, 'User not found');
};

const assertProjectExists = async (projectUid: string): Promise<void> => {
  const [p] = await db
    .select({ uid: projects.uid })
    .from(projects)
    .where(eq(projects.uid, projectUid));
  if (!p) throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
};

const assertDepartmentExists = async (departmentUid: string): Promise<void> => {
  const [d] = await db
    .select({ uid: departments.uid })
    .from(departments)
    .where(eq(departments.uid, departmentUid));
  if (!d) throw new CustomError(HttpStatus.NOT_FOUND, 'Department not found');
};

const assertProjectsExist = async (projectUids: string[]): Promise<void> => {
  if (projectUids.length === 0) return;
  const found = await db
    .select({ uid: projects.uid })
    .from(projects)
    .where(inArray(projects.uid, projectUids));
  if (found.length !== projectUids.length) {
    throw new CustomError(HttpStatus.BAD_REQUEST, 'один или несколько projectUids не существуют');
  }
};

/**
 * Триггер фонового пересчёта snapshots всех затронутых команд.
 * Используется после изменения состава members/projects — без этого
 * snapshots показывали бы устаревшие данные до следующего sync-tick'а
 * (по умолчанию 10 минут).
 *
 * Fire-and-forget: ошибка writer'а НЕ ломает основную операцию.
 */
const scheduleSnapshotRecalc = (teamUid: string): void => {
  void SnapshotService.writeSnapshotsForTeam(teamUid).catch((err: Error) => {
    logger.warn(`teams.scheduleSnapshotRecalc team=${teamUid}: ${err.message}`);
  });
};

// ===========================================================================
// Списки команд для пользователя (с role-фильтрацией)
// ===========================================================================

/**
 * Команды, доступные пользователю по концепции CherryGit (CLAUDE.md):
 *   ADMIN     — все;
 *   HEAD      — команды его отдела;
 *   LEAD/DEV  — команды, в которых он `team_members` (любой per-team role).
 *
 * Возвращает срез `{ uid, name, departmentUid }` + per-team role актора
 * (для UI: «вы LEAD этой команды», «вы DEVELOPER этой команды»).
 */
export const listTeamsForUser = async (userUid: string) => {
  const role = await loadActorRole(userUid);

  if (role === 'ADMIN') {
    return db
      .select({
        uid: teams.uid,
        name: teams.name,
        description: teams.description,
        departmentUid: teams.departmentUid
      })
      .from(teams)
      .orderBy(asc(teams.name));
  }

  if (role === 'HEAD') {
    const [actor] = await db
      .select({ departmentUid: users.departmentUid })
      .from(users)
      .where(eq(users.uid, userUid));
    if (!actor?.departmentUid) {
      // HEAD без отдела — отдельный edge case; возвращаем пусто, не 500.
      return [];
    }
    return db
      .select({
        uid: teams.uid,
        name: teams.name,
        description: teams.description,
        departmentUid: teams.departmentUid
      })
      .from(teams)
      .where(eq(teams.departmentUid, actor.departmentUid))
      .orderBy(asc(teams.name));
  }

  // LEAD / DEVELOPER — только свои команды через team_members.
  return db
    .select({
      uid: teams.uid,
      name: teams.name,
      description: teams.description,
      departmentUid: teams.departmentUid,
      myRole: teamMembers.role
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.uid, teamMembers.teamUid))
    .where(eq(teamMembers.userUid, userUid))
    .orderBy(asc(teams.name));
};

/**
 * Детальная карточка команды. Доступ через `assertTeamAccess` (matrix 3.1):
 *   ADMIN/LEAD/HEAD-of-department/member — пропускаются;
 *   иначе 403.
 */
export const getTeam = async (userUid: string, teamUid: string) => {
  // Импорт здесь, чтобы не плодить cross-import во всём файле.
  // assertTeamAccess уже делает SELECT team — дополнительный assertTeamExists
  // не нужен (404 даст сам).
  const { assertTeamAccess } = await import('@/modules/metrics/lib/team-access');
  const { team, accessMode } = await assertTeamAccess(userUid, teamUid);

  const [members, attachedProjects, department] = await Promise.all([
    listMembersByTeam(teamUid),
    listProjectsByTeam(teamUid),
    team.departmentUid ? loadDepartment(team.departmentUid) : Promise.resolve(null)
  ]);

  return {
    ...team,
    department,
    accessMode,
    members,
    projects: attachedProjects
  };
};

const loadDepartment = async (uid: string) => {
  const [d] = await db
    .select({ uid: departments.uid, name: departments.name })
    .from(departments)
    .where(eq(departments.uid, uid));
  return d ?? null;
};

// ===========================================================================
// Admin CRUD teams
// ===========================================================================

export const listAllTeams = async () =>
  db
    .select({
      uid: teams.uid,
      name: teams.name,
      description: teams.description,
      departmentUid: teams.departmentUid
    })
    .from(teams)
    .orderBy(asc(teams.name));

/**
 * Создание команды. Опционально привязывает проекты в одной транзакции —
 * иначе админу пришлось бы делать POST team + N POST team_projects, и
 * между ними транзакция могла бы порваться.
 */
export const createTeam = async (actorUid: string, dto: CreateTeamDto) => {
  if (dto.departmentUid) await assertDepartmentExists(dto.departmentUid);
  if (dto.projectUids && dto.projectUids.length > 0) {
    await assertProjectsExist(dto.projectUids);
  }

  const created = await db.transaction(async (tx) => {
    const [team] = await tx
      .insert(teams)
      .values({
        name: dto.name,
        description: dto.description ?? null,
        departmentUid: dto.departmentUid ?? null
      })
      .returning();

    if (dto.projectUids && dto.projectUids.length > 0) {
      await tx
        .insert(teamProjects)
        .values(dto.projectUids.map((projectUid) => ({ teamUid: team.uid, projectUid })));
    }

    return team;
  });

  await recordAuditLog({
    userUid: actorUid,
    action: 'team.created',
    entityType: 'team',
    entityId: created.uid,
    details: {
      name: created.name,
      departmentUid: created.departmentUid,
      projectUids: dto.projectUids ?? []
    }
  });

  // Snapshot writer для свежесозданной команды: на момент создания нет MR,
  // но writer всё равно запишет пустые snapshots (sampleSize=0) — это даёт
  // UI «нет данных» вместо null-response.
  scheduleSnapshotRecalc(created.uid);

  return created;
};

export const updateTeam = async (uid: string, dto: UpdateTeamDto, actorUid: string) => {
  const before = await assertTeamExists(uid);

  if (dto.departmentUid !== undefined && dto.departmentUid !== null) {
    await assertDepartmentExists(dto.departmentUid);
  }

  const patch: Partial<typeof teams.$inferInsert> = {};
  if (dto.name !== undefined) patch.name = dto.name;
  if (dto.description !== undefined) patch.description = dto.description ?? null;
  // departmentUid: undefined → не трогать; null → отвязать.
  if (dto.departmentUid !== undefined) patch.departmentUid = dto.departmentUid;

  if (Object.keys(patch).length === 0) return before;

  const [updated] = await db.update(teams).set(patch).where(eq(teams.uid, uid)).returning();
  if (!updated) {
    // Гонка SELECT vs UPDATE — команда удалена параллельно.
    throw new CustomError(HttpStatus.NOT_FOUND, 'Team not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'team.updated',
    entityType: 'team',
    entityId: uid,
    details: {
      before: {
        name: before.name,
        description: before.description,
        departmentUid: before.departmentUid
      },
      after: {
        name: updated.name,
        description: updated.description,
        departmentUid: updated.departmentUid
      }
    }
  });

  return updated;
};

/**
 * Удаление команды. Каскадно снимает связи `team_members` и `team_projects`
 * в одной транзакции. `metrics_snapshots` команды НЕ удаляются (см. шапку
 * файла) — остаются как «осиротевшая история».
 */
export const deleteTeam = async (actorUid: string, uid: string) => {
  const before = await assertTeamExists(uid);

  await db.transaction(async (tx) => {
    await tx.delete(teamMembers).where(eq(teamMembers.teamUid, uid));
    await tx.delete(teamProjects).where(eq(teamProjects.teamUid, uid));
    await tx.delete(teams).where(eq(teams.uid, uid));
  });

  await recordAuditLog({
    userUid: actorUid,
    action: 'team.deleted',
    entityType: 'team',
    entityId: uid,
    details: {
      name: before.name,
      departmentUid: before.departmentUid
    }
  });
};

// ===========================================================================
// Members
// ===========================================================================

/**
 * Список участников команды с базовыми полями user'а + per-team role.
 * Используется в `getTeam` (внутри `Promise.all`) и через прямой endpoint.
 */
const listMembersByTeam = async (teamUid: string) =>
  db
    .select({
      memberUid: teamMembers.uid,
      userUid: users.uid,
      firstName: users.firstName,
      secondName: users.secondName,
      mail: users.mail,
      teamRole: teamMembers.role,
      joinedAt: teamMembers.joinedAt
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.uid, teamMembers.userUid))
    .where(eq(teamMembers.teamUid, teamUid))
    .orderBy(asc(teamMembers.joinedAt));

export const listMembers = async (teamUid: string) => {
  await assertTeamExists(teamUid);
  return listMembersByTeam(teamUid);
};

export const addMember = async (actorUid: string, teamUid: string, dto: AddTeamMemberDto) => {
  await assertTeamExists(teamUid);
  await assertUserExists(dto.userUid);

  let created;
  try {
    [created] = await db
      .insert(teamMembers)
      .values({
        teamUid,
        userUid: dto.userUid,
        role: dto.role
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      // uq_member_per_team — уже состоит в команде. Соответствует «дубликат».
      throw new CustomError(HttpStatus.CONFLICT, 'пользователь уже состоит в этой команде');
    }
    throw error;
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'team.member.added',
    entityType: 'team',
    entityId: teamUid,
    details: {
      memberUid: created.uid,
      userUid: dto.userUid,
      role: dto.role
    }
  });

  // Member change может повлиять на `assertTeamAccess` для этого юзера
  // (теперь он pulled в команду → видит baseline). Snapshot не зависит от
  // members команды (агрегаты от MR проектов), пересчёт не нужен.

  return created;
};

export const updateMember = async (
  actorUid: string,
  teamUid: string,
  memberUid: string,
  dto: UpdateTeamMemberDto
) => {
  // teamUid в URL + memberUid (PK строки team_members) — двойной фильтр
  // защищает от cross-team-modification (memberUid одной команды нельзя
  // подменить на другую team в URL).
  const [before] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.uid, memberUid), eq(teamMembers.teamUid, teamUid)));
  if (!before) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Team member not found');
  }

  if (before.role === dto.role) return before; // no-op

  const [updated] = await db
    .update(teamMembers)
    .set({ role: dto.role })
    .where(eq(teamMembers.uid, memberUid))
    .returning();

  await recordAuditLog({
    userUid: actorUid,
    action: 'team.member.role_changed',
    entityType: 'team',
    entityId: teamUid,
    details: {
      memberUid,
      userUid: before.userUid,
      before: before.role,
      after: dto.role
    }
  });

  return updated;
};

export const removeMember = async (actorUid: string, teamUid: string, memberUid: string) => {
  const [before] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.uid, memberUid), eq(teamMembers.teamUid, teamUid)));
  if (!before) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Team member not found');
  }

  await db.delete(teamMembers).where(eq(teamMembers.uid, memberUid));

  await recordAuditLog({
    userUid: actorUid,
    action: 'team.member.removed',
    entityType: 'team',
    entityId: teamUid,
    details: {
      memberUid,
      userUid: before.userUid,
      role: before.role
    }
  });
};

// ===========================================================================
// Project attachment
// ===========================================================================

/**
 * Список проектов, привязанных к команде. Используется в `getTeam` и
 * через прямой endpoint.
 */
const listProjectsByTeam = async (teamUid: string) =>
  db
    .select({
      uid: projects.uid,
      name: projects.name,
      namespace: projects.namespace,
      defaultBranch: projects.defaultBranch
    })
    .from(teamProjects)
    .innerJoin(projects, eq(projects.uid, teamProjects.projectUid))
    .where(eq(teamProjects.teamUid, teamUid))
    .orderBy(asc(projects.name));

export const listTeamProjects = async (teamUid: string) => {
  await assertTeamExists(teamUid);
  return listProjectsByTeam(teamUid);
};

export const attachProject = async (actorUid: string, teamUid: string, dto: AttachProjectDto) => {
  await assertTeamExists(teamUid);
  await assertProjectExists(dto.projectUid);

  try {
    await db.insert(teamProjects).values({ teamUid, projectUid: dto.projectUid });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CustomError(HttpStatus.CONFLICT, 'проект уже привязан к этой команде');
    }
    throw error;
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'team.project.attached',
    entityType: 'team',
    entityId: teamUid,
    details: { projectUid: dto.projectUid }
  });

  // Состав проектов команды поменялся → snapshot устарел.
  scheduleSnapshotRecalc(teamUid);
};

export const detachProject = async (actorUid: string, teamUid: string, projectUid: string) => {
  const result = await db
    .delete(teamProjects)
    .where(and(eq(teamProjects.teamUid, teamUid), eq(teamProjects.projectUid, projectUid)))
    .returning();
  if (result.length === 0) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Project is not attached to this team');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'team.project.detached',
    entityType: 'team',
    entityId: teamUid,
    details: { projectUid }
  });

  scheduleSnapshotRecalc(teamUid);
};

// ===========================================================================
// Utility (опционально для тестов 8.3 — пометим как exported)
// ===========================================================================

/**
 * Проверка членства пользователя в команде. Использует тот же критерий, что
 * `assertTeamAccess`, но без бросания ошибок и без загрузки projectUids.
 */
export const isMemberOfTeam = async (userUid: string, teamUid: string): Promise<boolean> => {
  const [row] = await db
    .select({ uid: teamMembers.uid })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamUid, teamUid), eq(teamMembers.userUid, userUid)));
  return Boolean(row);
};

/** Type-export для использования в контроллерах без direct import RoleType. */
export type ActorRole = RoleType;
