import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pg, admin, backendEnv, statePath, type TestState } from './accounts';
import { cleanup } from './teardown';

export default async function setup() {
  const env = backendEnv();
  const { databaseConfig } = await import('../../backend/src/database-config.js');
  // Recover only accounts explicitly recorded by an earlier interrupted run.
  if (fs.existsSync(statePath)) await cleanup();
  const pool = new pg.Pool(databaseConfig(env));
  const state: TestState = { users: [], runId: crypto.randomUUID() };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  save();
  try {
    for (const [name, role] of [['Khách thử A', 'CUSTOMER'], ['Khách thử B', 'CUSTOMER'], ['Người bán thử Lan', 'SELLER'], ['Người bán thử An', 'SELLER']]) {
      const id = crypto.randomUUID(), password = `${crypto.randomBytes(24).toString('base64url')}!Aa1`;
      const email = `chat-e2e-${state.runId.slice(0, 8)}-${state.users.length}@example.com`;
      const user = await admin('users', 'POST', { email, password, email_confirm: true, user_metadata: { full_name: name } });
      const account = { id, authId: user.id, email, password, fullName: name, role };
      state.users.push(account); save();
      await pool.query(`INSERT INTO shop.profiles(id,auth_user_id,email,full_name,role,active,version,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,true,0,now(),now())`, [id, user.id, email, name, role]);
    }
    console.log('Provisioned four temporary accounts for real Supabase chat tests.');
  } catch (error) { await cleanup(); throw error; }
  finally { await pool.end(); }
}
