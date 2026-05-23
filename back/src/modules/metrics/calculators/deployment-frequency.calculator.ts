import type {
  DeploymentFrequencyCategory,
  DeploymentFrequencyGranularity,
  DeploymentFrequencyValue
} from '@/db/drizzle/schema/metrics/schema';
import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import type { CalculationContext } from './metric-calculator';

import { MetricCalculator } from './metric-calculator';

/**
 * Deployment Frequency — DORA-throughput (ВКР FR-04, доработка 2.4).
 *
 * Формула:
 *   perDay = count(successful_deploys в окне) / max(1, periodDays)
 *
 * Категоризация (CherryGit концепция, согласовано с DORA Accelerate):
 *   elite   — perDay > 1            (несколько в день)
 *   high    — perDay ∈ [1/7, 1]     (день — неделя)
 *   medium  — perDay ∈ [1/30, 1/7)  (неделя — месяц)
 *   low     — perDay < 1/30         (реже месяца; включая 0 deploys)
 *
 * Парная визуализация (ВКР FR-06):
 *   DF без CFR — половина картины. На дашборде HEAD они рендерятся рядом
 *   (метрика скорости + метрика качества). В этом сервисе они разделены
 *   на два эндпоинта (отдельные queries клиенту), чтобы кешировать
 *   независимо; парность реализует фронт.
 *
 * Алгоритм:
 *   1. На вход — массив `deploys` (только `deployedAt`) и окно периода.
 *      Фильтр `isFailed=false` ВНЕ калькулятора (на уровне сервиса
 *      делается WHERE в SQL — экономит RAM).
 *   2. perDay, category.
 *   3. timeline: группировка по бакетам (`day`/`week`/`month`); пустые
 *      бакеты НЕ дополняются — это решает UI.
 *
 * Окно — `[periodStart, periodEnd]` по `deployedAt` (стабильность
 * исторических замеров, как в 2.1-2.3).
 */
export class DeploymentFrequencyCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'deployment_frequency';

  /**
   * Пороги категоризации, выраженные как deploys/day.
   * Изменение порогов — параметр доменной модели; вынесены в static
   * для удобства unit-тестов и единого места правки.
   */
  static readonly THRESHOLDS = {
    elite: 1, // > 1 deploy/day
    high: 1 / 7, // ≥ 1/неделя
    medium: 1 / 30 // ≥ 1/месяц
  } as const;

  /** Миллисекунд в сутках — экспортируется ради тестов. */
  static readonly MS_PER_DAY = 24 * 60 * 60 * 1000;

  compute(
    deploys: DeploymentFrequencyInput[],
    periodStart: Date,
    periodEnd: Date,
    granularity: DeploymentFrequencyGranularity = 'week'
  ): DeploymentFrequencyValue {
    if (periodEnd < periodStart) {
      // Защита на случай прямого вызова compute() из теста; контроллер
      // и сервис эту валидацию уже делают.
      throw new RangeError('periodEnd must be ≥ periodStart');
    }

    const periodMs = periodEnd.getTime() - periodStart.getTime();
    // ≥1, иначе при periodStart=periodEnd (zero-length окно) делили бы на 0.
    // 1 день — минимальный разумный период для DF.
    const periodDays = Math.max(1, periodMs / DeploymentFrequencyCalculator.MS_PER_DAY);

    const count = deploys.length;
    const perDay = count / periodDays;
    const category = DeploymentFrequencyCalculator.categorize(perDay);

    // Группировка по бакетам.
    const bucketCounts = new Map<string, number>();
    for (const d of deploys) {
      const key = DeploymentFrequencyCalculator.bucketKey(d.deployedAt, granularity);
      bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
    }

    // Сортировка по строковому ключу работает корректно, потому что все
    // форматы (`YYYY-MM-DD`, `YYYY-MM`) лексикографически совпадают с
    // хронологическим порядком.
    const timeline = bucketCounts
      .entries()
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([bucket, c]) => ({ bucket, count: c }));

    return {
      category,
      count,
      perDay,
      periodDays,
      granularity,
      timeline
    };
  }

  /**
   * Контракт стратегии — выборка делается на уровне сервиса (WHERE по
   * проектам команды и окну периода). Здесь оставляем заглушку.
   */
  async calculate(_ctx: CalculationContext): Promise<DeploymentFrequencyValue> {
    throw new Error(
      'DeploymentFrequencyCalculator: используйте compute() — выборка делается на уровне сервиса'
    );
  }

  /**
   * Из частоты `perDay` → дискретная DORA-категория.
   * Граничные значения интерпретируются включительно «слева» (≥), это
   * совпадает с обычной интерпретацией «один деплой В НЕДЕЛЮ ровно — это
   * High», а не «Medium».
   */
  static categorize(perDay: number): DeploymentFrequencyCategory {
    if (perDay > DeploymentFrequencyCalculator.THRESHOLDS.elite) return 'elite';
    if (perDay >= DeploymentFrequencyCalculator.THRESHOLDS.high) return 'high';
    if (perDay >= DeploymentFrequencyCalculator.THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Ключ бакета для агрегации `timeline`.
   *
   * Договорённости:
   *   — day   → `YYYY-MM-DD`        (UTC);
   *   — month → `YYYY-MM`           (UTC);
   *   — week  → `YYYY-MM-DD` понедельника недели (UTC).
   *
   * Почему UTC: время деплоя `deployedAt` приходит из GitLab как ISO-строка
   * с таймзоной; БД хранит как `timestamp` без TZ (UTC). Использование UTC
   * для бакетов даёт детерминированный результат и не зависит от TZ сервера.
   * Локализация (отображение «Понедельник, 12 мая») — задача фронта.
   */
  static bucketKey(date: Date, granularity: DeploymentFrequencyGranularity): string {
    if (granularity === 'day') {
      return date.toISOString().slice(0, 10);
    }
    if (granularity === 'month') {
      return date.toISOString().slice(0, 7);
    }
    // week → понедельник недели (UTC).
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // getUTCDay: 0=воскресенье, 1=понедельник, ..., 6=суббота. Сдвиг до пн.
    const day = monday.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    monday.setUTCDate(monday.getUTCDate() + diffToMonday);
    return monday.toISOString().slice(0, 10);
  }
}

/** Минимальный срез строки `deployments`, нужный калькулятору. */
export interface DeploymentFrequencyInput {
  deployedAt: Date;
}
