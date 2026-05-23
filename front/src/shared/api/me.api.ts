import type { ApiResponse, CurrentUser } from '@shared/types';

import { api } from './instance';

export const meApi = {
  getCurrentUser: async (): Promise<CurrentUser> => {
    const res = await api.get<ApiResponse<CurrentUser>>('/me');
    return res.data.message;
  }
};
