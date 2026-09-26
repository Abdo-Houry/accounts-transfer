import { type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@/components/ui';
import { EmptyState, ErrorState } from './index';
import { useI18n } from '@/context/i18n-context';
import { PAGE_SIZE_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { PaginationMeta } from '@/types/api';

export interface Column<T> {
  /** Stable key, also used for the React key of the cell. */
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  /** Anchor the column to one physical edge regardless of text direction. */
  numeric?: boolean;
  className?: string;
  headerClassName?: string;
  /** Hidden below the `md` breakpoint - use for secondary columns. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[] | undefined;
  rowKey: (row: T, index: number) => string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * One table for every list screen, so loading, empty and error states look and
 * behave identically everywhere.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  onRowClick,
  emptyTitle,
  emptyDescription,
  emptyAction,
  footer,
  className,
}: DataTableProps<T>) {
  if (error) {
    return (
      <Card className={className}>
        <ErrorState message={error} onRetry={onRetry} />
      </Card>
    );
  }

  if (isLoading && !rows) {
    return (
      <Card className={className}>
        <TableSkeleton columns={columns.length} />
      </Card>
    );
  }

  if (rows && rows.length === 0) {
    return (
      <Card className={className}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  column.numeric && 'num-col',
                  column.hideOnMobile && 'hidden md:table-cell',
                  column.headerClassName,
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).map((row, index) => (
            <TableRow
              key={rowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer')}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    column.numeric && 'num-col',
                    column.hideOnMobile && 'hidden md:table-cell',
                    column.className,
                  )}
                >
                  {column.render(row, index)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footer}
    </Card>
  );
}

export function Pagination({
  meta,
  onPageChange,
  onLimitChange,
}: {
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}) {
  const { t, direction } = useI18n();
  if (!meta || meta.total === 0) return null;

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  // In RTL the "previous" affordance points the other way.
  const PrevIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = direction === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[var(--text-muted)]">
        {t('common.showing', { from, to, total: meta.total })}
      </p>

      <div className="flex items-center gap-3">
        {onLimitChange ? (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-xs text-[var(--text-muted)]">{t('common.rowsPerPage')}</span>
            <Select
              value={String(meta.limit)}
              onValueChange={(value) => onLimitChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!meta.hasPrev}
            onClick={() => onPageChange(meta.page - 1)}
            aria-label={t('common.previous')}
          >
            <PrevIcon />
          </Button>
          <span className="numeric px-2 text-sm text-[var(--text-secondary)]">
            {meta.page} / {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!meta.hasNext}
            onClick={() => onPageChange(meta.page + 1)}
            aria-label={t('common.next')}
          >
            <NextIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
