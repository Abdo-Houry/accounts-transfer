export { BaseEntity } from './base.entity';
export { Permission } from './permission.entity';
export { Role } from './role.entity';
export { User } from './user.entity';
export { RefreshToken } from './refresh-token.entity';
export { Currency } from './currency.entity';
export { ExchangeRate } from './exchange-rate.entity';
export { CashBox } from './cash-box.entity';
export { CashBoxBalance } from './cash-box-balance.entity';
export { Account } from './account.entity';
export { Customer } from './customer.entity';
export { Correspondent } from './correspondent.entity';
export { CommissionRule } from './commission-rule.entity';
export { Transfer } from './transfer.entity';
export { TransferStatusHistory } from './transfer-status-history.entity';
export { CurrencyExchange } from './currency-exchange.entity';
export { FinancialTransaction } from './financial-transaction.entity';
export { LedgerEntry } from './ledger-entry.entity';
export { Voucher } from './voucher.entity';
export { AuditLog } from './audit-log.entity';

import { Permission } from './permission.entity';
import { Role } from './role.entity';
import { User } from './user.entity';
import { RefreshToken } from './refresh-token.entity';
import { Currency } from './currency.entity';
import { ExchangeRate } from './exchange-rate.entity';
import { CashBox } from './cash-box.entity';
import { CashBoxBalance } from './cash-box-balance.entity';
import { Account } from './account.entity';
import { Customer } from './customer.entity';
import { Correspondent } from './correspondent.entity';
import { CommissionRule } from './commission-rule.entity';
import { Transfer } from './transfer.entity';
import { TransferStatusHistory } from './transfer-status-history.entity';
import { CurrencyExchange } from './currency-exchange.entity';
import { FinancialTransaction } from './financial-transaction.entity';
import { LedgerEntry } from './ledger-entry.entity';
import { Voucher } from './voucher.entity';
import { AuditLog } from './audit-log.entity';

/** Registered with the DataSource - order is irrelevant, TypeORM resolves it. */
export const ENTITIES = [
  Permission,
  Role,
  User,
  RefreshToken,
  Currency,
  ExchangeRate,
  CashBox,
  CashBoxBalance,
  Account,
  Customer,
  Correspondent,
  CommissionRule,
  Transfer,
  TransferStatusHistory,
  CurrencyExchange,
  FinancialTransaction,
  LedgerEntry,
  Voucher,
  AuditLog,
];
