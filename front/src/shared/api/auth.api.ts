import type { ApiResponse, CurrentUser } from '@shared/types';

import { api } from './instance';

export interface LoginDto {
  mail: string;
  password: string;
}

export interface RegisterDto {
  firstName: string;
  secondName: string;
  mail: string;
  password: string;
}

export const authApi = {
  login: async (dto: LoginDto): Promise<CurrentUser> => {
    const res = await api.post<ApiResponse<CurrentUser>>('/auth/login', dto);
    return res.data.message;
  },

  register: async (dto: RegisterDto): Promise<CurrentUser> => {
    const res = await api.post<ApiResponse<CurrentUser>>('/auth/register', dto);
    return res.data.message;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  }
};
