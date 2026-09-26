import { z } from 'zod';
import { uuid } from './common.validation';

const permissionCodes = z.array(z.string().trim().min(3).max(80)).max(200);

export const createRoleSchema = {
  body: z.object({
    name: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Role name may contain letters, digits, underscore and dash'),
    description: z.string().trim().max(200).optional(),
    permissionCodes: permissionCodes.optional(),
  }),
};

export const updateRoleSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    name: z.string().trim().min(3).max(50).optional(),
    description: z.string().trim().max(200).optional(),
  }),
};

export const setRolePermissionsSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ permissionCodes }),
};
