import type { LeadTimeValue } from '@/db/drizzle/schema/metrics/schema';
import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { median, p90 } from '@/lib/statistics';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * Lead Time for Changes (ВКР FR-04, DORA-throughput, доработка 2.3).
 *
 * Что считаем:
 *   На каждую пару (deployment, merge_request), связанную через
 *   `deployment_merge_requests`, берём время от первого коммита MR
 *   до выкатки релиза:
 *     leadTime = deployedAt − MIN(commits.committedAt for c in mr_commits)
 *
 * Алгоритм (ВКР раздел 3.5.1):
 *   1. На вход — массив samples {deploymentUid, deployedAt, mrUid,
 *      firstCommitAt}; сборка лежит на уровне MetricsService (один SQL
 *      с GROUP BY).
 *   2. Отбрасываем samples без `firstCommitAt` (MR без mr_commits — данные
 *      ещё не подгрузились; такие записи считаются в excludedMrsWithoutCommits).
 *   3. Отбрасываем «временные аномалии» — firstCommitAt > deployedAt
 *      (data corruption — теоретически невозможно при корректном sync,
 *      но защищаемся: иначе p90 уйдёт в отрицательные числа).
 *   4. Медиана и p90 в секундах (тот же R-7, что 2.1/2.2).
 *
 * Намеренные ограничения (для ВКР):
 *   — каноническая DORA-формула берёт «first commit of branch BEFORE deploy»,
 *     у нас — first commit of MR. Различие проявляется на «squash-and-merge»
 *     стратегиях (GitLab squash оставляет один commit, и его authored_date
 *     != committed_date); для MVP принято MR-level (доступно из текущей
 *     схемы без дополнительных запросов).
 *   — деплой без связанных MR (тег поставлен вручную) не вносит вклад
 *     в выборку и считается в `deploymentsConsidered − sampleSize`.
 */
export class LeadTimeCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'lead_time';

  /**
   * Чистая функция: массив пар (deployment, MR, firstCommitAt) → агрегат.
   *
   * `deploymentsConsidered` принимается отдельным аргументом, потому что
   * деплой без связанных MR не попадает в samples (LEFT JOIN отсёк), а
   * для прозрачности расчёта нам нужна полная цифра «сколько вообще
   * деплоев было в окне».
   */
  compute(samples: LeadTimeSample[], deploymentsConsidered: number): LeadTimeValue {
    let excludedMrsWithoutCommits = 0;
    const leadTimes: number[] = [];

    for (const s of samples) {
      if (!s.firstCommitAt) {
        excludedMrsWithoutCommits += 1;
        continue;
      }
      const diff = diffSeconds(s.deployedAt, s.firstCommitAt);
      // Защита от data corruption: коммит позже деплоя — невозможно
      // в корректной модели, отбрасываем (иначе p90 ушёл бы в минус).
      if (diff < 0) {
        excludedMrsWithoutCommits += 1;
        continue;
      }
      leadTimes.push(diff);
    }

    return {
      medianSeconds: median(leadTimes),
      p90Seconds: p90(leadTimes),
      sampleSize: leadTimes.length,
      deploymentsConsidered,
      excludedMrsWithoutCommits
    };
  }

  /**
   * Контракт стратегии — фактический вызов идёт через `compute()`, выборка
   * делается в MetricsService одним SQL'ом с GROUP BY (см. getTeamLeadTime).
   */
  async calculate(_ctx: CalculationContext): Promise<LeadTimeValue> {
    throw new Error(
      'LeadTimeCalculator: используйте compute(samples) — выборка делается на уровне сервиса'
    );
  }
}

/** Одна пара (deployment, MR) с уже найденным первым коммитом MR. */
export interface LeadTimeSample {
  deployedAt: Date;
  firstCommitAt: Date | null;
}

/** Разница в секундах (округление вниз). */
const diffSeconds = (later: Date, earlier: Date): number =>
  Math.floor((later.getTime() - earlier.getTime()) / 1000);
