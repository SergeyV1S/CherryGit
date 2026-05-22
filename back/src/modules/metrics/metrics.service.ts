import { and, count, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import type {
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
import { notImplemented } from '@/lib/not-implemented';

import {
  ChangeFailureRateCalculator,
  type ChangeFailureRateInput
} from './calculators/change-failure-rate.calculator';
import {
  CycleTimeMrCalculator,
  type CycleTimeMrInput
} from './calculators/cycle-time-mr.calculator';
import {
  DeploymentFrequencyCalculator,
  type DeploymentFrequencyInput
} from './calculators/deployment-frequency.calculator';
import {
  LeadTimeCalculator,
  type LeadTimeSample
} from './calculators/lead-time.calculator';
import {
  MrSizeCalculator,
  type MrSizeInput
} from './calculators/mr-size.calculator';
import { assertTeamAccess } from './lib/team-access';

/**
 * Сервис получения рассчитанных метрик из metrics_snapshots.
 *
 * Ролевая модель (ВКР 2.2.3, FR-07):
 *   — DEVELOPER → отдельные `/me/...` эндпоинты (не этот сервис);
 *   — LEAD      → командные агрегаты тех команд, где он лид (LEAD per-team);
 *   — HEAD      → команды своего отдела;
 *   — ADMIN     → любые команды (для отладки/аудита).
 *
 * Все команд-зависимые методы выполняют `assertTeamAccess` ПЕРЕД доступом
 * к БД, чтобы 403 возвращался до маршрутизации тяжёлых выборок.
 *
 * Текущий статус: реализованы методы из доработки 2.1 (Cycle Time MR).
 * Остальные — заглушки `notImplemented` до завершения 2.2-2.6.
 */

// ===== Team-scoped metrics =====

/**
 * Сводные метрики команды (парная визуализация скорости и качества — FR-06).
 * Возвращает: Lead Time, Deployment Frequency, Change Failure Rate, MR Size.
 */
export const getTeamMetrics = async (
  _actorUid: string,
  _teamUid: string,
  _periodStart: Date,
  _periodEnd: Date
) => {
  notImplemented('metrics.getTeamMetrics');
};

/**
 * Cycle Time MR с декомпозицией на 3 фазы (ВКР FR-09, доработка 2.1).
 *
 * Алгоритм (см. также cycle-time-mr.calculator.ts):
 *   1. assertTeamAccess(actor, team) — 403 если нет доступа, 404 если нет команды.
 *   2. Если у команды нет проектов — пустой результат (sampleSize=0).
 *   3. SELECT merged MRs по проектам команды, mergedAt ∈ [start, end].
 *   4. compute() — медиана и p90 на total + 3 фазы, отброс draft/WIP.
 *
 * Окно: фильтр по `mergedAt`. Это даёт стабильность — MR попадает в метрику
 * ровно того периода, в котором был замерджен (не «открыт», не «обновлён»).
 * Альтернативные окна (по `closedAt`, `gitlabCreatedAt`) могут быть полезны
 * для других дашбордов, но MVP-эндпоинт — по mergedAt.
 *
 * Доступ — LEAD команды / HEAD отдела / ADMIN.
 */
export interface TeamCycleTimeMrReport {
  metricType: 'cycle_time_mr';
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  value: CycleTimeMrValue;
  /** Список UID проектов, по которым шла выборка (прозрачность расчёта). */
  projectUids: string[];
}

export const getTeamCycleTimeMr = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamCycleTimeMrReport> => {
  if (periodEnd < periodStart) {
    // Контроллер пускает диапазон as-is — здесь страхуемся, чтобы не получить
    // пустую выборку из-за опечатки клиента.
    throw new Error('periodEnd must be ≥ periodStart');
  }

  const { projectUids } = await assertTeamAccess(actorUid, teamUid);

  const calculator = new CycleTimeMrCalculator();

  // Если у команды нет проектов — отдельная ветка: SELECT с inArray([]) в Drizzle
  // безопасен (вернёт пусто), но явная ранняя ветка читабельнее и экономит roundtrip.
  if (projectUids.length === 0) {
    return {
      metricType: 'cycle_time_mr',
      teamUid,
      periodStart,
      periodEnd,
      projectUids,
      value: calculator.compute([])
    };
  }

  // Выборка только merged-MR'ов с mergedAt в окне периода.
  // state='merged' исключает open/closed-без-мержа; mergedAt NOT NULL — там же.
  // Дополнительно фильтруем по target_branch != null уровнем выше (не нужно
  // тут — Cycle Time не зависит от ветки релиза, в отличие от Lead Time).
  const rows = await db
    .select({
      title: mergeRequests.title,
      gitlabCreatedAt: mergeRequests.gitlabCreatedAt,
      firstReviewAt: mergeRequests.firstReviewAt,
      approvedAt: mergeRequests.approvedAt,
      mergedAt: mergeRequests.mergedAt
    })
    .from(mergeRequests)
    .where(
      and(
        inArray(mergeRequests.projectUid, projectUids),
        gte(mergeRequests.mergedAt, periodStart),
        lte(mergeRequests.mergedAt, periodEnd)
      )
    );

  // Драйвер postgres возвращает timestamp как Date; типы Drizzle тоже.
  // Здесь ничего не парсим — отдаём как есть калькулятору.
  const input: CycleTimeMrInput[] = rows.map((r) => ({
    title: r.title,
    gitlabCreatedAt: r.gitlabCreatedAt,
    firstReviewAt: r.firstReviewAt,
    approvedAt: r.approvedAt,
    mergedAt: r.mergedAt
  }));

  return {
    metricType: 'cycle_time_mr',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    value: calculator.compute(input)
  };
};

/**
 * MR Size — распределение MR команды по бакетам размеров (ВКР FR-15, доработка 2.2).
 *
 * Бакеты фиксированные: ≤50, 51-200, 201-400, 401-800, >800
 * (по сумме `linesAdded + linesRemoved`). См. `MrSizeCalculator.BUCKETS`.
 *
 * Алгоритм идентичен `getTeamCycleTimeMr` (тот же скоуп выборки):
 *   1. assertTeamAccess(actor, team) — 403/404.
 *   2. Если у команды нет проектов — пустой результат (sampleSize=0).
 *   3. SELECT merged MRs по проектам команды, mergedAt ∈ [start, end].
 *   4. compute() — медиана/p90/бакеты, отброс draft/WIP по заголовку.
 *
 * Окно — по `mergedAt` (стабильность исторических замеров).
 *
 * Доступ — LEAD команды / HEAD отдела / ADMIN (см. metrics.routes.ts).
 *
 * Парная визуализация (ВКР FR-06):
 *   MR Size без Cycle Time — половина картины. В дашборде тимлида они
 *   рендерятся рядом: распределение размеров MR + время прохождения по фазам.
 *   В этом сервисе они разделены на два эндпоинта (отдельные queries клиенту,
 *   но одинаковый scope), чтобы кешироваться и обновляться независимо.
 */
export interface TeamMrSizeReport {
  metricType: 'mr_size';
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  /** Список UID проектов, по которым шла выборка (прозрачность расчёта). */
  projectUids: string[];
  value: MrSizeValue;
}

export const getTeamMrSize = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamMrSizeReport> => {
  if (periodEnd < periodStart) {
    throw new Error('periodEnd must be ≥ periodStart');
  }

  const { projectUids } = await assertTeamAccess(actorUid, teamUid);

  const calculator = new MrSizeCalculator();

  if (projectUids.length === 0) {
    return {
      metricType: 'mr_size',
      teamUid,
      periodStart,
      periodEnd,
      projectUids,
      value: calculator.compute([])
    };
  }

  // Минимальный срез — только то, что нужно калькулятору; mergedAt не запрашиваем,
  // потому что фильтрация уже в WHERE.
  const rows = await db
    .select({
      title: mergeRequests.title,
      linesAdded: mergeRequests.linesAdded,
      linesRemoved: mergeRequests.linesRemoved
    })
    .from(mergeRequests)
    .where(
      and(
        inArray(mergeRequests.projectUid, projectUids),
        gte(mergeRequests.mergedAt, periodStart),
        lte(mergeRequests.mergedAt, periodEnd)
      )
    );

  const input: MrSizeInput[] = rows.map((r) => ({
    title: r.title,
    linesAdded: r.linesAdded,
    linesRemoved: r.linesRemoved
  }));

  return {
    metricType: 'mr_size',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    value: calculator.compute(input)
  };
};

/**
 * Lead Time for Changes — DORA-метрика (ВКР FR-04, доработка 2.3).
 *
 * Формула на пару (deployment, MR):
 *   leadTime = deployedAt − MIN(commits.committedAt for c in mr_commits)
 *
 * Алгоритм:
 *   1. assertTeamAccess(actor, team) — 403/404.
 *   2. Если у команды нет проектов — пустой результат.
 *   3. Параллельно два запроса:
 *      a) COUNT deployments в окне (для прозрачности расчёта — UI показывает
 *         «N деплоев рассмотрено», даже если у части не нашлось связанных MR);
 *      b) LEFT JOIN deployments → deployment_merge_requests → merge_requests
 *         → mr_commits → commits, GROUP BY (deployment, MR), агрегат
 *         MIN(commits.committedAt) AS firstCommitAt.
 *   4. calculator.compute(samples, deploymentsConsidered) — медиана/p90.
 *
 * Окно — по `deployedAt` (это «дата релиза», стабильная во времени).
 *
 * Почему LEFT JOIN, а не INNER на mr_commits:
 *   Если у MR ещё нет связей `mr_commits` (sync только что подключил проект
 *   и не успел подгрузить детали MR), MR не должен «исчезнуть из выборки» —
 *   он должен быть посчитан в `excludedMrsWithoutCommits`, чтобы при
 *   маленькой выборке тимлид понимал «у трёх MR из десяти не успел подгрузиться
 *   первый коммит, перезапустите sync».
 *
 * Доступ — LEAD команды / HEAD отдела / ADMIN (см. metrics.routes.ts).
 *   LEAD видит DORA своей команды (это часть «командных агрегатов» FR-04),
 *   HEAD — DORA любой команды своего отдела (для дашборда руководителя 7.4).
 */
export interface TeamLeadTimeReport {
  metricType: 'lead_time';
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  /** Список UID проектов, по которым шла выборка (прозрачность расчёта). */
  projectUids: string[];
  value: LeadTimeValue;
}

export const getTeamLeadTime = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamLeadTimeReport> => {
  if (periodEnd < periodStart) {
    throw new Error('periodEnd must be ≥ periodStart');
  }

  const { projectUids } = await assertTeamAccess(actorUid, teamUid);

  const calculator = new LeadTimeCalculator();

  if (projectUids.length === 0) {
    return {
      metricType: 'lead_time',
      teamUid,
      periodStart,
      periodEnd,
      projectUids,
      value: calculator.compute([], 0)
    };
  }

  const deploymentWindow = and(
    inArray(deployments.projectUid, projectUids),
    gte(deployments.deployedAt, periodStart),
    lte(deployments.deployedAt, periodEnd)
  );

  // (a) счётчик деплоев в окне — нужен для `deploymentsConsidered` в LeadTimeValue.
  // Делаем отдельный запрос, потому что LEFT JOIN ниже теряет deployments без
  // связанных MR (INNER JOIN на deployment_merge_requests отсекает их).
  // (b) выборка пар (deployment, MR) с минимальным временем коммита.
  //     LEFT JOIN на mr_commits/commits даёт NULL у MR без подгруженных коммитов;
  //     calculator считает их в excludedMrsWithoutCommits.
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

  // Postgres драйвер возвращает MIN(timestamp) как Date | null; sql<Date | null>
  // выше выравнивает тип. Передаём в калькулятор без преобразований.
  const samples: LeadTimeSample[] = pairs.map((r) => ({
    deployedAt: r.deployedAt,
    firstCommitAt: r.firstCommitAt ? new Date(r.firstCommitAt) : null
  }));

  return {
    metricType: 'lead_time',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    value: calculator.compute(samples, deploymentsConsidered)
  };
};

/**
 * Deployment Frequency — DORA-throughput (ВКР FR-04, доработка 2.4).
 *
 * Считает количество successful-деплоев команды в окне периода и
 * возвращает категорию (elite/high/medium/low) + timeline для графика.
 *
 * Алгоритм:
 *   1. assertTeamAccess(actor, team) — 403/404.
 *   2. Если у команды нет проектов — пустой результат (count=0, low).
 *   3. SELECT deployments по проектам команды с `isFailed=false` и
 *      `deployedAt ∈ [periodStart, periodEnd]`. В MVP `isFailed` всегда
 *      false (нет интеграции с мониторингом, см. CLAUDE.md «За пределами
 *      MVP»), но фильтр оставлен ради семантической корректности — DORA
 *      считает только успешные деплои.
 *   4. calculator.compute(deploys, periodStart, periodEnd, granularity).
 *
 * Окно — `[periodStart, periodEnd]` по `deployedAt` (как 2.3 Lead Time).
 *
 * Доступ — LEAD команды / HEAD отдела / ADMIN (см. metrics.routes.ts).
 * Парная визуализация с CFR (2.5): фронт запрашивает оба эндпоинта и
 * рендерит рядом (ВКР FR-06 «парная визуализация скорости и качества»).
 */
export interface TeamDeploymentFrequencyReport {
  metricType: 'deployment_frequency';
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  projectUids: string[];
  value: DeploymentFrequencyValue;
}

export const getTeamDeploymentFrequency = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date,
  granularity: DeploymentFrequencyGranularity = 'week'
): Promise<TeamDeploymentFrequencyReport> => {
  if (periodEnd < periodStart) {
    throw new Error('periodEnd must be ≥ periodStart');
  }

  const { projectUids } = await assertTeamAccess(actorUid, teamUid);

  const calculator = new DeploymentFrequencyCalculator();

  if (projectUids.length === 0) {
    return {
      metricType: 'deployment_frequency',
      teamUid,
      periodStart,
      periodEnd,
      projectUids,
      value: calculator.compute([], periodStart, periodEnd, granularity)
    };
  }

  // Минимальный срез — только `deployedAt`. Фильтр `isFailed=false` оставлен
  // как explicit-семантика DORA, даже если в MVP isFailed всегда false:
  // когда появится мониторинг, фильтр заработает «бесплатно».
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

  const input: DeploymentFrequencyInput[] = rows.map((r) => ({
    deployedAt: r.deployedAt
  }));

  return {
    metricType: 'deployment_frequency',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    value: calculator.compute(input, periodStart, periodEnd, granularity)
  };
};

/**
 * Change Failure Rate — DORA-instability (ВКР FR-04, доработка 2.5).
 *
 * Парная метрика к Deployment Frequency (ВКР FR-06: «парная визуализация
 * скорости и качества»). Здесь сервисы разделены — фронт делает два
 * запроса параллельно; общая `granularity` обеспечивает совпадение
 * временных шкал DF и CFR.
 *
 * Алгоритм:
 *   1. assertTeamAccess(actor, team) — 403/404.
 *   2. Если у команды нет проектов — пустой результат (totalDeploys=0,
 *      category=null).
 *   3. SELECT deployments по проектам команды (deployedAt в окне, isFailed=false).
 *      `isHotfix/isRevert` уже проставлены sync-пайплайном (см. 1.4
 *      `linkDeploymentsToMergeRequests`).
 *   4. calculator.compute(deploys, granularity) — числитель, знаменатель,
 *      процент, категория, breakdown, timeline.
 *
 * Окно — `[periodStart, periodEnd]` по `deployedAt` (как 2.3-2.4).
 *
 * Доступ — LEAD команды / HEAD отдела / ADMIN (как 2.3-2.4 DORA).
 *
 * Семантика `failedDeploys` см. 1.4 / `ChangeFailureRateValue` — MVP-упрощение
 * (помечается _fix_-deploy, а не _broken_-deploy). Численно эквивалентно.
 */
export interface TeamChangeFailureRateReport {
  metricType: 'change_failure_rate';
  periodStart: Date;
  periodEnd: Date;
  teamUid: string;
  projectUids: string[];
  value: ChangeFailureRateValue;
}

export const getTeamChangeFailureRate = async (
  actorUid: string,
  teamUid: string,
  periodStart: Date,
  periodEnd: Date,
  granularity: DeploymentFrequencyGranularity = 'week'
): Promise<TeamChangeFailureRateReport> => {
  if (periodEnd < periodStart) {
    throw new Error('periodEnd must be ≥ periodStart');
  }

  const { projectUids } = await assertTeamAccess(actorUid, teamUid);

  const calculator = new ChangeFailureRateCalculator();

  if (projectUids.length === 0) {
    return {
      metricType: 'change_failure_rate',
      teamUid,
      periodStart,
      periodEnd,
      projectUids,
      value: calculator.compute([], granularity)
    };
  }

  // WHERE синхронизирован с 2.4 (getTeamDeploymentFrequency): тот же фильтр
  // проектов + isFailed=false + окно. Гарантирует, что знаменатель CFR
  // совпадает с количеством деплоев в DF на том же периоде — иначе
  // парный график был бы рассинхронизирован.
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

  return {
    metricType: 'change_failure_rate',
    teamUid,
    periodStart,
    periodEnd,
    projectUids,
    value: calculator.compute(input, granularity)
  };
};

/**
 * Bus Factor по модулям кодовой базы за 90 дней (FR-10).
 * Доступ — LEAD команды и HEAD.
 */
export const getTeamBusFactor = async (_actorUid: string, _teamUid: string) => {
  notImplemented('metrics.getTeamBusFactor');
};

/**
 * Сигналы аномалий командного флоу (FR-13).
 * Возвращает только description (без раскрытия индивидуальных значений).
 * Доступ — только LEAD команды.
 */
export const getTeamAnomalies = async (_actorUid: string, _teamUid: string) => {
  notImplemented('metrics.getTeamAnomalies');
};

export const dismissAnomaly = async (
  _actorUid: string,
  _teamUid: string,
  _anomalyUid: string
) => {
  notImplemented('metrics.dismissAnomaly');
};
