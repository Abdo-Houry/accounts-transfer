import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save, ShieldCheck } from 'lucide-react';
import { rolesApi } from '@/api/admin.api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Separator,
} from '@/components/ui';
import { LoadingState, PageHeader, PermissionGate } from '@/components/common';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';

/**
 * Roles and permissions.
 *
 * Editing a role bumps the token version of everyone holding it on the server,
 * so a revoked permission takes effect on their very next request rather than
 * when their access token happens to expire.
 */
export default function RolesPage() {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['roles']]);

  const roles = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });
  const permissions = useQuery({
    queryKey: ['permissions'],
    queryFn: () => rolesApi.permissions(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const selectedRole = roles.data?.find((role) => role.id === selectedId) ?? roles.data?.[0];

  // Load the role's current permissions into the editor when the selection changes.
  useEffect(() => {
    if (!selectedRole) return;
    setSelectedId(selectedRole.id);
    setSelectedCodes(new Set((selectedRole.permissions ?? []).map((item) => item.code)));
  }, [selectedRole?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ code: string; description: string }>>();
    for (const permission of permissions.data ?? []) {
      const list = map.get(permission.module) ?? [];
      list.push({ code: permission.code, description: permission.description });
      map.set(permission.module, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions.data]);

  const save = useMutation({
    mutationFn: () => rolesApi.setPermissions(selectedRole!.id, [...selectedCodes]),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      void roles.refetch();
    },
    onError: feedback.onError,
  });

  const isDirty = useMemo(() => {
    if (!selectedRole) return false;
    const current = new Set((selectedRole.permissions ?? []).map((item) => item.code));
    if (current.size !== selectedCodes.size) return true;
    for (const code of selectedCodes) if (!current.has(code)) return true;
    return false;
  }, [selectedRole, selectedCodes]);

  const toggle = (code: string) =>
    setSelectedCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  if (roles.isLoading || permissions.isLoading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title={t('role.title')}
        subtitle={t('role.subtitle')}
        icon={<ShieldCheck className="size-5" />}
        actions={
          <PermissionGate permission={PERMISSIONS.ROLE_UPDATE}>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!isDirty}>
              <Save />
              {t('common.save')}
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t('role.title')}</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ul className="space-y-1">
              {(roles.data ?? []).map((role) => (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(role.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors',
                      role.id === selectedRole?.id
                        ? 'bg-brand-700 text-gold-100'
                        : 'hover:bg-[var(--surface-muted)]',
                    )}
                  >
                    <span className="truncate font-medium">{role.name}</span>
                    {role.isSystem ? (
                      <Badge tone={role.id === selectedRole?.id ? 'gold' : 'neutral'}>
                        {t('role.systemRole')}
                      </Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>{selectedRole?.name}</CardTitle>
              <p className="text-sm text-[var(--text-muted)]">{selectedRole?.description}</p>
            </div>
            <PermissionGate permission={PERMISSIONS.ROLE_UPDATE}>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelectedCodes(new Set((permissions.data ?? []).map((item) => item.code)))
                  }
                >
                  {t('role.selectAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCodes(new Set())}>
                  {t('role.clearAll')}
                </Button>
              </div>
            </PermissionGate>
          </CardHeader>

          <CardContent className="space-y-5">
            {isDirty ? <Alert tone="warning">{t('feedback.unsavedChanges')}</Alert> : null}

            {grouped.map(([module, items]) => (
              <div key={module}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {module}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((permission) => (
                    <label
                      key={permission.code}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedCodes.has(permission.code)}
                        onChange={() => toggle(permission.code)}
                      />
                      <span className="numeric truncate text-xs">{permission.code}</span>
                    </label>
                  ))}
                </div>
                <Separator className="mt-4" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
