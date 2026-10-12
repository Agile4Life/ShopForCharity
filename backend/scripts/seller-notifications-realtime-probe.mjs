// Opt-in live transport test: creates only its own temporary account and
// notification, without creating an order or changing shop stock/settings.
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { createRequire } from 'node:module';
import { databaseConfig } from '../src/database-config.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to test the configured Supabase project.');
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const env = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const front = dotenv.parse(fs.readFileSync(new URL('../../frontend/.env.local', import.meta.url)));
const pool = new pg.Pool(databaseConfig(env));
const profileId = crypto.randomUUID(), notificationId = crypto.randomUUID();
const password = crypto.randomBytes(24).toString('base64url') + '!Aa1';
const email = `seller-notification-probe-${profileId}@example.com`;
const client = createClient(env.SUPABASE_URL, front.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = { apikey: env.SUPABASE_BACKEND_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_BACKEND_SECRET_KEY}`, 'Content-Type': 'application/json' };
let authId;
let insertedProfile = false;
let timer;
try {
  const created = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers, body: JSON.stringify({ email, password, email_confirm: true }), signal: AbortSignal.timeout(15000),
  });
  if (!created.ok) throw new Error(`Create probe account HTTP ${created.status}`);
  authId = (await created.json()).id;
  await pool.query(`INSERT INTO shop.profiles(id,auth_user_id,email,full_name,role,active,version,created_at,updated_at)
    VALUES($1,$2,$3,'Notification transport probe','SELLER',true,0,now(),now())`, [profileId, authId, email]);
  insertedProfile = true;
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw new Error('Probe login failed');
  await client.realtime.setAuth(login.data.session.access_token);
  let receive;
  const event = new Promise(resolve => { receive = resolve; });
  const channel = client.channel(`seller:notifications:${profileId}`, { config: { private: true } })
    .on('broadcast', { event: 'changed' }, message => {
      console.log('Broadcast event:', message.event, 'payload keys:', Object.keys(message.payload || {}).join(','));
      if (message.payload.notificationId === notificationId) receive(message.payload);
    });
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Probe subscription timeout')), 15000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(deadline); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(deadline); reject(new Error('Probe subscription rejected')); }
    });
  });
  console.log('Private seller channel subscribed.');
  await pool.query(`INSERT INTO shop.notifications(id,shop_id,recipient_profile_id,type,is_read,version,created_at,updated_at)
    VALUES($1,$2,$3,'ORDER_CREATED',false,0,now(),now())`, [notificationId, env.APP_SHOP_ID || '00000000-0000-0000-0000-000000000001', profileId]);
  const payload = await Promise.race([event, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Database broadcast was not delivered')), 15000); })]);
  clearTimeout(timer);
  if (!payload.notificationId || Object.keys(payload).some(key => !['notificationId', 'id'].includes(key))) throw new Error('Unexpected broadcast payload');
  console.log('Database notification delivered over the real WebSocket; payload contains identifiers only.');
  const denied = client.channel(`seller:notifications:${crypto.randomUUID()}`, { config: { private: true } });
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Foreign topic authorization timeout')), 15000);
    denied.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(deadline); reject(new Error('Foreign notification topic was accessible')); }
      if (status === 'CHANNEL_ERROR') { clearTimeout(deadline); resolve(); }
    });
  });
  console.log('Another seller topic rejected.');
} finally {
  clearTimeout(timer);
  await client.removeAllChannels();
  await client.auth.signOut();
  try {
    if (insertedProfile) {
      await pool.query('DELETE FROM shop.notifications WHERE id=$1 AND recipient_profile_id=$2', [notificationId, profileId]);
      await pool.query('DELETE FROM shop.profiles WHERE id=$1 AND auth_user_id=$2', [profileId, authId]);
    }
    if (authId) {
      const removed = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${authId}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(15000) });
      if (!removed.ok) throw new Error(`Probe account cleanup HTTP ${removed.status}`);
    }
    console.log('Temporary probe account and notification removed.');
  } finally { await pool.end(); }
}
