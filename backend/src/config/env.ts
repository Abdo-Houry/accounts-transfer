import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Boolean from an environment string.
 *
 * `z.coerce.boolean()` is NOT usable here: it applies `Boolean("false")`, which
 * is `true`. Every flag in this file would then be permanently on - including
 * `DB_SYNCHRONIZE`, which would let TypeORM rewrite a production schema.
 */
const envBoolean = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return defaultValue;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

/**
 * Fail fast on a bad environment. A financial service must never boot with a
 * default JWT secret or a half-configured database.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),

  // Optional on their own because a managed host supplies `DATABASE_URL`
  // instead. The check below refuses a configuration that has neither.
  DB_HOST: z.string().min(1).optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().min(1).optional(),
  DB_PASSWORD: z.string().optional(),
  DB_DATABASE: z.string().min(1).optional(),
  DB_SCHEMA: z.string().default('public'),
  DB_SSL: envBoolean(false),
  DB_LOGGING: envBoolean(false),
  DB_SYNCHRONIZE: envBoolean(false),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  COOKIE_SECURE: envBoolean(false),
  COOKIE_DOMAIN: z.string().optional(),

  DEFAULT_LANGUAGE: z.enum(['ar', 'en', 'tr']).default('ar'),
  BASE_CURRENCY: z.string().length(3).default('SYP'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),

  /**
   * Serve the built frontend from the API process.
   *
   * Turns the whole system into a single origin on a single port, which removes
   * the CORS surface entirely and is what makes a one-command deployment (or a
   * single tunnel for a demo) possible.
   */
  SERVE_FRONTEND: envBoolean(false),
  FRONTEND_DIST: z.string().default('../frontend/dist'),

  /**
   * Managed Postgres providers hand out one connection string rather than the
   * five separate values. When present it wins, so the same build runs locally
   * from `DB_*` and on a host from `DATABASE_URL` with nothing else changed.
   */
  DATABASE_URL: z.string().url().optional(),

  /**
   * A hosted free tier usually has no shell, so the schema and the base data
   * have to be able to arrive with the deploy itself. Both steps are safe to
   * repeat: migrations track what already ran, and the seeder upserts.
   */
  RUN_MIGRATIONS_ON_BOOT: envBoolean(false),
  SEED_ON_BOOT: envBoolean(false),

  SEED_ADMIN_USERNAME: z.string().default('admin'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@12345'),
  SEED_ADMIN_FULLNAME: z.string().default('System Administrator'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // Thrown before the logger exists, so a plain message is the clearest signal.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

if (env.isProduction && env.DB_SYNCHRONIZE) {
  throw new Error('DB_SYNCHRONIZE must be false in production - use migrations.');
}

/**
 * Exactly one way of reaching the database has to be complete. Catching a half
 * -filled configuration here turns it into a clear startup message instead of
 * an obscure driver error on the first query.
 */
if (!env.DATABASE_URL && (!env.DB_HOST || !env.DB_USERNAME || !env.DB_DATABASE)) {
  throw new Error(
    'Database is not configured: set DATABASE_URL, or all of DB_HOST, DB_USERNAME and DB_DATABASE.',
  );
}

export type Env = typeof env;
