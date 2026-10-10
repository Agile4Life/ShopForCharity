import fs from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../src/config.js';

// Read-only snapshot of the configured database. Never prints credentials or buyer data.
const client = new pg.Client(config.db);
const expected = new PGlite();
const directory = new URL('../src/main/resources/db/migration/', import.meta.url);
const files = fs.readdirSync(directory).filter(name => /^V\d+__.*\.sql$/.test(name)).sort();
const columnsSql = `SELECT table_name,column_name,data_type,is_nullable,column_default
 FROM information_schema.columns WHERE table_schema='shop' ORDER BY table_name,ordinal_position`;
const structureSql = `SELECT c.relname AS table_name, con.conname, con.contype,
 pg_get_constraintdef(con.oid) AS definition,con.convalidated AS validated FROM pg_constraint con
 JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='shop' AND con.contype<>'n' ORDER BY c.relname,con.conname`;
try {
  for (const file of files) await expected.exec(fs.readFileSync(new URL(file, directory), 'utf8'));
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const report = { checkedAt: new Date().toISOString() };
  report.identity = (await client.query(`SELECT current_user AS role,current_database() AS database,
    current_setting('server_version') AS version`)).rows[0];
  report.identity.clientTls = client.connection.stream.encrypted === true;
  const frontendEnv = fs.readFileSync(new URL('../../frontend/.env.local', import.meta.url),'utf8');
  const frontendUrl = frontendEnv.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^"'\r\n]+)/m)?.[1];
  report.environment = {
    supabaseAuthMatchesBackend: process.env.JWT_ISSUER_URI === `${config.supabaseUrl}/auth/v1`,
    frontendAuthMatchesBackend: frontendUrl === config.supabaseUrl,
    migrationsEnabled: config.migrationsEnabled, poolMax: config.db.max,
    tlsVerified: config.db.ssl?.rejectUnauthorized === true,
  };
  const wanted = (await expected.query(columnsSql)).rows;
  const actual = (await client.query(columnsSql)).rows;
  const key = row => `${row.table_name}.${row.column_name}`;
  const actualMap = new Map(actual.map(row => [key(row),row]));
  report.schema = {
    expectedTables: new Set(wanted.map(row => row.table_name)).size,
    actualTables: new Set(actual.map(row => row.table_name)).size,
    missingColumns: wanted.filter(row => !actualMap.has(key(row))).map(key),
    columnDifferences: wanted.filter(row => actualMap.has(key(row)) &&
      ['data_type','is_nullable'].some(field => row[field] !== actualMap.get(key(row))[field])).map(key),
    defaultDifferences: wanted.filter(row => actualMap.has(key(row)) && row.column_default !== actualMap.get(key(row)).column_default).map(key),
  };
  const constraints = (await client.query(structureSql)).rows;
  const expectedConstraints = (await expected.query(structureSql)).rows;
  report.schema.missingConstraints = expectedConstraints.filter(row => !constraints.some(actualRow =>
    actualRow.table_name === row.table_name && actualRow.contype === row.contype && actualRow.definition === row.definition));
  report.schema.unvalidatedConstraints = constraints.filter(row => !row.validated);
  const indexes = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='shop'")).rows;
  const expectedIndexes = (await expected.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='shop'")).rows;
  report.schema.missingIndexes = expectedIndexes
    .filter(row => !indexes.some(index => index.tablename === row.tablename && index.indexname === row.indexname));
  report.schema.indexDifferences = expectedIndexes.filter(row => indexes.some(index =>
    index.tablename === row.tablename && index.indexname === row.indexname && index.indexdef !== row.indexdef));
  report.tables = [];
  for (const table of new Set(wanted.map(row => row.table_name))) {
    if (!actual.some(row => row.table_name === table)) {
      report.tables.push({ table, count: null, missing: true });
      continue;
    }
    const privileges = (await client.query(`SELECT has_table_privilege(current_user,$1,'SELECT') AS select,
      has_table_privilege(current_user,$1,'INSERT') AS insert,has_table_privilege(current_user,$1,'UPDATE') AS update,
      has_table_privilege(current_user,$1,'DELETE') AS delete`, [`shop.${table}`])).rows[0];
    const count = privileges.select && actual.some(row => row.table_name === table)
      ? (await client.query(`SELECT count(*)::int AS count FROM shop."${table}"`)).rows[0].count : null;
    report.tables.push({ table, count, privileges });
  }
  report.migrations = [];
  for (const table of ['schema_migrations','flyway_schema_history']) {
    const exists = (await client.query('SELECT to_regclass($1) AS table', [`shop.${table}`])).rows[0].table;
    if (!exists) continue;
    const readable = (await client.query("SELECT has_table_privilege(current_user,$1,'SELECT') AS readable", [exists])).rows[0].readable;
    const history = readable ? (await client.query(table === 'schema_migrations'
      ? 'SELECT version,checksum FROM shop.schema_migrations ORDER BY version'
      : 'SELECT version,script,success FROM shop.flyway_schema_history ORDER BY installed_rank')).rows : null;
    report.migrations.push({ table, readable, history });
    if (history && table === 'schema_migrations') report.schema.checksumMismatches = files.filter(file =>
      history.find(row => row.version === file)?.checksum !== createHash('sha256').update(fs.readFileSync(new URL(file,directory))).digest('hex'));
  }
  report.shop = (await client.query(`SELECT id,name,accepting_orders,version,updated_at,
    payment_settings_version_id IS NOT NULL AS bank_configured,
    (SELECT count(*)::int FROM shop.pickup_points p WHERE p.shop_id=s.id AND active) AS active_pickup_points,
    (SELECT count(*)::int FROM shop.products p WHERE p.shop_id=s.id AND status='ACTIVE') AS active_products
    FROM shop.shops s WHERE id=$1`, [config.shopId])).rows[0];
  report.profiles = (await client.query('SELECT role,active,count(*)::int AS count FROM shop.profiles GROUP BY role,active')).rows;
  report.integrity = (await client.query(`SELECT
    (SELECT count(*)::int FROM shop.products p LEFT JOIN shop.product_inventory i ON i.id=p.id WHERE i.id IS NULL) AS missing_inventory,
    (SELECT count(*)::int FROM shop.product_inventory WHERE stock_reserved<0 OR stock_on_hand<stock_reserved) AS invalid_stock,
    (SELECT count(*)::int FROM shop.product_inventory i WHERE stock_reserved<>(SELECT coalesce(sum(quantity),0) FROM shop.stock_reservations r WHERE r.product_id=i.id AND state='HELD')) AS reservation_mismatches,
    (SELECT count(*)::int FROM shop.orders o WHERE total<>(SELECT coalesce(sum(line_total),0) FROM shop.order_items i WHERE i.order_id=o.id)) AS order_total_mismatches,
    (SELECT count(*)::int FROM shop.orders WHERE status='COMPLETED' AND payment_status<>'PAID') AS completed_unpaid,
    (SELECT count(*)::int FROM shop.orders WHERE status='PENDING_CONTACT' AND reservation_expires_at<now()) AS expired_pending_orders`)).rows[0];
  report.schemaAccess = (await client.query(`SELECT rolname,has_schema_privilege(rolname,'shop','USAGE') AS usage
    FROM pg_roles WHERE rolname IN ('anon','authenticated',current_user)`)).rows;
  await client.query('ROLLBACK');
  const storage = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
    headers: { apikey: config.supabaseStorageKey, Authorization: `Bearer ${config.supabaseStorageKey}` },
  });
  report.storage = { status: storage.status, buckets: storage.ok ? (await storage.json()).map(bucket => ({ name:bucket.name, public:bucket.public })) : [] };
  if (process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
  console.log(JSON.stringify({ ...report, tables: report.tables.map(({table,count}) => ({table,count})) },null,2));
} catch (error) {
  console.error('Database audit failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
  await expected.close();
}
