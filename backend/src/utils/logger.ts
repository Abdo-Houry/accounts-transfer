/* eslint-disable no-console */

/**
 * Minimal structured logger. Dependency-free on purpose: the project pins its
 * dependency list, and a JSON line on stdout is what a container platform wants.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Never let a password, hash or token reach the log stream. */
export const REDACTED_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'passwordHash',
  'password_hash',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
]);

function replacer(key: string, value: unknown): unknown {
  if (REDACTED_KEYS.has(key)) return '[REDACTED]';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function threshold(): number {
  const fallback: Level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  const configured = (process.env.LOG_LEVEL as Level) || fallback;
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
}

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < threshold()) return;
  const serialized = JSON.stringify(
    { ts: new Date().toISOString(), level, message, ...(meta ?? {}) },
    replacer,
  );
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};

/** Deep-clones a payload with secrets stripped - used by the audit log. */
export function redact<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload ?? null, replacer)) as T;
}
