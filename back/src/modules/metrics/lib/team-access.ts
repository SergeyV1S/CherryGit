import { and, eq } from 'drizzle-orm';

import type { TeamMemberRole } from '@/db/drizzle/schema/teams/types/team-member-role.type';
import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { db } from '@/db/drizzle/connect';
import { teamMembers, teamProjects, teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Проверка доступа к данным конкретной команды (ВКР 2.2.3, FR-07).
 *
 * Правила (соответствует матрице ВКР 2.2.7 и `middleware/role-matrix.ts`):
 *   ADMIN      — полный доступ к любой команде (для отладки и аудита);
 *   LEAD       — только если состоит в команде с per-team ролью LEAD
 *                (`team_members.role === 'LEAD'`);
 *   HEAD       — только если команда принадлежит его отделу
 *                (`teams.departmentUid === users.departmentUid`);
 *   DEVELOPER  — только если он член команды (`team_members` любая роль).
 *                Это для FR-07 «командный baseline» — DEVELOPER видит
 *                агрегаты СВОЕЙ команды для сравнения «я vs команда».
 *
 * Сценарии 403 (ВКР: «возврат 403 при попытке доступа вне зоны видимости»):
 *   — LEAD запрашивает чужую команду → 403;
 *   — HEAD запрашивает команду другого отдела → 403;
 *   — DEVELOPER запрашивает команду, в которой не состоит → 403;
 *   — пользователь без записи в users → 403.
 *
 * Сценарии 404:
 *   — teamUid не существует → 404 (раньше 403, чтобы не было ENUM-leak).
 *
 * Возвращает `team`, `projectUids` и `accessMode`:
 *   — `accessMode='admin'`     — полный доступ;
 *   — `accessMode='lead'`      — лид этой команды;
 *   — `accessMode='head'`      — голова отдела этой команды;
 *   — `accessMode='member'`    — обычный участник команды (DEVELOPER).
 *
 * `accessMode` нужен сервисам, чтобы фильтровать ответы (доработка 3.2):
 * для `member` индивидуальные значения других участников должны быть
 * скрыты, а agregate baseline — показан.
 */
export interface TeamAccessResult {
  projectUids: string[];
  team: { uid: string; name: string; departmentUid: string | null };
  /** Способ, которым actor получил доступ. Используется для фильтрации ответа. */
  accessMode: 'admin' | 'head' | 'lead' | 'member';
}

/**
 * Загрузить глобальную роль actor'а по UID. Возвращает строго `RoleType`.
 * Бросает 403 если actor не найден (защита от удалённого пользователя
 * со старым JWT).
 *
 * Хелпер вынесен на уровень `metrics/lib`, чтобы и `metrics.service`,
 * и `snapshot.service` (доработка 2.7), и контроллеры могли его использовать
 * без cross-imports между этими модулями.
 */
export const loadActorRole = async (actorUid: string): Promise<RoleType> => {
  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.uid, actorUid));
  if (!actor) {
    throw new CustomError(HttpStatus.FORBIDDEN, 'actor not found');
  }
  return actor.role as RoleType;
};

export const assertTeamAccess = async (
  actorUid: string,
  teamUid: string
): Promise<TeamAccessResult> => {
  const [actor] = await db
    .select({ role: users.role, departmentUid: users.departmentUid })
    .from(users)
    .where(eq(users.uid, actorUid));
  if (!actor) {
    throw new CustomError(HttpStatus.FORBIDDEN, 'actor not found');
  }

  const [team] = await db
    .select({ uid: teams.uid, name: teams.name, departmentUid: teams.departmentUid })
    .from(teams)
    .where(eq(teams.uid, teamUid));
  if (!team) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Team not found');
  }

  const role = actor.role as RoleType;
  let accessMode: TeamAccessResult['accessMode'];

  // ADMIN — полный доступ.
  // LEAD — должен быть в team_members этой команды с ролью LEAD.
  // HEAD — команда должна принадлежать его отделу.
  // DEVELOPER — должен быть в team_members этой команды (для baseline, FR-07).
  if (role === 'ADMIN') {
    accessMode = 'admin';
  } else if (role === 'LEAD') {
    const [membership] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamUid, teamUid), eq(teamMembers.userUid, actorUid)));
    // Глобальный LEAD без membership = 403 (он может быть LEAD'ом другой команды).
    // Глобальный LEAD с per-team role 'DEVELOPER' в этой команде = тоже 403
    // (он не лид ИМЕННО ЭТОЙ команды).
    if (!membership || (membership.role as TeamMemberRole) !== 'LEAD') {
      throw new CustomError(HttpStatus.FORBIDDEN, 'Not a lead of this team');
    }
    accessMode = 'lead';
  } else if (role === 'HEAD') {
    if (!actor.departmentUid || actor.departmentUid !== team.departmentUid) {
      throw new CustomError(HttpStatus.FORBIDDEN, "Team is not in HEAD's department");
    }
    accessMode = 'head';
  } else if (role === 'DEVELOPER') {
    // DEVELOPER пропускается ТОЛЬКО если он реально член команды. Это новое
    // поведение из доработки 3.1: концепция CherryGit требует, чтобы
    // разработчик видел командный baseline СВОЕЙ команды (FR-07).
    // Член ≠ автор данных: глобальная роль DEVELOPER + per-team role
    // DEVELOPER в team_members → доступ только к ag agregates своей команды.
    // Сервисы (доработка 3.2) дополнительно фильтруют — НЕ раскрывают
    // индивидуальные значения других участников.
    const [membership] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamUid, teamUid), eq(teamMembers.userUid, actorUid)));
    if (!membership) {
      throw new CustomError(HttpStatus.FORBIDDEN, 'Not a member of this team');
    }
    accessMode = 'member';
  } else {
    // Неизвестная роль (защита от расширения RoleType без обновления matrix).
    throw new CustomError(HttpStatus.FORBIDDEN, `Role ${role} has no access to team aggregates`);
  }

  const projectRows = await db
    .select({ uid: teamProjects.projectUid })
    .from(teamProjects)
    .where(eq(teamProjects.teamUid, teamUid));

  return {
    team,
    accessMode,
    projectUids: projectRows.map((r) => r.uid)
  };
};
