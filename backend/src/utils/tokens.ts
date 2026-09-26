import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './api-error';

/**
 * Access-token claims.
 *
 * Deliberately minimal: an id, the session id, the role name and a version
 * counter. No name, no phone, no permission list - permissions are resolved
 * from the database on every request so a revoked right takes effect at once
 * rather than when the token happens to expire.
 */
export interface AccessTokenPayload {
  sub: string;
  jti: string;
  role: string;
  tv: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'remittance-office',
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'remittance-office',
    }) as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw ApiError.unauthenticated('auth.tokenExpired');
    throw ApiError.unauthenticated('auth.tokenInvalid');
  }
}

/**
 * Refresh tokens are opaque random strings, not JWTs: nothing about them needs
 * to be readable by the client, and an opaque value cannot be replayed after
 * the server row is revoked.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Stored as a keyed hash, so a database dump does not hand over usable
 * sessions. The refresh secret acts as the pepper.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

/** Parses `7d` / `15m` / `3600` into milliseconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
}

export const REFRESH_COOKIE_NAME = 'rt';

export function refreshCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'none';
  path: string;
  maxAge: number;
  domain?: string;
} {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    /**
     * `lax` whenever the UI is served from this same origin - the cookie never
     * travels cross-site there, so the weaker `none` would only widen the CSRF
     * surface for nothing. `none` is reserved for a separately hosted frontend,
     * and it requires `secure`, which is why http development falls back to
     * `lax` as well.
     */
    sameSite: env.COOKIE_SECURE && !env.SERVE_FRONTEND ? 'none' : 'lax',
    path: '/',
    maxAge: parseDuration(env.JWT_REFRESH_EXPIRES_IN),
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}
