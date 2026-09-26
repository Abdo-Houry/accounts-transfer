/**
 * Shared configuration for the maintenance scripts.
 *
 * They read the backend `.env` so they keep working after the admin password
 * or the port is changed - hard-coding either meant a script silently broke the
 * moment the value it assumed was edited.
 *
 * `DEMO_API` points any of them at a deployed instance instead of localhost.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnv() {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
  const values = {};
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    console.warn('No .env found - falling back to defaults.');
  }
  // A real environment variable wins over the file, so CI and one-off runs can
  // override without editing anything.
  return { ...values, ...process.env };
}

const env = loadEnv();

export const API_BASE =
  env.DEMO_API ?? `http://localhost:${env.PORT ?? 4000}${env.API_PREFIX ?? '/api/v1'}`;

export const ADMIN = {
  username: env.SEED_ADMIN_USERNAME ?? 'admin',
  password: env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
};

export { env };
