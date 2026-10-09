import pg from 'pg';
import '../src/config.js';
import { pool as runtimePool } from '../src/common/db.js';
import { databaseConfig } from '../src/database-config.js';
import { applyMigrations } from '../src/migrations/migrate.js';

// Explicit operator command, never imported by the serverless request handler.
// Adds V4 after validating legacy Flyway checksums, then grants only the new table.
const migrationPool = new pg.Pool(databaseConfig(process.env, true));
try {
  const client = await migrationPool.connect();
  try {
    // Supabase pooler login names include a project suffix; PostgreSQL current_user
    // is the actual role and must be used for GRANT/REVOKE.
    const runtimeIdentity = await runtimePool.query('SELECT current_user AS role');
    const runtimeUser = runtimeIdentity.rows[0].role;
    if (!runtimeUser) throw new Error('Runtime database role not configured.');
    const role = `"${runtimeUser.replaceAll('"', '""')}"`;
    await applyMigrations(client, undefined, true);
    await client.query('BEGIN');
    try {
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON shop.rate_limit_windows TO ${role}`);
      await client.query(`REVOKE ALL ON shop.schema_migrations FROM ${role}`);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    console.log('Node migration history, V4 shared rate limits and runtime grants are ready.');
  } finally { client.release(); }
} catch (err) {
  console.error('Node DB upgrade failed:', err.message);
  process.exitCode = 1;
} finally { await Promise.all([migrationPool.end(), runtimePool.end()]); }
