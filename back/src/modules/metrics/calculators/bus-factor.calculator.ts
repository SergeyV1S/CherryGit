import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { notImplemented } from '@/lib/not-implemented';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * Bus Factor по модулям (ВКР FR-10).
 * Окно: последние 90 дней.
 * Для каждой записи code_modules матчатся коммиты по pathPattern,
 * считается count(distinct authorUid). Модули с 1 контрибьютором — риск.
 */
export class BusFactorCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'bus_factor';

  async calculate(_ctx: CalculationContext): Promise<unknown> {
    return notImplemented('BusFactorCalculator.calculate');
  }
}
