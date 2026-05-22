import { and, eq } from 'drizzle-orm';

import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { db } from '@/db/drizzle/connect';
import { teamMembers, teamProjects, teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Проверка доступа к данным конкретной команды (ВКР 2.2.3, FR-07).
 *
 * Правила:
 *   ADMIN          — полный доступ к любой команде (для отладки и аудита);
 *   LEAD           — только если состоит в команде с per-team ролью LEAD;
 *   HEAD           — только если команда принадлежит его отделу;
 *   DEVELOPER      — отдельные эндпоинты (`/me/...`); этот хелпер для них не нужен.
 *
 * Сценарии 403 (ВКР: «возврат 403 при попытке доступа вне зоны видимости»):
 *   — LEAD запрашивает чужую команду → 403;
 *   — HEAD запрашивает команду другого отдела → 403;
 *   — пользователь без записи в users → 403.
 *
 * Сценарии 404:
 *   — teamUid не существует → 404 (раньше 403, чтобы не было ENUM-leak).
 *
 * Возвращает список `projectUids` команды — это самый частый «next step»
 * после проверки доступа (выборка merge_requests/commits по проектам).
 */
export interface TeamAccessResult {
  projectUids: string[];
  team: { uid: string; name: string; departmentUid: string | null };
}

export const assertTeamAccess = async (
  actorUid: string,
  teamUid: string
): Promise<TeamAccessResult> => {
  // Загрузка команды и роли актора одним SELECT с двумя left join'ами.
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

  // ADMIN — полный доступ.
  // LEAD — должен быть в team_members этой команды с ролью LEAD.
  // HEAD — команда должна принадлежать его отделу.
  if (role === 'ADMIN') {
    // ok
  } else if (role === 'LEAD') {
    const [membership] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamUid, teamUid), eq(teamMembers.userUid, actorUid))
      );
    // LEAD'ом в этой команде должен быть именно этот пользователь.
    // Глобальный LEAD без membership = 403 (он может быть LEAD'ом другой команды).
    if (!membership || membership.role !== 'LEAD') {
      throw new CustomError(HttpStatus.FORBIDDEN, 'Not a lead of this team');
    }
  } else if (role === 'HEAD') {
    if (!actor.departmentUid || actor.departmentUid !== team.departmentUid) {
      throw new CustomError(HttpStatus.FORBIDDEN, "Team is not in HEAD's department");
    }
  } else {
    // DEVELOPER и прочие — этот хелпер не предназначен для них.
    throw new CustomError(HttpStatus.FORBIDDEN, 'Role has no access to team aggregates');
  }

  const projectRows = await db
    .select({ uid: teamProjects.projectUid })
    .from(teamProjects)
    .where(eq(teamProjects.teamUid, teamUid));

  return {
    team,
    projectUids: projectRows.map((r) => r.uid)
  };
};
