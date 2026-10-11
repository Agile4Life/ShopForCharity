import fs from 'node:fs';
import crypto from 'node:crypto';
import { pg, admin, backendEnv, readState, statePath } from './accounts';

export async function cleanup() {
  if (!fs.existsSync(statePath)) return;
  const state = readState(), env = backendEnv();
  const { databaseConfig } = await import('../../backend/src/database-config.js');
  const pool = new pg.Pool(databaseConfig(env));
  try {
    const ids = state.users.map(u => u.id);
    // Exact IDs from this run only; never delete by email patterns or role.
    await pool.query('DELETE FROM shop.chat_conversations WHERE customer_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM shop.chat_reads WHERE profile_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM shop.profiles WHERE id=ANY($1::uuid[]) AND auth_user_id=ANY($2::uuid[])', [ids, state.users.map(u => u.authId)]);
    const hashes = ids.map(id => crypto.createHash('sha256').update(`chat:${id}`).digest('hex'));
    await pool.query('DELETE FROM shop.rate_limit_windows WHERE key_hash=ANY($1::text[])', [hashes]);
    for (const user of state.users) await admin(`users/${user.authId}`, 'DELETE');
    fs.unlinkSync(statePath);
    console.log('Temporary chat conversations, profiles, counters and Auth accounts removed.');
  } finally { await pool.end(); }
}
export default async function teardown() {
  const stopped = await fetch('http://127.0.0.1:8081/__chat_test_stop', { method: 'POST', signal: AbortSignal.timeout(30000) })
    .catch((error: Error & { cause?: { code?: string } }) => {
      if (error.cause?.code === 'ECONNREFUSED') return null;
      throw error;
    });
  // A server that never started has no requests to drain. A running server
  // must acknowledge shutdown before cleanup removes its test accounts.
  if (stopped && !stopped.ok) throw new Error('Chat test API could not drain before cleanup.');
  await cleanup();
}
