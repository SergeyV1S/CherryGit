import { and, asc, desc, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm';

import type { RoleType } from '@/db/drizzle/schema/user/types/role.type';

import { db } from '@/db/drizzle/connect';
import { mergeRequests } from '@/db/drizzle/schema/git-data/schema';
import { auditLogs } from '@/db/drizzle/schema/metrics/schema';
import { teams } from '@/db/drizzle/schema/teams/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { recordAuditLog } from '@/modules/audit/audit.service';
import {
  computeChangeFailureRate,
  computeDeploymentFrequency,
  computeLeadTime
} from '@/modules/metrics/lib/compute-team';
import { assertTeamAccess, loadActorRole } from '@/modules/metrics/lib/team-access';
import { getTeamMetrics } from '@/modules/metrics/metrics.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type { AuditExportQuery, DepartmentDoraQuery, PeriodExportQuery } from './dto/export.dto';

import { csvFilename, writeCsv } from './lib/csv-writer';

/**
 * Экспорт отчётов в CSV (ВКР FR-12, доработка 6).
 *
 * **Назначение и архитектурные решения:**
 *
 *   1. **Ролевая фильтрация — на уровне СЕРВИСА**, не только в route'ах.
 *      Каждая export-функция переиспользует тот же `assertTeamAccess` (3.1),
 *      что и обычные metric-endpoints. Это гарантирует, что:
 *        — LEAD одной команды не сможет выгрузить чужую команду подменой
 *          teamUid в URL (assertTeamAccess отдаст 403);
 *        — HEAD не выгрузит департамент другого отдела;
 *        — DEVELOPER без membership не выгрузит данные команды.
 *      Defence-in-depth: даже если route потеряет `requireRole`, сервис
 *      сам отдаст 403.
 *
 *   2. **Переиспользование compute-функций**, не отдельные SQL'и под
 *      export. `team-metrics` зовёт `getTeamMetrics` (тот же что для UI);
 *      `department-dora` — те же `computeLeadTime/DF/CFR`. Это значит:
 *        — CSV всегда бит-в-бит идентичен UI-значениям (нет «расхождения
 *          между экраном и выгрузкой» — частая жалоба пользователей);
 *        — изменения формул автоматически попадают в CSV.
 *
 *   3. **Audit на сам акт экспорта**: каждый успешный экспорт пишет
 *      `export.csv.generated` с метаданными `{type, scope, rowCount}`.
 *      Это нужно для compliance (ВКР 2.2.3): admin может проверить, кто
 *      выгружал данные сотрудников. Раскрытия PII в audit нет — только
 *      факт + размер.
 *
 *   4. **Возврат `{ filename, csv: Buffer }`** — контроллер ставит
 *      `Content-Disposition: attachment; filename="..."` и
 *      `Content-Type: text/csv; charset=utf-8`. Buffer вместо строки —
 *      `csv-writer` уже добавляет UTF-8 BOM, Express не должен повторно
 *      обрабатывать строку через `toString()`.
 */

export interface CsvExportResult {
  csv: Buffer;
  filename: string;
  /** Количество data-строк (без header) — для audit и Content-Length-проверки. */
  rowCount: number;
}

// ===========================================================================
// 1. Экспорт метрик одной команды за период
// ===========================================================================

/**
 * Все 6 MVP-метрик команды одним CSV (one-row-per-metric).
 *
 * **Формат**: «long» (один row на метрику), не «wide» — потому что метрики
 * имеют РАЗНУЮ структуру value (LeadTime — два числа, MR Size — массив
 * бакетов, Bus Factor — массив модулей). Wide-формат бы дал 30+ колонок
 * с пустотами в большинстве ячеек. Long-формат с JSON в `value`-колонке —
 * единое представление, любое значение читаемо в Excel-RU после парсинга.
 *
 * **Ролевая фильтрация**: переиспользует `getTeamMetrics` — недоступные
 * метрики придут как `null` и пишутся в CSV как пустая `value`. UI должен
 * это интерпретировать корректно («роль не имеет доступа» vs «нет данных»).
 *
 * **Separator** по умолчанию `;` (Excel-RU friendly).
 */
export const exportTeamMetrics = async (
  actorUid: string,
  teamUid: string,
  query: PeriodExportQuery
): Promise<CsvExportResult> => {
  if (query.periodEnd < query.periodStart) {
    throw new CustomError(HttpStatus.BAD_REQUEST, 'periodEnd должен быть ≥ periodStart');
  }

  const bundle = await getTeamMetrics(actorUid, teamUid, query.periodStart, query.periodEnd);

  // long-формат: 6 строк, по одной на метрику.
  const rows = (
    [
      ['cycle_time_mr', bundle.metrics.cycle_time_mr],
      ['mr_size', bundle.metrics.mr_size],
      ['lead_time', bundle.metrics.lead_time],
      ['deployment_frequency', bundle.metrics.deployment_frequency],
      ['change_failure_rate', bundle.metrics.change_failure_rate],
      ['bus_factor', bundle.metrics.bus_factor]
    ] as const
  ).map(([name, value]) => ({
    metric: name,
    accessible: value !== null,
    periodStart: query.periodStart,
    periodEnd: query.periodEnd,
    teamUid,
    value
  }));

  const csv = writeCsv({
    columns: [
      { header: 'Метрика', key: 'metric' },
      { header: 'Доступна для роли', key: (r) => (r.accessible ? 'да' : 'нет') },
      { header: 'Начало периода (UTC)', key: 'periodStart' },
      { header: 'Конец периода (UTC)', key: 'periodEnd' },
      { header: 'UID команды', key: 'teamUid' },
      { header: 'Значение (JSON)', key: 'value' }
    ],
    rows,
    separator: query.separator
  });

  const filename = csvFilename(`team-${teamUid.slice(0, 8)}-metrics`);

  await recordAuditLog({
    userUid: actorUid,
    action: 'export.csv.generated',
    entityType: 'team',
    entityId: teamUid,
    details: {
      exportType: 'team-metrics',
      periodStart: query.periodStart.toISOString(),
      periodEnd: query.periodEnd.toISOString(),
      rowCount: rows.length,
      accessMode: bundle.accessMode
    }
  });

  return { csv, filename, rowCount: rows.length };
};

// ===========================================================================
// 2. Экспорт списка merge requests команды за период
// ===========================================================================

/**
 * Список merged MR команды с raw-данными для аналитики в Excel/Python:
 * MR-level cycle time, MR Size, hotfix-маркеры, автор, фазы.
 *
 * **Использование**: LEAD/HEAD выгружает «сырые» MR для quarterly retro
 * или передачи аналитику. UI-дашборд показывает агрегаты, CSV — детализацию.
 *
 * **PII**: `authorGitlabUsername` пишем — это публичная git-сущность, не PII.
 * Полные имена авторов через JOIN с users НЕ делаем — usernames достаточно
 * для идентификации в Git-контексте.
 *
 * **Окно** — по `mergedAt` (как в калькуляторах), чтобы MR попадал в выгрузку
 * того же периода, что и в дашборд.
 */
export const exportTeamMergeRequests = async (
  actorUid: string,
  teamUid: string,
  query: PeriodExportQuery
): Promise<CsvExportResult> => {
  if (query.periodEnd < query.periodStart) {
    throw new CustomError(HttpStatus.BAD_REQUEST, 'periodEnd должен быть ≥ periodStart');
  }

  const { projectUids } = await assertTeamAccess(actorUid, teamUid);

  if (projectUids.length === 0) {
    // Команда без проектов — пустой CSV (только header).
    const csv = writeCsv({
      columns: MR_COLUMNS,
      rows: [],
      separator: query.separator
    });
    return {
      csv,
      filename: csvFilename(`team-${teamUid.slice(0, 8)}-mrs`),
      rowCount: 0
    };
  }

  const rows = await db
    .select({
      projectUid: mergeRequests.projectUid,
      gitlabMrIid: mergeRequests.gitlabMrIid,
      title: mergeRequests.title,
      state: mergeRequests.state,
      sourceBranch: mergeRequests.sourceBranch,
      targetBranch: mergeRequests.targetBranch,
      authorGitlabUsername: mergeRequests.authorGitlabUsername,
      authorUid: mergeRequests.authorUid,
      gitlabCreatedAt: mergeRequests.gitlabCreatedAt,
      firstReviewAt: mergeRequests.firstReviewAt,
      approvedAt: mergeRequests.approvedAt,
      mergedAt: mergeRequests.mergedAt,
      closedAt: mergeRequests.closedAt,
      linesAdded: mergeRequests.linesAdded,
      linesRemoved: mergeRequests.linesRemoved,
      filesChangedCount: mergeRequests.filesChangedCount,
      hasHotfixLabel: mergeRequests.hasHotfixLabel,
      hasRevertLabel: mergeRequests.hasRevertLabel
    })
    .from(mergeRequests)
    .where(
      and(
        inArray(mergeRequests.projectUid, projectUids),
        gte(mergeRequests.mergedAt, query.periodStart),
        lte(mergeRequests.mergedAt, query.periodEnd)
      )
    )
    .orderBy(desc(mergeRequests.mergedAt));

  const enrichedRows = rows.map((r) => ({
    ...r,
    totalLinesChanged: r.linesAdded + r.linesRemoved,
    cycleTimeSeconds:
      r.mergedAt && r.gitlabCreatedAt
        ? Math.round((r.mergedAt.getTime() - r.gitlabCreatedAt.getTime()) / 1000)
        : null
  }));

  const csv = writeCsv({
    columns: MR_COLUMNS,
    rows: enrichedRows,
    separator: query.separator
  });

  const filename = csvFilename(`team-${teamUid.slice(0, 8)}-mrs`);

  await recordAuditLog({
    userUid: actorUid,
    action: 'export.csv.generated',
    entityType: 'team',
    entityId: teamUid,
    details: {
      exportType: 'team-merge-requests',
      periodStart: query.periodStart.toISOString(),
      periodEnd: query.periodEnd.toISOString(),
      rowCount: enrichedRows.length
    }
  });

  return { csv, filename, rowCount: enrichedRows.length };
};

const MR_COLUMNS = [
  { header: 'UID проекта', key: 'projectUid' as const },
  { header: 'IID MR', key: 'gitlabMrIid' as const },
  { header: 'Заголовок', key: 'title' as const },
  { header: 'Состояние', key: 'state' as const },
  { header: 'Source branch', key: 'sourceBranch' as const },
  { header: 'Target branch', key: 'targetBranch' as const },
  { header: 'Автор (GitLab username)', key: 'authorGitlabUsername' as const },
  { header: 'Автор (CherryGit UID)', key: 'authorUid' as const },
  { header: 'Создан (UTC)', key: 'gitlabCreatedAt' as const },
  { header: 'Первое ревью (UTC)', key: 'firstReviewAt' as const },
  { header: 'Approved (UTC)', key: 'approvedAt' as const },
  { header: 'Merged (UTC)', key: 'mergedAt' as const },
  { header: 'Closed (UTC)', key: 'closedAt' as const },
  { header: 'Строк добавлено', key: 'linesAdded' as const },
  { header: 'Строк удалено', key: 'linesRemoved' as const },
  { header: 'Файлов изменено', key: 'filesChangedCount' as const },
  { header: 'Всего строк изменено', key: 'totalLinesChanged' as const },
  { header: 'Cycle time (секунды)', key: 'cycleTimeSeconds' as const },
  { header: 'Hotfix label', key: 'hasHotfixLabel' as const },
  { header: 'Revert label', key: 'hasRevertLabel' as const }
];

// ===========================================================================
// 3. Экспорт DORA-метрик по командам отдела
// ===========================================================================

/**
 * DORA cross-team CSV для руководителя отдела: одна строка на команду,
 * колонки — Lead Time (медиана+p90), DF (count, perDay, category), CFR
 * (rate, category).
 *
 * **Формат**: wide (одна строка = одна команда) — потому что метрики
 * однородные (всё DORA), кол-во колонок управляемое (~10).
 *
 * **Scope-проверка**: HEAD видит только команды СВОЕГО отдела. ADMIN —
 * любого. DEVELOPER/LEAD без HEAD-роли — 403.
 *
 * **Использование**: HEAD еженедельно/ежемесячно выгружает дашборд
 * руководителя в Excel для отчётности (вне сценария UI).
 */
export const exportDepartmentDora = async (
  actorUid: string,
  departmentUid: string,
  query: DepartmentDoraQuery
): Promise<CsvExportResult> => {
  if (query.periodEnd < query.periodStart) {
    throw new CustomError(HttpStatus.BAD_REQUEST, 'periodEnd должен быть ≥ periodStart');
  }

  const actor = await db
    .select({ uid: users.uid, role: users.role, departmentUid: users.departmentUid })
    .from(users)
    .where(eq(users.uid, actorUid))
    .then((rows) => rows[0]);

  if (!actor) throw new CustomError(HttpStatus.FORBIDDEN, 'actor not found');
  const role = actor.role as RoleType;

  // Scope: HEAD только своего отдела, ADMIN — любого. LEAD/DEVELOPER — нет.
  if (role !== 'ADMIN' && role !== 'HEAD') {
    throw new CustomError(
      HttpStatus.FORBIDDEN,
      'экспорт DORA по отделу доступен только HEAD и ADMIN'
    );
  }
  if (role === 'HEAD' && actor.departmentUid !== departmentUid) {
    throw new CustomError(HttpStatus.FORBIDDEN, 'HEAD может выгружать только свой отдел');
  }

  // Команды отдела (с проектами).
  const departmentTeams = await db
    .select({ uid: teams.uid, name: teams.name })
    .from(teams)
    .where(eq(teams.departmentUid, departmentUid))
    .orderBy(asc(teams.name));

  if (departmentTeams.length === 0) {
    // Пустой отдел — header only.
    const csv = writeCsv({
      columns: DORA_COLUMNS,
      rows: [],
      separator: query.separator
    });
    return {
      csv,
      filename: csvFilename(`dept-${departmentUid.slice(0, 8)}-dora`),
      rowCount: 0
    };
  }

  // Для каждой команды резолвим projectUids и считаем DORA параллельно.
  // assertTeamAccess НЕ зовём для каждой — actor уже подтверждён выше как
  // HEAD/ADMIN с правом на отдел; assertTeamAccess повторно бы упирался в
  // ту же роль.
  const teamProjectsMap = await loadProjectsForTeams(departmentTeams.map((t) => t.uid));
  const granularity = query.granularity ?? 'week';

  const rows = await Promise.all(
    departmentTeams.map(async (team) => {
      const projectUids = teamProjectsMap.get(team.uid) ?? [];
      if (projectUids.length === 0) {
        return {
          teamUid: team.uid,
          teamName: team.name,
          projectCount: 0,
          leadTimeMedianSeconds: null,
          leadTimeP90Seconds: null,
          leadTimeSampleSize: 0,
          dfCount: 0,
          dfPerDay: 0,
          dfCategory: 'low' as const,
          cfrTotalDeploys: 0,
          cfrFailedDeploys: 0,
          cfrRatePercent: 0,
          cfrCategory: null as string | null
        };
      }
      const [lt, df, cfr] = await Promise.all([
        computeLeadTime(projectUids, query.periodStart, query.periodEnd),
        computeDeploymentFrequency(projectUids, query.periodStart, query.periodEnd, granularity),
        computeChangeFailureRate(projectUids, query.periodStart, query.periodEnd, granularity)
      ]);
      return {
        teamUid: team.uid,
        teamName: team.name,
        projectCount: projectUids.length,
        leadTimeMedianSeconds: lt.medianSeconds,
        leadTimeP90Seconds: lt.p90Seconds,
        leadTimeSampleSize: lt.sampleSize,
        dfCount: df.count,
        dfPerDay: df.perDay,
        dfCategory: df.category,
        cfrTotalDeploys: cfr.totalDeploys,
        cfrFailedDeploys: cfr.failedDeploys,
        cfrRatePercent: cfr.ratePercent,
        cfrCategory: cfr.category
      };
    })
  );

  const csv = writeCsv({
    columns: DORA_COLUMNS,
    rows,
    separator: query.separator
  });

  const filename = csvFilename(`dept-${departmentUid.slice(0, 8)}-dora`);

  await recordAuditLog({
    userUid: actorUid,
    action: 'export.csv.generated',
    entityType: 'department',
    entityId: departmentUid,
    details: {
      exportType: 'department-dora',
      periodStart: query.periodStart.toISOString(),
      periodEnd: query.periodEnd.toISOString(),
      granularity,
      teamsCount: departmentTeams.length,
      rowCount: rows.length
    }
  });

  return { csv, filename, rowCount: rows.length };
};

const DORA_COLUMNS = [
  { header: 'UID команды', key: 'teamUid' as const },
  { header: 'Команда', key: 'teamName' as const },
  { header: 'Проектов', key: 'projectCount' as const },
  { header: 'Lead Time медиана (сек)', key: 'leadTimeMedianSeconds' as const },
  { header: 'Lead Time p90 (сек)', key: 'leadTimeP90Seconds' as const },
  { header: 'Lead Time выборка', key: 'leadTimeSampleSize' as const },
  { header: 'DF деплоев', key: 'dfCount' as const },
  { header: 'DF в день', key: 'dfPerDay' as const },
  { header: 'DF категория', key: 'dfCategory' as const },
  { header: 'CFR всего деплоев', key: 'cfrTotalDeploys' as const },
  { header: 'CFR failed деплоев', key: 'cfrFailedDeploys' as const },
  { header: 'CFR процент', key: 'cfrRatePercent' as const },
  { header: 'CFR категория', key: 'cfrCategory' as const }
];

/**
 * Хелпер: загрузить projectUid'ы для списка teamUid'ов одним SELECT'ом.
 * Возвращает Map<teamUid, projectUids[]> — для удобства lookup'а.
 */
const loadProjectsForTeams = async (teamUids: string[]): Promise<Map<string, string[]>> => {
  if (teamUids.length === 0) return new Map();

  const { teamProjects } = await import('@/db/drizzle/schema/teams/schema');
  const rows = await db
    .select({
      teamUid: teamProjects.teamUid,
      projectUid: teamProjects.projectUid
    })
    .from(teamProjects)
    .where(inArray(teamProjects.teamUid, teamUids));

  const result = new Map<string, string[]>();
  for (const r of rows) {
    if (!result.has(r.teamUid)) result.set(r.teamUid, []);
    result.get(r.teamUid)!.push(r.projectUid);
  }
  return result;
};

// ===========================================================================
// 4. Экспорт audit-логов (admin only)
// ===========================================================================

/**
 * Audit-журнал в CSV (для compliance/расследований).
 *
 * Те же фильтры что у `GET /admin/audit`. Без пагинации — выгружаем
 * всё подходящее под фильтр (с защитным cap'ом 100k строк, чтобы не
 * исчерпать память).
 *
 * `actorMail` через LEFT JOIN — admin'у удобнее видеть email actor'а
 * в Excel, чем UUID.
 *
 * **Ролевая проверка**: `loadActorRole(actor) === 'ADMIN'`. Делается
 * defence-in-depth: даже если route без `requireRole('ADMIN')`, сервис
 * сам отдаст 403.
 */
const AUDIT_EXPORT_HARD_CAP = 100_000;

export const exportAuditLogs = async (
  actorUid: string,
  query: AuditExportQuery
): Promise<CsvExportResult> => {
  const role = await loadActorRole(actorUid);
  if (role !== 'ADMIN') {
    throw new CustomError(HttpStatus.FORBIDDEN, 'audit export доступен только ADMIN');
  }

  const conditions = [];
  if (query.userUid) conditions.push(eq(auditLogs.userUid, query.userUid));
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.actionPrefix) {
    // LIKE escape не нужен — actionPrefix контролируется Zod'ом (см. audit.dto).
    conditions.push(ilike(auditLogs.action, `${query.actionPrefix}%`));
  }
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  if (query.entityId) conditions.push(eq(auditLogs.entityId, query.entityId));
  if (query.from) conditions.push(gte(auditLogs.occurredAt, query.from));
  if (query.to) conditions.push(lte(auditLogs.occurredAt, query.to));
  // `or` import keeps unused linter happy для будущих фильтров «X OR Y».
  void or;
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      uid: auditLogs.uid,
      occurredAt: auditLogs.occurredAt,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorUid: users.uid,
      actorMail: users.mail,
      actorFirstName: users.firstName,
      actorSecondName: users.secondName,
      details: auditLogs.details
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.uid, auditLogs.userUid))
    .where(where)
    .orderBy(desc(auditLogs.occurredAt))
    .limit(AUDIT_EXPORT_HARD_CAP);

  const csv = writeCsv({
    columns: [
      { header: 'UID записи', key: 'uid' },
      { header: 'Время (UTC)', key: 'occurredAt' },
      { header: 'Действие', key: 'action' },
      { header: 'Тип сущности', key: 'entityType' },
      { header: 'UID сущности', key: 'entityId' },
      { header: 'Actor UID', key: 'actorUid' },
      { header: 'Actor email', key: 'actorMail' },
      { header: 'Actor имя', key: 'actorFirstName' },
      { header: 'Actor фамилия', key: 'actorSecondName' },
      { header: 'Details (JSON)', key: 'details' }
    ],
    rows,
    separator: query.separator
  });

  const filename = csvFilename('audit-logs');

  // Сам факт audit export — тоже audit. Без рекурсии: пишем 1 запись на
  // запрос, не на каждую выгруженную строку.
  await recordAuditLog({
    userUid: actorUid,
    action: 'export.csv.generated',
    entityType: 'audit',
    details: {
      exportType: 'audit-logs',
      rowCount: rows.length,
      filterAction: query.action,
      filterActionPrefix: query.actionPrefix,
      filterEntityType: query.entityType,
      filterFrom: query.from?.toISOString(),
      filterTo: query.to?.toISOString(),
      hitHardCap: rows.length === AUDIT_EXPORT_HARD_CAP
    }
  });

  return { csv, filename, rowCount: rows.length };
};
