import { notImplemented } from '@/lib/not-implemented';

/**
 * Экспорт отчётов по рассчитанным метрикам в CSV (ВКР FR-12).
 *
 * Состав выгружаемых данных определяется ролью инициатора
 * (зона видимости та же, что и в дашбордах).
 */

export type ExportType = 'dora-cross-team' | 'individual-metrics' | 'team-metrics';

export const exportCsv = async (
  _actorUid: string,
  _type: ExportType,
  _params: Record<string, string>
): Promise<{ filename: string; csv: string }> => notImplemented('export.exportCsv');
