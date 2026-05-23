import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import type {
  MetricValue
} from '@/db/drizzle/schema/metrics/schema';
import type { EntityType } from '@/db/drizzle/schema/metrics/types/entity-type.type';
import type { MetricType } from '@/db/drizzle/schema/metrics/types/metric-type.type';
import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { db } from '@/db/drizzle/connect';
import { metricsSnapshots } from '@/db/drizzle/schema/metrics/schema';
import { teamMembers, teamProjects, teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { logger } from '@/lib/loger';
import { HEAD_FORBIDDEN_METRICS } from '@/middleware/role-matrix';
import { BusFactorCalculator } from '@/modules/metrics/calculators/bus-factor.calculator';
import {
  computeBusFactor,
  computeChangeFailureRate,
  computeCycleTimeMr,
  computeDeploymentFrequency,
  computeLeadTime,
  computeMrSize
} from '@/modules/metrics/lib/compute-team';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Snapshot writer & reader (доработка 2.7).
 *
 * Назначение:
 *   — Writer: пересчитывает все MVP-метрики команды и записывает их в
 *     `metrics_snapshots` для исторических графиков и быстрого чтения.
 *   — Reader: отдаёт `getLatestSnapshot` и `getSnapshotHistory` для UI.
 *
 * Парадигма «канонические окна»:
 *   Snapshot — это «снимок метрик на конец суток UTC». В одном дне может
 *   быть много sync-ticks, но все они пишут в ОДНУ строку
 *   (`ON CONFLICT (metricType, entityType, entityId, periodStart, periodEnd) DO UPDATE`),
 *   с обновлением `value` и `calculatedAt`. Это даёт:
 *     — 1 snapshot per day per (метрика, команда) → компактное хранение;
 *     — детерминированный ключ для upsert;
 *     — естественные исторические точки для графика.
 *
 * Окна расчёта:
 *   — `rolling_30d` (для CT MR, MR Size, Lead Time, DF, CFR) —
 *     30 календарных дней до начала сегодняшних суток UTC;
 *   — `rolling_90d` (для Bus Factor) — концептуальное окно из CLAUDE.md.
 *
 * Триггер записи:
 *   — после успешного `syncProject` для команд, связанных с проектом;
 *   — отдельно вызывается через `recalculateMetrics` (POST /admin/...).
 *
 * Ошибки писателя не критичны для бизнес-операции (sync): пишутся в audit
 * `metrics.snapshot.failed`, sync-operation продолжается.
 */

// ===========================================================================
// Константы и хелперы окон
// ===========================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Начало текущих UTC-суток. Округление снепшота к началу дня — главное
 * design-решение 2.7: оно даёт ровно одну запись `metrics_snapshots` на
 * (метрика, команда, день), независимо от того, сколько раз внутри дня
 * сработал sync-tick.
 */
const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const daysAgo = (anchor: Date, days: number): Date =>
  new Date(anchor.getTime() - days * MS_PER_DAY);

// ===========================================================================
// Ролевая фильтрация метрик
// ===========================================================================

/**
 * Per-metric whitelist реализован в `middleware/role-matrix.ts`
 * (доработка 3.1 — единое место правды). Здесь — только enforcement
 * на уровне snapshot-reader'а.
 *
 * Правила (синхронно с `TEAM_METRIC_ACCESS`):
 *   ADMIN/LEAD — все 6 метрик;
 *   HEAD       — все кроме MR-level (cycle_time_mr, mr_size);
 *   DEVELOPER  — не запрашивает напрямую (ходит через `/api/me/*`).
 *
 * Эта проверка применяется ПОСЛЕ `assertTeamAccess` — даже если actor
 * прошёл per-team scope, MR-level метрики не должны утечь к HEAD.
 */
export const assertMetricAccessibleForRole = (role: RoleType, metricType: MetricType): void => {
  if (role === 'ADMIN' || role === 'LEAD') return;
  if (role === 'HEAD' && HEAD_FORBIDDEN_METRICS.has(metricType)) {
    throw new CustomError(
      HttpStatus.FORBIDDEN,
      `metric ${metricType} not accessible for HEAD (MR-level review metric)`
    );
  }
  if (role === 'DEVELOPER') {
    throw new CustomError(
      HttpStatus.FORBIDDEN,
      'DEVELOPER reads metrics via /api/me/* endpoints, not /teams/:uid/snapshots'
    );
  }
};

// ===========================================================================
// Writer
// ===========================================================================

/**
 * Все типы команд-агрегированных метрик MVP — единая правда для writer'а.
 * Если добавится новый MetricType (например, `review_coverage`), достаточно
 * расширить этот массив + добавить ветку в `computeOne`.
 */
const ALL_TEAM_METRICS: MetricType[] = [
  'cycle_time_mr',
  'mr_size',
  'lead_time',
  'deployment_frequency',
  'change_failure_rate',
  'bus_factor'
];

export interface SnapshotWriteEntry {
  metricType: MetricType;
  /** Результат записи: `ok` или сообщение ошибки. */
  status: 'ok' | string;
}

export interface TeamSnapshotReport {
  teamUid: string;
  calculatedAt: Date;
  entries: SnapshotWriteEntry[];
}

/**
 * Записать snapshots для одной команды по всем 6 MVP-метрикам.
 *
 * Алгоритм:
 *   1. Резолвим `projectUids` команды (БЕЗ assertTeamAccess — system-context).
 *   2. Для каждой метрики:
 *      a) вычислить `value` через соответствующий `compute*`;
 *      b) upsert в `metrics_snapshots` по бизнес-ключу.
 *   3. Записать audit `metrics.snapshot.written` с количеством успехов/ошибок.
 *
 * Ошибки одной метрики НЕ останавливают остальные (Promise.allSettled-стиль).
 * Это критично: если, например, `computeLeadTime` упал из-за edge case,
 * snapshot для Cycle Time всё равно сохранится.
 */
export const writeSnapshotsForTeam = async (
  teamUid: string,
  calculatedAt: Date = new Date(),
  actorUid?: string
): Promise<TeamSnapshotReport> => {
  const [team] = await db.select().from(teams).where(eq(teams.uid, teamUid));
  if (!team) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Team not found');
  }

  const projectRows = await db
    .select({ uid: teamProjects.projectUid })
    .from(teamProjects)
    .where(eq(teamProjects.teamUid, teamUid));
  const projectUids = projectRows.map((r) => r.uid);

  // Канонические окна (см. парадигму выше).
  const periodEnd = startOfUtcDay(calculatedAt);
  const period30Start = daysAgo(periodEnd, 30);
  const period90Start = daysAgo(periodEnd, 90);

  const entries: SnapshotWriteEntry[] = [];

  for (const metricType of ALL_TEAM_METRICS) {
    try {
      const { value, periodStart, periodEndForSnapshot } = await computeOne(
        metricType,
        projectUids,
        periodEnd,
        period30Start,
        period90Start
      );
      await upsertSnapshot({
        metricType,
        entityType: 'team',
        entityId: teamUid,
        periodStart,
        periodEnd: periodEndForSnapshot,
        value,
        calculatedAt
      });
      entries.push({ metricType, status: 'ok' });
    } catch (error) {
      const msg = (error as Error).message || String(error);
      logger.warn(
        `snapshot.write team=${teamUid} metric=${metricType} failed: ${msg}`
      );
      entries.push({ metricType, status: msg });
    }
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'metrics.snapshot.written',
    entityType: 'team',
    entityId: teamUid,
    details: {
      calculatedAt: calculatedAt.toISOString(),
      ok: entries.filter((e) => e.status === 'ok').length,
      failed: entries.filter((e) => e.status !== 'ok').length,
      entries
    }
  });

  return { teamUid, calculatedAt, entries };
};

