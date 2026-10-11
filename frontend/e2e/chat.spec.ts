import { test, expect, product, ids } from './fixtures';
import type { Page } from '@playwright/test';
import type { ChatMessage, Conversation } from '../src/features/chat/api';

const conversationId = '00000000-0000-4000-8000-000000000081';
const sellerId = '00000000-0000-4000-8000-000000000082';
function message(sequence: number, content: string, seller = false): ChatMessage {
  return { id: `chat-${sequence}`, conversationId, sequence, senderId: seller ? sellerId : ids.user,
    senderName: seller ? 'Người bán Lan' : 'Khách hàng Test', senderRole: seller ? 'SELLER' : 'CUSTOMER',
    clientMessageId: `intent-${sequence}`, content, product: null, createdAt: '2026-10-11T09:00:00Z' };
}
class ChatScenario {
  messages: ChatMessage[] = [];
  attempts: { clientMessageId: string; content: string; productId?: string }[] = [];
  reads: number[] = [];
  failSend = false; failHistory = false; failInbox = false; unread = 0;
  constructor(private page: Page) {}
  summary(): Conversation { return { id: conversationId, customerName: 'Khách hàng Test', lastSequence: this.messages.length, unreadCount: this.unread, recipientReadSequence: 0,
    lastMessage: this.messages.at(-1)?.content || '', lastMessageAt: this.messages.at(-1)?.createdAt || null, createdAt: '2026-10-11T09:00:00Z', updatedAt: '2026-10-11T09:00:00Z' }; }
  async install() {
    await this.page.route('**/api/v1/**', async route => {
      const req=route.request(), url=new URL(req.url()), path=url.pathname.replace('/api/v1','');
      if (!path.startsWith('/chat/') && !path.startsWith('/seller/chat/')) return route.fallback();
      const ok=(data:unknown)=>route.fulfill({json:data}), error=()=>route.fulfill({status:503,json:{code:'UNAVAILABLE',message:'Chưa kết nối được'}});
      if(path==='/chat/unread')return ok({count:this.unread});
      if(path==='/chat/conversation')return ok(this.summary());
      if(path==='/seller/chat/conversations') {
        if(this.failInbox)return error();
        const content=url.searchParams.get('q') && !'khách hàng test'.includes(url.searchParams.get('q')!.toLowerCase()) ? [] : [this.summary()];
        return ok({content,page:0,size:20,totalElements:content.length,totalPages:content.length?1:0});
      }
      if(path===`/chat/conversations/${conversationId}`) return ok(this.summary());
      if(path.endsWith('/read')){this.reads.push(req.postDataJSON().sequence);this.unread=0;return ok({success:true});}
      if(path.endsWith('/messages')){
        if(req.method()==='GET') {
          if(this.failHistory)return error();
          const before=Number(url.searchParams.get('before')||Infinity), all=this.messages.filter(m=>m.sequence<before);
          const content=all.slice(-40); return ok({content,nextBefore:all.length>40?content[0].sequence:null});
        }
        const body=req.postDataJSON();this.attempts.push(body);
        if(this.failSend)return error();
        const existing=this.messages.find(m=>m.clientMessageId===body.clientMessageId);
        if(existing)return ok(existing);
        const next={...message(this.messages.length+1,body.content),clientMessageId:body.clientMessageId,product:body.productId?{id:product.id,slug:product.slug!,name:product.name,price:product.price}:null};
        this.messages.push(next);return ok(next);
      }
      return route.fulfill({status:404,json:{code:'NOT_FOUND',message:'Không tìm thấy'}});
    });
  }
}

