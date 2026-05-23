import { asc, eq, inArray } from 'drizzle-orm';

import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { db } from '@/db/drizzle/connect';
import { teamProjects, teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import {
  computeChangeFailureRate,
  computeDeploymentFrequency,
  computeLeadTime
} from '@/modules/metrics/lib/compute-team';
import { getSnapshotHistory } from '@/modules/snapshots/snapshot.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Кросс-командные DORA-метрики для руководителя отдела (ВКР 2.2.7, FR-05).
 * Доступ — только HEAD; данные агрегируются по командам внутри отдела пользователя.
 *
 * Принципиально НЕ возвращает индивидуальные данные участников
 * и не позволяет drill-down глубже уровня команды.
 */
export const getCrossTeamDora = async (actorUid: string, periodStart: Date, periodEnd: Date) => {
  const [actor] = await db
    .select({ uid: users.uid, role: users.role, departmentUid: users.departmentUid })
    .from(users)
    .where(eq(users.uid, actorUid));

  if (!actor) {
    throw new CustomError(HttpStatus.FORBIDDEN, 'actor not found');
  }

  if (actor.role !== 'ADMIN' && actor.role !== 'HEAD') {
    throw new CustomError(HttpStatus.FORBIDDEN, 'cross-team DORA доступен только HEAD и ADMIN');
  }

  // HEAD видит только команды своего отдела, ADMIN — любого.
  if (actor.role === 'HEAD' && !actor.departmentUid) {
    return { departmentUid: null, teams: [] };
  }

  const departmentUid = actor.role === 'HEAD' ? actor.departmentUid! : null;

  const departmentTeams = departmentUid
    ? await db
        .select({ uid: teams.uid, name: teams.name })
        .from(teams)
        .where(eq(teams.departmentUid, departmentUid))
        .orderBy(asc(teams.name))
    : await db.select({ uid: teams.uid, name: teams.name }).from(teams).orderBy(asc(teams.name));

  if (departmentTeams.length === 0) {
    return { departmentUid, teams: [] };
  }

  const teamUids = departmentTeams.map((t) => t.uid);

  // Загрузить projectUids для всех команд отдела одним SELECT.
  const projectRows = await db
    .select({ teamUid: teamProjects.teamUid, projectUid: teamProjects.projectUid })
    .from(teamProjects)
    .where(inArray(teamProjects.teamUid, teamUids));

  const teamProjectsMap = new Map<string, string[]>();
  for (const r of projectRows) {
    if (!teamProjectsMap.has(r.teamUid)) teamProjectsMap.set(r.teamUid, []);
    teamProjectsMap.get(r.teamUid)!.push(r.projectUid);
  }

  const teamResults = await Promise.all(
    departmentTeams.map(async (team) => {
      const projectUids = teamProjectsMap.get(team.uid) ?? [];
      if (projectUids.length === 0) {
        return {
          teamUid: team.uid,
          teamName: team.name,
          projectCount: 0,
          leadTime: null as Awaited<ReturnType<typeof computeLeadTime>> | null,
          deploymentFrequency: null as Awaited<
            ReturnType<typeof computeDeploymentFrequency>
          > | null,
          changeFailureRate: null as Awaited<ReturnType<typeof computeChangeFailureRate>> | null
        };
      }
      const [lt, df, cfr] = await Promise.all([
        computeLeadTime(projectUids, periodStart, periodEnd),
        computeDeploymentFrequency(projectUids, periodStart, periodEnd, 'week'),
        computeChangeFailureRate(projectUids, periodStart, periodEnd, 'week')
      ]);
      return {
        teamUid: team.uid,
        teamName: team.name,
        projectCount: projectUids.length,
        leadTime: lt,
        deploymentFrequency: df,
        changeFailureRate: cfr
      };
    })
  );

  return {
    departmentUid,
    periodStart,
    periodEnd,
    teams: teamResults
  };
};

/**
 * Сравнительная динамика DORA-метрик команд во времени.
 * Читает из metrics_snapshots (history) для каждой команды отдела.
 */
export const getCrossTeamTrend = async (
  actorUid: string,
  periodStart: Date,
  periodEnd: Date,
  granularity: 'day' | 'month' | 'week'
) => {
  const [actor] = await db
    .select({ uid: users.uid, role: users.role, departmentUid: users.departmentUid })
    .from(users)
    .where(eq(users.uid, actorUid));

  if (!actor) {
    throw new CustomError(HttpStatus.FORBIDDEN, 'actor not found');
  }

  if (actor.role !== 'ADMIN' && actor.role !== 'HEAD') {
    throw new CustomError(HttpStatus.FORBIDDEN, 'cross-team trend доступен только HEAD и ADMIN');
  }

  if (actor.role === 'HEAD' && !actor.departmentUid) {
    return { departmentUid: null, teams: [] };
  }

  const departmentUid = actor.role === 'HEAD' ? actor.departmentUid! : null;

  const departmentTeams = departmentUid
    ? await db
        .select({ uid: teams.uid, name: teams.name })
        .from(teams)
        .where(eq(teams.departmentUid, departmentUid))
        .orderBy(asc(teams.name))
    : await db.select({ uid: teams.uid, name: teams.name }).from(teams).orderBy(asc(teams.name));

  if (departmentTeams.length === 0) {
    return { departmentUid, teams: [] };
  }

  // DORA-метрики, доступные HEAD через snapshot history.
  const doraMetrics: MetricType[] = ['lead_time', 'deployment_frequency', 'change_failure_rate'];

  const teamTrends = await Promise.all(
    departmentTeams.map(async (team) => {
      const histories = await Promise.all(
        doraMetrics.map((metricType) =>
          getSnapshotHistory(team.uid, metricType, periodStart, periodEnd).then((rows) => ({
            metricType,
            snapshots: rows
          }))
        )
      );
      return {
        teamUid: team.uid,
        teamName: team.name,
        history: Object.fromEntries(histories.map((h) => [h.metricType, h.snapshots]))
      };
    })
  );

  return {
    departmentUid,
    periodStart,
    periodEnd,
    granularity,
    teams: teamTrends
  };
};
