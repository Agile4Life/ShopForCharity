import app from './app.js';
import { config } from './config.js';
import { logger } from './common/logger.js';
import { pool } from './common/db.js';
import { runMigrations } from './migrations/migrate.js';
import { getOrderService } from './order/order-service.js';
import { getAssetService } from './infrastructure/asset-service.js';

async function bootstrap() {
  if (config.migrationsEnabled) {
    try {
      logger.info('Running database migrations...');
      await runMigrations();
      logger.info('Database migrations completed.');
    } catch (err) {
      throw err;
    }
  }

  const server = app.listen(config.port, () => {
    logger.info(`Server started on port ${config.port}`, {
      port: config.port,
      nodeEnv: process.env.NODE_ENV,
      shopId: config.shopId,
    });
  });

  // Background schedulers
  const orders = getOrderService();
  const assets = getAssetService();

  const expiryTimer = setInterval(async () => {
    try {
      await orders.expire();
    } catch (err) {
      logger.error('Expiry scheduler error', { error: err.message });
    }
  }, config.expiryIntervalMs);

  const cleanupTimer = setInterval(async () => {
    try {
      await assets.cleanup();
    } catch (err) {
      logger.error('Cleanup scheduler error', { error: err.message });
    }
  }, config.cleanupIntervalMs);

  function gracefulShutdown(signal) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    clearInterval(expiryTimer);
    clearInterval(cleanupTimer);

    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await pool.end();
        logger.info('Database connection pool closed.');
      } catch (err) {
        logger.error('Error closing database pool', { error: err.message });
      }
      process.exit(0);
    });

    // Force shutdown after 10s if graceful fails
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failure', { error: err.message, stack: err.stack });
  process.exit(1);
});
