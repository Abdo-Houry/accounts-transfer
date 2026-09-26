import type { Language } from './enums';

/** Everything a service needs to know about the caller. */
export interface RequestContext {
  userId: string;
  username: string;
  roleName: string;
  permissions: ReadonlySet<string>;
  language: Language;
  ipAddress: string;
  userAgent: string;
  defaultCashBoxId: string | null;
}

export interface PaginationQuery {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface DateRange {
  from: Date;
  to: Date;
}

/** A localised label carried to the frontend so the UI never re-translates data. */
export interface LocalizedName {
  ar: string;
  en: string;
  tr: string;
}
