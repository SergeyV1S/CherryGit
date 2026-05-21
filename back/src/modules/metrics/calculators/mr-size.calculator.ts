import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { notImplemented } from '@/lib/not-implemented';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * MR Size (ВКР FR-15). Бакеты: ≤50, 51-200, 201-400, 401-800, >800
 * по сумме (linesAdded + linesRemoved).
 */
export class MrSizeCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'mr_size';

  async calculate(_ctx: CalculationContext): Promise<unknown> {
    return notImplemented('MrSizeCalculator.calculate');
  }
}
