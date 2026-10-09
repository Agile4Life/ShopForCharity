import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../common/logger.js';
import { rateLimiter } from './rate-limiter.js';
export { rateLimiter } from './rate-limiter.js';

export async function requestFilter(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Cache-Control', 'private, no-store');

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  const mutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
  const authorization = req.headers.authorization;
  const bearer = authorization && authorization.startsWith('Bearer ');
  const path = req.path || req.url;
  const cookieRoute = path.startsWith('/api/v1/guest/') || path === '/api/v1/checkout/session';
  const origin = req.headers.origin;

  if (mutation && (cookieRoute || !bearer)) {
    if (!origin || !config.corsOrigins.includes(origin)) {
      res.status(403);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        code: 'CSRF_ORIGIN_REJECTED',
        message: 'Nguồn yêu cầu không hợp lệ.',
        details: [],
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (path === '/api/v1/guest/orders/access' && req.method === 'POST') {
    // Vercel overwrites this header. Outside Vercel, use the direct socket IP.
    const ip = process.env.VERCEL === '1'
      ? req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress || 'unknown'
      : req.socket.remoteAddress || 'unknown';
    let allowed;
    try { allowed = await rateLimiter.allow(`access:${ip}`, 10); }
    catch (err) { return next(err); }
    if (!allowed) {
      res.status(429);
      res.setHeader('Retry-After', '60');
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        code: 'RATE_LIMITED',
        message: 'Vui lòng thử lại sau.',
        details: [],
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  next();
}
