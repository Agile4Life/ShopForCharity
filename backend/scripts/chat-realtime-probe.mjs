// Narrow diagnostics for database Broadcast; no customer data or tokens logged.
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { createRequire } from 'node:module';
import { databaseConfig } from '../src/database-config.js';
const require = createRequire(new URL('../../frontend/package.json',import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const env=dotenv.parse(fs.readFileSync(new URL('../.env',import.meta.url)));
const front=dotenv.parse(fs.readFileSync(new URL('../../frontend/.env.local',import.meta.url)));
const pool=new pg.Pool(databaseConfig(env));
const id=crypto.randomUUID(),conversation=crypto.randomUUID(),password=crypto.randomBytes(24).toString('base64url')+'!Aa1';
const client=createClient(env.SUPABASE_URL,front.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let authId;
const adminHeaders={apikey:env.SUPABASE_BACKEND_SECRET_KEY,Authorization:`Bearer ${env.SUPABASE_BACKEND_SECRET_KEY}`,'Content-Type':'application/json'};
try {
  const email=`chat-probe-${id}@example.com`;
  const response=await fetch(env.SUPABASE_URL+'/auth/v1/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email,password,email_confirm:true}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Create test account HTTP ${response.status}`);
  authId=(await response.json()).id;
  await pool.query("INSERT INTO shop.profiles(id,auth_user_id,email,full_name,role,active,version,created_at,updated_at) VALUES($1,$2,$3,'Transport probe','SELLER',true,0,now(),now())",[id,authId,email]);
  await pool.query('INSERT INTO shop.chat_conversations(id,shop_id,customer_id) VALUES($1,$2,$3)',[conversation,env.APP_SHOP_ID||'00000000-0000-0000-0000-000000000001',id]);
  const login=await client.auth.signInWithPassword({email,password});if(login.error)throw new Error('Probe login failed');
  await client.realtime.setAuth(login.data.session.access_token);
  let resolveEvent;const received=new Promise(resolve=>{resolveEvent=resolve;});
  const channel=client.channel('chat:inbox:sellers',{config:{private:true}}).on('broadcast',{event:'*'},payload=>{console.log('Broadcast received:',payload.event);resolveEvent(true);});
  await new Promise((resolve,reject)=>{channel.subscribe((status,error)=>{console.log('Subscription:',status);if(status==='SUBSCRIBED')resolve();if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')reject(new Error('Probe subscription failed'));});});
  await pool.query(`UPDATE shop.chat_conversations SET last_sequence=1 WHERE id=$1`,[conversation]);
  await pool.query(`INSERT INTO shop.chat_messages(id,conversation_id,sequence,sender_id,client_message_id,content) VALUES($1,$2,1,$3,$4,'Transport test')`,[crypto.randomUUID(),conversation,id,crypto.randomUUID()]);
  let timer;const delivered=await Promise.race([received,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),12000);})]);clearTimeout(timer);
  console.log('Database broadcast delivered:',delivered);if(!delivered)process.exitCode=1;
} finally {
  await client.removeAllChannels();await client.auth.signOut();
  await pool.query('DELETE FROM shop.chat_conversations WHERE id=$1 AND customer_id=$2',[conversation,id]);
  await pool.query('DELETE FROM shop.profiles WHERE id=$1 AND auth_user_id=$2',[id,authId]);
  if(authId){const response=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${authId}`,{method:'DELETE',headers:adminHeaders,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`Probe cleanup HTTP ${response.status}`);}
  await pool.end();console.log('Probe account and data removed.');
}
