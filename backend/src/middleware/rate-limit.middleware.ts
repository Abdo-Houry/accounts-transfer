import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';
import { clientIp } from './request-context.middleware';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  /**
   * Count only requests that failed.
   *
   * On a login endpoint this is what the limit is actually for: the budget
   * should be spent by wrong passwords, not by people signing in correctly.
   * Counting every attempt punishes a shared address - a whole office behind
   * one public IP reaches the limit by working normally.
   */
  countOnlyFailures?: boolean;
}

/**
 * Small in-process limiter used to blunt credential stuffing on `/auth/login`.
 *
 * Deliberately not a general-purpose solution: with more than one instance the
 * counters are per-process, so a real deployment should also rate-limit at the
 * reverse proxy. It is here because an unthrottled login endpoint on a
 * financial system is worse than an imperfect throttle.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  // Keep the map from growing without bound on a long-running process.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, options.windowMs);
  sweep.unref?.();

  const record = (key: string, now: number): void => {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return;
    }
    bucket.count += 1;
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${options.keyPrefix ?? ''}:${clientIp(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    const active = bucket && bucket.resetAt > now ? bucket : null;

    if (active && active.count >= options.max) {
      res.setHeader('retry-after', Math.ceil((active.resetAt - now) / 1000));
      return next(ApiError.tooManyRequests());
    }

    if (options.countOnlyFailures) {
      // Charged once the outcome is known, so a successful sign-in costs nothing.
      res.on('finish', () => {
        if (res.statusCode >= 400) record(key, Date.now());
      });
    } else {
      record(key, now);
    }

    next();
  };
}
