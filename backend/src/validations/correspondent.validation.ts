import { z } from 'zod';
import { CorrespondentStatus } from '../types/enums';
import { dateRangeQuery, paginationQuery, searchQuery, uuid } from './common.validation';

const name = z.string().trim().min(2).max(150);

const correspondentBody = z.object({
  nameAr: name,
  nameEn: name,
  nameTr: name,
  country: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(150).nullable().optional(),
  contactPerson: z.string().trim().max(150).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const listCorrespondentsSchema = {
  query: paginationQuery.merge(searchQuery).extend({
    status: z.nativeEnum(CorrespondentStatus).optional(),
  }),
};

export const createCorrespondentSchema = {
  body: correspondentBody.extend({
    // Becomes the suffix of the ledger account (`1300-HAMZA`), so it is kept to
    // the characters an account code can safely carry.
    code: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, hyphen and underscore only'),
  }),
};

export const updateCorrespondentSchema = {
  params: z.object({ id: uuid }),
  body: correspondentBody.partial(),
};

export const correspondentStatusSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ status: z.nativeEnum(CorrespondentStatus) }),
};

export const correspondentStatementSchema = {
  params: z.object({ id: uuid }),
  query: dateRangeQuery.extend({ currencyId: uuid.optional() }),
};
