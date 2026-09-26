import { z } from 'zod';
import { Language } from '../types/enums';
import { password, personName } from './common.validation';

export const loginSchema = {
  body: z.object({
    username: z.string().trim().min(3).max(50),
    password: z.string().min(1).max(128),
  }),
};

export const changePasswordSchema = {
  body: z
    .object({
      currentPassword: z.string().min(1).max(128),
      newPassword: password,
      confirmPassword: z.string().min(1).max(128),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      path: ['newPassword'],
      message: 'The new password must differ from the current one',
    }),
};

export const updateProfileSchema = {
  body: z.object({
    fullName: personName.optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    language: z.nativeEnum(Language).optional(),
  }),
};
