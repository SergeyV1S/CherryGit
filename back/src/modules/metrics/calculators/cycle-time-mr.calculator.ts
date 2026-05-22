import type { CycleTimeMrValue } from '@/db/drizzle/schema/metrics/schema';
import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { median, p90 } from '@/lib/statistics';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * Cycle Time MR с декомпозицией на 3 фазы (ВКР FR-09, доработка 2.1).
 *
 *   timeToFirstReview       = firstReviewAt - gitlabCreatedAt   // открыт → первое ревью
 *   timeInReview            = approvedAt    - firstReviewAt     // первое ревью → апрув
 *   timeToMergeAfterApproval = mergedAt     - approvedAt        // апрув → мерж
 *
 *   totalCycle              = mergedAt - gitlabCreatedAt        // открыт → мерж
 *
 * Алгоритм (ВКР раздел 3.5.1):
 *   1. На вход — массив merged MRs за период.
 *   2. Отбрасываем draft/WIP по префиксу заголовка (GitLab автоматически
 *      добавляет «Draft: » для черновиков; «WIP:» — устаревший суффикс,
 *      встречается в legacy-репозиториях).
 *   3. Для каждой фазы строим выборку из non-null значений (MR без апрува
 *      даёт null в timeInReview — мы НЕ заменяем это на 0; см. ДОРАБОТКИ 2.1).
 *   4. Считаем медиану и p90 на каждой фазе и на total.
 *
 * Намеренно: total Cycle Time MR — это время жизни MR, НЕ Lead Time for
 * Changes (last-commit → deploy). Lead Time реализуется отдельно в 2.3.
 */
export class CycleTimeMrCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'cycle_time_mr';

  /**
   * Поля MR, нужные для расчёта (минимальный срез таблицы merge_requests).
   * Метод принимает не CalculationContext, а уже выгруженные MR — это
   * упрощает тестирование (calculator чистая функция) и снимает с него
   * зависимость от Drizzle.
   */
  compute(merged: CycleTimeMrInput[]): CycleTimeMrValue {
    let excludedDrafts = 0;
    const totals: number[] = [];
    const t2fr: number[] = []; // time to first review
    const tInRev: number[] = []; // time in review
    const t2merge: number[] = []; // time to merge after approval

    for (const mr of merged) {
      if (CycleTimeMrCalculator.isDraft(mr.title)) {
        excludedDrafts += 1;
        continue;
      }
      // merged MR без mergedAt — это аномалия sync'а; пропускаем без подсчёта.
      if (!mr.mergedAt || !mr.gitlabCreatedAt) continue;

      totals.push(diffSeconds(mr.mergedAt, mr.gitlabCreatedAt));

      if (mr.firstReviewAt) {
        t2fr.push(diffSeconds(mr.firstReviewAt, mr.gitlabCreatedAt));
        if (mr.approvedAt) {
          tInRev.push(diffSeconds(mr.approvedAt, mr.firstReviewAt));
        }
      }
      if (mr.approvedAt) {
        t2merge.push(diffSeconds(mr.mergedAt, mr.approvedAt));
      }
    }

    return {
      medianTotalSeconds: median(totals),
      p90TotalSeconds: p90(totals),
      phases: {
        timeToFirstReviewMedianSeconds: median(t2fr),
        timeToFirstReviewP90Seconds: p90(t2fr),
        timeInReviewMedianSeconds: median(tInRev),
        timeInReviewP90Seconds: p90(tInRev),
        timeToMergeAfterApprovalMedianSeconds: median(t2merge),
        timeToMergeAfterApprovalP90Seconds: p90(t2merge)
      },
      sampleSize: totals.length,
      excludedDrafts,
      sampleSizePerPhase: {
        timeToFirstReview: t2fr.length,
        timeInReview: tInRev.length,
        timeToMergeAfterApproval: t2merge.length
      }
    };
  }

  /**
   * Метод-наследник из абстрактного класса. В текущей версии калькулятор
   * НЕ обращается к БД сам — это делает MetricsService (для контроля
   * ролевой выборки и кеша). Здесь оставляем заглушку, чтобы соблюсти
   * контракт стратегии, но фактический вызов идёт через `compute()`.
   */
  async calculate(_ctx: CalculationContext): Promise<CycleTimeMrValue> {
    throw new Error(
      'CycleTimeMrCalculator: используйте compute(merged) — выборка MR делается на уровне сервиса'
    );
  }

  /**
   * Определение draft/WIP-MR по заголовку.
   * GitLab автоматически добавляет «Draft: » префикс при включении черновика;
   * «WIP:» — legacy-конвенция (до GitLab 12.10).
   * Сравнение case-insensitive, допускается опциональный пробел/двоеточие/дефис.
   */
  static isDraft(title: string): boolean {
    return /^\s*(draft|wip)\b\s*[:\-]/i.test(title);
  }
}

/** Минимальный срез строки `merge_requests`, нужный калькулятору. */
export interface CycleTimeMrInput {
  title: string;
  gitlabCreatedAt: Date | null;
  firstReviewAt: Date | null;
  approvedAt: Date | null;
  mergedAt: Date | null;
}

/** Разница в секундах. Возвращает целое число (округление вниз). */
const diffSeconds = (later: Date, earlier: Date): number =>
  Math.floor((later.getTime() - earlier.getTime()) / 1000);
