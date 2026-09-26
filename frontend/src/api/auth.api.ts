import { request, requestWithMessage } from './client';
import type { CurrentUser } from '@/types/api';
import type { Language } from '@/types/enums';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: CurrentUser;
  accessToken: string;
  expiresIn: number;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    requestWithMessage<LoginResponse>({ url: '/auth/login', method: 'POST', data: payload }),

  refresh: () => request<LoginResponse>({ url: '/auth/refresh', method: 'POST' }),

  logout: () => request<null>({ url: '/auth/logout', method: 'POST' }),

  logoutAll: () => request<null>({ url: '/auth/logout-all', method: 'POST' }),

  me: () => request<CurrentUser>({ url: '/auth/me', method: 'GET' }),

  updateProfile: (payload: { fullName?: string; phone?: string | null; language?: Language }) =>
    requestWithMessage<CurrentUser>({ url: '/auth/me', method: 'PATCH', data: payload }),

  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => requestWithMessage<null>({ url: '/auth/change-password', method: 'POST', data: payload }),
};
