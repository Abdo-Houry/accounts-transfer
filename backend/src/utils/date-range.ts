import { ReportPeriod } from '../types/enums';
import type { DateRange } from '../types/common';
import { ApiError } from './api-error';

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/**
 * Turns `?period=week` (or an explicit from/to pair) into a concrete range.
 * `custom` requires both bounds; every other period ignores them.
 */
export function resolveDateRange(
  period: ReportPeriod | undefined,
  from?: string,
  to?: string,
  now: Date = new Date(),
): DateRange {
  const effective = period ?? (from || to ? ReportPeriod.CUSTOM : ReportPeriod.TODAY);

  if (effective === ReportPeriod.CUSTOM) {
    const start = from ? new Date(from) : startOfDay(now);
    const end = to ? new Date(to) : endOfDay(now);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw ApiError.badRequest('report.invalidRange');
    }
    if (start > end) throw ApiError.badRequest('report.invalidRange');
    return { from: start, to: end };
  }

  const end = endOfDay(now);
  const start = startOfDay(now);

  switch (effective) {
    case ReportPeriod.TODAY:
      return { from: start, to: end };
    case ReportPeriod.WEEK: {
      const weekStart = new Date(start);
      weekStart.setDate(weekStart.getDate() - 6);
      return { from: weekStart, to: end };
    }
    case ReportPeriod.MONTH: {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { from: monthStart, to: end };
    }
    case ReportPeriod.YEAR: {
      const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return { from: yearStart, to: end };
    }
    default:
      return { from: start, to: end };
  }
}

/** Splits a range into day buckets - used by dashboard trend charts. */
export function eachDay(range: DateRange): Date[] {
  const days: Date[] = [];
  const cursor = startOfDay(range.from);
  const limit = endOfDay(range.to);
  while (cursor <= limit) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
