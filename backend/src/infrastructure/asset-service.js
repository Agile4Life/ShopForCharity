import crypto from 'node:crypto';
import { withTx, lockShop, query } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { config } from '../config.js';
import { getProfileService } from '../identity/profile-service.js';
import { getImageProcessor } from './image-processor.js';
import { getStorage } from './storage.js';

export class AssetService {
  constructor(
    storageInstance = getStorage(),
    imageProcessorInstance = getImageProcessor(),
    profileServiceInstance = getProfileService()
  ) {
    this.storage = storageInstance;
    this.images = imageProcessorInstance;
    this.profiles = profileServiceInstance;
    this.productsBucket = config.productBucket;
    this.paymentsBucket = config.paymentBucket;
  }

  async upload(actor, type, buffer, mime) {
    this.profiles.seller(actor);
    ApiException.check(
      ['PRODUCT_IMAGE', 'PAYMENT_QR'].includes(type),
      400,
      'INVALID_ASSET_TYPE',
      'Loại ảnh không hợp lệ.'
    );

    const isQr = type === 'PAYMENT_QR';
    const processed = await this.images.process(buffer, mime, isQr);

    const assetId = crypto.randomUUID();
    const bucket = isQr ? this.paymentsBucket : this.productsBucket;
    const objectPath = `${config.shopId}/${assetId}.png`;
    const thumbnailPath = processed.thumbnail ? `${config.shopId}/${assetId}-thumb.png` : null;
    const uploadedPaths = [];

    try {
      await this.storage.upload(bucket, objectPath, processed.image, 'image/png');
      uploadedPaths.push(objectPath);

      if (thumbnailPath && processed.thumbnail) {
        await this.storage.upload(bucket, thumbnailPath, processed.thumbnail, 'image/png');
        uploadedPaths.push(thumbnailPath);
      }

      await withTx(async (client) => {
        await lockShop(client, config.shopId);
        await client.query(
          `INSERT INTO shop.assets (id, shop_id, bucket, object_path, thumbnail_path, type, mime, size, created_by, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NOW(), NOW())`,
          [
            assetId,
            config.shopId,
            bucket,
            objectPath,
            thumbnailPath,
            type,
            'image/png',
            processed.image.length,
            actor.id,
          ]
        );
      });

      const url = isQr
        ? await this.storage.signed(bucket, objectPath, 300)
        : this.storage.publicUrl(bucket, objectPath);

      return {
        assetId,
        objectPath,
        url,
      };
    } catch (err) {
      for (const p of uploadedPaths) {
        try {
          await this.storage.delete(bucket, p);
        } catch {
          console.warn('Upload compensation pending assetId', assetId);
        }
      }
      throw err;
    }
  }

  async cleanup() {
    await withTx(async (client) => {
      await lockShop(client, config.shopId);

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const assetsRes = await client.query(
        `SELECT * FROM shop.assets
         WHERE shop_id = $1 AND created_at < $2`,
        [config.shopId, cutoff]
      );

      for (const a of assetsRes.rows) {
        const prodCheck = await client.query(
          'SELECT 1 FROM shop.products WHERE image_asset_id = $1 LIMIT 1',
          [a.id]
        );
        const comboCheck = await client.query(
          'SELECT 1 FROM shop.combos WHERE image_asset_id = $1 LIMIT 1',
          [a.id]
        );
        const orderCheck = await client.query(
          'SELECT 1 FROM shop.order_items WHERE image_asset_id_snapshot = $1 LIMIT 1',
          [a.id]
        );
        const settingsCheck = await client.query(
          'SELECT 1 FROM shop.payment_settings_versions WHERE qr_asset_id = $1 LIMIT 1',
          [a.id]
        );

        const used =
          prodCheck.rows.length > 0 ||
          comboCheck.rows.length > 0 ||
          orderCheck.rows.length > 0 ||
          settingsCheck.rows.length > 0;

        if (!used) {
          await this.storage.delete(a.bucket, a.object_path);
          if (a.thumbnail_path) {
            await this.storage.delete(a.bucket, a.thumbnail_path);
          }
          await client.query('DELETE FROM shop.assets WHERE id = $1', [a.id]);
        }
      }

      await client.query(
        'DELETE FROM shop.idempotency_keys WHERE expires_at < NOW()'
      );
      await client.query('DELETE FROM shop.rate_limit_windows WHERE minute < floor(extract(epoch FROM NOW()) / 60) - 2');
    });
  }
}

let defaultAssetService = null;
export function getAssetService() {
  if (!defaultAssetService) {
    defaultAssetService = new AssetService();
  }
  return defaultAssetService;
}
