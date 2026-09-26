import { AccountType, EntryDirection } from '../types/enums';

/**
 * Chart of accounts (see docs/01-architecture.md section 4).
 *
 * These codes are referenced by name from the posting services, so a typo is a
 * compile error rather than a silent mis-posting.
 */
export const ACCOUNT_CODES = {
  CASH: '1000',
  CUSTOMER_RECEIVABLE: '1100',
  TRANSFERS_RECEIVABLE: '1200',
  CORRESPONDENT_CURRENT: '1300',
  TRANSFERS_PAYABLE: '2000',
  CUSTOMER_PAYABLE: '2100',
  EQUITY_OPENING: '3000',
  FX_POSITION: '3900',
  COMMISSION_INCOME: '4000',
  OTHER_INCOME: '4100',
  OPERATING_EXPENSE: '5000',
  FX_RESULT: '5100',
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

/** The per-correspondent current account code, e.g. `1300-HAMZA`. */
export function correspondentAccountCode(correspondentCode: string): string {
  return `${ACCOUNT_CODES.CORRESPONDENT_CURRENT}-${correspondentCode.toUpperCase()}`;
}

/** The per-cash-box child account code, e.g. `1000-MAIN`. */
export function cashAccountCode(cashBoxCode: string): string {
  return `${ACCOUNT_CODES.CASH}-${cashBoxCode.toUpperCase()}`;
}

export interface AccountSeed {
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  type: AccountType;
  normalBalance: EntryDirection;
  parentCode?: string;
}

export const ACCOUNT_SEEDS: readonly AccountSeed[] = [
  {
    code: ACCOUNT_CODES.CASH,
    nameAr: 'النقدية في الصناديق',
    nameEn: 'Cash on hand',
    nameTr: 'Kasadaki nakit',
    type: AccountType.ASSET,
    normalBalance: EntryDirection.DEBIT,
  },
  {
    code: ACCOUNT_CODES.CUSTOMER_RECEIVABLE,
    nameAr: 'ذمم العملاء المدينة',
    nameEn: 'Customer receivable',
    nameTr: 'Musteri alacaklari',
    type: AccountType.ASSET,
    normalBalance: EntryDirection.DEBIT,
  },
  {
    code: ACCOUNT_CODES.TRANSFERS_RECEIVABLE,
    nameAr: 'حوالات مستحقة القبض',
    nameEn: 'Transfers receivable',
    nameTr: 'Alacak havaleler',
    type: AccountType.ASSET,
    normalBalance: EntryDirection.DEBIT,
  },
  {
    code: ACCOUNT_CODES.CORRESPONDENT_CURRENT,
    nameAr: 'الحسابات الجارية للمراسلين',
    nameEn: 'Correspondent current accounts',
    nameTr: 'Muhabir cari hesaplari',
    // Filed under assets because that is the usual position - a partner
    // holding funds for us. A credit balance simply means the relationship is
    // the other way round that month, and the balance sheet presents it on the
    // liability side from the sign rather than needing a second account.
    type: AccountType.ASSET,
    normalBalance: EntryDirection.DEBIT,
  },
  {
    code: ACCOUNT_CODES.TRANSFERS_PAYABLE,
    nameAr: 'حوالات مستحقة الدفع',
    nameEn: 'Transfers payable',
    nameTr: 'Odenecek havaleler',
    type: AccountType.LIABILITY,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    code: ACCOUNT_CODES.CUSTOMER_PAYABLE,
    nameAr: 'ذمم العملاء الدائنة',
    nameEn: 'Customer payable',
    nameTr: 'Musteri borclari',
    type: AccountType.LIABILITY,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    code: ACCOUNT_CODES.EQUITY_OPENING,
    nameAr: 'رأس المال والأرصدة الافتتاحية',
    nameEn: 'Owner equity and opening balances',
    nameTr: 'Sermaye ve acilis bakiyeleri',
    type: AccountType.EQUITY,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    code: ACCOUNT_CODES.FX_POSITION,
    nameAr: 'مركز العملات (حساب المقاصة)',
    nameEn: 'FX position (currency clearing)',
    nameTr: 'Doviz pozisyonu (mahsup hesabi)',
    type: AccountType.EQUITY,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    code: ACCOUNT_CODES.COMMISSION_INCOME,
    nameAr: 'إيرادات العمولات',
    nameEn: 'Commission income',
    nameTr: 'Komisyon geliri',
    type: AccountType.REVENUE,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    code: ACCOUNT_CODES.OTHER_INCOME,
    nameAr: 'إيرادات أخرى',
    nameEn: 'Other income',
    nameTr: 'Diger gelirler',
    type: AccountType.REVENUE,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    code: ACCOUNT_CODES.OPERATING_EXPENSE,
    nameAr: 'المصاريف التشغيلية',
    nameEn: 'Operating expenses',
    nameTr: 'Isletme giderleri',
    type: AccountType.EXPENSE,
    normalBalance: EntryDirection.DEBIT,
  },
  {
    code: ACCOUNT_CODES.FX_RESULT,
    nameAr: 'أرباح وخسائر فروقات العملة',
    nameEn: 'Realised FX result',
    nameTr: 'Gerceklesen kur farki',
    type: AccountType.EXPENSE,
    normalBalance: EntryDirection.DEBIT,
  },
];
