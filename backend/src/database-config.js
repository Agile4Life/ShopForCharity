import fs from 'node:fs';

// pg URL SSL parameters override an explicit ssl object. Normalize them here so
// a supplied CA is never silently discarded by pg-connection-string.
export function databaseConfig(env, migration = false) {
  const prefix = migration ? 'MIGRATION_DB' : 'DB';
  const raw = migration
    ? env.MIGRATION_DATABASE_URL || env.MIGRATION_DB_URL
    : env.DATABASE_URL || env.DB_URL || env.DB_JDBC_URL;
  if (migration && !raw) throw new Error('Set MIGRATION_DATABASE_URL or MIGRATION_DB_URL with separate migration credentials.');
  const url = raw ? new URL(raw.replace(/^jdbc:/, '')) : null;
  if (url && !['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Database URL must use PostgreSQL.');
  const mode = url?.searchParams.get('sslmode');
  const sslSetting = env[`${prefix}_SSL`] ?? env.DB_SSL;
  const caPath = env[`${prefix}_SSL_CA_PATH`] || env.DB_SSL_CA_PATH;
  const supabaseHost = url && (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.pooler.supabase.com'));
  const ca = (env[`${prefix}_SSL_CA`] || env.DB_SSL_CA)?.replace(/\\n/g, '\n')
    || (caPath ? fs.readFileSync(caPath, 'utf8') : undefined)
    || (supabaseHost ? fs.readFileSync(new URL('../certs/supabase-ca.crt', import.meta.url), 'utf8') : undefined);
  const ssl = sslSetting === 'true' || (mode && mode !== 'disable') || ca
    ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
    : false;
  if (sslSetting === 'false' && mode && mode !== 'disable') throw new Error('DB_SSL=false conflicts with URL sslmode.');
  if (url) {
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
    const user = env[`${prefix}_USERNAME`] || env[`${prefix}_USER`];
    if (user && !url.username) url.username = user;
    if (env[`${prefix}_PASSWORD`] && !url.password) url.password = env[`${prefix}_PASSWORD`];
  }
  return {
    ...(url ? { connectionString: url.toString() } : {
      host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432),
      database: env.DB_NAME || 'schoolshop', user: env.DB_USERNAME || env.DB_USER || 'shop_runtime',
      password: env.DB_PASSWORD || '',
    }),
    ssl, max: Number(env.DB_POOL_MAX || 3), connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000, statement_timeout: 15000, lock_timeout: 5000,
  };
}
