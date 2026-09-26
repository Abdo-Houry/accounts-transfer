import type { Paginated, PaginationMeta } from '../types/common';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export interface NormalizedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/**
 * Query-string values arrive as strings, so the input type is deliberately
 * loose: this is the one place that coerces and clamps them before they reach
 * a query builder.
 */
export interface PaginationInput {
  page?: number | string;
  limit?: number | string;
  sortBy?: string;
  sortOrder?: string;
}

export function normalizePagination(query: PaginationInput): NormalizedPagination {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function buildMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

export function paginate<T>(items: T[], page: number, limit: number, total: number): Paginated<T> {
  return { items, meta: buildMeta(page, limit, total) };
}

/**
 * Whitelist guard for `ORDER BY`: a sort column arriving from the query string
 * is never interpolated unless it is a known column of that endpoint.
 */
export function safeSort<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(requested as T) ? (requested as T) : fallback;
}

export function safeSortOrder(requested: string | undefined): 'ASC' | 'DESC' {
  return String(requested).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}
