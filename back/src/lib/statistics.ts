/**
 * Утилиты статистики для расчёта метрик (ВКР раздел 3.5.1).
 *
 * Решения:
 *  — все функции принимают массив чисел и НЕ мутируют его (внутри клонируется);
 *  — для пустого массива возвращается `null`, чтобы вызывающий код мог отличить
 *    «выборка пустая» от «выборка содержит ноль» (важно для MR-метрик: MR без
 *    апрува даст null в фазе timeInReview, и медиана этой фазы тоже должна
 *    остаться null, см. ДОРАБОТКИ.md 2.1);
 *  — квантиль считается методом линейной интерполяции (R-7 / Excel `PERCENTILE`),
 *    устойчивым к маленьким выборкам и совпадающим с расчётом GitLab Insights.
 */

/**
 * Сортированная копия массива (без побочного эффекта).
 * Если в массиве есть `null`/`undefined` — они отфильтровываются.
 */
const sortedFinite = (values: ReadonlyArray<number | null | undefined>): number[] => {
  const filtered: number[] = [];
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) filtered.push(v);
  }
  return filtered.sort((a, b) => a - b);
};

/**
 * Медиана выборки.
 * Для чётного N — среднее двух центральных элементов.
 * @returns `null` для пустой выборки.
 */
export const median = (values: ReadonlyArray<number | null | undefined>): number | null => {
  const xs = sortedFinite(values);
  if (xs.length === 0) return null;
  const mid = xs.length / 2;
  if (Number.isInteger(mid)) {
    return (xs[mid - 1] + xs[mid]) / 2;
  }
  return xs[Math.floor(mid)];
};

/**
 * Квантиль уровня p ∈ [0, 1] методом R-7 (Excel/NumPy `linear`).
 * Идея: позиция h = (N-1) * p; результат — линейная интерполяция между
 * xs[floor(h)] и xs[ceil(h)].
 *
 * @returns `null` для пустой выборки.
 */
export const quantile = (
  values: ReadonlyArray<number | null | undefined>,
  p: number
): number | null => {
  if (p < 0 || p > 1) throw new RangeError(`quantile p must be in [0,1], got ${p}`);
  const xs = sortedFinite(values);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0];

  const h = (xs.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return xs[lo];
  const frac = h - lo;
  return xs[lo] + (xs[hi] - xs[lo]) * frac;
};

/** Удобный шорткат для 90-го перцентиля — самый частый case в DORA/SPACE. */
export const p90 = (values: ReadonlyArray<number | null | undefined>): number | null =>
  quantile(values, 0.9);
