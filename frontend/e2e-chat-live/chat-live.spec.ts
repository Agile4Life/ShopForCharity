import { test, expect, type Page } from '@playwright/test';
import { readState, frontendEnv, type TestUser } from './accounts';

async function login(page: Page, user: TestUser, target: string) {
  await page.goto(target);
  await expect(page).toHaveURL(/\/login/);
  await page.locator('#loginEmail').fill(user.email);
  await page.locator('#loginPass').fill(user.password);
  await page.locator('main form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
}
async function api(page: Page, path: string, method='GET', body?: unknown) {
  return page.evaluate(async ({path,method,body}) => {
    const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'))!;
    const token=JSON.parse(localStorage.getItem(key)!).access_token;
    const response=await fetch(`http://127.0.0.1:8081/api/v1${path}`,{method,
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  },{path,method,body});
}

test('real Supabase: two sellers share inbox, product context, unread and realtime replies',async({browser,page},info)=>{
  const [buyer,other,seller1,seller2]=readState().users;
  const sellerContext1=await browser.newContext(info.project.use),sellerContext2=await browser.newContext(info.project.use),otherContext=await browser.newContext(info.project.use);
  const s1=await sellerContext1.newPage(),s2=await sellerContext2.newPage(),outsider=await otherContext.newPage();
  const text=`Câu hỏi realtime ${info.project.name} ${Date.now()}`;
  const errors:string[]=[];
  const broadcasts=new Map<Page,number>();
  for(const p of [page,s1,s2,outsider]) {
    p.on('pageerror',e=>errors.push(e.message));
    p.on('websocket',ws=>ws.on('framereceived',frame=>{
      // Current Supabase uses binary kind 4 for received Broadcast frames.
      if(typeof frame.payload!=='string' && frame.payload[0]===4) { broadcasts.set(p,(broadcasts.get(p)||0)+1);return; }
      try { const data=JSON.parse(typeof frame.payload==='string'?frame.payload:frame.payload.toString('utf8'));if((Array.isArray(data)?data[3]:data.event)==='broadcast')broadcasts.set(p,(broadcasts.get(p)||0)+1); } catch { /* heartbeat or binary */ }
    }));
  }
  try {
    await login(page,buyer,'/account/chat');
    const products=await api(page,'/products?size=1');expect(products.status).toBe(200);expect(products.data.content.length).toBeGreaterThan(0);
    const product=products.data.content[0];
    await page.goto(`/account/chat?product=${product.id}`);
    await expect(page.locator('.chat-attachment')).toContainText(product.name);
    await expect(page.locator('.chat-connection')).toHaveText('Đã kết nối trò chuyện');
    await login(s1,seller1,'/seller/chat');await login(s2,seller2,'/seller');
    const own=await api(page,'/chat/conversation','POST',{});expect(own.status).toBe(200);const id=own.data.id;
    // Seller 1 reads the room while seller 2 only watches their inbox badge.
    await s1.goto(`/seller/chat?conversation=${id}`);await expect(s1.locator('.chat-connection')).toHaveText('Đã kết nối trò chuyện');
    await page.getByRole('textbox',{name:'Nội dung tin nhắn'}).fill(text);
    await page.getByRole('button',{name:'Gửi tin',exact:true}).click();
    await s1.bringToFront();
    await expect(s1.getByRole('log')).toContainText(text,{timeout:10000});
    await expect(s1.locator('.chat-product-card').last()).toContainText(product.name);
    await s2.bringToFront();
    await expect(s2.locator('.chat-launcher .chat-unread')).toBeVisible({timeout:10000});
    await expect.poll(async()=>(await api(sellerContext2.pages()[0],'/chat/unread')).data.count).toBeGreaterThan(0);
    await expect.poll(async()=>(await api(s1,'/chat/unread')).data.count).toBe(0);
    await s2.getByRole('button',{name:'Mở hộp thư khách hàng'}).click();await s2.getByRole('button',{name:new RegExp(buyer.fullName)}).click();await expect(s2.locator('.chat-connection')).toHaveText('Đã kết nối trò chuyện');
    const reply1=`Lan hỗ trợ ${Date.now()}`,reply2=`An hỗ trợ ${Date.now()}`;
    await s1.getByRole('textbox',{name:'Nội dung tin nhắn'}).fill(reply1);await s2.getByRole('textbox',{name:'Nội dung tin nhắn'}).fill(reply2);
    await Promise.all([s1.getByRole('button',{name:'Gửi tin',exact:true}).click(),s2.getByRole('button',{name:'Gửi tin',exact:true}).click()]);
    await page.bringToFront();
    await expect.poll(()=>broadcasts.get(page)||0,{timeout:10000}).toBeGreaterThan(0);
    await expect(page.getByRole('log')).toContainText(reply1,{timeout:10000});await expect(page.getByRole('log')).toContainText(reply2,{timeout:10000});
    await expect(s1.getByRole('log')).toContainText(reply2,{timeout:10000});await expect(s2.getByRole('log')).toContainText(reply1,{timeout:10000});
    await expect(page.getByRole('log')).toContainText(seller1.fullName);await expect(page.getByRole('log')).toContainText(seller2.fullName);
    // A second customer is denied history, replies and the private WS room.
    await login(outsider,other,'/account/chat');
    expect((await api(outsider,`/chat/conversations/${id}/messages`)).status).toBe(404);
    expect((await api(outsider,`/chat/conversations/${id}/messages`,'POST',{clientMessageId:crypto.randomUUID(),content:'Không được gửi'})).status).toBe(404);
    const env=frontendEnv();
    const denied=await outsider.evaluate(async ({id,url,key})=>{
      const modulePath='/node_modules/.vite/deps/@supabase_supabase-js.js';
      const {createClient}=await import(modulePath) as typeof import('@supabase/supabase-js');
      const storageKey=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'))!;
      const token=JSON.parse(localStorage.getItem(storageKey)!).access_token;
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});await client.realtime.setAuth(token);
      return new Promise<string>(resolve=>{
        const channel=client.channel(`chat:room:${id}`,{config:{private:true}});
        const timer=setTimeout(()=>{void client.removeChannel(channel);resolve('TIMEOUT');},12000);
        channel.subscribe(status=>{if(status==='SUBSCRIBED'||status==='CHANNEL_ERROR'){clearTimeout(timer);void client.removeChannel(channel);resolve(status);}});
      });
    },{id,url:env.VITE_SUPABASE_URL,key:env.VITE_SUPABASE_PUBLISHABLE_KEY});
    expect(denied).toBe('CHANNEL_ERROR');
    await page.reload();await expect(page.getByRole('log')).toContainText(text);await expect(page.getByRole('log')).toContainText(reply2);
    await page.screenshot({path:info.outputPath('customer-chat.png'),fullPage:true});await s1.screenshot({path:info.outputPath('shared-seller-inbox.png'),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await sellerContext1.close();await sellerContext2.close();await otherContext.close(); }
});

test('real Supabase: guest must login, product retained, lost response retries only once',async({page},info)=>{
  const buyer=readState().users[0];
  await page.goto('/');await page.getByRole('button',{name:'Chat với gian hàng',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Để sau',exact:true}).click();
  const productLink=page.locator('.product-card-title a').first();await expect(productLink).toBeVisible();await productLink.click();
  await page.getByRole('button',{name:/Hỏi về/}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('link',{name:'Đăng nhập để chat'}).click();
  await page.locator('#loginEmail').fill(buyer.email);await page.locator('#loginPass').fill(buyer.password);await page.locator('main form button[type="submit"]').click();await expect(page).toHaveURL(/\/account\/chat/);await expect(page.locator('.chat-attachment')).toBeVisible();
  let dropped=false;const intents:string[]=[];
  await page.route('**/chat/conversations/*/messages',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    intents.push(route.request().postDataJSON().clientMessageId);
    if(dropped)return route.continue();
    dropped=true;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');
  });
  const text=`Gửi lại an toàn ${info.project.name} ${Date.now()}`;
  await page.getByRole('textbox',{name:'Nội dung tin nhắn'}).fill(text);await page.getByRole('button',{name:'Gửi tin',exact:true}).click();await expect(page.locator('.chat-send-error')).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Nội dung tin nhắn'})).toHaveValue(text);await page.getByRole('button',{name:'Gửi lại',exact:true}).click();await expect(page.getByRole('log')).toContainText(text);
  expect(intents).toHaveLength(2);expect(intents[0]).toBe(intents[1]);
  const own=await api(page,'/chat/conversation','POST',{}),history=await api(page,`/chat/conversations/${own.data.id}/messages`);
  expect(history.data.content.filter((m:{content:string})=>m.content===text)).toHaveLength(1);
});
