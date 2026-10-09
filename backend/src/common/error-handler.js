import { ApiException } from './api-exception.js';
import { logger } from './logger.js';
import { IMAGE_SIZE_MESSAGE } from '../infrastructure/upload-limits.js';

export function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'unknown';
  res.setHeader('Cache-Control', 'no-store');
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 'REQUEST_TOO_LARGE', message: 'Yêu cầu quá lớn.', details: [], requestId, timestamp: new Date().toISOString() });
  }

  if (err instanceof ApiException) {
    if (err.status === 429) {
      res.setHeader('Retry-After', '60');
    }
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details || [],
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // Multer file upload size exceeded
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      code: 'FILE_TOO_LARGE',
      message: IMAGE_SIZE_MESSAGE,
      details: [],
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // JSON syntax parse error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      code: 'INVALID_REQUEST',
      message: 'Yêu cầu không hợp lệ.',
      details: [],
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // PostgreSQL unique violation, foreign key violation, check violation
  if (err.code === '23505' || err.code === '23503' || err.code === '23514') {
    return res.status(409).json({
      code: 'DATA_CONFLICT',
      message: 'Dữ liệu trùng hoặc không còn hợp lệ.',
      details: [],
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // PostgreSQL lock timeout, query timeout, connection failure
  if (
    err.code === '55P03' ||
    err.code === '57014' ||
    err.code === '08006' ||
    err.code === '08001' ||
    err.code === 'ECONNREFUSED'
  ) {
    return res.status(503).json({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Dịch vụ tạm không sẵn sàng. Vui lòng thử lại.',
      details: [],
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  logger.error('Unhandled error', {
    errorName: err.name,
    errorMessage: err.message,
    stack: err.stack,
    requestId,
  });

  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Không thể xử lý yêu cầu.',
    details: [],
    requestId,
    timestamp: new Date().toISOString(),
  });
}
