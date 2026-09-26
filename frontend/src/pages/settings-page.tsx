import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, Settings as SettingsIcon, UserRound } from 'lucide-react';
import { authApi, currenciesApi } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { FormField, LoadingState, PageHeader, PermissionGate } from '@/components/common';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';
import { LANGUAGES } from '@/i18n';
import { formatDateTime, localizedName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import type { Language } from '@/types/enums';

export default function SettingsPage() {
  const { t } = useI18n();
  const { can } = useAuth();

  return (
    <>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        icon={<SettingsIcon className="size-5" />}
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <UserRound className="size-4" />
            {t('settings.profile')}
          </TabsTrigger>
          <TabsTrigger value="security">
            <KeyRound className="size-4" />
            {t('settings.security')}
          </TabsTrigger>
          {can(PERMISSIONS.CURRENCY_READ) ? (
            <TabsTrigger value="currencies">{t('settings.currencies')}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="profile">
          <ProfilePanel />
        </TabsContent>
        <TabsContent value="security">
          <SecurityPanel />
        </TabsContent>
        <TabsContent value="currencies">
          <CurrenciesPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProfilePanel() {
  const { t, language, setLanguage } = useI18n();
  const { user, refreshUser } = useAuth();
  const feedback = useMutationFeedback([]);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [preferred, setPreferred] = useState<Language>(user?.language ?? language);

  const save = useMutation({
    mutationFn: () =>
      authApi.updateProfile({ fullName, phone: phone || null, language: preferred }),
    onSuccess: async (result) => {
      feedback.onSuccess(result);
      setLanguage(preferred);
      await refreshUser();
    },
    onError: feedback.onError,
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.profile')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('user.username')}>
            <Input value={user?.username ?? ''} disabled dir="ltr" />
          </FormField>
          <FormField label={t('auth.role')}>
            <Input value={user?.role.name ?? ''} disabled />
          </FormField>
          <FormField label={t('user.fullName')} required>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </FormField>
          <FormField label={t('user.phone')}>
            <Input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FormField>
          <FormField label={t('user.language')}>
            <Select value={preferred} onValueChange={(value) => setPreferred(value as Language)}>
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
          <FormField label={t('auth.lastLogin')}>
            <Input
              value={user?.lastLoginAt ? formatDateTime(user.lastLoginAt, language) : '-'}
              disabled
            />
          </FormField>
        </div>

        <Button onClick={() => save.mutate()} loading={save.isPending}>
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}

function SecurityPanel() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const feedback = useMutationFeedback([]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const change = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword, confirmPassword }),
    onSuccess: async (result) => {
      feedback.onSuccess(result);
      // Changing the password ends every session, including this one.
      await logout();
    },
    onError: feedback.onError,
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('auth.changePassword')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert tone="info">{t('auth.passwordChanged')}</Alert>

        <FormField label={t('auth.currentPassword')} required>
          <Input
            type="password"
            dir="ltr"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </FormField>
        <FormField label={t('auth.newPassword')} required hint={t('validation.passwordWeak')}>
          <Input
            type="password"
            dir="ltr"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </FormField>
        <FormField
          label={t('auth.confirmPassword')}
          required
          error={mismatch ? t('validation.passwordsDoNotMatch') : undefined}
        >
          <Input
            type="password"
            dir="ltr"
            invalid={mismatch}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </FormField>

        <Button
          onClick={() => change.mutate()}
          loading={change.isPending}
          disabled={!currentPassword || newPassword.length < 10 || mismatch}
        >
          {t('auth.changePassword')}
        </Button>
      </CardContent>
    </Card>
  );
}

function CurrenciesPanel() {
  const { t, language } = useI18n();
  const feedback = useMutationFeedback([['currencies'], ['rate-board']]);

  const currencies = useQuery({
    queryKey: ['currencies', { includeInactive: true }],
    queryFn: () => currenciesApi.list(true),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      currenciesApi.update(id, { isActive }),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      void currencies.refetch();
    },
    onError: feedback.onError,
  });

  if (currencies.isLoading) return <LoadingState />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.currencies')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('settings.currencyCode')}</TableHead>
              <TableHead>{t('customer.name')}</TableHead>
              <TableHead className="num-col">{t('settings.decimalPlaces')}</TableHead>
              <TableHead>{t('settings.isBase')}</TableHead>
              <TableHead>{t('settings.isActive')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(currencies.data ?? []).map((currency) => (
              <TableRow key={currency.id}>
                <TableCell className="numeric font-semibold">{currency.code}</TableCell>
                <TableCell>{localizedName(currency, language)}</TableCell>
                <TableCell className="numeric num-col">{currency.decimalPlaces}</TableCell>
                <TableCell>
                  {currency.isBase ? <Badge tone="gold">{t('settings.isBase')}</Badge> : null}
                </TableCell>
                <TableCell>
                  <PermissionGate
                    permission={PERMISSIONS.CURRENCY_UPDATE}
                    fallback={
                      <Badge tone={currency.isActive ? 'positive' : 'neutral'}>
                        {currency.isActive ? t('common.yes') : t('common.no')}
                      </Badge>
                    }
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={currency.isBase}
                      onClick={() =>
                        toggle.mutate({ id: currency.id, isActive: !currency.isActive })
                      }
                    >
                      <Badge tone={currency.isActive ? 'positive' : 'neutral'}>
                        {currency.isActive ? t('common.yes') : t('common.no')}
                      </Badge>
                    </Button>
                  </PermissionGate>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
