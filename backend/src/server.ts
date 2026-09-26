import 'reflect-metadata';
import { createApp } from './app';
import { env } from './config/env';
import { AppDataSource, initializeDataSource } from './config/data-source';
import { logger } from './utils/logger';
import { findMissingKeys } from './utils/i18n';

async function bootstrap(): Promise<void> {
  await initializeDataSource();
  logger.info('Database connected', {
    database: env.DATABASE_URL ? '(from DATABASE_URL)' : env.DB_DATABASE,
    host: env.DATABASE_URL ? '(managed)' : env.DB_HOST,
  });

  /**
   * Schema and base data can arrive with the deploy.
   *
   * A free hosting tier typically offers no shell, so there is nowhere to run
   * the migration and seed commands by hand. Both operations are safe to repeat
   * on every boot: migrations record what has already run, and the seeder
   * upserts by natural key, so a restart is a no-op rather than a duplicate.
   */
  if (env.RUN_MIGRATIONS_ON_BOOT) {
    const applied = await AppDataSource.runMigrations();
    logger.info('Migrations checked', {
      applied: applied.map((migration) => migration.name),
    });
  }

  if (env.SEED_ON_BOOT) {
    const { seedBaseData } = await import('./database/seeds/run-seed');
    await seedBaseData(false);
  }

  // Surface an incomplete translation catalogue at boot rather than in front of
  // an operator who suddenly sees an English string in an Arabic screen.
  const missing = findMissingKeys();
  if (Object.keys(missing).length > 0) {
    logger.warn('Missing translation keys', missing);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('API listening', {
      port: env.PORT,
      prefix: env.API_PREFIX,
      environment: env.NODE_ENV,
    });
  });

  /**
   * Graceful shutdown matters here: a request that is halfway through a money
   * transaction must be allowed to commit or roll back cleanly before the
   * process exits.
   */
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(async () => {
      try {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    });

    // Do not hang forever if a socket refuses to close.
    setTimeout(() => process.exit(1), 15_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception - exiting', { error });
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start the server', { error });
  process.exit(1);
});
