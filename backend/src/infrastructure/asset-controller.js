import { Router } from 'express';
import multer from 'multer';
import { requireSeller } from '../identity/auth-middleware.js';
import { rateLimiter } from '../identity/request-filter.js';
import { ApiException } from '../common/api-exception.js';
import { getAssetService } from './asset-service.js';
import { MAX_IMAGE_BYTES } from './upload-limits.js';

const router = Router();
export const upload = multer({
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2, fieldSize: 1024, parts: 3 },
});
const assets = getAssetService();

router.post(
  '/',
  requireSeller,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const actor = req.actor;
      if (!await rateLimiter.allow(`upload:${actor.scope}`, 20)) {
        res.setHeader('Retry-After', '60');
        throw new ApiException(429, 'RATE_LIMITED', 'Vui lòng thử lại sau.');
      }

      if (!req.file) {
        throw new ApiException(400, 'FILE_REQUIRED', 'Cần chọn tệp ảnh tải lên.');
      }

      const type = req.body.type;
      const result = await assets.upload(
        actor,
        type,
        req.file.buffer,
        req.file.mimetype || ''
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export const assetRouter = router;
