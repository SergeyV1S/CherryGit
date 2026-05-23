import { and, count, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';

import type {
  BusFactorValue,
  ChangeFailureRateValue,
  CycleTimeMrValue,
  DeploymentFrequencyGranularity,
  DeploymentFrequencyValue,
  LeadTimeValue,
  MrSizeValue
} from '@/db/drizzle/schema/metrics/schema';

import { db } from '@/db/drizzle/connect';
import {
  commits,
  deploymentMergeRequests,
  deployments,
  mergeRequests,
  mrCommits
} from '@/db/drizzle/schema/git-data/schema';
import { codeModules } from '@/db/drizzle/schema/gitlab/schema';

import {
  BusFactorCalculator,
  type BusFactorMrInput
} from '../calculators/bus-factor.calculator';
import {
  ChangeFailureRateCalculator,
  type ChangeFailureRateInput
} from '../calculators/change-failure-rate.calculator';
import {
  CycleTimeMrCalculator,
  type CycleTimeMrInput
} from '../calculators/cycle-time-mr.calculator';
import {
  DeploymentFrequencyCalculator,
  type DeploymentFrequencyInput
} from '../calculators/deployment-frequency.calculator';
import {
  LeadTimeCalculator,
  type LeadTimeSample
} from '../calculators/lead-time.calculator';
import {
  MrSizeCalculator,
  type MrSizeInput
} from '../calculators/mr-size.calculator';

/**
 * Чистые функции расчёта метрик команды на УЖЕ резолвленных `projectUids`
 * (доработка 2.7).
 *
 * Цель — SoC между:
 *   — авторизацией (`assertTeamAccess` в `metrics.service.ts`) и
 *   — собственно вычислением.
 *
 * Эти функции вызываются и пользовательскими эндпоинтами (через
 * `metrics.service.ts:getTeam*`), и snapshot-writer'ом (system-context,
 * без actorUid). За счёт переиспользования гарантируется, что snapshot
 * и on-demand-расчёт дают БИТ-В-БИТ идентичный результат — иначе
 * исторические графики и текущая метрика начнут расходиться.
 *
 * Все функции возвращают только `value: <MetricValue>`, без обёртки
 * `TeamXxxReport` — обёртка добавляется на уровне `metrics.service.ts`
 * (там же лежат метаданные actor/team).
 *
 * Доработка 3.2 — `AuthorFilter`:
 *   MR-метрики (`computeCycleTimeMr`, `computeMrSize`) поддерживают
 *   опциональный фильтр по автору MR. Используется для personal-секции
 *   `/api/me/metrics`: «мои MR'ы в этой команде». Без фильтра — командный
 *   агрегат (baseline) — тот же контракт, что был.
 */

/**
 * Фильтр по автору MR (доработка 3.2 — для personal-метрик `/me/*`).
 *
 * Применяется как `WHERE authorUid IN userUid OR authorGitlabUsername IN [...]`:
 *   — `userUid` — резолвленный CherryGit-юзер (через `user_gitlab_identities`);
 *   — `gitlabUsernames` — все известные username'ы этого юзера на разных
 *     GitLab-инстансах (один юзер — несколько identities).
 *
 * **Семантика «пустой фильтр»**: если в фильтре не указан ни userUid, ни
 * gitlabUsernames, функция возвращает **пустую выборку** (а не «всё»).
 * Это критично для безопасности: вызывающий код не может случайно слить
 * чужие данные передав `{}` вместо валидного фильтра. Принцип fail-closed.
 */
export interface AuthorFilter {
  userUid?: string;
  gitlabUsernames?: string[];
}

/**
 * Построить SQL-условие по AuthorFilter для таблицы `merge_requests`.
 * Возвращает `null` если фильтр пуст — вызывающая функция должна вернуть
 * пустую выборку (fail-closed).
 */
const buildAuthorCondition = (filter: AuthorFilter | undefined): SQL | null => {
  if (!filter) return null; // фильтра нет → без фильтра по автору (командный baseline)
  const conditions: SQL[] = [];
  if (filter.userUid) conditions.push(eq(mergeRequests.authorUid, filter.userUid));
  if (filter.gitlabUsernames && filter.gitlabUsernames.length > 0) {
    conditions.push(inArray(mergeRequests.authorGitlabUsername, filter.gitlabUsernames));
  }
  if (conditions.length === 0) return null;
  return conditions.length === 1 ? conditions[0] : or(...conditions)!;
};

// ===========================================================================
// 2.1 Cycle Time MR
// ===========================================================================

export const computeCycleTimeMr = async (
  projectUids: string[],
  periodStart: Date,
  periodEnd: Date,
  options?: { authorFilter?: AuthorFilter }
): Promise<CycleTimeMrValue> => {
  const calculator = new CycleTimeMrCalculator();
  if (projectUids.length === 0) return calculator.compute([]);

  // Fail-closed: если передан пустой authorFilter (без userUid и без
  // gitlabUsernames) — возвращаем пустую выборку. Иначе вызывающий код
  // мог бы получить ЧУЖИЕ данные, передав `{}` (ВКР: индивидуальные
  // данные другого пользователя → 403 на уровне middleware, доп. защита
  // на уровне сервиса).
  const authorCond = options?.authorFilter ? buildAuthorCondition(options.authorFilter) : null;
  if (options?.authorFilter && !authorCond) return calculator.compute([]);

  const whereConds: SQL[] = [
    inArray(mergeRequests.projectUid, projectUids),
    gte(mergeRequests.mergedAt, periodStart),
    lte(mergeRequests.mergedAt, periodEnd)
  ];
  if (authorCond) whereConds.push(authorCond);

  const rows = await db
    .select({
      title: mergeRequests.title,
      gitlabCreatedAt: mergeRequests.gitlabCreatedAt,
      firstReviewAt: mergeRequests.firstReviewAt,
      approvedAt: mergeRequests.approvedAt,
      mergedAt: mergeRequests.mergedAt
    })
    .from(mergeRequests)
    .where(and(...whereConds));

  const input: CycleTimeMrInput[] = rows.map((r) => ({
    title: r.title,
    gitlabCreatedAt: r.gitlabCreatedAt,
    firstReviewAt: r.firstReviewAt,
    approvedAt: r.approvedAt,
    mergedAt: r.mergedAt
  }));
  return calculator.compute(input);
};

// ===========================================================================
// 2.2 MR Size
// ===========================================================================

export const computeMrSize = async (
  projectUids: string[],
  periodStart: Date,
  periodEnd: Date,
  options?: { authorFilter?: AuthorFilter }
): Promise<MrSizeValue> => {
  const calculator = new MrSizeCalculator();
  if (projectUids.length === 0) return calculator.compute([]);

  const authorCond = options?.authorFilter ? buildAuthorCondition(options.authorFilter) : null;
  if (options?.authorFilter && !authorCond) return calculator.compute([]);

  const whereConds: SQL[] = [
    inArray(mergeRequests.projectUid, projectUids),
    gte(mergeRequests.mergedAt, periodStart),
    lte(mergeRequests.mergedAt, periodEnd)
  ];
  if (authorCond) whereConds.push(authorCond);

  const rows = await db
    .select({
      title: mergeRequests.title,
      linesAdded: mergeRequests.linesAdded,
      linesRemoved: mergeRequests.linesRemoved
    })
    .from(mergeRequests)
    .where(and(...whereConds));

  const input: MrSizeInput[] = rows.map((r) => ({
    title: r.title,
    linesAdded: r.linesAdded,
    linesRemoved: r.linesRemoved
  }));
  return calculator.compute(input);
};

// ===========================================================================
// 2.3 Lead Time for Changes
// ===========================================================================

export const computeLeadTime = async (
  projectUids: string[],
  periodStart: Date,
  periodEnd: Date
): Promise<LeadTimeValue> => {
  const calculator = new LeadTimeCalculator();
  if (projectUids.length === 0) return calculator.compute([], 0);

  const deploymentWindow = and(
    inArray(deployments.projectUid, projectUids),
    gte(deployments.deployedAt, periodStart),
    lte(deployments.deployedAt, periodEnd)
  );

  // (a) счётчик деплоев в окне — для прозрачности `deploymentsConsidered`;
  // (b) LEFT JOIN пар (deployment, MR, MIN(commit time)).
  const [[deploymentsCountRow], pairs] = await Promise.all([
    db
      .select({ value: count() })
      .from(deployments)
      .where(deploymentWindow),
    db
      .select({
        deployedAt: deployments.deployedAt,
        firstCommitAt: sql<Date | null>`MIN(${commits.committedAt})`.as('first_commit_at')
      })
      .from(deployments)
      .innerJoin(
        deploymentMergeRequests,
        eq(deploymentMergeRequests.deploymentUid, deployments.uid)
      )
      .innerJoin(mergeRequests, eq(mergeRequests.uid, deploymentMergeRequests.mergeRequestUid))
      .leftJoin(mrCommits, eq(mrCommits.mergeRequestUid, mergeRequests.uid))
      .leftJoin(commits, eq(commits.uid, mrCommits.commitUid))
      .where(deploymentWindow)
      .groupBy(deployments.uid, deployments.deployedAt, mergeRequests.uid)
  ]);

  const deploymentsConsidered = deploymentsCountRow?.value ?? 0;
  const samples: LeadTimeSample[] = pairs.map((r) => ({
    deployedAt: r.deployedAt,
    firstCommitAt: r.firstCommitAt ? new Date(r.firstCommitAt) : null
  }));
  return calculator.compute(samples, deploymentsConsidered);
};

// ===========================================================================
// 2.4 Deployment Frequency
// ===========================================================================

export const computeDeploymentFrequency = async (
  projectUids: string[],
  periodStart: Date,
  periodEnd: Date,
  granularity: DeploymentFrequencyGranularity = 'week'
): Promise<DeploymentFrequencyValue> => {
  const calculator = new DeploymentFrequencyCalculator();
  if (projectUids.length === 0) {
    return calculator.compute([], periodStart, periodEnd, granularity);
  }

  const rows = await db
    .select({ deployedAt: deployments.deployedAt })
    .from(deployments)
    .where(
      and(
        inArray(deployments.projectUid, projectUids),
        eq(deployments.isFailed, false),
        gte(deployments.deployedAt, periodStart),
        lte(deployments.deployedAt, periodEnd)
      )
    );

  const input: DeploymentFrequencyInput[] = rows.map((r) => ({ deployedAt: r.deployedAt }));
  return calculator.compute(input, periodStart, periodEnd, granularity);
};

// ===========================================================================
// 2.5 Change Failure Rate
// ===========================================================================

export const computeChangeFailureRate = async (
  projectUids: string[],
  periodStart: Date,
  periodEnd: Date,
  granularity: DeploymentFrequencyGranularity = 'week'
): Promise<ChangeFailureRateValue> => {
  const calculator = new ChangeFailureRateCalculator();
  if (projectUids.length === 0) return calculator.compute([], granularity);

  const rows = await db
    .select({
      deployedAt: deployments.deployedAt,
      isHotfix: deployments.isHotfix,
      isRevert: deployments.isRevert
    })
    .from(deployments)
    .where(
      and(
        inArray(deployments.projectUid, projectUids),
        eq(deployments.isFailed, false),
        gte(deployments.deployedAt, periodStart),
        lte(deployments.deployedAt, periodEnd)
      )
    );

  const input: ChangeFailureRateInput[] = rows.map((r) => ({
    deployedAt: r.deployedAt,
    isHotfix: r.isHotfix,
    isRevert: r.isRevert
  }));
  return calculator.compute(input, granularity);
};

// ===========================================================================
// 2.6 Bus Factor
// ===========================================================================

export const computeBusFactor = async (
  projectUids: string[],
  windowStart: Date,
  windowEnd: Date,
  windowDays: number = BusFactorCalculator.DEFAULT_WINDOW_DAYS
): Promise<BusFactorValue> => {
  const calculator = new BusFactorCalculator();
  if (projectUids.length === 0) return calculator.compute([], [], windowDays);

  const [mrRows, moduleRows] = await Promise.all([
    db
      .select({
        authorUid: mergeRequests.authorUid,
        authorGitlabUsername: mergeRequests.authorGitlabUsername,
        filePaths: mergeRequests.filePaths
      })
      .from(mergeRequests)
      .where(
        and(
          inArray(mergeRequests.projectUid, projectUids),
          eq(mergeRequests.state, 'merged'),
          gte(mergeRequests.mergedAt, windowStart),
          lte(mergeRequests.mergedAt, windowEnd)
        )
      ),
    db
      .select({
        name: codeModules.name,
        pathPattern: codeModules.pathPattern
      })
      .from(codeModules)
      .where(inArray(codeModules.projectUid, projectUids))
  ]);

  const dedupedModules = Array.from(
    new Map(
      moduleRows.map((m) => [`${m.name}::${m.pathPattern}`, m] as const)
    ).values()
  ).map((m) => ({ name: m.name, pathPattern: m.pathPattern }));

  const mrs: BusFactorMrInput[] = mrRows.map((r) => ({
    authorKey: r.authorUid ? `uid:${r.authorUid}` : `gitlab:${r.authorGitlabUsername}`,
    filePaths: r.filePaths ?? []
  }));

  return calculator.compute(mrs, dedupedModules, windowDays);
};
