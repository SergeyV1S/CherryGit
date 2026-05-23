import type { NextFunction, Request, Response } from 'express';

import { sendResponse } from '@/lib/reponse';
import { HttpStatus } from '@/utils/enums/http-status';

import * as AuditService from './audit.service';
import {
  entityHistoryParamsSchema,
  listAuditLogsQuerySchema,
  statsQuerySchema
} from './dto/audit.dto';

/**
 * Контроллеры журнала аудита (доработка 5).
 *
 * Все endpoint'ы под ADMIN (см. `audit.admin.routes.ts`).
 *
 * Query-параметры валидируются Zod через `safeParse` — это даёт детальный
 * 400 с указанием поля и причины, а не общий ZodError-throw. Контроллер
 * сам бросает CustomError, чтобы глобальный handler в `main.ts` не
 * обрабатывал ZodError особым образом.
 */

export async function listAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filter = listAuditLogsQuerySchema.parse(req.query);
    const result = await AuditService.listAuditLogs(filter);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

/**
 * История событий одной сущности: `/admin/audit/entity/:entityType/:entityId`.
 * Возвращает массив (без пагинации) в хронологическом порядке.
 */
export async function listAuditLogsForEntity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params = entityHistoryParamsSchema.parse(req.params);
    const result = await AuditService.listAuditLogsForEntity(params.entityType, params.entityId);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

/** Уникальные action'ы для UI-фильтра (dropdown). */
export async function listKnownActions(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await AuditService.listKnownActions();
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

/** Уникальные entityType'ы для UI-фильтра. */
export async function listKnownEntityTypes(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await AuditService.listKnownEntityTypes();
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}

/**
 * Агрегированная статистика по журналу для admin-дашборда.
 * Query: `?from=2026-04-01&to=2026-05-23` (оба опциональны).
 */
export async function getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = statsQuerySchema.parse(req.query);
    const result = await AuditService.getAuditStats(from, to);
    sendResponse(res, HttpStatus.OK, result);
  } catch (error) {
    next(error);
  }
}
