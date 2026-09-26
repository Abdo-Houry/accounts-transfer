import { z } from 'zod';
import { CommissionMethod, CommissionOperation } from '../types/enums';
import { booleanish, nonNegativeDecimal, uuid } from './common.validation';

const ruleBody = z.object({
  name: z.string().trim().min(2).max(100),
  operation: z.nativeEnum(CommissionOperation),
  currencyId: uuid.nullable().optional(),
  method: z.nativeEnum(CommissionMethod),
  fixedAmount: nonNegativeDecimal.nullable().optional(),
  percent: nonNegativeDecimal.nullable().optional(),
  minAmount: nonNegativeDecimal.nullable().optional(),
  maxAmount: nonNegativeDecimal.nullable().optional(),
  fromAmount: nonNegativeDecimal.nullable().optional(),
  toAmount: nonNegativeDecimal.nullable().optional(),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: booleanish.optional(),
});

export const listCommissionRulesSchema = {
  query: z.object({ operation: z.nativeEnum(CommissionOperation).optional() }),
};

export const createCommissionRuleSchema = { body: ruleBody };

export const updateCommissionRuleSchema = {
  params: z.object({ id: uuid }),
  body: ruleBody.partial(),
};
