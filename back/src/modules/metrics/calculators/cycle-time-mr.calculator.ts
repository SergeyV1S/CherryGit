import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { notImplemented } from '@/lib/not-implemented';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * Cycle Time MR с декомпозицией на 3 фазы (ВКР FR-09):
 *   timeToFirstReview      = firstReviewAt - gitlabCreatedAt
 *   timeInReview           = approvedAt    - firstReviewAt
 *   timeToMergeAfterApprove = mergedAt     - approvedAt
 */
export class CycleTimeMrCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'cycle_time_mr';

  async calculate(_ctx: CalculationContext): Promise<unknown> {
    return notImplemented('CycleTimeMrCalculator.calculate');
  }
}
