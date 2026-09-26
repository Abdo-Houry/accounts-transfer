import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Building2, Globe, LogOut, Menu, Moon, Sun, UserRound, X } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Separator,
  initialsOf,
} from '@/components/ui';
import { NAVIGATION } from './navigation';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { useAuth, usePermissions } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';
import { useTheme } from '@/context/theme-context';
import { LANGUAGES } from '@/i18n';
import { cn } from '@/lib/utils';
import type { Language } from '@/types/enums';

/**
 * Application shell: a fixed sidebar on desktop, a slide-over on mobile, and a
 * header carrying identity, language and theme.
 *
 * The sidebar is the office's deep green so the working area stays a calm white
 * surface - on a screen where an operator reads numbers all day, the chrome
 * should recede rather than compete.
 */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // A navigation on mobile should close the drawer behind it.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="lg:ms-64">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          {/* Keyed on the path so a crash on one screen clears when navigating away. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, direction } = useI18n();
  const { canAny } = usePermissions();

  /**
   * The off-screen direction is chosen in JS rather than with Tailwind's
   * `rtl:` / `ltr:` variants: those compile to an attribute selector whose
   * specificity beats the plain `lg:translate-x-0` override, which would leave
   * the sidebar parked off-screen on desktop in Arabic.
   */
  const closedTransform = direction === 'rtl' ? 'translate-x-full' : '-translate-x-full';

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-brand-900/50 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 flex-col bg-[var(--surface-sidebar)] text-gold-100 transition-transform duration-200',
          open ? 'translate-x-0' : closedTransform,
          'lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gold-500 text-brand-900">
              <Building2 className="size-5" />
            </span>
            <span className="text-sm font-semibold leading-tight">{t('common.appName')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gold-200/70 hover:bg-[var(--surface-sidebar-hover)] lg:hidden"
            aria-label={t('common.close')}
          >
            <X className="size-5" />
          </button>
        </div>

        <Separator className="bg-brand-600/40" />

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAVIGATION.map((group) => {
            const visible = group.items.filter(
              (item) => item.anyOf.length === 0 || canAny(...item.anyOf),
            );
            if (visible.length === 0) return null;

            return (
              <div key={group.labelKey} className="mb-5">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gold-200/50">
                  {t(group.labelKey)}
                </p>
                <ul className="space-y-0.5">
                  {visible.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                            isActive
                              ? 'bg-gold-500 font-medium text-brand-900'
                              : 'text-gold-100/80 hover:bg-[var(--surface-sidebar-hover)] hover:text-gold-50',
                          )
                        }
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { t, language, setLanguage } = useI18n();
  const { resolved, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)]/90 px-4 backdrop-blur sm:px-6 lg:px-8 no-print">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label={t('common.actions')}>
        <Menu />
      </Button>

      <div className="flex-1" />

      <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
        <SelectTrigger className="h-9 w-auto gap-2 border-transparent bg-transparent px-2 hover:bg-[var(--surface-muted)]">
          <Globe className="size-4 opacity-70" />
          <span className="hidden text-sm sm:inline">
            {LANGUAGES.find((item) => item.code === language)?.label}
          </span>
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((item) => (
            <SelectItem key={item.code} value={item.code}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
        aria-label={t('common.theme')}
      >
        {resolved === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <Separator orientation="vertical" className="mx-1 h-8" />

      <NavLink
        to="/settings"
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-muted)]"
      >
        <Avatar>
          <AvatarFallback>{initialsOf(user?.fullName ?? '?')}</AvatarFallback>
        </Avatar>
        <span className="hidden text-start leading-tight sm:block">
          <span className="block text-sm font-medium text-[var(--text-primary)]">
            {user?.fullName}
          </span>
          <span className="block text-xs text-[var(--text-muted)]">{user?.role.name}</span>
        </span>
      </NavLink>

      <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t('nav.logout')}>
        <LogOut />
      </Button>
    </header>
  );
}

/** Minimal chrome used by the login screen. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { t, language, setLanguage } = useI18n();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-[var(--surface-sidebar)] p-10 text-gold-100 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gold-500 text-brand-900">
            <Building2 className="size-5" />
          </span>
          <span className="text-lg font-semibold">{t('common.appName')}</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-snug">{t('auth.welcome')}</h2>
          <p className="mt-3 text-gold-200/80">{t('auth.loginSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2 text-sm text-gold-200/60">
          <UserRound className="size-4" />
          <span>{t('role.subtitle')}</span>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex justify-end p-4">
          <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
            <SelectTrigger className="h-9 w-auto gap-2">
              <Globe className="size-4 opacity-70" />
              <span className="text-sm">
                {LANGUAGES.find((item) => item.code === language)?.label}
              </span>
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">{children}</div>
      </div>
    </div>
  );
}
