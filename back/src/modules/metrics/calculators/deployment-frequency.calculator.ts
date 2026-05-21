import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { notImplemented } from '@/lib/not-implemented';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * Deployment Frequency (ВКР FR-04, DORA).
 * Формула: count(deployments в периоде) / длительность периода.
 * Категоризация: Elite / High / Medium / Low.
 */
export class DeploymentFrequencyCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'deployment_frequency';

  async calculate(_ctx: CalculationContext): Promise<unknown> {
    return notImplemented('DeploymentFrequencyCalculator.calculate');
  }
}
