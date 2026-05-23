import type { NextFunction, Request, Response } from 'express';

import { HttpStatus } from '@/utils/enums/http-status';

import {
  auditExportQuerySchema,
  departmentDoraQuerySchema,
  departmentParamsSchema,
  periodExportQuerySchema,
  teamParamsSchema
} from './dto/export.dto';
import * as ExportService from './export.service';

/**
 * Контроллеры экспорта CSV (доработка 6).
 *
 * Все эндпоинты:
 *   1. Парсят path/query через Zod (ZodError → 400);
 *   2. Прокидывают `req.user!.uid` как `actorUid` (для assertTeamAccess и audit);
 *   3. Отправляют CSV-ответ с тремя заголовками:
 *        Content-Type: text/csv; charset=utf-8
 *        Content-Disposition: attachment; filename="..."
 *        X-Row-Count: <число строк> (custom — для UI прогресс-бара).
 *
 * **Status code = 200 OK** (не 204), даже если CSV пустой (header-only) —
 * браузер начинает download только при OK. Body всегда есть (минимум BOM
 * + header row).
 *
 * **Filename в Content-Disposition** — экранируем через encodeURIComponent
 * + RFC 5987 (`filename*=UTF-8''...`) для имён с кириллицей в будущем.
 * Сейчас файлы английские (`team-...-metrics-...csv`) — простой `filename=` OK.
 */

const sendCsv = (
  res: Response,
  result: { csv: Buffer; filename: string; rowCount: number }
): void => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('X-Row-Count', String(result.rowCount));
  res.status(HttpStatus.OK).send(result.csv);
};

// ===== Team-level exports (доступны DEV/LEAD/HEAD/ADMIN через assertTeamAccess) =====

export async function exportTeamMetrics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params = teamParamsSchema.parse(req.params);
    const query = periodExportQuerySchema.parse(req.query);
    const result = await ExportService.exportTeamMetrics(req.user!.uid, params.teamUid, query);
    sendCsv(res, result);
  } catch (error) {
    next(error);
  }
}

export async function exportTeamMergeRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params = teamParamsSchema.parse(req.params);
    const query = periodExportQuerySchema.parse(req.query);
    const result = await ExportService.exportTeamMergeRequests(
      req.user!.uid,
      params.teamUid,
      query
    );
    sendCsv(res, result);
  } catch (error) {
    next(error);
  }
}

// ===== Department-level (HEAD/ADMIN) =====

export async function exportDepartmentDora(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params = departmentParamsSchema.parse(req.params);
    const query = departmentDoraQuerySchema.parse(req.query);
    const result = await ExportService.exportDepartmentDora(
      req.user!.uid,
      params.departmentUid,
      query
    );
    sendCsv(res, result);
  } catch (error) {
    next(error);
  }
}

// ===== Audit (ADMIN only) =====

export async function exportAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = auditExportQuerySchema.parse(req.query);
    const result = await ExportService.exportAuditLogs(req.user!.uid, query);
    sendCsv(res, result);
  } catch (error) {
    next(error);
  }
}
