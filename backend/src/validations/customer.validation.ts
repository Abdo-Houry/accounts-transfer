import { z } from 'zod';
import { CustomerStatus } from '../types/enums';
import {
  dateRangeQuery,
  paginationQuery,
  personName,
  phone,
  searchQuery,
  uuid,
} from './common.validation';

const customerBody = z.object({
  fullName: personName,
  phone,
  altPhone: z.string().trim().max(30).nullable().optional(),
  nationalId: z.string().trim().max(50).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const listCustomersSchema = {
  query: paginationQuery.merge(searchQuery).extend({
    status: z.nativeEnum(CustomerStatus).optional(),
  }),
};

export const createCustomerSchema = { body: customerBody };

export const updateCustomerSchema = {
  params: z.object({ id: uuid }),
  body: customerBody.partial(),
};

export const customerStatementSchema = {
  params: z.object({ id: uuid }),
  query: dateRangeQuery.extend({ currencyId: uuid.optional() }),
};

export const customerStatusSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ status: z.nativeEnum(CustomerStatus) }),
};
