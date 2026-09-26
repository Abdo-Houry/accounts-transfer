import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { env } from './env';
import { ENTITIES } from '../entities';

/**
 * Single DataSource shared by the app, the TypeORM CLI and the seeder.
 *
 * `poolSize` is deliberately modest: every money-moving request holds a
 * transaction with row locks, so a huge pool only lengthens lock queues.
 */
/**
 * A managed database gives one URL; a local one gives five separate settings.
 * Spreading both into the same options object means neither the entities nor
 * the services ever learn which of the two they are running against.
 */
const connection = env.DATABASE_URL
  ? { url: env.DATABASE_URL }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_DATABASE,
    };

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...connection,
  schema: env.DB_SCHEMA,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  synchronize: env.DB_SYNCHRONIZE,
  logging: env.DB_LOGGING ? ['query', 'error', 'warn'] : ['error'],
  entities: ENTITIES,
  migrations: [path.join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  poolSize: 20,
  extra: {
    // A money transaction that cannot get its row lock should fail fast and
    // surface a clear error rather than pile up behind a stuck session.
    statement_timeout: 15000,
    lock_timeout: 8000,
    idle_in_transaction_session_timeout: 20000,
  },
});

let initializing: Promise<DataSource> | null = null;

/** Idempotent initialiser - safe to call from the server and from scripts. */
export async function initializeDataSource(): Promise<DataSource> {
  if (AppDataSource.isInitialized) return AppDataSource;
  if (!initializing) initializing = AppDataSource.initialize();
  return initializing;
}
