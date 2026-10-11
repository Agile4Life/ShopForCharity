import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
export const dotenv = require('../../backend/node_modules/dotenv');
export const pg = require('../../backend/node_modules/pg');
export const statePath = fileURLToPath(new URL('../.tools/chat-live-accounts.json', import.meta.url));
export const backendEnv = () => dotenv.parse(fs.readFileSync(new URL('../../backend/.env', import.meta.url)));
export const frontendEnv = () => dotenv.parse(fs.readFileSync(new URL('../.env.local', import.meta.url)));
export type TestUser = { id: string; authId: string; email: string; password: string; fullName: string; role: string };
export type TestState = { users: TestUser[]; runId: string };
export const readState = (): TestState => JSON.parse(fs.readFileSync(statePath, 'utf8'));
export async function admin(path: string, method: string, body?: unknown) {
  const env = backendEnv();
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/${path}`, {
    method, headers: { apikey: env.SUPABASE_BACKEND_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_BACKEND_SECRET_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Auth test account administration HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
