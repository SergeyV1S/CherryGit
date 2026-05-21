import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { notImplemented } from '@/lib/not-implemented';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * Change Failure Rate (ВКР FR-04, DORA).
 * Формула: count(deployments where isHotfix || isRevert) / count(всех деплоев) × 100%.
 */
export class ChangeFailureRateCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'change_failure_rate';

  async calculate(_ctx: CalculationContext): Promise<unknown> {
    return notImplemented('ChangeFailureRateCalculator.calculate');
  }
}
