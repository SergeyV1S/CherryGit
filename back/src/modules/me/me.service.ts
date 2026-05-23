import { eq } from 'drizzle-orm';

import type {
  CycleTimeMrValue,
  MrSizeValue
} from '@/db/drizzle/schema/metrics/schema';

import { db } from '@/db/drizzle/connect';
import { userGitlabIdentities } from '@/db/drizzle/schema/gitlab/schema';
import { teamMembers, teamProjects, teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { notImplemented } from '@/lib/not-implemented';
import {
  computeCycleTimeMr,
  computeMrSize,
  type AuthorFilter
} from '@/modules/metrics/lib/compute-team';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Сервис `/api/me/*` — данные текущего пользователя (доработка 3.2,
 * ВКР FR-07 «личные метрики + командный baseline»).
 *
 * Принципы ВКР (CLAUDE.md «Принципы метрик»):
 *   1. DEVELOPER видит ТОЛЬКО свои индивидуальные значения и агрегаты
 *      команд, в которых состоит. Никаких чужих личных значений.
 *   2. Baseline — это командный агрегат БЕЗ раскрытия индивидуальных
 *      значений (медиана/p90, бакеты, count — но не «у Васи 5 дней, у
 *      Пети 3 дня»). Структурно это `MrSizeValue` / `CycleTimeMrValue`
 *      без author-фильтра.
 *
 * Архитектурная гарантия: actorUid берётся ИЗ COOKIE, никогда из path/query.
 * Это исключает possibility прочитать чужие данные подменой параметра.
 */

// ===========================================================================
// Профиль текущего пользователя
// ===========================================================================

/**
 * Расширенный профиль: базовые поля + role + departmentUid + команды +
 * gitlab-identities. Используется UI для шапки приложения и страницы
 * «обо мне».
 *
 * Возвращаем только PUBLIC-поля. `password` явно НЕ селектится.
 */
export const getCurrentUser = async (userUid: string) => {
  const [user] = await db
    .select({
      uid: users.uid,
      firstName: users.firstName,
      secondName: users.secondName,
      mail: users.mail,
      role: users.role,
      departmentUid: users.departmentUid
    })
    .from(users)
    .where(eq(users.uid, userUid));
  if (!user) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'User not found');
  }

  const memberships = await db
    .select({
      teamUid: teams.uid,
      teamName: teams.name,
      teamRole: teamMembers.role,
      departmentUid: teams.departmentUid
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.uid, teamMembers.teamUid))
    .where(eq(teamMembers.userUid, userUid));

  const identities = await db
    .select({
      uid: userGitlabIdentities.uid,
      gitlabConnectionUid: userGitlabIdentities.gitlabConnectionUid,
      gitlabUsername: userGitlabIdentities.gitlabUsername,
      gitlabUserId: userGitlabIdentities.gitlabUserId,
      email: userGitlabIdentities.email
    })
    .from(userGitlabIdentities)
    .where(eq(userGitlabIdentities.userUid, userUid));

  return {
    ...user,
    teams: memberships,
    gitlabIdentities: identities
  };
};

// ===========================================================================
// GitLab-identities пользователя
// ===========================================================================

/**
 * Все GitLab-аккаунты, привязанные к этому пользователю.
 * Один пользователь может иметь identity на нескольких GitLab-инстансах
 * (см. `gitlab_connections`). UI отображает список для админа и юзера.
 */
export const getMyGitlabIdentities = async (userUid: string) => {
  return db
    .select({
      uid: userGitlabIdentities.uid,
      gitlabConnectionUid: userGitlabIdentities.gitlabConnectionUid,
      gitlabUsername: userGitlabIdentities.gitlabUsername,
      gitlabUserId: userGitlabIdentities.gitlabUserId,
      email: userGitlabIdentities.email
    })
    .from(userGitlabIdentities)
    .where(eq(userGitlabIdentities.userUid, userUid));
};

// ===========================================================================
// Личные метрики + командный baseline
// ===========================================================================

