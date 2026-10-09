import crypto from 'node:crypto';
import { query, withTx, lockShop } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { config } from '../config.js';
import { getProfileService } from '../identity/profile-service.js';
import { getAuditService } from '../audit/audit-service.js';

export class ShopService {
  constructor(
    profileServiceInstance = getProfileService(),
    auditServiceInstance = getAuditService()
  ) {
    this.profiles = profileServiceInstance;
    this.audit = auditServiceInstance;
  }

  async pickup(id, client = null) {
    const res = await query(
      'SELECT * FROM shop.pickup_points WHERE id = $1',
      [id],
      client
    );
    if (res.rows.length === 0) throw ApiException.missing();
    const p = res.rows[0];
    if (p.shop_id !== config.shopId) throw ApiException.missing();
    ApiException.check(p.active, 400, 'INVALID_PICKUP_POINT', 'Điểm nhận không hoạt động.');
    return p;
  }

  async get(seller = false, actor = null) {
    if (seller) this.profiles.seller(actor);

    const shopRes = await query(
      'SELECT * FROM shop.shops WHERE id = $1',
      [config.shopId]
    );
    if (shopRes.rows.length === 0) throw ApiException.missing();
    const s = shopRes.rows[0];

    const points = await this.points(seller);
    const out = {
      id: s.id,
      name: s.name,
      contactPhone: s.contact_phone,
      contactEmail: s.contact_email,
      acceptingOrders: s.accepting_orders,
      version: Number(s.version),
      pickupPoints: points,
    };

    if (seller) {
      out.paymentSettingsVersionId = s.payment_settings_version_id;
      if (s.payment_settings_version_id) {
        const bankRes = await query(
          'SELECT * FROM shop.payment_settings_versions WHERE id = $1',
          [s.payment_settings_version_id]
        );
        if (bankRes.rows.length > 0) {
          const b = bankRes.rows[0];
          out.bank = {
            bankName: b.bank_name,
            accountNumber: b.account_number,
            accountHolder: b.account_holder,
            qrAssetId: b.qr_asset_id,
            versionId: b.id,
          };
          out.bankName = b.bank_name;
          out.accountNumber = b.account_number;
          out.accountHolder = b.account_holder;
          out.qrAssetId = b.qr_asset_id;
        }
      }
    }

    return out;
  }

  async points(seller = false) {
    const sql = `SELECT * FROM shop.pickup_points WHERE shop_id = $1 ${
      seller ? '' : 'AND active = true'
    } ORDER BY created_at ASC`;
    const res = await query(sql, [config.shopId]);
    return res.rows.map((p) => ({
      id: p.id,
      name: p.name,
      instructions: p.instructions,
      active: p.active,
      version: Number(p.version),
    }));
  }

