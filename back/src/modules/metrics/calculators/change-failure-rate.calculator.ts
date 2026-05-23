import type {
  ChangeFailureRateCategory,
  ChangeFailureRateValue,
  DeploymentFrequencyGranularity
} from '@/db/drizzle/schema/metrics/schema';
import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import type { CalculationContext } from './metric-calculator';

import { DeploymentFrequencyCalculator } from './deployment-frequency.calculator';
import { MetricCalculator } from './metric-calculator';

/**
 * Change Failure Rate — DORA-instability (ВКР FR-04, доработка 2.5).
 *
 * Формула (CherryGit MVP):
 *   CFR = count(deployments c isHotfix OR isRevert) / count(all deployments) × 100%
 *
 * Парная метрика к Deployment Frequency (ВКР FR-06). Эндпоинты разделены,
 * но `granularity` синхронизируется — фронт рендерит DF и CFR на одной
 * временной шкале (общий X-axis). Ключи бакетов формируются тем же
 * `DeploymentFrequencyCalculator.bucketKey` — гарантирует совпадение.
 *
 * Категоризация (DORA Accelerate 2023, упрощённые пороги):
 *   elite   ≤ 15%
 *   high    ≤ 30%
 *   medium  ≤ 45%
 *   low     > 45%
 *   null    при totalDeploys=0
 *
 * Алгоритм:
 *   1. На вход — массив `deploys: ChangeFailureRateInput[]` (deployedAt
 *      + isHotfix + isRevert) и окно периода. Фильтр `isFailed=false`
 *      ВНЕ калькулятора (на уровне SQL — экономит RAM на больших окнах).
 *   2. failedDeploys = count(d : d.isHotfix || d.isRevert) — дедупликация
 *      деплоя, у которого ОБЕ метки одновременно.
 *   3. breakdown: отдельные счётчики hotfix/revert (могут пересекаться).
 *   4. timeline: то же бакетирование, что и в DF, но в каждом бакете —
 *      и total, и failed, и ratePercent.
 *
 * Намеренное упрощение MVP (см. ДОРАБОТКИ 1.4): помечается _fix_-deploy,
 * а не _broken_-deploy. Численно эквивалентно, семантически отличается;
 * для канонической DORA нужна интеграция с системой инцидент-менеджмента.
 */
export class ChangeFailureRateCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'change_failure_rate';

  /**
   * Пороги категоризации в процентах (0..100).
   * Вынесены в static — единое место правки и удобство unit-тестов.
   */
  static readonly THRESHOLDS = {
    elite: 15,
    high: 30,
    medium: 45
  } as const;

  compute(
    deploys: ChangeFailureRateInput[],
    granularity: DeploymentFrequencyGranularity = 'week'
  ): ChangeFailureRateValue {
    const totalDeploys = deploys.length;

    let failedDeploys = 0;
    let hotfixDeploys = 0;
    let revertDeploys = 0;

    // Бакеты — Map<bucketKey, {total, failed}>.
    // Используем тот же bucketKey, что и DF, ради синхронизации временных
    // шкал на парной визуализации (фронт сводит DF и CFR по одному ключу).
    const buckets = new Map<string, { total: number; failed: number }>();

    for (const d of deploys) {
      const isFailed = d.isHotfix || d.isRevert;
      if (d.isHotfix) hotfixDeploys += 1;
      if (d.isRevert) revertDeploys += 1;
      // Дедупликация в `failedDeploys`: один deploy с обеими метками
      // считается ОДИН раз (иначе ratePercent мог бы превысить 100%).
      if (isFailed) failedDeploys += 1;

      const key = DeploymentFrequencyCalculator.bucketKey(d.deployedAt, granularity);
      const bucket = buckets.get(key) ?? { total: 0, failed: 0 };
      bucket.total += 1;
      if (isFailed) bucket.failed += 1;
      buckets.set(key, bucket);
    }

    const ratePercent =
      totalDeploys > 0
        ? ChangeFailureRateCalculator.roundPercent((failedDeploys / totalDeploys) * 100)
        : 0;

    const category = totalDeploys > 0 ? ChangeFailureRateCalculator.categorize(ratePercent) : null;

    const timeline = buckets
      .entries()
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({
        bucket,
        totalDeploys: v.total,
        failedDeploys: v.failed,
        ratePercent:
          v.total > 0 ? ChangeFailureRateCalculator.roundPercent((v.failed / v.total) * 100) : 0
      }));

    return {
      totalDeploys,
      failedDeploys,
      ratePercent,
      category,
      breakdown: {
        hotfixDeploys,
        revertDeploys
      },
      granularity,
      timeline
    };
  }

  /**
   * Контракт стратегии — выборка делается на уровне сервиса.
   */
  async calculate(_ctx: CalculationContext): Promise<ChangeFailureRateValue> {
    throw new Error(
      'ChangeFailureRateCalculator: используйте compute() — выборка делается на уровне сервиса'
    );
  }

  /**
   * Из ratePercent → дискретная DORA-категория.
   * Граничные значения интерпретируются `≤` — «ровно 15%» это `elite`.
   */
  static categorize(ratePercent: number): ChangeFailureRateCategory {
    if (ratePercent <= ChangeFailureRateCalculator.THRESHOLDS.elite) return 'elite';
    if (ratePercent <= ChangeFailureRateCalculator.THRESHOLDS.high) return 'high';
    if (ratePercent <= ChangeFailureRateCalculator.THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /** Округление до 2 знаков (как в MR Size percent — единый стиль). */
  static roundPercent(p: number): number {
    return Math.round(p * 100) / 100;
  }
}

/** Минимальный срез строки `deployments`, нужный калькулятору. */
export interface ChangeFailureRateInput {
  deployedAt: Date;
  isHotfix: boolean;
  isRevert: boolean;
}
