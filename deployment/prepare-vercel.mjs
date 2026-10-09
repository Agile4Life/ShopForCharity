import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from '../backend/node_modules/dotenv/lib/main.js';
import { createDeployEnv } from './deploy-env.mjs';

const root = new URL('../', import.meta.url);
function readEnv(relative) {
  const file = new URL(relative, root);
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}
const output = new URL('.vercel/deploy.env', root);
const env = createDeployEnv(readEnv('backend/.env'), {
  ...readEnv('frontend/.env'), ...readEnv('frontend/.env.local'),
}, readEnv('.vercel/deploy.env'), process.argv[2]);
fs.mkdirSync(new URL('.vercel/', root), { recursive: true });
// No secrets in terminal output and no migration credentials in this export.
fs.writeFileSync(output, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
console.log(`Prepared ${Object.keys(env).length} deployment variables in ${fileURLToPath(output)}.`);
console.log(`Website origin: ${env.CORS_ALLOWED_ORIGINS}`);
console.log('Import this private file into Vercel Environment Variables; do not commit or share it.');
