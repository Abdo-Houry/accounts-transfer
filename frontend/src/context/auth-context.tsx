import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '@/api/auth.api';
import { setAccessToken, setUnauthorizedHandler, toApiError } from '@/api/client';
import { useI18n } from './i18n-context';
import type { PermissionCode } from '@/lib/permissions';
import type { CurrentUser } from '@/types/api';
import type { Language } from '@/types/enums';

interface AuthContextValue {
  user: CurrentUser | null;
  /** `true` only while the initial session probe is running. */
  isInitialising: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Renders-only check. The server enforces the same permission again. */
  can: (...permissions: PermissionCode[]) => boolean;
  canAny: (...permissions: PermissionCode[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t, setLanguage } = useI18n();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isInitialising, setIsInitialising] = useState(true);

  /**
   * Session restore.
   *
   * The access token lives in memory only, so a page reload starts with no
   * credential at all. The httpOnly refresh cookie is what carries the session
   * across reloads: if it is still valid we silently get a new access token,
   * otherwise the app simply starts logged out.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = await authApi.refresh();
        if (cancelled) return;
        setAccessToken(session.accessToken);
        setUser(session.user);
        setLanguage(session.user.language);
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsInitialising(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally runs once: this is the boot-time session probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A refresh failure anywhere in the app drops us back to the login screen. */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const { data } = await authApi.login({ username, password });
        setAccessToken(data.accessToken);
        setUser(data.user);
        setLanguage(data.user.language as Language);
        return data.user;
      } catch (error) {
        throw toApiError(error, t('feedback.networkError'));
      }
    },
    [setLanguage, t],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails, the local session must end.
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const current = await authApi.me();
    setUser(current);
  }, []);

  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isInitialising,
      isAuthenticated: user !== null,
      login,
      logout,
      refreshUser,
      can: (...required) => required.every((permission) => permissions.has(permission)),
      canAny: (...accepted) => accepted.some((permission) => permissions.has(permission)),
    }),
    [user, isInitialising, login, logout, refreshUser, permissions],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Convenience hook for conditional rendering. */
export function usePermissions() {
  const { can, canAny, user } = useAuth();
  return { can, canAny, permissions: user?.permissions ?? [] };
}
