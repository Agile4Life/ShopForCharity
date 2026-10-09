import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { ApiException } from '../common/api-exception.js';

export function requireCron(req, res, next) {
  if (req.method !== 'GET') return res.status(405).set('Allow', 'GET').end();
  if (!config.cronSecret) return next(new ApiException(503, 'CRON_DISABLED', 'Cron chưa được cấu hình.'));
  const expected = Buffer.from(`Bearer ${config.cronSecret}`);
  const actual = Buffer.from(req.headers.authorization || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return next(new ApiException(401, 'AUTH_REQUIRED', 'Không có quyền chạy cron.'));
  }
  next();
}
