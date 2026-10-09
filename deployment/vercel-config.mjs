/** Vercel build-time config, shared with offline deployment contract checks. */
export function createVercelConfig(env) {
  if (!env.BACKEND_ORIGIN) {
    throw new Error('Set BACKEND_ORIGIN to the HTTPS origin of the Spring Boot service.');
  }
  let backend;
  try {
    backend = new URL(env.BACKEND_ORIGIN);
  } catch {
    throw new Error('BACKEND_ORIGIN must be an HTTPS origin, without a path or credentials.');
  }
  if (
    backend.protocol !== 'https:' ||
    backend.username || backend.password || backend.search || backend.hash ||
    backend.pathname !== '/' || backend.hostname === 'localhost' ||
    backend.hostname === '127.0.0.1' || backend.hostname === '[::1]'
  ) {
    throw new Error('BACKEND_ORIGIN must be a public HTTPS origin, without a path or credentials.');
  }
  if (env.VITE_API_BASE_URL && env.VITE_API_BASE_URL !== '/api/v1') {
    throw new Error('For Vercel guest-cookie routing, set VITE_API_BASE_URL=/api/v1.');
  }
  let auth;
  try {
    auth = new URL(env.VITE_SUPABASE_URL);
  } catch {
    throw new Error('Set VITE_SUPABASE_URL to the HTTPS Supabase project origin.');
  }
  if (auth.protocol !== 'https:' || auth.username || auth.password || auth.search ||
      auth.hash || auth.pathname !== '/') {
    throw new Error('VITE_SUPABASE_URL must be an HTTPS project origin.');
  }
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let legacyAnon = false;
  if (publicKey?.split('.').length === 3) {
    try {
      legacyAnon = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role === 'anon';
    } catch { /* Not a valid legacy public key. */ }
  }
  if (!publicKey || (!publicKey.startsWith('sb_publishable_') && !legacyAnon)) {
    throw new Error('Set a Supabase publishable/anon client key; secret/service keys cannot enter the FE build.');
  }
  return {
    framework: 'vite',
    installCommand: 'npm --prefix frontend ci',
    buildCommand: 'npm --prefix frontend run build',
    outputDirectory: 'frontend/dist',
    rewrites: [
      { source: '/api/:path*', destination: `${backend.origin}/api/:path*` },
      { source: '/((?!api(?:/|$)|assets(?:/|$)).*)', destination: '/index.html' },
    ],
    headers: [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
    ],
  };
}
