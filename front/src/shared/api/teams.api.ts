import type {
  ApiResponse,
  TeamBusFactorReport,
  TeamChangeFailureRateReport,
  TeamCycleTimeMrReport,
  TeamDeploymentFrequencyReport,
  TeamLeadTimeReport,
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
  },

  getLeadTime: async (
    teamUid: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<TeamLeadTimeReport> => {
    const res = await api.get<ApiResponse<TeamLeadTimeReport>>(`/teams/${teamUid}/lead-time`, {
      params: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString()
      }
    });
    return res.data.message;
  },

  getDeploymentFrequency: async (
    teamUid: string,
    periodStart: Date,
    periodEnd: Date,
    granularity: 'day' | 'week' | 'month' = 'week'
  ): Promise<TeamDeploymentFrequencyReport> => {
    const res = await api.get<ApiResponse<TeamDeploymentFrequencyReport>>(
      `/teams/${teamUid}/deployment-frequency`,
      {
        params: {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          granularity
        }
      }
    );
    return res.data.message;
  },

  getChangeFailureRate: async (
    teamUid: string,
    periodStart: Date,
    periodEnd: Date,
    granularity: 'day' | 'week' | 'month' = 'week'
  ): Promise<TeamChangeFailureRateReport> => {
    const res = await api.get<ApiResponse<TeamChangeFailureRateReport>>(
      `/teams/${teamUid}/change-failure-rate`,
      {
        params: {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          granularity
        }
      }
    );
    return res.data.message;
  }
};
