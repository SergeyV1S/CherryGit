import type { ApiResponse, CrossTeamDoraReport } from '@shared/types';

import { api } from './instance';

export const doraApi = {
  getCrossTeamDora: async (periodStart: Date, periodEnd: Date): Promise<CrossTeamDoraReport> => {
    const res = await api.get<ApiResponse<CrossTeamDoraReport>>('/dora/cross-team', {
      params: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString()
      }
    });
    return res.data.message;
  }
};
