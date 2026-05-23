import type { ApiResponse, CurrentUser, MyMetricsReport } from '@shared/types';

import { api } from './instance';

export const meApi = {
  getCurrentUser: async (): Promise<CurrentUser> => {
    const res = await api.get<ApiResponse<CurrentUser>>('/me');
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
  }
};
