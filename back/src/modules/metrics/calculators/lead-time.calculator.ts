import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { notImplemented } from '@/lib/not-implemented';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * Lead Time for Changes (ВКР FR-04, DORA).
 * Формула: для каждого MR в деплое — разница между первым коммитом MR и deployedAt.
 * Возвращает медиану и 90-й перцентиль.
 */
export class LeadTimeCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'lead_time';

  async calculate(_ctx: CalculationContext): Promise<unknown> {
    return notImplemented('LeadTimeCalculator.calculate');
  }
}
