import sharp from 'sharp';
import { ApiException } from '../common/api-exception.js';
import { MAX_IMAGE_BYTES, IMAGE_SIZE_MESSAGE } from './upload-limits.js';

export class ImageProcessor {
  async process(buffer, mime, qr = false) {
    ApiException.check(
      buffer && buffer.length > 0 && buffer.length <= MAX_IMAGE_BYTES,
      413,
      'FILE_TOO_LARGE',
      IMAGE_SIZE_MESSAGE
    );

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    ApiException.check(
      allowedMimes.includes(mime),
      415,
      'UNSUPPORTED_IMAGE',
      'Chỉ nhận JPEG, PNG, WebP.'
    );

    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      throw new ApiException(415, 'INVALID_IMAGE', 'Không giải mã được ảnh.');
    }

    const format = (metadata.format || '').toLowerCase();
    const validFormat =
      (mime === 'image/jpeg' && (format === 'jpeg' || format === 'jpg')) ||
      (mime === 'image/png' && format === 'png') ||
      (mime === 'image/webp' && format === 'webp');

    ApiException.check(validFormat, 415, 'INVALID_IMAGE', 'Nội dung ảnh không khớp MIME.');

    const w = metadata.width || 0;
    const h = metadata.height || 0;

    ApiException.check(
      w > 0 && h > 0 && w <= 8192 && h <= 8192 && w * h <= 20_000_000,
      400,
      'IMAGE_DIMENSIONS_EXCEEDED',
      'Ảnh vượt giới hạn kích thước.'
    );

    if (qr) {
      // Strip metadata and convert to PNG without resizing
      const imagePng = await sharp(buffer)
        .png()
        .toBuffer();
      return { image: imagePng, thumbnail: null };
    }

    // Product Image: resize max 1600, thumbnail max 400
    const imagePng = await sharp(buffer)
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const thumbPng = await sharp(buffer)
      .resize({
        width: 400,
        height: 400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    return { image: imagePng, thumbnail: thumbPng };
  }
}

let defaultImageProcessor = null;
export function getImageProcessor() {
  if (!defaultImageProcessor) {
    defaultImageProcessor = new ImageProcessor();
  }
  return defaultImageProcessor;
}
