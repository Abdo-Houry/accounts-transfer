import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';
import { clientIp } from './request-context.middleware';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-process limiter used to blunt credential stuffing on `/auth/login`.
 *
 * Deliberately not a general-purpose solution: with more than one instance the
 * counters are per-process, so a real deployment should also rate-limit at the
 * reverse proxy. It is here because an unthrottled login endpoint on a
 * financial system is worse than an imperfect throttle.
 */
export function rateLimit(options: { windowMs: number; max: number; keyPrefix?: string }) {
  const buckets = new Map<string, Bucket>();

  // Keep the map from growing without bound on a long-running process.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, options.windowMs);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${options.keyPrefix ?? ''}:${clientIp(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      res.setHeader('retry-after', Math.ceil((bucket.resetAt - now) / 1000));
      return next(ApiError.tooManyRequests());
    }

    next();
  };
}
