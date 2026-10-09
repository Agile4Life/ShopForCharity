import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import '../config.js';
import { databaseConfig } from '../database-config.js';
import { logger } from '../common/logger.js';
import { crc32 } from 'node:zlib';

const migrationDir = fileURLToPath(new URL('../main/resources/db/migration/', import.meta.url));

export function flywayChecksum(sql) {
  return crc32(Buffer.from(sql.replace(/^\uFEFF/, '').replace(/\r\n|\r|\n/g, ''), 'utf8')) | 0;
}

export async function applyMigrations(client, directory = migrationDir, baselineFlyway = false) {
  const files = fs.readdirSync(directory).filter(f => /^V\d+__.*\.sql$/.test(f))
    .sort((a, b) => Number(a.match(/^V(\d+)/)[1]) - Number(b.match(/^V(\d+)/)[1]));
  if (!files.length) throw new Error('No SQL migrations found.');
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(301, 1)');
    await client.query('CREATE SCHEMA IF NOT EXISTS shop');
    await client.query(`CREATE TABLE IF NOT EXISTS shop.schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const appliedRes = await client.query('SELECT version, checksum FROM shop.schema_migrations');
    const applied = new Map(appliedRes.rows.map(r => [r.version, r.checksum]));
    if (!applied.size) {
      const existing = await client.query("SELECT to_regclass('shop.shops') AS existing");
      if (existing.rows[0].existing) {
        if (!baselineFlyway) throw new Error('Existing shop schema: use --baseline-flyway after verifying legacy history.');
        const legacy = await client.query("SELECT version, script, checksum, success FROM shop.flyway_schema_history WHERE type <> 'SCHEMA' ORDER BY installed_rank");
        if (!legacy.rows.length || legacy.rows.some(r => !r.success || !files.includes(r.script))) {
          throw new Error('Cannot baseline unknown or failed Flyway migrations.');
        }
        for (const row of legacy.rows) {
          const sql = fs.readFileSync(path.join(directory, row.script), 'utf8');
          if (flywayChecksum(sql) !== Number(row.checksum)) throw new Error(`Flyway checksum mismatch: ${row.script}`);
          const checksum = createHash('sha256').update(sql).digest('hex');
          await client.query('INSERT INTO shop.schema_migrations (version, checksum) VALUES ($1, $2)', [row.script, checksum]);
          applied.set(row.script, checksum);
        }
      }
    }
    for (const file of files) {
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(file)) {
        if (applied.get(file) !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO shop.schema_migrations (version, checksum) VALUES ($1, $2)', [file, checksum]);
      logger.info('Migration applied', { file });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function runMigrations() {
  const migrationPool = new pg.Pool(databaseConfig(process.env, true));
  try {
    const client = await migrationPool.connect();
    try { await applyMigrations(client, migrationDir, process.argv.includes('--baseline-flyway')); } finally { client.release(); }
  } finally { await migrationPool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations().catch(err => {
    logger.error('Migration failed', { error: err.message });
    process.exitCode = 1;
  });
}
