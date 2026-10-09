import { createHash } from 'node:crypto';
import { query } from '../common/db.js';

export class RateLimiter {
  constructor(runQuery = query) { this.runQuery = runQuery; }

  async allow(key, limit) {
    // Store only a digest, never raw customer identifiers or IP addresses.
    const digest = createHash('sha256').update(key).digest('hex');
    const result = await this.runQuery(`
      INSERT INTO shop.rate_limit_windows (key_hash, minute, count)
      VALUES ($1, floor(extract(epoch FROM clock_timestamp()) / 60)::bigint, 1)
      ON CONFLICT (key_hash) DO UPDATE SET
        count = CASE WHEN rate_limit_windows.minute = EXCLUDED.minute
          THEN rate_limit_windows.count + 1 ELSE 1 END,
        minute = EXCLUDED.minute
      RETURNING count
    `, [digest]);
    return Number(result.rows[0].count) <= limit;
  }
}

export const rateLimiter = new RateLimiter();
