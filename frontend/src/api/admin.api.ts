import { request, requestPage, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type { AuditLog, CommissionRule, Permission, Role, User } from '@/types/api';
import type {
  AuditResult,
  CommissionMethod,
  CommissionOperation,
  Language,
  UserStatus,
} from '@/types/enums';

export interface UserPayload {
  username: string;
  password: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  roleId: string;
  defaultCashBoxId?: string | null;
  language?: Language;
}

export interface CommissionRulePayload {
  name: string;
  operation: CommissionOperation;
  currencyId?: string | null;
  method: CommissionMethod;
  fixedAmount?: string | null;
  percent?: string | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  fromAmount?: string | null;
  toAmount?: string | null;
  priority?: number;
  isActive?: boolean;
}

export const usersApi = {
  list: (params: { page?: number; limit?: number; q?: string; roleId?: string; status?: UserStatus }) =>
    requestPage<User>({ url: '/users', method: 'GET', params: cleanParams(params) }),

  detail: (id: string) => request<User>({ url: `/users/${id}`, method: 'GET' }),

  create: (payload: UserPayload) =>
    requestWithMessage<User>({ url: '/users', method: 'POST', data: payload }),

  update: (id: string, payload: Partial<Omit<UserPayload, 'password'>>) =>
    requestWithMessage<User>({ url: `/users/${id}`, method: 'PATCH', data: payload }),

  setStatus: (id: string, status: UserStatus) =>
    requestWithMessage<User>({ url: `/users/${id}/status`, method: 'PATCH', data: { status } }),

  resetPassword: (id: string, newPassword: string) =>
    requestWithMessage<null>({
      url: `/users/${id}/reset-password`,
      method: 'POST',
      data: { newPassword },
    }),
};

export const rolesApi = {
  list: () => request<Role[]>({ url: '/roles', method: 'GET' }),

  detail: (id: string) => request<Role>({ url: `/roles/${id}`, method: 'GET' }),

  permissions: () => request<Permission[]>({ url: '/permissions', method: 'GET' }),

  create: (payload: { name: string; description?: string; permissionCodes?: string[] }) =>
    requestWithMessage<Role>({ url: '/roles', method: 'POST', data: payload }),

  update: (id: string, payload: { name?: string; description?: string }) =>
    requestWithMessage<Role>({ url: `/roles/${id}`, method: 'PATCH', data: payload }),

  setPermissions: (id: string, permissionCodes: string[]) =>
    requestWithMessage<Role>({
      url: `/roles/${id}/permissions`,
      method: 'PUT',
      data: { permissionCodes },
    }),

  remove: (id: string) => requestWithMessage<null>({ url: `/roles/${id}`, method: 'DELETE' }),
};

export const commissionsApi = {
  list: (operation?: CommissionOperation) =>
    request<CommissionRule[]>({
      url: '/commission-rules',
      method: 'GET',
      params: cleanParams({ operation }),
    }),

  create: (payload: CommissionRulePayload) =>
    requestWithMessage<CommissionRule>({ url: '/commission-rules', method: 'POST', data: payload }),

  update: (id: string, payload: Partial<CommissionRulePayload>) =>
    requestWithMessage<CommissionRule>({
      url: `/commission-rules/${id}`,
      method: 'PATCH',
      data: payload,
    }),

  remove: (id: string) =>
    requestWithMessage<null>({ url: `/commission-rules/${id}`, method: 'DELETE' }),
};

export const auditApi = {
  list: (params: {
    page?: number;
    limit?: number;
    q?: string;
    userId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    result?: AuditResult;
    from?: string;
    to?: string;
  }) => requestPage<AuditLog>({ url: '/audit-logs', method: 'GET', params: cleanParams(params) }),

  detail: (id: string) => request<AuditLog>({ url: `/audit-logs/${id}`, method: 'GET' }),
};