test('guest can open chat prompt, dismiss with Escape and never calls chat API', async ({page,scenario})=>{
  await page.goto('/');
  const launcher=page.getByRole('button',{name:'Chat với gian hàng',exact:true});
  await launcher.click();
  await expect(page.getByRole('dialog',{name:'Đăng nhập để trò chuyện'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Đăng nhập để chat'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(launcher).toBeFocused();
  expect(scenario.calls.filter(r=>new URL(r.url()).pathname.includes('/chat/'))).toHaveLength(0);
});
test('guest product question survives login and opens an attached product draft',async({page})=>{
  const chat=new ChatScenario(page);await chat.install();
  await page.goto(`/products/${product.slug}`);
  await page.getByRole('button',{name:`Hỏi về ${product.name}`,exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText(product.name);
  await page.getByRole('link',{name:'Đăng nhập để chat'}).click();
  await page.locator('#loginEmail').fill('test@example.com');await page.locator('#loginPass').fill('test-password');
  await page.locator('main form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/account\/chat/);
  await expect(page.locator('.chat-attachment')).toContainText(product.name);
  await expect(page.getByRole('button',{name:'Gửi tin',exact:true})).toBeEnabled();
  expect(chat.attempts).toHaveLength(0);
});
test('guest catalog product action also requests login',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:`Hỏi về ${product.name}`,exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Đăng nhập để trò chuyện');
});
test('customer sends product and text, history persists after reload',async({page,scenario})=>{
  await scenario.authenticate('CUSTOMER');const chat=new ChatScenario(page);await chat.install();
  await page.goto(`/products/${product.slug}`);await page.getByRole('button',{name:`Hỏi về ${product.name}`,exact:true}).click();
  await expect(page.locator('.chat-attachment')).toContainText(product.name);
  await page.getByRole('textbox',{name:'Nội dung tin nhắn'}).fill('Món này có vị gì?');await page.getByRole('button',{name:'Gửi tin',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('Món này có vị gì?');await expect(page.locator('.chat-product-card')).toContainText(product.name);
  expect(chat.attempts[0]).toMatchObject({productId:ids.product,content:'Món này có vị gì?'});
  await expect(page.locator('.chat-attachment')).toHaveCount(0);await page.reload();await expect(page.getByRole('log')).toContainText('Món này có vị gì?');
});
test('product picker searches, adds, removes and sends product without text',async({page,scenario})=>{
  await scenario.authenticate('CUSTOMER');const chat=new ChatScenario(page);await chat.install();await page.goto('/account/chat');
  await expect(page.getByRole('button',{name:'Gửi tin',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Thêm sản phẩm',exact:true}).click();await page.getByRole('textbox',{name:'Tìm sản phẩm để gửi'}).fill('Bánh');
  await page.getByRole('button',{name:`Chọn ${product.name}`,exact:true}).click();await expect(page.locator('.chat-attachment')).toContainText(product.name);
  await page.getByRole('button',{name:'Bỏ sản phẩm đính kèm'}).click();await expect(page.getByRole('button',{name:'Gửi tin',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Thêm sản phẩm',exact:true}).click();await page.getByRole('button',{name:`Chọn ${product.name}`,exact:true}).click();await page.getByRole('button',{name:'Gửi tin',exact:true}).click();
  await expect(page.locator('.chat-product-card')).toContainText(product.name);expect(chat.attempts[0].content).toBe('');
});
test('failed send retains draft and attachment and retry uses same client intent',async({page,scenario})=>{
  await scenario.authenticate('CUSTOMER');const chat=new ChatScenario(page);chat.failSend=true;await chat.install();
  await page.goto(`/account/chat?product=${ids.product}`);await expect(page.locator('.chat-attachment')).toBeVisible();
  await page.getByRole('textbox',{name:'Nội dung tin nhắn'}).fill('Giữ lại câu hỏi');await page.getByRole('button',{name:'Gửi tin',exact:true}).click();
  await expect(page.locator('.chat-send-error')).toBeVisible();await expect(page.getByRole('textbox',{name:'Nội dung tin nhắn'})).toHaveValue('Giữ lại câu hỏi');await expect(page.locator('.chat-attachment')).toBeVisible();
  chat.failSend=false;await page.getByRole('button',{name:'Gửi lại',exact:true}).click();await expect(page.getByRole('log')).toContainText('Giữ lại câu hỏi');
  expect(chat.attempts).toHaveLength(2);expect(chat.attempts[0].clientMessageId).toBe(chat.attempts[1].clientMessageId);expect(chat.messages).toHaveLength(1);
});
test('keyboard supports multiline and Enter sends once; empty input and length limit',async({page,scenario})=>{
  await scenario.authenticate('CUSTOMER');const chat=new ChatScenario(page);await chat.install();await page.goto('/account/chat');
  const input=page.getByRole('textbox',{name:'Nội dung tin nhắn'});await input.fill('   ');await expect(page.getByRole('button',{name:'Gửi tin',exact:true})).toBeDisabled();
  await input.fill('Dòng một');await input.press('Shift+Enter');await expect(input).toHaveValue('Dòng một\n');await input.press('Control+End');await input.press('A');await input.press('Enter');
  await expect(page.getByRole('log')).toContainText('Dòng một');expect(chat.attempts).toHaveLength(1);expect(chat.attempts[0].content).toContain('\n');await expect(input).toHaveAttribute('maxlength','4000');
});
test('older messages load without duplicates and latest message remains present',async({page,scenario})=>{
  await scenario.authenticate('CUSTOMER');const chat=new ChatScenario(page);chat.messages=Array.from({length:75},(_,i)=>message(i+1,`Tin cũ ${i+1}`,true));await chat.install();await page.goto('/account/chat');
  await expect(page.locator('.chat-message')).toHaveCount(40);await page.getByRole('button',{name:'Xem tin nhắn trước'}).click();await expect(page.locator('.chat-message')).toHaveCount(75);
  await expect(page.getByRole('log')).toContainText('Tin cũ 1');await expect(page.getByRole('log')).toContainText('Tin cũ 75');
});
test('seller inbox supports search and replies alongside another seller',async({page,scenario})=>{
  await scenario.authenticate('SELLER');const chat=new ChatScenario(page);chat.messages=[message(1,'Khách hỏi sản phẩm'),message(2,'Seller Lan đã trả lời',true)];chat.unread=2;await chat.install();await page.goto('/seller/chat');
  await page.getByRole('textbox',{name:'Tìm khách hàng'}).fill('không có');await expect(page.getByText('Không tìm thấy khách hàng.')).toBeVisible();
  await page.getByRole('textbox',{name:'Tìm khách hàng'}).fill('Test');await page.getByRole('button',{name:/Khách hàng Test/}).click();
  await expect(page.getByRole('log')).toContainText('Seller Lan đã trả lời');await page.getByRole('textbox',{name:'Nội dung tin nhắn'}).fill('Mình hỗ trợ thêm nhé');await page.getByRole('button',{name:'Gửi tin',exact:true}).click();await expect(page.getByRole('log')).toContainText('Mình hỗ trợ thêm nhé');
  if(test.info().project.name.includes('mobile')){await page.getByRole('button',{name:'Quay lại hộp thư'}).click();await expect(page.getByRole('textbox',{name:'Tìm khách hàng'})).toBeVisible();}
});
test('polling fallback receives new message and marks visible history read',async({page,scenario})=>{
  await scenario.authenticate('CUSTOMER');await page.clock.install();const chat=new ChatScenario(page);await chat.install();await page.goto('/account/chat');
  await expect(page.getByText('Một lời nhắn, thêm chút ấm áp')).toBeVisible();chat.messages.push(message(1,'Seller vừa nhắn',true));await page.clock.fastForward(16000);
  await expect(page.getByRole('log')).toContainText('Seller vừa nhắn');await expect.poll(()=>chat.reads).toContain(1);
});
test('chat history error has recovery action',async({page,scenario})=>{
  await scenario.authenticate('CUSTOMER');const chat=new ChatScenario(page);chat.failHistory=true;await chat.install();await page.goto('/account/chat');
  await expect(page.getByRole('log').getByRole('button',{name:/Thử lại/})).toBeVisible();chat.failHistory=false;await page.getByRole('log').getByRole('button',{name:/Thử lại/}).click();await expect(page.getByText('Một lời nhắn, thêm chút ấm áp')).toBeVisible();
});
test('customer cannot open seller inbox',async({page,scenario})=>{
  await scenario.authenticate('CUSTOMER');await page.goto('/seller/chat');await expect(page.getByRole('heading',{name:'Truy cập bị từ chối'})).toBeVisible();
});
test('chat layout keeps composer, attachment and picker within viewport',async({page,scenario},info)=>{
  await scenario.authenticate('CUSTOMER');const chat=new ChatScenario(page);chat.messages=[message(1,'a'.repeat(300),true)];await chat.install();await page.goto(`/account/chat?product=${ids.product}`);
  await expect(page.locator('.chat-attachment')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.locator('.chat-composer').scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Gửi tin',exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath('chat-theme.png'),fullPage:true});
  await page.getByRole('button',{name:'Thêm sản phẩm',exact:true}).click();await expect(page.getByRole('dialog')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
