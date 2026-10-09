import pg from 'pg';
import { config } from '../config.js';
import { ApiException } from './api-exception.js';

const { Pool } = pg;

export const pool = new Pool(config.db);

pool.on('error', (err) => {
  console.error('Unexpected idle PostgreSQL client error', err);
});

export async function query(text, params = [], client = null) {
  const runner = client || pool;
  return runner.query(text, params);
}

export async function withTx(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      console.error('Rollback error', rbErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function lockShop(client, shopId = config.shopId) {
  const res = await client.query(
    'SELECT * FROM shop.shops WHERE id = $1 FOR UPDATE',
    [shopId]
  );
  if (res.rows.length === 0) {
    throw ApiException.missing();
  }
  return res.rows[0];
}

export async function lockInventory(client, productId) {
  const res = await client.query(
    'SELECT * FROM shop.product_inventory WHERE id = $1 FOR UPDATE',
    [productId]
  );
  if (res.rows.length === 0) {
    throw ApiException.missing();
  }
  return res.rows[0];
}

export async function checkDb() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}
