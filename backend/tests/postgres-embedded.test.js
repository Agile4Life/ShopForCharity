import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations, flywayChecksum } from '../src/migrations/migrate.js';
import fs from 'node:fs';
import { RateLimiter } from '../src/identity/rate-limiter.js';

test('PostgreSQL embedded: empty migration, rerun, shared counters and rollback', async () => {
  const db = new PGlite();
  try {
    // PGlite runs one connection, so it does not implement advisory locks.
    // Everything else below executes the real application SQL in PostgreSQL WASM.
    const client = { query: (sql, params) => sql.includes('pg_advisory_xact_lock')
      ? Promise.resolve({ rows: [] }) : params ? db.query(sql, params) : db.exec(sql).then(results => results.at(-1)) };
    await applyMigrations(client);
    await applyMigrations(client);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.schema_migrations')).rows[0].count, 4);
    assert.equal((await db.query('SELECT accepting_orders FROM shop.shops')).rows[0].accepting_orders, false);
    const firstInstance = new RateLimiter((sql, params) => db.query(sql, params));
    const secondInstance = new RateLimiter((sql, params) => db.query(sql, params));
    assert.equal(await firstInstance.allow('test-caller', 2), true);
    assert.equal(await secondInstance.allow('test-caller', 2), true);
    assert.equal(await firstInstance.allow('test-caller', 2), false);
    await db.query('UPDATE shop.rate_limit_windows SET minute = minute - 1');
    assert.equal(await secondInstance.allow('test-caller', 2), true);
    await db.query("UPDATE shop.schema_migrations SET checksum = 'changed' WHERE version LIKE 'V1%'");
    await assert.rejects(applyMigrations(client), /checksum mismatch/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.shops')).rows[0].count, 1);
    await db.exec('DROP TABLE shop.schema_migrations; DROP TABLE shop.rate_limit_windows');
    await db.exec("CREATE TABLE shop.flyway_schema_history (installed_rank int, version text, script text, checksum int, success boolean, type text DEFAULT 'SQL')");
    for (const [index, name] of ['V1__tables.sql', 'V2__constraints_and_seed.sql', 'V3__product_allergens.sql'].entries()) {
      const sql = fs.readFileSync(new URL(`../src/main/resources/db/migration/${name}`, import.meta.url), 'utf8');
      await db.query("INSERT INTO shop.flyway_schema_history VALUES ($1,$2,$3,$4,true,'SQL')", [index + 1, String(index + 1), name, flywayChecksum(sql)]);
    }
    await assert.rejects(applyMigrations(client), /baseline-flyway/);
    await applyMigrations(client, undefined, true);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.schema_migrations')).rows[0].count, 4);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.shops')).rows[0].count, 1);
  } finally { await db.close(); }
});
