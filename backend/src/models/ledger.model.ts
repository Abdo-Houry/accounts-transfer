import type { EntryDirection, TransactionType } from '../types/enums';
import type { MessageParams } from '../utils/i18n';

/**
 * One line of a journal entry, as services describe it.
 * The account may be given by chart-of-accounts `code` or by `accountId`.
 */
export interface PostingLine {
  accountCode?: string;
  accountId?: string;
  /** Set for cash lines - drives the cash box balance and the box statement. */
  cashBoxId?: string | null;
  customerId?: string | null;
  /** Set on a leg routed through a partner office - drives their statement. */
  correspondentId?: string | null;
  currencyId: string;
  direction: EntryDirection;
  /** Always positive; the side is carried by `direction`. */
  amount: string;
  description?: string;
  /** Translatable form of `description` - see `PostingRequest`. */
  descriptionKey?: string;
  descriptionParams?: MessageParams;
}

export interface PostingRequest {
  type: TransactionType;
  sourceType: string;
  sourceId?: string | null;
  description: string;
  /**
   * The same sentence as `description`, but as a catalogue key plus params so
   * the journal can be read in the operator's language. `description` stays
   * the written record and the English fallback; the key is what the read
   * layer renders when one is present.
   */
  descriptionKey?: string;
  descriptionParams?: MessageParams;
  occurredAt?: Date;
  reversesTransactionId?: string | null;
  lines: PostingLine[];
}

export interface BalanceDelta {
  cashBoxId: string;
  currencyId: string;
  /** Signed: positive means money entered the box. */
  delta: string;
}

export interface AccountBalanceRow {
  accountId: string;
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  accountNameTr: string;
  currencyId: string;
  currencyCode: string;
  debit: string;
  credit: string;
  balance: string;
}
