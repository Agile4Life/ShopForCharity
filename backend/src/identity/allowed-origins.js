export function allowedOrigins(env) {
  const origins = new Set((env.CORS_ALLOWED_ORIGINS || (env.VERCEL === '1' ? '' : 'http://localhost:5173'))
    .split(',').map(value => value.trim()).filter(Boolean));
  if (env.VERCEL === '1') {
    for (const name of ['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL']) {
      const host = env[name];
      if (!host) continue;
      const url = new URL(`https://${host}`);
      if (url.hostname !== host || url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw new Error(`Invalid ${name} deployment hostname.`);
      }
      origins.add(url.origin);
    }
  }
  return [...origins];
}