export interface SnapshotBatchReport {
  total: number;
  ok: number;
  failed: number;
  teams: TeamSnapshotReport[];
}

/**
 * Записать snapshots для всех команд системы.
 * Используется планировщиком/`syncAllProjects`. Ошибка одной команды
 * не останавливает обход остальных.
 */
export const writeSnapshotsForAllTeams = async (
  calculatedAt: Date = new Date()
): Promise<SnapshotBatchReport> => {
  const rows = await db.select({ uid: teams.uid }).from(teams);
  return writeForTeams(
    rows.map((r) => r.uid),
    calculatedAt
  );
};

/**
 * Записать snapshots для команд, связанных с конкретным проектом.
 * Используется после успешного `syncProject`: пересчитываем только те
 * команды, чьи данные могли измениться — не трогаем команды других проектов.
 */
export const writeSnapshotsForProjectTeams = async (
  projectUid: string,
  calculatedAt: Date = new Date()
): Promise<SnapshotBatchReport> => {
  const rows = await db
    .select({ uid: teamProjects.teamUid })
    .from(teamProjects)
    .where(eq(teamProjects.projectUid, projectUid));
  const teamUids = [...new Set(rows.map((r) => r.uid))];
  return writeForTeams(teamUids, calculatedAt);
};

const writeForTeams = async (
  teamUids: string[],
  calculatedAt: Date
): Promise<SnapshotBatchReport> => {
  const reports: TeamSnapshotReport[] = [];
  let ok = 0;
  let failed = 0;
  for (const teamUid of teamUids) {
    try {
      const report = await writeSnapshotsForTeam(teamUid, calculatedAt);
      reports.push(report);
      // Команда считается ok, если все 6 метрик ok; иначе — failed.
      if (report.entries.every((e) => e.status === 'ok')) ok += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      logger.warn(
        `snapshot.writeForTeams team=${teamUid} failed: ${(error as Error).message}`
      );
    }
  }
  return { total: teamUids.length, ok, failed, teams: reports };
};

