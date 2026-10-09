import crypto from 'node:crypto';
import { query, withTx, lockShop } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { size } from '../common/views.js';
import { config } from '../config.js';
import { getProfileService } from '../identity/profile-service.js';
import { getAuditService } from '../audit/audit-service.js';
import { getStorage } from '../infrastructure/storage.js';

export function generateSlug(name, id) {
  let result = (name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!result) result = 'item';
  return `${result}-${id.toString().substring(0, 8)}`;
}

export class CatalogService {
  constructor(
    profileServiceInstance = getProfileService(),
    auditServiceInstance = getAuditService(),
    storageInstance = getStorage()
  ) {
    this.profiles = profileServiceInstance;
    this.audit = auditServiceInstance;
    this.storage = storageInstance;
  }

  async product(id, publicOnly = false, client = null) {
    const res = await query(
      'SELECT * FROM shop.products WHERE id = $1',
      [id],
      client
    );
    if (res.rows.length === 0) throw ApiException.missing();
    const p = res.rows[0];
    if (p.shop_id !== config.shopId) throw ApiException.missing();
    if (publicOnly && p.status !== 'ACTIVE') throw ApiException.missing();
    return p;
  }

  async combo(id, publicOnly = false, client = null) {
    const res = await query(
      'SELECT * FROM shop.combos WHERE id = $1',
      [id],
      client
    );
    if (res.rows.length === 0) throw ApiException.missing();
    const c = res.rows[0];
    if (c.shop_id !== config.shopId) throw ApiException.missing();
    if (publicOnly && c.status !== 'ACTIVE') throw ApiException.missing();
    return c;
  }

  async components(comboId, client = null) {
    const res = await query(
      'SELECT * FROM shop.combo_items WHERE combo_id = $1 ORDER BY created_at ASC',
      [comboId],
      client
    );
    return res.rows;
  }

  async asset(id, type, client = null) {
    if (!id) return;
    const res = await query(
      'SELECT * FROM shop.assets WHERE id = $1',
      [id],
      client
    );
    if (res.rows.length === 0) throw ApiException.missing();
    const a = res.rows[0];
    if (a.shop_id !== config.shopId) throw ApiException.missing();
    ApiException.check(type === a.type, 400, 'INVALID_ASSET', 'Loại ảnh không phù hợp.');
  }

