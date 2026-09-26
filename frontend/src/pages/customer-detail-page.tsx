import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Ban, ShieldCheck, UserRound } from 'lucide-react';
import { customersApi } from '@/api';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Money,
  PageHeader,
  PermissionGate,
  StatusBadge,
} from '@/components/common';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { formatAmount, formatDateTime } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { CustomerStatus } from '@/types/enums';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useI18n();
  const feedback = useMutationFeedback([['customers'], ['customer-statement']]);

  const statement = useQuery({
    queryKey: ['customer-statement', id],
    queryFn: () => customersApi.statement(id as string),
    enabled: Boolean(id),
  });

  const setStatus = useMutation({
    mutationFn: (status: CustomerStatus) => customersApi.setStatus(id as string, status),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      void statement.refetch();
    },
    onError: feedback.onError,
  });

  if (statement.isLoading) return <LoadingState />;
  if (statement.isError || !statement.data) {
    return <ErrorState message={t('customer.notFound')} onRetry={() => statement.refetch()} />;
  }

  const { customer, transfersSent, transfersReceived, exchanges, vouchers, balances } =
    statement.data;
  const isBlocked = customer.status === CustomerStatus.BLOCKED;

  return (
    <>
      <PageHeader
        title={customer.fullName}
        subtitle={`${customer.customerNo} · ${customer.phone}`}
        icon={<UserRound className="size-5" />}
        actions={
          <>
            <StatusBadge value={customer.status} />
            <PermissionGate permission={PERMISSIONS.CUSTOMER_UPDATE}>
              <Button
                variant={isBlocked ? 'outline' : 'danger'}
                loading={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate(isBlocked ? CustomerStatus.ACTIVE : CustomerStatus.BLOCKED)
                }
              >
                {isBlocked ? <ShieldCheck /> : <Ban />}
                {isBlocked ? t('customer.unblock') : t('customer.block')}
              </Button>
            </PermissionGate>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t('customer.netPosition')}</CardTitle>
            <p className="text-xs text-[var(--text-muted)]">{t('customer.netPositionHint')}</p>
          </CardHeader>
          <CardContent>
            {balances.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('common.noResults')}</p>
            ) : (
              <ul className="space-y-3">
                {balances.map((row) => {
                  const net = Number(row.net);
                  return (
                    <li key={row.currencyId} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="numeric text-sm text-[var(--text-muted)]">
                          {row.currencyCode}
                        </span>
                        <Money value={row.net} signed showCode={false} />
                      </div>
                      {/* The two sides behind the net, so the figure can be
                          checked rather than taken on trust. */}
                      <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
                        <span>
                          {t('ledger.debit')}{' '}
                          <span className="numeric">
                            {formatAmount(row.debit, row.decimalPlaces, language)}
                          </span>
                          {'  ·  '}
                          {t('ledger.credit')}{' '}
                          <span className="numeric">
                            {formatAmount(row.credit, row.decimalPlaces, language)}
                          </span>
                        </span>
                        <span>
                          {net > 0
                            ? t('customer.officeOwes')
                            : net < 0
                              ? t('customer.owesOffice')
                              : t('customer.square')}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <dl className="mt-6 space-y-3 border-t border-[var(--border-subtle)] pt-4 text-sm">
              <Row label={t('customer.nationalId')} value={customer.nationalId} />
              <Row label={t('customer.altPhone')} value={customer.altPhone} />
              <Row
                label={t('customer.city')}
                value={[customer.city, customer.country].filter(Boolean).join(', ') || null}
              />
              <Row label={t('customer.address')} value={customer.address} />
              <Row label={t('common.notes')} value={customer.notes} />
            </dl>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="statement">
            <TabsList>
              <TabsTrigger value="statement">{t('customer.accountStatement')}</TabsTrigger>
              <TabsTrigger value="sent">{t('customer.transfersSent')}</TabsTrigger>
              <TabsTrigger value="received">{t('customer.transfersReceived')}</TabsTrigger>
              <TabsTrigger value="exchanges">{t('customer.exchanges')}</TabsTrigger>
              <TabsTrigger value="vouchers">{t('customer.vouchers')}</TabsTrigger>
            </TabsList>

            <TabsContent value="statement">
              <AccountStatementTab customerId={customer.id} />
            </TabsContent>

            <TabsContent value="sent">
              <Card>
                <CardContent className="p-0 pb-2">
                  {transfersSent.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>{t('transfer.no')}</TableHead>
                          <TableHead>{t('transfer.beneficiary')}</TableHead>
                          <TableHead className="num-col">{t('common.amount')}</TableHead>
                          <TableHead>{t('common.status')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transfersSent.map((transfer) => (
                          <TableRow key={transfer.id}>
                            <TableCell>
                              <Link
                                to={`/transfers/${transfer.id}`}
                                className="numeric text-brand-600 hover:underline"
                              >
                                {transfer.transferNo}
                              </Link>
                            </TableCell>
                            <TableCell>{transfer.beneficiaryName}</TableCell>
                            <TableCell className="num-col">
                              <Money value={transfer.amount} currency={transfer.currency} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge value={transfer.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="received">
              <Card>
                <CardContent className="p-0 pb-2">
                  {transfersReceived.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>{t('transfer.no')}</TableHead>
                          <TableHead>{t('transfer.sender')}</TableHead>
                          <TableHead className="num-col">{t('transfer.payoutAmount')}</TableHead>
                          <TableHead>{t('common.status')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transfersReceived.map((transfer) => (
                          <TableRow key={transfer.id}>
                            <TableCell>
                              <Link
                                to={`/transfers/${transfer.id}`}
                                className="numeric text-brand-600 hover:underline"
                              >
                                {transfer.transferNo}
                              </Link>
                            </TableCell>
                            <TableCell>{transfer.senderName}</TableCell>
                            <TableCell className="num-col">
                              <Money
                                value={transfer.payoutAmount}
                                currency={transfer.payoutCurrency}
                              />
                            </TableCell>
                            <TableCell>
                              <StatusBadge value={transfer.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="exchanges">
              <Card>
                <CardContent className="p-0 pb-2">
                  {exchanges.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>{t('exchange.no')}</TableHead>
                          <TableHead className="num-col">{t('exchange.fromAmount')}</TableHead>
                          <TableHead className="num-col">{t('exchange.toAmount')}</TableHead>
                          <TableHead>{t('common.date')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exchanges.map((exchange) => (
                          <TableRow key={exchange.id}>
                            <TableCell className="numeric">{exchange.exchangeNo}</TableCell>
                            <TableCell className="num-col">
                              <Money value={exchange.fromAmount} currency={exchange.fromCurrency} />
                            </TableCell>
                            <TableCell className="num-col">
                              <Money value={exchange.toAmount} currency={exchange.toCurrency} />
                            </TableCell>
                            <TableCell className="text-sm text-[var(--text-muted)]">
                              {formatDateTime(exchange.createdAt, language)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vouchers">
              <Card>
                <CardContent className="p-0 pb-2">
                  {vouchers.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>{t('voucher.no')}</TableHead>
                          <TableHead>{t('voucher.type')}</TableHead>
                          <TableHead className="num-col">{t('common.amount')}</TableHead>
                          <TableHead>{t('common.reason')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vouchers.map((voucher) => (
                          <TableRow key={voucher.id}>
                            <TableCell className="numeric">{voucher.voucherNo}</TableCell>
                            <TableCell>
                              <StatusBadge value={voucher.type} />
                            </TableCell>
                            <TableCell className="num-col">
                              <Money value={voucher.amount} currency={voucher.currency} />
                            </TableCell>
                            <TableCell className="text-sm">{voucher.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}

/**
 * The customer's own account movement: debit, credit and the balance each line
 * left behind, oldest first.
 *
 * Restricted server-side to the customer control accounts (1100 / 2100). The
 * cash leg of a voucher belongs to the office's box, not to the customer, and
 * including it is what used to make every balance read zero.
 */
function AccountStatementTab({ customerId }: { customerId: string }) {
  const { t, language } = useI18n();
  const query = useQuery({
    queryKey: ['customer-account-statement', customerId],
    queryFn: () => customersApi.accountStatement(customerId),
  });

  if (query.isLoading) return <LoadingState />;
  const lines = query.data ?? [];
  if (lines.length === 0) {
    return <EmptyState title={t('common.noResults')} description={t('customer.square')} />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('common.dateTime')}</TableHead>
              <TableHead>{t('ledger.reference')}</TableHead>
              <TableHead>{t('ledger.description')}</TableHead>
              <TableHead>{t('common.currency')}</TableHead>
              <TableHead className="num-col">{t('ledger.debit')}</TableHead>
              <TableHead className="num-col">{t('ledger.credit')}</TableHead>
              <TableHead className="num-col">{t('common.balance')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.entryId}>
                <TableCell className="text-sm">
                  {formatDateTime(line.occurredAt, language)}
                </TableCell>
                <TableCell>
                  <span className="numeric text-xs">{line.referenceNo}</span>
                </TableCell>
                <TableCell className="text-sm">{line.description}</TableCell>
                <TableCell>
                  <span className="numeric">{line.currencyCode}</span>
                </TableCell>
                <TableCell className="num-col">
                  <span className="numeric">
                    {Number(line.debit) === 0
                      ? '-'
                      : formatAmount(line.debit, line.decimalPlaces, language)}
                  </span>
                </TableCell>
                <TableCell className="num-col">
                  <span className="numeric">
                    {Number(line.credit) === 0
                      ? '-'
                      : formatAmount(line.credit, line.decimalPlaces, language)}
                  </span>
                </TableCell>
                <TableCell className="num-col">
                  <span className="numeric font-medium">
                    {formatAmount(line.balance, line.decimalPlaces, language)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