// ===========================================================================
// Helpers: per-metric compute + upsert
// ===========================================================================

const computeOne = async (
  metricType: MetricType,
  projectUids: string[],
  periodEnd: Date,
  period30Start: Date,
  period90Start: Date
): Promise<{ value: MetricValue; periodStart: Date; periodEndForSnapshot: Date }> => {
  switch (metricType) {
    case 'cycle_time_mr': {
      const value = await computeCycleTimeMr(projectUids, period30Start, periodEnd);
      return { value, periodStart: period30Start, periodEndForSnapshot: periodEnd };
    }
    case 'mr_size': {
      const value = await computeMrSize(projectUids, period30Start, periodEnd);
      return { value, periodStart: period30Start, periodEndForSnapshot: periodEnd };
    }
    case 'lead_time': {
      const value = await computeLeadTime(projectUids, period30Start, periodEnd);
      return { value, periodStart: period30Start, periodEndForSnapshot: periodEnd };
    }
    case 'deployment_frequency': {
      const value = await computeDeploymentFrequency(
        projectUids,
        period30Start,
        periodEnd,
        'week'
      );
      return { value, periodStart: period30Start, periodEndForSnapshot: periodEnd };
    }
    case 'change_failure_rate': {
      const value = await computeChangeFailureRate(
        projectUids,
        period30Start,
        periodEnd,
        'week'
      );
      return { value, periodStart: period30Start, periodEndForSnapshot: periodEnd };
    }
    case 'bus_factor': {
      const value = await computeBusFactor(
        projectUids,
        period90Start,
        periodEnd,
        BusFactorCalculator.DEFAULT_WINDOW_DAYS
      );
      return { value, periodStart: period90Start, periodEndForSnapshot: periodEnd };
    }
  }
};

interface UpsertSnapshotInput {
  metricType: MetricType;
  entityType: EntityType;
  entityId: string;
  periodStart: Date;
  periodEnd: Date;
  value: MetricValue;
  calculatedAt: Date;
}

