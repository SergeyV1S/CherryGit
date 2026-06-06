import type {
  ApiResponse,
  CurrentUser,
  MeAccess,
  MyMetricsHistoryReport,
  MyMetricsReport
} from '@shared/types';

import { api } from './instance';

export const meApi = {
  getCurrentUser: async (): Promise<CurrentUser> => {
    const res = await api.get<ApiResponse<CurrentUser>>('/me');
    return res.data.message;
  },

  /**
   * Гейт для UI: показать дашборд или баннер «обратитесь к администратору».
   * См. `MeAccessStatus` для возможных значений.
   */
  getMyAccess: async (): Promise<MeAccess> => {
    const res = await api.get<ApiResponse<MeAccess>>('/me/access');
    return res.data.message;
  },

  getMyMetrics: async (periodStart: Date, periodEnd: Date): Promise<MyMetricsReport> => {
    const res = await api.get<ApiResponse<MyMetricsReport>>('/me/metrics', {
      params: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString()
      }
    });
    return res.data.message;
  },

  /**
   * История командных снепшотов (Cycle Time MR + MR Size) за период.
   * Возвращается per-team — потому что snapshot'ы пишутся per-team
   * (личных пока нет, см. ДОРАБОТКИ 2.7+).
   */
  getMyMetricsHistory: async (from?: Date, to?: Date): Promise<MyMetricsHistoryReport> => {
    const params: Record<string, string> = {};
    if (from) params.from = from.toISOString();
    if (to) params.to = to.toISOString();
    const res = await api.get<ApiResponse<MyMetricsHistoryReport>>('/me/metrics/history', {
      params
    });
    return res.data.message;
  }
};