  async categories(client = null) {
    const res = await query(
      'SELECT * FROM shop.categories WHERE shop_id = $1 AND active = true ORDER BY created_at ASC',
      [config.shopId],
      client
    );
    return res.rows.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      active: c.active,
    }));
  }

  async list(combos, seller, q, category, sort, page, requestedSize, actor) {
    if (seller) this.profiles.seller(actor);

    const pageSize = size(requestedSize);
    ApiException.check(page >= 0 && page <= 100000, 400, 'INVALID_PAGE', 'Trang không hợp lệ.');

    const table = combos ? 'shop.combos' : 'shop.products';
    const conditions = ['shop_id = $1'];
    const params = [config.shopId];
    let paramIndex = 2;

    if (!seller) {
      conditions.push("status = 'ACTIVE'");
    }

    if (q && q.trim()) {
      const sanitized = q.toLowerCase().replace(/[%_]/g, '');
      conditions.push(`lower(name) LIKE $${paramIndex}`);
      params.push(`%${sanitized}%`);
      paramIndex++;
    }

    if (!combos && category && category.trim()) {
      conditions.push(
        `category_id IN (SELECT id FROM shop.categories WHERE shop_id = $1 AND (code = $${paramIndex} OR id::text = $${paramIndex}))`
      );
      params.push(category.trim());
      paramIndex++;
    }

    let orderBy = 'created_at DESC, id ASC';
    const sortVal = sort || 'newest';
    if (sortVal === 'price_asc') {
      orderBy = 'price ASC, id ASC';
    } else if (sortVal === 'price_desc') {
      orderBy = 'price DESC, id ASC';
    } else if (sortVal === 'newest') {
      orderBy = 'created_at DESC, id ASC';
    } else {
      throw new ApiException(400, 'INVALID_SORT', 'Sắp xếp không hợp lệ.');
    }

    const whereClause = conditions.join(' AND ');
    const countSql = `SELECT count(*) FROM ${table} WHERE ${whereClause}`;
    const countRes = await query(countSql, params);
    const totalElements = parseInt(countRes.rows[0].count, 10);

    const offset = Math.max(0, page) * pageSize;
    const dataSql = `SELECT * FROM ${table} WHERE ${whereClause} ORDER BY ${orderBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const dataRes = await query(dataSql, [...params, pageSize, offset]);

    const content = [];
    for (const row of dataRes.rows) {
      if (combos) {
        content.push(await this.comboView(row, seller));
      } else {
        content.push(await this.productView(row, seller));
      }
    }

    return {
      content,
      page,
      size: pageSize,
      totalElements,
      totalPages: Math.ceil(totalElements / pageSize) || 0,
    };
  }

  async detail(combos, id, seller, actor) {
    if (seller) this.profiles.seller(actor);
    if (combos) {
      const c = await this.combo(id, !seller);
      return this.comboView(c, seller);
    }
    const p = await this.product(id, !seller);
    return this.productView(p, seller);
  }

  async publicDetail(combos, idOrSlug) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    if (isUuid) {
      return this.detail(combos, idOrSlug, false, null);
    }

    const table = combos ? 'shop.combos' : 'shop.products';
    const res = await query(
      `SELECT * FROM ${table} WHERE shop_id = $1 AND slug = $2 AND status = 'ACTIVE'`,
      [config.shopId, idOrSlug]
    );
    if (res.rows.length === 0) throw ApiException.missing();
    return combos ? this.comboView(res.rows[0], false) : this.productView(res.rows[0], false);
  }

  async productView(p, seller = false, client = null) {
    const invRes = await query(
      'SELECT * FROM shop.product_inventory WHERE id = $1',
      [p.id],
      client
    );
    const i = invRes.rows[0] || { stock_on_hand: 0, stock_reserved: 0, version: 0 };

    const catRes = await query(
      'SELECT name FROM shop.categories WHERE id = $1',
      [p.category_id],
      client
    );
    const categoryName = catRes.rows[0]?.name || '';

    const img = await this.image(p.image_asset_id, client);
    const availableStock = i.stock_on_hand - i.stock_reserved;
    const isSoldOut = i.stock_on_hand === i.stock_reserved;

    const out = {
      id: p.id,
      kind: 'PRODUCT',
      slug: p.slug,
      name: p.name,
      categoryId: p.category_id,
      description: p.description,
      price: Number(p.price),
      imageAssetId: p.image_asset_id,
      ingredients: p.ingredients,
      storageInstructions: p.storage_instructions,
      preservationInstructions: p.storage_instructions,
      allergens: p.allergens,
      categoryName,
      imageUrl: await this.imageUrl(p.image_asset_id, client),
      isSoldOut,
      status: p.status,
      availableStock,
      soldOut: isSoldOut,
      version: Number(p.version),
      image: img,
    };

    if (seller) {
      out.stockOnHand = i.stock_on_hand;
      out.stockReserved = i.stock_reserved;
      out.inventoryVersion = Number(i.version);
    }

    return out;
  }

  async comboView(c, seller = false, passedParts = null, client = null) {
    const parts = passedParts || (await this.components(c.id, client));

    let available = parts.length > 0 ? Number.MAX_SAFE_INTEGER : 0;
    let retailTotal = 0;
    const items = [];

    for (const item of parts) {
      const p = await this.product(item.product_id, false, client);
      const invRes = await query(
        'SELECT * FROM shop.product_inventory WHERE id = $1',
        [p.id],
        client
      );
      const i = invRes.rows[0] || { stock_on_hand: 0, stock_reserved: 0 };
      const itemAvail = i.stock_on_hand - i.stock_reserved;

      if (p.status === 'ACTIVE') {
        available = Math.min(available, Math.floor(itemAvail / item.quantity));
      } else {
        available = 0;
      }

      retailTotal += Number(p.price) * item.quantity;
      items.push({
        productId: p.id,
        name: p.name,
        quantity: item.quantity,
        productName: p.name,
        availableStock: itemAvail,
      });
    }

    if (items.length === 0) available = 0;

    const img = await this.image(c.image_asset_id, client);
    const priceNum = Number(c.price);
    const savings = Math.max(0, retailTotal - priceNum);
    const isSoldOut = available === 0;

    const out = {
      id: c.id,
      kind: 'COMBO',
      slug: c.slug,
      name: c.name,
      description: c.description,
      price: priceNum,
      imageAssetId: c.image_asset_id,
      image: img,
      imageUrl: await this.imageUrl(c.image_asset_id, client),
      isSoldOut,
      status: c.status,
      items,
      availableStock: available,
      soldOut: isSoldOut,
      retailTotal,
      savings,
      version: Number(c.version),
    };

    if (seller) {
      out.priceWarning = priceNum > retailTotal;
    }

    return out;
  }

  async image(id, client = null) {
    if (!id) return null;
    const res = await query(
      'SELECT * FROM shop.assets WHERE id = $1',
      [id],
      client
    );
    if (res.rows.length === 0) return null;
    const a = res.rows[0];
    return {
      assetId: a.id,
      objectPath: a.object_path,
      thumbnailPath: a.thumbnail_path,
      bucket: a.bucket,
    };
  }

  async imageUrl(id, client = null) {
    if (!id) return null;
    const res = await query(
      'SELECT * FROM shop.assets WHERE id = $1',
      [id],
      client
    );
    if (res.rows.length === 0) return null;
    const a = res.rows[0];
    return this.storage.publicUrl(a.bucket, a.object_path);
  }

  async saveProduct(actor, id, input) {
    this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      const isCreate = !id;

      let p;
      if (isCreate) {
        ApiException.check(
          input.name && input.name.trim() && input.categoryId && input.price !== undefined,
          400,
          'REQUIRED_FIELDS',
          'Cần tên, danh mục và giá.'
        );
        p = {
          id: crypto.randomUUID(),
          shop_id: config.shopId,
          status: 'DRAFT',
          version: 0,
        };
      } else {
        p = await this.product(id, false, client);
        ApiException.check(
          input.expectedVersion !== undefined && input.expectedVersion !== null,
          400,
          'VERSION_REQUIRED',
          'Cần expectedVersion.'
        );
        ApiException.version(p.version, input.expectedVersion);
        ApiException.check(
          input.initialStock === undefined && input.stockOnHand === undefined,
          400,
          'STOCK_ACTION_REQUIRED',
          'Dùng stock-adjustments để sửa tồn kho.'
        );
      }

      if (input.categoryId) {
        const catRes = await client.query(
          'SELECT * FROM shop.categories WHERE id = $1 AND shop_id = $2',
          [input.categoryId, config.shopId]
        );
        if (catRes.rows.length === 0) throw ApiException.missing();
        ApiException.check(catRes.rows[0].active, 400, 'INVALID_CATEGORY', 'Danh mục không hoạt động.');
        p.category_id = input.categoryId;
      }

      if (input.imageAssetId) {
        await this.asset(input.imageAssetId, 'PRODUCT_IMAGE', client);
        p.image_asset_id = input.imageAssetId;
      }

      const before = isCreate ? null : JSON.stringify({ price: Number(p.price) });

      if (input.name !== undefined) {
        ApiException.check(input.name && input.name.trim(), 400, 'INVALID_NAME', 'Tên không được trống.');
        p.name = input.name.trim();
      }

      if (input.slug !== undefined) {
        p.slug = input.slug;
      } else if (isCreate) {
        p.slug = generateSlug(p.name, p.id);
      }

      if (input.description !== undefined) p.description = input.description;
      if (input.price !== undefined) p.price = input.price;
      if (input.ingredients !== undefined) p.ingredients = input.ingredients;
      if (input.allergens !== undefined) p.allergens = input.allergens;
      if (input.storageInstructions !== undefined) p.storage_instructions = input.storageInstructions;
      else if (input.preservationInstructions !== undefined) p.storage_instructions = input.preservationInstructions;

      if (isCreate) {
        await client.query(
          `INSERT INTO shop.products (
            id, shop_id, category_id, slug, name, description, price,
            image_asset_id, status, ingredients, storage_instructions, allergens,
            version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, NOW(), NOW())`,
          [
            p.id,
            p.shop_id,
            p.category_id,
            p.slug,
            p.name,
            p.description,
            p.price,
            p.image_asset_id || null,
            p.status,
            p.ingredients || null,
            p.storage_instructions || null,
            p.allergens || null,
          ]
        );

        const stockOnHand = input.initialStock !== undefined ? input.initialStock : (input.stockOnHand || 0);
        await client.query(
          `INSERT INTO shop.product_inventory (id, stock_on_hand, stock_reserved, version, created_at, updated_at)
           VALUES ($1, $2, 0, 0, NOW(), NOW())`,
          [p.id, stockOnHand]
        );

        if (stockOnHand > 0) {
          const moveId = crypto.randomUUID();
          await client.query(
            `INSERT INTO shop.inventory_movements (
              id, product_id, order_id, kind, delta_on_hand, delta_reserved,
              reason, actor_id, version, created_at, updated_at
            ) VALUES ($1, $2, null, 'ADJUSTED', $3, 0, 'INITIAL_STOCK', $4, 0, NOW(), NOW())`,
            [moveId, p.id, stockOnHand, actor.id]
          );

          await this.audit.record(
            client,
            actor,
            'STOCK_ADJUSTED',
            'PRODUCT',
            p.id,
            JSON.stringify({ stockOnHand: 0 }),
            JSON.stringify({ stockOnHand })
          );
        }
      } else {
        await client.query(
          `UPDATE shop.products
           SET category_id = $1, slug = $2, name = $3, description = $4, price = $5,
               image_asset_id = $6, ingredients = $7, storage_instructions = $8, allergens = $9,
               version = version + 1, updated_at = NOW()
           WHERE id = $10`,
          [
            p.category_id,
            p.slug,
            p.name,
            p.description,
            p.price,
            p.image_asset_id || null,
            p.ingredients || null,
            p.storage_instructions || null,
            p.allergens || null,
            p.id,
          ]
        );
      }

      await this.audit.record(
        client,
        actor,
        isCreate ? 'PRODUCT_CREATED' : 'PRODUCT_UPDATED',
        'PRODUCT',
        p.id,
        before,
        JSON.stringify({ price: Number(p.price) })
      );

      const updated = await this.product(p.id, false, client);
      return this.productView(updated, true, client);
    });
  }

  async saveCombo(actor, id, input) {
    this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);
      const isCreate = !id;

      let c;
      if (isCreate) {
        ApiException.check(
          input.name && input.name.trim() && input.price !== undefined && input.items,
          400,
          'REQUIRED_FIELDS',
          'Cần tên, giá và thành phần combo.'
        );
        c = {
          id: crypto.randomUUID(),
          shop_id: config.shopId,
          status: 'DRAFT',
          version: 0,
        };
      } else {
        c = await this.combo(id, false, client);
        ApiException.check(
          input.expectedVersion !== undefined && input.expectedVersion !== null,
          400,
          'VERSION_REQUIRED',
          'Cần expectedVersion.'
        );
        ApiException.version(c.version, input.expectedVersion);
      }

      if (input.imageAssetId) {
        await this.asset(input.imageAssetId, 'PRODUCT_IMAGE', client);
        c.image_asset_id = input.imageAssetId;
      }

      if (input.name !== undefined) {
        ApiException.check(input.name && input.name.trim(), 400, 'INVALID_NAME', 'Tên không được trống.');
        c.name = input.name.trim();
      }

      if (input.slug !== undefined) {
        c.slug = input.slug;
      } else if (isCreate) {
        c.slug = generateSlug(c.name, c.id);
      }

      if (input.description !== undefined) c.description = input.description;
      if (input.price !== undefined) c.price = input.price;

      const rawItems = input.items || (await this.components(c.id, client)).map(x => ({ productId: x.product_id, quantity: x.quantity }));
      ApiException.check(rawItems.length >= 2, 400, 'INVALID_COMBO', 'Combo cần ít nhất hai món.');

      const seen = new Set();
      let retailTotal = 0;
      for (const part of rawItems) {
        ApiException.check(!seen.has(part.productId), 400, 'DUPLICATE_COMPONENT', 'Thành phần combo bị trùng.');
        seen.add(part.productId);
        const p = await this.product(part.productId, true, client);
        retailTotal += Number(p.price) * part.quantity;
      }

      ApiException.check(
        Number(c.price) <= retailTotal,
        400,
        'INVALID_COMBO_PRICE',
        'Giá combo không được vượt tổng giá lẻ.'
      );

      if (isCreate) {
        await client.query(
          `INSERT INTO shop.combos (
            id, shop_id, slug, name, description, price, image_asset_id, status,
            version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NOW(), NOW())`,
          [
            c.id,
            c.shop_id,
            c.slug,
            c.name,
            c.description,
            c.price,
            c.image_asset_id || null,
            c.status,
          ]
        );
      } else {
        await client.query(
          `UPDATE shop.combos
           SET slug = $1, name = $2, description = $3, price = $4, image_asset_id = $5,
               version = version + 1, updated_at = NOW()
           WHERE id = $6`,
          [
            c.slug,
            c.name,
            c.description,
            c.price,
            c.image_asset_id || null,
            c.id,
          ]
        );

        if (input.items) {
          await client.query('DELETE FROM shop.combo_items WHERE combo_id = $1', [c.id]);
        }
      }

      if (isCreate || input.items) {
        for (const part of rawItems) {
          const itemId = crypto.randomUUID();
          await client.query(
            `INSERT INTO shop.combo_items (id, combo_id, product_id, quantity, version, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
            [itemId, c.id, part.productId, part.quantity]
          );
        }
      }

      await this.audit.record(
        client,
        actor,
        isCreate ? 'COMBO_CREATED' : 'COMBO_UPDATED',
        'COMBO',
        c.id,
        null,
        JSON.stringify({ price: Number(c.price) })
      );

      const updated = await this.combo(c.id, false, client);
      return this.comboView(updated, true, null, client);
    });
  }

  async status(actor, combos, id, newStatus, expectedVersion) {
    this.profiles.seller(actor);

    return withTx(async (client) => {
      await lockShop(client, config.shopId);

      if (combos) {
        const c = await this.combo(id, false, client);
        ApiException.version(c.version, expectedVersion);

        if (newStatus === 'ACTIVE') {
          ApiException.check(c.image_asset_id != null, 400, 'IMAGE_REQUIRED', 'Cần ảnh trước khi mở bán.');
          const parts = await this.components(id, client);
          ApiException.check(parts.length >= 2, 400, 'INVALID_COMBO', 'Combo cần ít nhất hai món.');
          for (const part of parts) {
            await this.product(part.product_id, true, client);
          }
        }

        await client.query(
          `UPDATE shop.combos SET status = $1, version = version + 1, updated_at = NOW() WHERE id = $2`,
          [newStatus, id]
        );

        await this.audit.record(
          client,
          actor,
          `COMBO_${newStatus === 'ACTIVE' ? 'ACTIVATED' : 'ARCHIVED'}`,
          'COMBO',
          id,
          null,
          JSON.stringify({ status: newStatus })
        );

        const updated = await this.combo(id, false, client);
        return this.comboView(updated, true, null, client);
      }

      const p = await this.product(id, false, client);
      ApiException.version(p.version, expectedVersion);

      if (newStatus === 'ACTIVE') {
        ApiException.check(p.image_asset_id != null, 400, 'IMAGE_REQUIRED', 'Cần ảnh trước khi mở bán.');
      }

      await client.query(
        `UPDATE shop.products SET status = $1, version = version + 1, updated_at = NOW() WHERE id = $2`,
        [newStatus, id]
      );

      await this.audit.record(
        client,
        actor,
        `PRODUCT_${newStatus === 'ACTIVE' ? 'ACTIVATED' : 'ARCHIVED'}`,
        'PRODUCT',
        id,
        null,
        JSON.stringify({ status: newStatus })
      );

      const updated = await this.product(id, false, client);
      return this.productView(updated, true, client);
    });
  }
}

let defaultCatalogService = null;
export function getCatalogService() {
  if (!defaultCatalogService) {
    defaultCatalogService = new CatalogService();
  }
  return defaultCatalogService;
}
