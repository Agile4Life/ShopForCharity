import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { CustomerRegistration, provisionCustomer } from '../src/identity/customer-registration.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { pool } from '../src/common/db.js';
import app from '../src/app.js';

const settings = { supabaseUrl:'https://auth.example.com',supabaseStorageKey:'test-secret' };
const input = { email:' TEST@example.com ',password:'Secret123!',fullName:' Khách Test ',phone:'+84 912 345 678' };
const user = () => ({id:randomUUID(),email:'test@example.com',email_confirmed_at:new Date().toISOString()});

test('customer registration validates before Auth and ignores submitted privilege metadata',async()=>{
  const blocked = new CustomerRegistration({settings,fetcher:()=>assert.fail('Invalid input must not call Auth')});
  for(const change of [{email:'invalid'},{password:'short'},{password:'x'.repeat(129)},{fullName:'x'}])
    await assert.rejects(blocked.register({...input,...change}),{code:'CUSTOMER_REGISTRATION_INPUT'});
  await assert.rejects(blocked.register({...input,phone:'bad'}),{code:'INVALID_PHONE'});
  const created = user();let provisioned = false;
  const service = new CustomerRegistration({settings,fetcher:async(url,options)=>{
    assert.equal(url,`${settings.supabaseUrl}/auth/v1/admin/users`);
    assert.deepEqual(JSON.parse(options.body),{email:'test@example.com',password:input.password,email_confirm:true,
      user_metadata:{full_name:'Khách Test',phone:'0912345678'}});
    return Response.json(created);
  },provision:async(value,details)=>{assert.deepEqual(value,created);assert.deepEqual(details,{fullName:'Khách Test',phone:'0912345678'});provisioned=true;}});
  assert.deepEqual(await service.register({...input,role:'SELLER',app_metadata:{seller_shop_id:'forged'}}),{success:true});
  assert.equal(provisioned,true);
});

test('duplicate customer email never updates the existing account; provider failures are sanitized',async()=>{
  for(const [status,code,expected] of [[422,'email_exists','CUSTOMER_EMAIL_EXISTS'],[422,'user_already_exists','CUSTOMER_EMAIL_EXISTS'],
    [400,'weak_password','weak_password'],[429,'too_many_requests','RATE_LIMITED'],[500,'internal','CUSTOMER_REGISTRATION_UNAVAILABLE']]){
    const service = new CustomerRegistration({settings,fetcher:async()=>Response.json({code:status,error_code:code,message:'secret SQL stack'}, {status}),
      provision:()=>assert.fail('Do not modify existing account')});
    await assert.rejects(service.register(input),error=>error.code===expected&&!error.message.includes('secret'));
  }
});

test('unknown create result, missing confirmation and profile failure have recovery errors',async()=>{
  const broken = new CustomerRegistration({settings,fetcher:async()=>{throw new Error('secret');}});
  await assert.rejects(broken.register(input),{code:'CUSTOMER_REGISTRATION_UNKNOWN'});
  for(const created of [{},{...user(),email_confirmed_at:null},{...user(),email:'other@example.com'}]){
    const service = new CustomerRegistration({settings,fetcher:async()=>Response.json(created),provision:()=>assert.fail('Invalid response')});
    await assert.rejects(service.register(input),{code:'CUSTOMER_REGISTRATION_UNKNOWN'});
  }
  const pending = new CustomerRegistration({settings,fetcher:async()=>Response.json(user()),provision:async()=>{throw new Error('SQL secret');}});
  await assert.rejects(pending.register(input),{code:'CUSTOMER_PROFILE_PENDING'});
});

test('PostgreSQL customer profile retains name/phone; public registration enforces origin and shared rate limit',async()=>{
  const db = new PGlite();
  const query = (sql,params) => sql.includes('pg_advisory_xact_lock') ? Promise.resolve({rows:[]})
    : params ? db.query(sql,params) : db.exec(sql).then(results=>results.at(-1));
  try{
    await applyMigrations({query});pool.query=query;
    const created=user();await provisionCustomer(created,{fullName:'Khách Test',phone:'0912345678'},fn=>fn({query}));
    const profile=(await db.query('SELECT full_name,phone,role FROM shop.profiles WHERE auth_user_id=$1',[created.id])).rows[0];
    assert.deepEqual(profile,{full_name:'Khách Test',phone:'0912345678',role:'CUSTOMER'});
    const noOrigin=await request(app).post('/api/v1/auth/register').set('Authorization','Bearer forged').send(input);
    assert.equal(noOrigin.status,403);
    for(const path of ['/api/v1/auth/register','/api/v1/auth/register/','/API/V1/AUTH/REGISTER','/api/v1/auth/register','/api/v1/auth/register']){
      const res=await request(app).post(path).set('Origin','http://localhost:5173').send({});assert.equal(res.status,400);
    }
    const limited=await request(app).post('/api/v1/auth/register').set('Origin','http://localhost:5173').send({});
    assert.equal(limited.status,429);assert.equal(limited.headers['retry-after'],'60');
  } finally { await db.close(); }
});
