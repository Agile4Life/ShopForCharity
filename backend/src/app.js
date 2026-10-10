import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { requestFilter } from './identity/request-filter.js';
import { errorHandler } from './common/error-handler.js';
import { checkDb } from './common/db.js';
import { requireCron } from './identity/cron-auth.js';

// Routers
import { shopRouter } from './shop/shop-controller.js';
import { catalogRouter } from './catalog/catalog-controller.js';
import { identityRouter } from './identity/identity-controller.js';
import { sellerRegistrationRouter } from './identity/seller-registration.js';
import { checkoutRouter } from './order/checkout-controller.js';
import { orderRouter } from './order/order-controller.js';
import { inventoryRouter } from './inventory/inventory-controller.js';
import { assetRouter } from './infrastructure/asset-controller.js';
import { sellerReadRouter } from './audit/seller-read-controller.js';

import { getOrderService } from './order/order-service.js';
import { getAssetService } from './infrastructure/asset-service.js';

const app = express();

app.disable('x-powered-by');

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '4mb' }));
app.use(requestFilter);

// Actuator health endpoints
app.get(['/actuator/health', '/actuator/health/liveness'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'UP' });
});

app.get('/actuator/health/readiness', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await checkDb();
    res.json({ status: 'UP' });
  } catch (err) {
    res.status(503).json({ status: 'DOWN' });
  }
});

// Cron endpoints for Serverless (e.g. Vercel Cron)
app.get('/api/v1/cron/expire', requireCron, async (req, res, next) => {
  try {
    const orders = getOrderService();
    await orders.expire();
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

app.get('/api/v1/cron/cleanup', requireCron, async (req, res, next) => {
  try {
    const assets = getAssetService();
    await assets.cleanup();
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// API v1 routes
const v1 = express.Router();
v1.use(shopRouter);
v1.use(catalogRouter);
v1.use('/me', identityRouter);
v1.use(sellerRegistrationRouter);
v1.use(checkoutRouter);
v1.use(orderRouter);
v1.use('/seller/products', inventoryRouter);
v1.use('/seller/assets', assetRouter);
v1.use('/seller', sellerReadRouter);

app.use('/api/v1', v1);

// 404 handler for unmapped routes
app.use((req, res) => {
  res.status(404).setHeader('Cache-Control', 'no-store').json({
    code: 'NOT_FOUND',
    message: 'Không tìm thấy dữ liệu.',
    details: [],
    requestId: req.requestId || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;
