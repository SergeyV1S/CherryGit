import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';
import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

/**
 * Единая матрица ролевого доступа CherryGit (ВКР раздел 2.2.7, доработка 3.1).
 *
 * Источник истины для:
 *   — `metrics.routes.ts` / `snapshot.routes.ts` — выбор `requireRole(...)`;
 *   — `snapshot.service.assertMetricAccessibleForRole` — per-metric фильтр;
 *   — `metrics/lib/team-access.ts:assertTeamAccess` — per-team scope.
 *
 * Главные принципы (CLAUDE.md «Принципы метрик»):
 *   1. **Метрики измеряют процесс, не людей**: руководитель НЕ видит
 *      индивидуальные данные участников.
 *   2. **Outcome важнее activity**: HEAD видит DORA-агрегаты (throughput
 *      + instability), но НЕ MR-level review-метрики (CT MR / MR Size),
 *      потому что review-метрики раскрывают паттерны конкретных команд.
 *   3. **DEVELOPER видит свои метрики + командный baseline**: команда —
 *      это его собственная команда (`team_members`), baseline — агрегат
 *      без раскрытия чужих индивидуальных значений.
 *
 * Архитектурная гарантия из ВКР: «возврат 403 при попытке доступа вне
 * зоны видимости». Это обеспечивается на ДВУХ уровнях:
 *   а) `requireRole` на маршруте — ранний отказ по глобальной роли;
 *   б) `assertTeamAccess` в сервисе — per-team membership check.
 *
 * Эти проверки НЕ заменяют друг друга — они комбинируются. Например,
 * `/cycle-time-mr` имеет `requireRole('LEAD','ADMIN')` (HEAD отсекается
 * глобально) + `assertTeamAccess` (LEAD должен быть лидом ИМЕННО ЭТОЙ
 * команды).
 */

// ===========================================================================
// Метрики team-scope: какие роли могут видеть какие metricType
// ===========================================================================

/**
 * Per-metric whitelist ролей для эндпоинтов уровня команды.
 *
 * Логика (из CLAUDE.md матрица):
 *   — Review-метрики (CT MR, MR Size) — ТОЛЬКО LEAD команды.
 *     HEAD не видит, потому что они раскрывают «как команда ревьюит»
 *     (паттерны давления тимлида на сотрудников). DEVELOPER видит
 *     командный baseline через тот же эндпоинт (assertTeamAccess
 *     пропускает member'ов).
 *   — DORA-метрики (Lead Time, DF, CFR) — LEAD + HEAD.
 *     Это throughput/instability команды — публичные показатели потока,
 *     не раскрывают индивидуалок.
 *   — Bus Factor — LEAD + HEAD.
 *     Показывает риск bus factor по модулям; для HEAD — индикатор
 *     устойчивости команды.
 *   — ADMIN — всё (для отладки/аудита).
 *   — DEVELOPER — через свою команду (assertTeamAccess пропускает member),
 *     получает командный baseline; индивидуальные значения других —
 *     скрываются на уровне сервиса (доработка 3.2).
 */
export const TEAM_METRIC_ACCESS: Record<MetricType, ReadonlyArray<RoleType>> = {
  // Review-метрики — LEAD only (плюс ADMIN везде).
  cycle_time_mr: ['LEAD', 'ADMIN'],
  mr_size: ['LEAD', 'ADMIN'],
  // DORA + Bus Factor — LEAD + HEAD.
  lead_time: ['LEAD', 'HEAD', 'ADMIN'],
  deployment_frequency: ['LEAD', 'HEAD', 'ADMIN'],
  change_failure_rate: ['LEAD', 'HEAD', 'ADMIN'],
  bus_factor: ['LEAD', 'HEAD', 'ADMIN']
};

/**
 * Проверка, разрешена ли глобальной роли запрашивать конкретный metricType.
 * Используется в snapshot-reader'е для per-metric фильтрации
 * (после прохождения `requireRole` на маршруте).
 *
 * DEVELOPER глобально НЕ запрашивает team-эндпоинты напрямую — он идёт
 * через `/api/me/*` (свои метрики + командный baseline). На team-эндпоинте
 * `assertTeamAccess` уже отдаст ему `accessMode='member'` для своей команды,
 * этого достаточно — per-metric фильтр здесь не нужен.
 */
export const canRoleAccessMetric = (role: RoleType, metricType: MetricType): boolean => {
  const allowed = TEAM_METRIC_ACCESS[metricType];
  if (!allowed) return false;
  return allowed.includes(role);
};

/**
 * Метрики, которые НЕЛЬЗЯ показывать HEAD (review-метрики команды).
 * Кеш для быстрого `Set.has` в hot-path snapshot-reader'а.
 */
export const HEAD_FORBIDDEN_METRICS: ReadonlySet<MetricType> = new Set(
  Object.entries(TEAM_METRIC_ACCESS)
    .filter(([, roles]) => !roles.includes('HEAD'))
    .map(([metric]) => metric as MetricType)
);