/**
 * Тип возврата `/api/me/metrics`.
 *
 * Сгруппировано по командам пользователя:
 *   — `personal` — метрики ТОЛЬКО его MR'ов в этой команде (через
 *     AuthorFilter: `userUid` OR `gitlabUsernames` из его identities);
 *   — `baseline` — командные агрегаты (те же метрики без author-фильтра).
 *
 * MR-уровневые метрики — `cycle_time_mr` и `mr_size`. Lead Time / DF / CFR /
 * Bus Factor НЕ имеют personal-варианта (Lead Time — про деплои, DF/CFR —
 * про релизы, BF — про модули), поэтому в personal не входят.
 *
 * Если у пользователя 0 команд → `teams: []`, не 500.
 */
export interface MyMetricsReport {
  userUid: string;
  periodStart: Date;
  periodEnd: Date;
  /** Identities, использованные для фильтрации personal-секции. */
  gitlabUsernames: string[];
  teams: {
    teamUid: string;
    teamName: string;
    personal: {
      cycle_time_mr: CycleTimeMrValue;
      mr_size: MrSizeValue;
    };
    baseline: {
      cycle_time_mr: CycleTimeMrValue;
      mr_size: MrSizeValue;
    };
  }[];
}

export const getMyMetrics = async (
  userUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<MyMetricsReport> => {
  if (periodEnd < periodStart) {
    throw new CustomError(HttpStatus.BAD_REQUEST, 'periodEnd must be ≥ periodStart');
  }

  // 1. Собрать все GitLab-username'ы пользователя — нужны для author-фильтра
  //    (один юзер может коммитить под `vasya` в одной GitLab и `vp` в другой).
  const identities = await db
    .select({ gitlabUsername: userGitlabIdentities.gitlabUsername })
    .from(userGitlabIdentities)
    .where(eq(userGitlabIdentities.userUid, userUid));
  const gitlabUsernames = [...new Set(identities.map((i) => i.gitlabUsername))];

  // 2. Резолв команд пользователя. DEVELOPER может состоять в нескольких
  //    командах (включая ту, в которой он LEAD per-team) — отдаём по всем.
  const memberships = await db
    .select({
      teamUid: teams.uid,
      teamName: teams.name
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.uid, teamMembers.teamUid))
    .where(eq(teamMembers.userUid, userUid));

  if (memberships.length === 0) {
    return { userUid, periodStart, periodEnd, gitlabUsernames, teams: [] };
  }

  // 3. AuthorFilter — userUid + все его GitLab username'ы. Это фильтр-OR:
  //    MR засчитывается как «личный», если authorUid === userUid (есть
  //    identity) ИЛИ authorGitlabUsername в списке (identity ещё не сделана).
  //    Без OR личные метрики не работали бы до полного резолва identities (4.4).
  const authorFilter: AuthorFilter = {
    userUid,
    gitlabUsernames
  };

  // 4. Для каждой команды — параллельно personal + baseline.
  const teamReports = await Promise.all(
    memberships.map(async (m) => {
      const projectRows = await db
        .select({ uid: teamProjects.projectUid })
        .from(teamProjects)
        .where(eq(teamProjects.teamUid, m.teamUid));
      const projectUids = projectRows.map((r) => r.uid);

      const [pCt, pSz, bCt, bSz] = await Promise.all([
        computeCycleTimeMr(projectUids, periodStart, periodEnd, { authorFilter }),
        computeMrSize(projectUids, periodStart, periodEnd, { authorFilter }),
        computeCycleTimeMr(projectUids, periodStart, periodEnd),
        computeMrSize(projectUids, periodStart, periodEnd)
      ]);

      return {
        teamUid: m.teamUid,
        teamName: m.teamName,
        personal: { cycle_time_mr: pCt, mr_size: pSz },
        baseline: { cycle_time_mr: bCt, mr_size: bSz }
      };
    })
  );

  return {
    userUid,
    periodStart,
    periodEnd,
    gitlabUsernames,
    teams: teamReports
  };
};

/**
 * История индивидуальных показателей за весь период наблюдения (ВКР FR-14).
 * За пределами 3.2 — требует snapshot-таблицы для `entityType='user'`
 * (см. ДОРАБОТКИ 2.7 — «осталось доработать: снепшоты для индивидуальных
 * метрик»). Сейчас заглушка.
 */
export const getMyMetricsHistory = async (_userUid: string) => {
  notImplemented('me.getMyMetricsHistory');
};
