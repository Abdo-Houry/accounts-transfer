import { z } from 'zod';
import { Language, UserStatus } from '../types/enums';
import { paginationQuery, password, personName, searchQuery, uuid } from './common.validation';

export const listUsersSchema = {
  query: paginationQuery.merge(searchQuery).extend({
    roleId: uuid.optional(),
    status: z.nativeEnum(UserStatus).optional(),
  }),
};

export const createUserSchema = {
  body: z.object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Username may contain letters, digits, dot, underscore and dash'),
    password,
    fullName: personName,
    email: z.string().trim().email().max(150).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    roleId: uuid,
    defaultCashBoxId: uuid.nullable().optional(),
    language: z.nativeEnum(Language).optional(),
  }),
};

export const updateUserSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    fullName: personName.optional(),
    email: z.string().trim().email().max(150).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    roleId: uuid.optional(),
    defaultCashBoxId: uuid.nullable().optional(),
    language: z.nativeEnum(Language).optional(),
  }),
};

export const userStatusSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ status: z.nativeEnum(UserStatus) }),
};

export const resetPasswordSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ newPassword: password }),
};
