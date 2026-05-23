import type {
  ApiResponse,
  TeamBusFactorReport,
  TeamCycleTimeMrReport,
  TeamListItem,
  TeamMrSizeReport
} from '@shared/types';

import { api } from './instance';

export const teamsApi = {
  listTeams: async (): Promise<TeamListItem[]> => {
    const res = await api.get<ApiResponse<TeamListItem[]>>('/teams');
    return res.data.message;
  },

  getCycleTimeMr: async (
    teamUid: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<TeamCycleTimeMrReport> => {
    const res = await api.get<ApiResponse<TeamCycleTimeMrReport>>(
      `/teams/${teamUid}/cycle-time-mr`,
      {
        params: {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        }
      }
    );
    return res.data.message;
  },

  getMrSize: async (
    teamUid: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<TeamMrSizeReport> => {
    const res = await api.get<ApiResponse<TeamMrSizeReport>>(`/teams/${teamUid}/mr-size`, {
      params: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString()
      }
    });
    return res.data.message;
  },

  getBusFactor: async (teamUid: string, windowDays = 90): Promise<TeamBusFactorReport> => {
    const res = await api.get<ApiResponse<TeamBusFactorReport>>(`/teams/${teamUid}/bus-factor`, {
      params: { windowDays }
    });
    return res.data.message;
  }
};