  async update(actor, input) {
    this.profiles.seller(actor);

    return withTx(async (client) => {
      const s = await lockShop(client, config.shopId);
      ApiException.version(s.version, input.expectedVersion);

      let name = s.name;
      if (input.name !== undefined) {
        ApiException.check(
          input.name && input.name.trim().length > 0,
          400,
          'INVALID_NAME',
          'Tên shop không được trống.'
        );
        name = input.name.trim();
      }

      let contactPhone = input.contactPhone !== undefined ? input.contactPhone : s.contact_phone;
      let contactEmail = input.contactEmail !== undefined ? input.contactEmail : s.contact_email;
      let acceptingOrders = input.acceptingOrders !== undefined ? Boolean(input.acceptingOrders) : s.accepting_orders;

      const flat =
        input.bankName !== undefined ||
        input.accountNumber !== undefined ||
        input.accountHolder !== undefined ||
        input.qrAssetId !== undefined;

      ApiException.check(
        !flat || !input.bank,
        400,
        'INVALID_BANK_INPUT',
        'Chỉ dùng một định dạng ngân hàng.'
      );

      let b = input.bank;
      if (flat) {
        let old = null;
        if (s.payment_settings_version_id) {
          const oldRes = await client.query(
            'SELECT * FROM shop.payment_settings_versions WHERE id = $1',
            [s.payment_settings_version_id]
          );
          if (oldRes.rows.length > 0) old = oldRes.rows[0];
        }

        b = {
          bankName: input.bankName !== undefined ? input.bankName : old?.bank_name,
          accountNumber: input.accountNumber !== undefined ? input.accountNumber : old?.account_number,
          accountHolder: input.accountHolder !== undefined ? input.accountHolder : old?.account_holder,
          qrAssetId: input.qrAssetId !== undefined ? input.qrAssetId : old?.qr_asset_id,
        };
      }

      let newPaymentSettingsVersionId = s.payment_settings_version_id;
      if (b) {
        ApiException.check(
          b.bankName && b.bankName.trim() &&
          b.accountNumber && b.accountNumber.trim() &&
          b.accountHolder && b.accountHolder.trim() &&
          b.qrAssetId,
          400,
          'BANK_FIELDS_REQUIRED',
          'Cần đầy đủ ngân hàng, số tài khoản, chủ tài khoản và QR.'
        );

        // Verify QR asset
        const assetRes = await client.query(
          'SELECT * FROM shop.assets WHERE id = $1 AND shop_id = $2',
          [b.qrAssetId, config.shopId]
        );
        if (assetRes.rows.length === 0) throw ApiException.missing();
        ApiException.check(
          assetRes.rows[0].type === 'PAYMENT_QR',
          400,
          'INVALID_ASSET',
          'Loại ảnh không phù hợp.'
        );

        const paymentId = crypto.randomUUID();
        await client.query(
          `INSERT INTO shop.payment_settings_versions (
            id, shop_id, bank_name, account_number, account_holder, qr_asset_id, created_by,
            version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW(), NOW())`,
          [
            paymentId,
            config.shopId,
            b.bankName.trim(),
            b.accountNumber.trim(),
            b.accountHolder.trim(),
            b.qrAssetId,
            actor.id,
          ]
        );

        newPaymentSettingsVersionId = paymentId;
        await this.audit.record(
          client,
          actor,
          'PAYMENT_SETTINGS_VERSION_CREATED',
          'PAYMENT_SETTINGS',
          paymentId,
          null,
          null
        );
      }

      await client.query(
        `UPDATE shop.shops
         SET name = $1, contact_phone = $2, contact_email = $3, accepting_orders = $4,
             payment_settings_version_id = $5, version = version + 1, updated_at = NOW()
         WHERE id = $6`,
        [
          name,
          contactPhone,
          contactEmail,
          acceptingOrders,
          newPaymentSettingsVersionId,
          config.shopId,
        ]
      );

      await this.audit.record(
        client,
        actor,
        'SHOP_SETTINGS_UPDATED',
        'SHOP',
        config.shopId,
        null,
        JSON.stringify({ acceptingOrders })
      );

      return this.get(true, actor);
    });
  }

  async savePoint(actor, id, input) {
    this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);

      let p;
      if (id) {
        const res = await client.query(
          'SELECT * FROM shop.pickup_points WHERE id = $1',
          [id]
        );
        if (res.rows.length === 0) throw ApiException.missing();
        p = res.rows[0];
        if (p.shop_id !== config.shopId) throw ApiException.missing();

        ApiException.check(
          input.expectedVersion !== undefined && input.expectedVersion !== null,
          400,
          'VERSION_REQUIRED',
          'Cần expectedVersion.'
        );
        ApiException.version(p.version, input.expectedVersion);
      } else {
        ApiException.check(
          input.name && input.name.trim().length > 0,
          400,
          'NAME_REQUIRED',
          'Cần tên điểm nhận.'
        );
      }

      let name = p ? p.name : '';
      if (input.name !== undefined) {
        ApiException.check(
          input.name && input.name.trim().length > 0,
          400,
          'INVALID_NAME',
          'Tên không được trống.'
        );
        name = input.name.trim();
      }

      const instructions = input.instructions !== undefined ? input.instructions : (p ? p.instructions : null);
      let active = input.active !== undefined ? Boolean(input.active) : (p ? p.active : true);

      let saved;
      if (id) {
        const updateRes = await client.query(
          `UPDATE shop.pickup_points
           SET name = $1, instructions = $2, active = $3, version = version + 1, updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [name, instructions, active, id]
        );
        saved = updateRes.rows[0];
      } else {
        const newId = crypto.randomUUID();
        const insertRes = await client.query(
          `INSERT INTO shop.pickup_points (id, shop_id, name, instructions, active, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 0, NOW(), NOW())
           RETURNING *`,
          [newId, config.shopId, name, instructions, active]
        );
        saved = insertRes.rows[0];
      }

      await this.audit.record(
        client,
        actor,
        'PICKUP_POINT_CHANGED',
        'PICKUP_POINT',
        saved.id,
        null,
        JSON.stringify({ active: saved.active })
      );

      return {
        id: saved.id,
        name: saved.name,
        instructions: saved.instructions,
        active: saved.active,
        version: Number(saved.version),
      };
    });
  }
}

let defaultShopService = null;
export function getShopService() {
  if (!defaultShopService) {
    defaultShopService = new ShopService();
  }
  return defaultShopService;
}
