import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { withTx } from '../common/db.js';
import { ApiException } from '../common/api-exception.js';
import { normalizePhone } from './phone.js';

export async function provisionCustomer(user, input, transact = withTx) {
  await transact(client => client.query(`INSERT INTO shop.profiles
    (id,auth_user_id,email,full_name,phone,role,active,version,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,'CUSTOMER',true,0,now(),now())
    ON CONFLICT(auth_user_id) DO NOTHING`,
  [randomUUID(),user.id,user.email,input.fullName,input.phone]));
}

export class CustomerRegistration {
  constructor({ settings = config, fetcher = fetch, provision = provisionCustomer } = {}) {
    this.settings = settings; this.fetcher = fetcher; this.provision = provision;
  }
  async register(input) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    ApiException.check(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      && password.length >= 6 && password.length <= 128 && fullName.length >= 2 && fullName.length <= 100,
      400,'CUSTOMER_REGISTRATION_INPUT','Kiểm tra email, họ tên và mật khẩu.');
    const phone = normalizePhone(input.phone);
    const { settings } = this;
    ApiException.check(settings.supabaseUrl && settings.supabaseStorageKey,
      503,'CUSTOMER_REGISTRATION_UNAVAILABLE','Đăng ký tài khoản chưa khả dụng.');
    let response, user;
    try {
      response = await this.fetcher(`${settings.supabaseUrl}/auth/v1/admin/users`, {
        method:'POST', headers:{ apikey:settings.supabaseStorageKey,
          Authorization:`Bearer ${settings.supabaseStorageKey}`,'Content-Type':'application/json' },
        body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name:fullName,phone}}),
        signal:AbortSignal.timeout(12000),
      });
      user = await response.json();
    } catch { throw new ApiException(503,'CUSTOMER_REGISTRATION_UNKNOWN','Chưa xác nhận được kết quả đăng ký. Thử đăng nhập trước khi đăng ký lại.'); }
    if (!response.ok) {
      const code = user?.error_code || user?.code;
      if (['email_exists','user_already_exists'].includes(code)) throw new ApiException(409,'CUSTOMER_EMAIL_EXISTS','Email đã được sử dụng.');
      if (code === 'weak_password') throw new ApiException(400,'weak_password','Mật khẩu chưa đủ mạnh.');
      if (response.status === 429) throw new ApiException(429,'RATE_LIMITED','Vui lòng thử lại sau.');
      throw new ApiException(503,'CUSTOMER_REGISTRATION_UNAVAILABLE','Chưa tạo được tài khoản.');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.id || '')
      || user.email?.toLowerCase() !== email || !user.email_confirmed_at)
      throw new ApiException(503,'CUSTOMER_REGISTRATION_UNKNOWN','Chưa xác nhận được kết quả đăng ký.');
    try { await this.provision(user,{fullName,phone}); }
    catch { throw new ApiException(503,'CUSTOMER_PROFILE_PENDING','Tài khoản đã tạo. Vui lòng thử đăng nhập để tải thông tin.'); }
    return {success:true};
  }
}
const registration = new CustomerRegistration();
export const customerRegistrationRouter = Router();
customerRegistrationRouter.post('/auth/register',async(req,res,next)=>{
  try { res.status(201).json(await registration.register(req.body || {})); }
  catch(error) { next(error); }
});
