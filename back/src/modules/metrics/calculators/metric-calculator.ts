import type { EntityType } from '@/db/drizzle/schema/metrics/types/entity-type.type';
import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

export interface Period {
  end: Date;
  start: Date;
}

export interface CalculationContext {
  entityId: string;
  entityType: EntityType;
  period: Period;
}

/**
 * Абстрактный калькулятор метрик (ВКР 3.5.1, шаблон «стратегия»).
 * Конкретные реализации читают доменные данные (commits, MRs, reviews, deployments)
 * и создают MetricSnapshot.
 */
export abstract class MetricCalculator {
  abstract readonly metricType: MetricType;

  abstract calculate(ctx: CalculationContext): Promise<unknown>;
}
