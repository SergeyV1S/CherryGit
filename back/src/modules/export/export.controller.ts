import type { NextFunction, Request, Response } from 'express';

import * as ExportService from './export.service';

export async function exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const type = req.query.type as ExportService.ExportType;
    const params = req.query as Record<string, string>;
    const { filename, csv } = await ExportService.exportCsv(req.user!.uid, type, params);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
}
