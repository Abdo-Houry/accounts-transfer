import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Save, TrendingUp } from 'lucide-react';
import { currenciesApi } from '@/api';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  NumericInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { Badge } from '@/components/ui';
import { EmptyState, LoadingState, PageHeader, PermissionGate } from '@/components/common';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime, formatRate, localizedName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';

interface DraftRate {
  buyRate: string;
  sellRate: string;
}

/**
 * The rate board.
 *
 * Editing is a single "publish the board" action rather than a save per row:
 * the office normally moves several rates together, and one bulk call means
 * they all take effect at the same instant instead of half a board being live.
 */
export default function RatesPage() {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const feedback = useMutationFeedback([['rate-board'], ['rate-history']]);

  const board = useQuery({ queryKey: ['rate-board'], queryFn: () => currenciesApi.board() });
  const history = useQuery({
    queryKey: ['rate-history'],
    queryFn: () => currenciesApi.history({ limit: 100 }),
  });

  const [drafts, setDrafts] = useState<Record<string, DraftRate>>({});

  // Seed the editable fields from the published board whenever it reloads.
  useEffect(() => {
    if (!board.data) return;
    const next: Record<string, DraftRate> = {};
    for (const row of board.data) {
      if (row.currency.isBase) continue;
      next[row.currency.id] = {
        buyRate: row.rate?.buyRate ?? '',
        sellRate: row.rate?.sellRate ?? '',
      };
    }
    setDrafts(next);
  }, [board.data]);

  const publish = useMutation({
    mutationFn: () => {
      const rates = Object.entries(drafts)
        .filter(([, value]) => Number(value.buyRate) > 0 && Number(value.sellRate) > 0)
        .map(([currencyId, value]) => ({
          currencyId,
          buyRate: value.buyRate,
          sellRate: value.sellRate,
        }));
      return currenciesApi.setRatesBulk(rates);
    },
    onSuccess: (result) => {
      feedback.onSuccess(result);
      void queryClient.invalidateQueries({ queryKey: ['rate-board'] });
    },
    onError: feedback.onError,
  });

  const isDirty = Boolean(
    board.data?.some((row) => {
      if (row.currency.isBase) return false;
      const draft = drafts[row.currency.id];
      if (!draft) return false;
      return draft.buyRate !== (row.rate?.buyRate ?? '') || draft.sellRate !== (row.rate?.sellRate ?? '');
    }),
  );

  return (
    <>
      <PageHeader
        title={t('rate.title')}
        subtitle={t('rate.subtitle')}
        icon={<TrendingUp className="size-5" />}
        actions={
          <PermissionGate permission={PERMISSIONS.RATE_UPDATE}>
            <Button onClick={() => publish.mutate()} loading={publish.isPending} disabled={!isDirty}>
              <Save />
              {t('rate.saveAll')}
            </Button>
          </PermissionGate>
        }
      />

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">{t('rate.current')}</TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-4" />
            {t('rate.history')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <Card>
            <CardContent className="p-0">
              {board.isLoading ? (
                <LoadingState />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('common.currency')}</TableHead>
                      <TableHead className="num-col">{t('rate.buy')}</TableHead>
                      <TableHead className="num-col">{t('rate.sell')}</TableHead>
                      <TableHead className="hidden num-col md:table-cell">
                        {t('rate.spread')}
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        {t('rate.effectiveFrom')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(board.data ?? []).map((row) => {
                      const draft = drafts[row.currency.id];
                      const spread =
                        draft && Number(draft.sellRate) && Number(draft.buyRate)
                          ? Number(draft.sellRate) - Number(draft.buyRate)
                          : null;

                      return (
                        <TableRow key={row.currency.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="numeric font-semibold">{row.currency.code}</span>
                              <span className="text-sm text-[var(--text-muted)]">
                                {localizedName(row.currency, language)}
                              </span>
                              {row.currency.isBase ? (
                                <Badge tone="gold">{t('rate.baseCurrency')}</Badge>
                              ) : null}
                            </div>
                          </TableCell>

                          {row.currency.isBase ? (
                            <>
                              {/* Two of the five columns are hidden below md,
                                  so the filler spans 2 there and 4 above. */}
                              <TableCell
                                colSpan={2}
                                className="text-center text-sm text-[var(--text-muted)]"
                              >
                                {t('rate.baseCurrency')}
                              </TableCell>
                              <TableCell colSpan={2} className="hidden md:table-cell" />
                            </>
                          ) : (
                            <>
                              <TableCell className="num-col">
                                <PermissionGate
                                  permission={PERMISSIONS.RATE_UPDATE}
                                  fallback={
                                    <span className="numeric">
                                      {formatRate(row.rate?.buyRate, language)}
                                    </span>
                                  }
                                >
                                  <NumericInput
                                    className="w-32 text-end"
                                    value={draft?.buyRate ?? ''}
                                    onChange={(event) =>
                                      setDrafts((current) => ({
                                        ...current,
                                        [row.currency.id]: {
                                          buyRate: event.target.value,
                                          sellRate: current[row.currency.id]?.sellRate ?? '',
                                        },
                                      }))
                                    }
                                  />
                                </PermissionGate>
                              </TableCell>

                              <TableCell className="num-col">
                                <PermissionGate
                                  permission={PERMISSIONS.RATE_UPDATE}
                                  fallback={
                                    <span className="numeric">
                                      {formatRate(row.rate?.sellRate, language)}
                                    </span>
                                  }
                                >
                                  <NumericInput
                                    className="w-32 text-end"
                                    value={draft?.sellRate ?? ''}
                                    onChange={(event) =>
                                      setDrafts((current) => ({
                                        ...current,
                                        [row.currency.id]: {
                                          buyRate: current[row.currency.id]?.buyRate ?? '',
                                          sellRate: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </PermissionGate>
                              </TableCell>

                              <TableCell className="hidden num-col md:table-cell">
                                <span className="numeric text-[var(--text-muted)]">
                                  {spread === null ? '-' : formatRate(String(spread), language)}
                                </span>
                              </TableCell>

                              <TableCell className="hidden text-sm text-[var(--text-muted)] md:table-cell">
                                {row.rate ? (
                                  formatDateTime(row.rate.effectiveFrom, language)
                                ) : (
                                  <Badge tone="warning">{t('rate.noRate')}</Badge>
                                )}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Alert tone="info" className="mt-4">
            {t('rate.historyHint')}
          </Alert>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>{t('rate.history')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {history.isLoading ? (
                <LoadingState />
              ) : (history.data ?? []).length === 0 ? (
                <EmptyState />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('common.currency')}</TableHead>
                      <TableHead className="num-col">{t('rate.buy')}</TableHead>
                      <TableHead className="num-col">{t('rate.sell')}</TableHead>
                      <TableHead>{t('rate.effectiveFrom')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('rate.effectiveTo')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('rate.changedBy')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(history.data ?? []).map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="numeric font-medium">
                          {rate.currency?.code}
                          {rate.isActive ? (
                            <Badge tone="positive" className="ms-2">
                              {t('rate.current')}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="numeric num-col">
                          {formatRate(rate.buyRate, language)}
                        </TableCell>
                        <TableCell className="numeric num-col">
                          {formatRate(rate.sellRate, language)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDateTime(rate.effectiveFrom, language)}
                        </TableCell>
                        <TableCell className="hidden text-sm text-[var(--text-muted)] md:table-cell">
                          {rate.effectiveTo ? formatDateTime(rate.effectiveTo, language) : '-'}
                        </TableCell>
                        <TableCell className="hidden text-sm text-[var(--text-muted)] md:table-cell">
                          {rate.createdBy?.fullName ?? '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
