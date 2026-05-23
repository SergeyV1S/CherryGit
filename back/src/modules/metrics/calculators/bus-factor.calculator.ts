import type { BusFactorColor, BusFactorValue } from '@/db/drizzle/schema/metrics/schema';
import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';

import type { ModuleSpec } from '../lib/module-resolver';
import type { CalculationContext } from './metric-calculator';

import { resolveModule } from '../lib/module-resolver';
import { MetricCalculator } from './metric-calculator';

/**
 * Bus Factor по модулям (ВКР FR-10, доработка 2.6).
 *
 * Формула:
 *   BF(module) = count(distinct author с merged MR'ом, затронувшим module,
 *                       за последние windowDays)
 *
 * Входная единица — пара (MR, filePath). Один MR с N файлами разворачивается
 * в N записей; модуль резолвится по filePath (см. `module-resolver.ts`).
 * Если MR пуст по `filePaths` (засинхрен до доработки 2.6) — отдельно
 * считается в `excludedMrsWithoutPaths`, чтобы UI мог показать диагностику.
 *
 * Автор идентифицируется ключом:
 *   `uid:<userUid>`               если MR.authorUid резолвится через
 *                                 user_gitlab_identities;
 *   `gitlab:<authorGitlabUsername>` если identity ещё не создана (резолв
 *                                 не сработал — см. ДОРАБОТКИ 4.4).
 * Это значит, что даже без зарезолвленных identity Bus Factor выдаёт
 * УНИКАЛЬНЫХ авторов (по GitLab-username), а не «всё в одну корзину».
 *
 * Цветовая маркировка (CherryGit концепция):
 *   red    — 1 автор;
 *   yellow — 2 автора;
 *   green  — ≥3.
 *
 * `overallBusFactor` = `min(BF(module))` среди модулей с активностью.
 * Если активности нет совсем (sampleSize=0 либо все MR без filePaths) — `null`.
 */
export class BusFactorCalculator extends MetricCalculator {
  readonly metricType: MetricType = 'bus_factor';

  /** Окно по умолчанию — 90 дней (CLAUDE.md «последние 90 дней»). */
  static readonly DEFAULT_WINDOW_DAYS = 90;

  /**
   * Чистая функция.
   *
   * @param mrs       — массив merged MR'ов в окне (с `filePaths` и authorKey);
   * @param modules   — список explicit-модулей проекта/команды (по всем
   *                    проектам команды объединяется на уровне сервиса).
   * @param windowDays — длина окна (для прозрачности расчёта; на формулу
   *                    не влияет — выборка уже отфильтрована сервисом).
   */
  compute(
    mrs: BusFactorMrInput[],
    modules: ReadonlyArray<ModuleSpec>,
    windowDays: number = BusFactorCalculator.DEFAULT_WINDOW_DAYS
  ): BusFactorValue {
    let excludedMrsWithoutPaths = 0;

    // module-name → Set<authorKey>. Set гарантирует distinct авторов.
    const moduleAuthors = new Map<string, Set<string>>();
    // module-name → first pathPattern, который сматчился (для UI).
    const modulePattern = new Map<string, string | null>();
    const moduleImplicit = new Map<string, boolean>();

    for (const mr of mrs) {
      if (mr.filePaths.length === 0) {
        excludedMrsWithoutPaths += 1;
        continue;
      }
      // Один MR — один автор; внутри MR не дублируем в Set (Set сам справится).
      for (const path of mr.filePaths) {
        const resolved = resolveModule(path, modules);
        const authors = moduleAuthors.get(resolved.name) ?? new Set<string>();
        authors.add(mr.authorKey);
        moduleAuthors.set(resolved.name, authors);
        // pathPattern/isImplicit определяется первым попавшим файлом —
        // explicit-модуль не «теряет» pattern из-за того, что второй файл
        // в другом explicit-модуле fallback'нулся.
        if (!modulePattern.has(resolved.name)) {
          modulePattern.set(resolved.name, resolved.pathPattern);
          moduleImplicit.set(resolved.name, resolved.isImplicit);
        }
      }
    }

    const moduleEntries = [...moduleAuthors.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, authorsSet]) => {
        const authors = [...authorsSet].sort();
        const activeContributors = authors.length;
        return {
          name,
          pathPattern: modulePattern.get(name) ?? null,
          isImplicit: moduleImplicit.get(name) ?? true,
          activeContributors,
          authors,
          color: BusFactorCalculator.colorFor(activeContributors)
        };
      });

    const overallBusFactor =
      moduleEntries.length > 0 ? Math.min(...moduleEntries.map((m) => m.activeContributors)) : null;

    return {
      overallBusFactor,
      windowDays,
      sampleSize: mrs.length,
      excludedMrsWithoutPaths,
      modules: moduleEntries
    };
  }

  /**
   * Цветовая маркировка из концепции CherryGit.
   *   1 → red       (один человек — bus factor 1 = риск)
   *   2 → yellow    (минимальная резервная пара)
   *   ≥3 → green
   */
  static colorFor(activeContributors: number): BusFactorColor {
    if (activeContributors <= 1) return 'red';
    if (activeContributors === 2) return 'yellow';
    return 'green';
  }

  /**
   * Контракт стратегии — выборка идёт через MetricsService (SELECT MR в окне).
   */
  async calculate(_ctx: CalculationContext): Promise<BusFactorValue> {
    throw new Error(
      'BusFactorCalculator: используйте compute() — выборка делается на уровне сервиса'
    );
  }
}

/**
 * Минимальный срез merge_requests для Bus Factor.
 * `authorKey` собирается на уровне сервиса как
 *   uid:<userUid>  | gitlab:<authorGitlabUsername>
 * чтобы calculator не зависел от схемы users_gitlab_identities.
 */
export interface BusFactorMrInput {
  authorKey: string;
  filePaths: string[];
}
