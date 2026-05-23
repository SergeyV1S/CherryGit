import type { MrSizeValue } from '@/db/drizzle/schema/metrics/schema';
import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import { median, p90 } from '@/lib/statistics';

import type { CalculationContext } from './metric-calculator';

import { CycleTimeMrCalculator } from './cycle-time-mr.calculator';
import { MetricCalculator } from './metric-calculator';

/**
 * MR Size — распределение MR по размеру (ВКР FR-15, доработка 2.2).
 *
 * Что считаем:
 *   size(mr) = linesAdded + linesRemoved
 * Категоризация — пять бакетов из концепции CherryGit:
 *   ≤50, 51-200, 201-400, 401-800, >800
 *
 * Алгоритм:
 *   1. На вход — массив MR за период (срез таблицы merge_requests).
 *   2. Отбрасываем draft/WIP — переиспользуем `CycleTimeMrCalculator.isDraft`,
 *      чтобы выборка совпадала с Cycle Time MR (один и тот же набор MR в
 *      двух парных метриках — снимок «scope vs. time», ВКР FR-06).
 *   3. На оставшихся:
 *      a) считаем медиану и p90 размера (общий agg);
 *      b) распределяем по бакетам — счётчик и доля от выборки.
 *
 * Возвращает чистое значение `MrSizeValue` — без обращения к БД, ради
 * тестируемости (как и `CycleTimeMrCalculator.compute`).
 *
 * Намеренные ограничения (для ВКР):
 *   — границы бакетов жёсткие, не конфигурируются (хардкод из концепции);
 *     если потребуется кастомизация — будущий extension через project-level
 *     настройку, за пределами MVP;
 *   — бинарные файлы и rename-only changes считаются как 0 строк
 *     (см. `GitlabClient.computeMrSize`); это общепринятая аппроксимация.
 */
export class MrSizeCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'mr_size';

  /**
   * Жёсткие границы бакетов из концепции CherryGit.
   * Каждая запись = { label, upper } — MR попадает в бакет, если
   * `size <= upper`. Последний бакет «>800» — синтетический (upper=Infinity).
   *
   * Порядок важен: бакеты идут от меньшего к большему, чтобы рендерить
   * столбчатую диаграмму слева-направо как «маленькие → крупные».
   */
  static readonly BUCKETS: ReadonlyArray<{ label: string; upper: number }> = [
    { label: '≤50', upper: 50 },
    { label: '51-200', upper: 200 },
    { label: '201-400', upper: 400 },
    { label: '401-800', upper: 800 },
    { label: '>800', upper: Number.POSITIVE_INFINITY }
  ];

  /**
   * Чистая функция: массив MR → агрегат.
   * Контракт намеренно совпадает с `CycleTimeMrCalculator.compute` —
   * один и тот же срез MR можно прогонять через оба калькулятора (для
   * парной визуализации скорости и качества по выборке).
   */
  compute(merged: MrSizeInput[]): MrSizeValue {
    let excludedDrafts = 0;
    const sizes: number[] = [];
    // Один счётчик на бакет; индексация по позиции в BUCKETS — заведомо корректна.
    const counts: number[] = MrSizeCalculator.BUCKETS.map(() => 0);

    for (const mr of merged) {
      if (CycleTimeMrCalculator.isDraft(mr.title)) {
        excludedDrafts += 1;
        continue;
      }

      // На случай повреждённого sync'а: nullable defensively → 0; не отбрасываем
      // MR целиком, иначе занизим знаменатель (бакет «≤50» поймает пустые diff'ы).
      const linesAdded = Number.isFinite(mr.linesAdded) ? mr.linesAdded : 0;
      const linesRemoved = Number.isFinite(mr.linesRemoved) ? mr.linesRemoved : 0;
      const size = linesAdded + linesRemoved;

      sizes.push(size);

      // Линейный поиск бакета — BUCKETS.length=5, оптимизировать нет смысла.
      const bucketIdx = MrSizeCalculator.BUCKETS.findIndex((b) => size <= b.upper);
      // bucketIdx === -1 невозможен (последний bucket — Infinity), но страхуемся.
      counts[bucketIdx >= 0 ? bucketIdx : counts.length - 1] += 1;
    }

    const sampleSize = sizes.length;
    const buckets = MrSizeCalculator.BUCKETS.map((b, i) => ({
      label: b.label,
      count: counts[i],
      // Округление до 2 знаков, чтобы сумма процентов была близка к 100 и легко
      // читалась в UI. При sampleSize=0 — 0 (а не NaN).
      percent: sampleSize > 0 ? Math.round((counts[i] / sampleSize) * 10000) / 100 : 0
    }));

    return {
      buckets,
      medianLinesChanged: median(sizes),
      p90LinesChanged: p90(sizes),
      sampleSize,
      excludedDrafts
    };
  }

  /**
   * Заглушка контракта стратегии — фактический вызов идёт через `compute()`,
   * выборка делается на уровне MetricsService (контроль ролей + переиспользование
   * среза MR между Cycle Time и MR Size в парной визуализации).
   */
  async calculate(_ctx: CalculationContext): Promise<MrSizeValue> {
    throw new Error(
      'MrSizeCalculator: используйте compute(merged) — выборка MR делается на уровне сервиса'
    );
  }
}

/** Минимальный срез строки `merge_requests`, нужный калькулятору. */
export interface MrSizeInput {
  linesAdded: number;
  linesRemoved: number;
  title: string;
}
