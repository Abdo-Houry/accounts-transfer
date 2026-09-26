import { z } from 'zod';
import { AuditResult } from '../types/enums';
import { dateRangeQuery, paginationQuery, searchQuery, uuid } from './common.validation';

export const dashboardSchema = { query: dateRangeQuery };

export const recentActivitySchema = {
  query: z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }),
};

export const reportSchema = {
  query: dateRangeQuery.extend({
    currencyId: uuid.optional(),
    cashBoxId: uuid.optional(),
    createdById: uuid.optional(),
    customerId: uuid.optional(),
    status: z.string().trim().max(30).optional(),
    type: z.string().trim().max(30).optional(),
  }),
};

export const auditLogSchema = {
  query: paginationQuery
    .merge(searchQuery)
    .merge(dateRangeQuery)
    .extend({
      userId: uuid.optional(),
      action: z.string().trim().max(60).optional(),
      entityType: z.string().trim().max(40).optional(),
      entityId: uuid.optional(),
      result: z.nativeEnum(AuditResult).optional(),
    }),
};
