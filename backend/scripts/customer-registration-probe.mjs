// Verifies the running local website against Supabase Auth/DB using one temporary customer.
// No password, token or existing user data is printed; only this run's account is removed.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from '../node_modules/dotenv/lib/main.js';
import pg from '../node_modules/pg/lib/index.js';
import { chromium, expect } from '../../frontend/node_modules/@playwright/test/index.mjs';
import { databaseConfig } from '../src/database-config.js';
const env=dotenv.parse(fs.readFileSync(new URL('../.env',import.meta.url)));
const publicEnv=dotenv.parse(fs.readFileSync(new URL('../../frontend/.env.local',import.meta.url)));
const email=`registration-e2e-${crypto.randomUUID()}@example.com`,password=`${crypto.randomBytes(24).toString('base64url')}!Aa1`;
const pool=new pg.Pool(databaseConfig(env));
const browser=await chromium.launch({headless:true});
let authId;
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/register');
 await page.locator('#regName').fill('Khách đăng ký thử');await page.locator('#regPhone').fill('0912345678');
 await page.locator('#regEmail').fill(email);await page.locator('#regPass').fill(password);
 await page.locator('main form button[type="submit"]').click();
 await expect(page.getByRole('status').filter({hasText:'Đã tạo tài khoản thành công'})).toBeVisible({timeout:25000});
 authId=await page.evaluate(()=>{
  const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
  return key?JSON.parse(localStorage.getItem(key)).user.id:null;
 });
 assert.ok(authId,'Registration must sign in immediately without verification email');
 await page.goto('http://127.0.0.1:5173/account/profile');
 await expect(page.locator('#profName')).toHaveValue('Khách đăng ký thử',{timeout:25000});await expect(page.locator('#profPhone')).toHaveValue('0912345678');
 const context=await browser.newContext();const duplicate=await context.newPage();await duplicate.goto('http://127.0.0.1:5173/register');
 await duplicate.locator('#regName').fill('Không thay đổi');await duplicate.locator('#regPhone').fill('0912345678');
 await duplicate.locator('#regEmail').fill(email);await duplicate.locator('#regPass').fill('Different123!');
 await duplicate.locator('main form button[type="submit"]').click();
 await expect(duplicate.getByText('Email này đã được sử dụng. Đăng nhập hoặc dùng email khác để đăng ký.',{exact:true})).toBeVisible({timeout:25000});
 await context.close();await page.close();
 const login=await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(15000)});
 assert.equal(login.status,200,'Duplicate registration must preserve the original password');
 const session=await login.json();assert.equal(session.user.id,authId);assert.ok(session.user.email_confirmed_at);
 console.log('PASS: registration logs in immediately, name/phone retained, duplicate email rejected and password unchanged.');
}finally{
 await browser.close();
 try{
  // Recover the exact account ID even if the UI failed after Auth committed.
  if(!authId){const response=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,{headers:{apikey:env.SUPABASE_BACKEND_SECRET_KEY,Authorization:`Bearer ${env.SUPABASE_BACKEND_SECRET_KEY}`},signal:AbortSignal.timeout(15000)});const data=await response.json();authId=data.users?.find(u=>u.email===email)?.id;}
  if(authId){
   await pool.query('DELETE FROM shop.profiles WHERE auth_user_id=$1 AND email=$2',[authId,email]);
   const removed=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${authId}`,{method:'DELETE',headers:{apikey:env.SUPABASE_BACKEND_SECRET_KEY,Authorization:`Bearer ${env.SUPABASE_BACKEND_SECRET_KEY}`},signal:AbortSignal.timeout(15000)});
   assert.ok(removed.ok,'Temporary Auth account cleanup failed');
   console.log('Temporary registration account and profile removed.');
  }
 }finally{await pool.end();}
}