const upsertSnapshot = async (input: UpsertSnapshotInput): Promise<void> => {
  await db
    .insert(metricsSnapshots)
    .values({
      metricType: input.metricType,
      entityType: input.entityType,
      entityId: input.entityId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      value: input.value,
      calculatedAt: input.calculatedAt
    })
    .onConflictDoUpdate({
      target: [
        metricsSnapshots.metricType,
        metricsSnapshots.entityType,
        metricsSnapshots.entityId,
        metricsSnapshots.periodStart,
        metricsSnapshots.periodEnd
      ],
      set: {
        value: sql`excluded.value`,
        calculatedAt: sql`excluded.calculated_at`
      }
    });
};

// ===========================================================================
// Reader (для UI)
// ===========================================================================

/**
 * Последний snapshot команды для конкретной метрики.
 * Возвращает null, если снепшота ещё нет (writer не отрабатывал).
 *
 * Контроллер должен предварительно вызвать `assertTeamAccess` +
 * `assertMetricAccessibleForRole` — здесь проверки доступа не делаем
 * (сервис не знает actor'а).
 */
export const getLatestSnapshot = async (
  teamUid: string,
  metricType: MetricType
): Promise<typeof metricsSnapshots.$inferSelect | null> => {
  const [row] = await db
    .select()
    .from(metricsSnapshots)
    .where(
      and(
        eq(metricsSnapshots.metricType, metricType),
        eq(metricsSnapshots.entityType, 'team' as EntityType),
        eq(metricsSnapshots.entityId, teamUid)
      )
    )
    .orderBy(desc(metricsSnapshots.periodEnd))
    .limit(1);
  return row ?? null;
};

/**
 * История снепшотов команды для метрики за окно времени.
 * Используется UI для рисования трендов «Lead Time по неделям».
 *
 * `from`/`to` — фильтр по `periodEnd` (одна точка на день). Если не заданы,
 * по умолчанию — последние 90 дней.
 *
 * `limit` — защита от переразмерных ответов; 1000 точек = ~3 года данных
 * (одна точка в день), для UI трендов больше не нужно.
 */
export const getSnapshotHistory = async (
  teamUid: string,
  metricType: MetricType,
  from?: Date,
  to?: Date,
  limit = 1000
): Promise<typeof metricsSnapshots.$inferSelect[]> => {
  const now = new Date();
  const effectiveTo = to ?? now;
  const effectiveFrom = from ?? new Date(effectiveTo.getTime() - 90 * MS_PER_DAY);

  return db
    .select()
    .from(metricsSnapshots)
    .where(
      and(
        eq(metricsSnapshots.metricType, metricType),
        eq(metricsSnapshots.entityType, 'team' as EntityType),
        eq(metricsSnapshots.entityId, teamUid),
        gte(metricsSnapshots.periodEnd, effectiveFrom),
        lte(metricsSnapshots.periodEnd, effectiveTo)
      )
    )
    .orderBy(asc(metricsSnapshots.periodEnd))
    .limit(limit);
};

// ===========================================================================
// Хелперы для контроллера
// ===========================================================================

/**
 * Резолв роли актора (для применения `assertMetricAccessibleForRole`
 * в контроллере). Возвращает глобальную роль из users.role.
 */
export const loadActorRole = async (actorUid: string): Promise<RoleType> => {
  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.uid, actorUid));
  if (!actor) throw new CustomError(HttpStatus.FORBIDDEN, 'actor not found');
  return actor.role as RoleType;
};

/**
 * Проверка, что user-actor — реально член team (для extra-safe чтения
 * snapshots, дополняет requireRole). Сейчас вспомогательная, используется
 * в reader-контроллерах, но `assertTeamAccess` уже даёт ту же гарантию.
 */
export const isTeamMember = async (actorUid: string, teamUid: string): Promise<boolean> => {
  const [row] = await db
    .select({ teamUid: teamMembers.teamUid })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamUid, teamUid), eq(teamMembers.userUid, actorUid)));
  return Boolean(row);
};

// ===========================================================================
// Whitelist для query-валидации (используется контроллером)
// ===========================================================================

export const KNOWN_METRIC_TYPES: ReadonlySet<MetricType> = new Set(ALL_TEAM_METRICS);
