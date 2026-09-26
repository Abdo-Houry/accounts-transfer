import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, Plus, Users } from 'lucide-react';
import { rolesApi, usersApi } from '@/api/admin.api';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import {
  FormField,
  PageHeader,
  PermissionGate,
  SearchInput,
  StatusBadge,
} from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { CashBoxSelect } from '@/components/common/pickers';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useDebouncedValue } from '@/features/reference/use-debounced-value';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { LANGUAGES } from '@/i18n';
import { Language, UserStatus } from '@/types/enums';
import type { User } from '@/types/api';

export default function UsersPage() {
  const { t, language } = useI18n();
  const feedback = useMutationFeedback([['users']]);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [suspending, setSuspending] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  const debounced = useDebouncedValue(search, 350);

  const query = useQuery({
    queryKey: ['users', { page, q: debounced }],
    queryFn: () => usersApi.list({ page, limit: 25, q: debounced || undefined }),
    placeholderData: (previous) => previous,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      usersApi.setStatus(id, status),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      setSuspending(null);
      void query.refetch();
    },
    onError: feedback.onError,
  });

  const columns: Array<Column<User>> = [
    {
      key: 'username',
      header: t('user.username'),
      render: (row) => <span className="numeric font-medium">{row.username}</span>,
    },
    { key: 'fullName', header: t('user.fullName'), render: (row) => row.fullName },
    {
      key: 'role',
      header: t('user.role'),
      render: (row) => <Badge tone="brand">{row.role?.name ?? '-'}</Badge>,
    },
    {
      key: 'cashBox',
      header: t('user.defaultCashBox'),
      hideOnMobile: true,
      render: (row) => row.defaultCashBox?.code ?? '-',
    },
    {
      key: 'lastLogin',
      header: t('user.lastLogin'),
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-[var(--text-muted)]">
          {row.lastLoginAt ? formatDateTime(row.lastLoginAt, language) : t('user.neverLoggedIn')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <PermissionGate permission={PERMISSIONS.USER_UPDATE}>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setResetting(row)}>
              <KeyRound />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                row.status === UserStatus.ACTIVE
                  ? setSuspending(row)
                  : setStatus.mutate({ id: row.id, status: UserStatus.ACTIVE })
              }
            >
              {row.status === UserStatus.ACTIVE ? t('user.suspend') : t('user.activate')}
            </Button>
          </div>
        </PermissionGate>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('user.title')}
        subtitle={t('user.subtitle')}
        icon={<Users className="size-5" />}
        actions={
          <PermissionGate permission={PERMISSIONS.USER_CREATE}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              {t('user.new')}
            </Button>
          </PermissionGate>
        }
      />

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          className="w-full sm:w-80"
        />
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? t('common.errorTitle') : null}
        onRetry={() => query.refetch()}
        footer={<Pagination meta={query.data?.meta} onPageChange={setPage} />}
      />

      <CreateUserDialog
        key={createOpen ? 'create-open' : 'create-closed'}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void query.refetch()}
      />

      <ConfirmDialog
        open={suspending !== null}
        onOpenChange={(open) => !open && setSuspending(null)}
        title={t('user.suspend')}
        description={
          suspending ? t('user.confirmSuspend', { name: suspending.fullName }) : undefined
        }
        tone="danger"
        loading={setStatus.isPending}
        onConfirm={() => {
          if (suspending) setStatus.mutate({ id: suspending.id, status: UserStatus.SUSPENDED });
        }}
      />

      <ResetPasswordDialog
        key={resetting ? `reset-${resetting.id}` : 'reset-closed'}
        user={resetting}
        onClose={() => setResetting(null)}
      />
    </>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['users']]);
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });

  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    phone: '',
    roleId: '',
    defaultCashBoxId: '',
    language: Language.AR as Language,
  });

  const create = useMutation({
    mutationFn: () =>
      usersApi.create({
        username: form.username,
        password: form.password,
        fullName: form.fullName,
        email: form.email || null,
        phone: form.phone || null,
        roleId: form.roleId,
        defaultCashBoxId: form.defaultCashBoxId || null,
        language: form.language,
      }),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      onCreated();
      onOpenChange(false);
      setForm({ ...form, username: '', password: '', fullName: '', email: '', phone: '' });
    },
    onError: feedback.onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('user.new')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('user.username')} required>
            <Input
              dir="ltr"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
            />
          </FormField>
          <FormField label={t('auth.password')} required hint={t('validation.passwordWeak')}>
            <Input
              type="password"
              dir="ltr"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </FormField>
          <FormField label={t('user.fullName')} required className="sm:col-span-2">
            <Input
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            />
          </FormField>
          <FormField label={t('user.email')}>
            <Input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </FormField>
          <FormField label={t('user.phone')}>
            <Input
              dir="ltr"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </FormField>
          <FormField label={t('user.role')} required>
            <Select value={form.roleId} onValueChange={(value) => setForm({ ...form, roleId: value })}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                {(roles.data ?? []).map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t('user.defaultCashBox')}>
            <CashBoxSelect
              value={form.defaultCashBoxId || undefined}
              onChange={(value) => setForm({ ...form, defaultCashBoxId: value })}
            />
          </FormField>
          <FormField label={t('user.language')}>
            <Select
              value={form.language}
              onValueChange={(value) => setForm({ ...form, language: value as Language })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={!form.username || !form.password || !form.fullName || !form.roleId}
          >
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['users']]);
  const [password, setPassword] = useState('');

  const reset = useMutation({
    mutationFn: () => usersApi.resetPassword(user!.id, password),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      setPassword('');
      onClose();
    },
    onError: feedback.onError,
  });

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('user.resetPassword')}</DialogTitle>
        </DialogHeader>

        <FormField label={t('auth.newPassword')} required hint={t('validation.passwordWeak')}>
          <Input
            type="password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => reset.mutate()}
            loading={reset.isPending}
            disabled={password.length < 10}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
