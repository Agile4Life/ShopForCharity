import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, Check, CheckCheck, MessageCircle, Package, Plus, Search, Send, X } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { getProductDetail, useProducts } from '../catalog/api';
import { Modal } from '../../components/Modal';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { AssetImage } from '../../components/AssetImage';
import { userErrorMessage } from '../../lib/user-errors';
import { chatApi } from './api';
import type { ChatMessage, ChatProduct, Conversation } from './api';
import { refreshChat, useChatRealtime } from './realtime';

const money = (price: number) => `${price.toLocaleString('vi-VN')} đ`;
const time = (date: string) => new Date(date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function ProductCard({ product }: { product: ChatProduct }) {
  return <Link to={`/products/${product.slug || product.id}`} className="chat-product-card">
    {product.imageUrl ? <AssetImage src={product.imageUrl} alt="" /> : <span className="chat-product-placeholder"><Package size={24} aria-hidden="true" /></span>}
    <span><strong>{product.name}</strong><small>{money(product.price)}</small><span className="chat-product-detail">Xem sản phẩm</span></span>
  </Link>;
}

function ProductPicker({ onSelect }: { onSelect: (p: ChatProduct) => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const products = useProducts({ q: search, page, size: 8 });
  return <div className="chat-picker">
    <label className="chat-search"><Search size={18} aria-hidden="true" /><input aria-label="Tìm sản phẩm để gửi" placeholder="Tìm món bạn muốn hỏi…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
    {products.isLoading ? <LoadingSpinner /> : products.isError ? <ErrorMessage error={products.error} onRetry={products.refetch} /> : <>
      {!products.data?.content.length && <p className="text-muted">Chưa có sản phẩm phù hợp.</p>}
      <div className="chat-picker-products">{products.data?.content.map(p => <button type="button" className="chat-picker-product" key={p.id} onClick={() => onSelect(p)} aria-label={`Chọn ${p.name}`}>
        {p.imageUrl ? <AssetImage src={p.imageUrl} alt="" /> : <Package size={26} aria-hidden="true" />}
        <span><strong>{p.name}</strong><small>{money(p.price)}{p.isSoldOut ? ' · Hết hàng' : ''}</small></span><Plus size={18} aria-hidden="true" />
      </button>)}</div>
      {!!products.data && products.data.totalPages > 1 && <div className="pagination-controls"><button type="button" className="btn-secondary-sm" disabled={!page} onClick={() => setPage(page - 1)}>Trang trước</button><span>{page + 1} / {products.data.totalPages}</span><button type="button" className="btn-secondary-sm" disabled={page + 1 >= products.data.totalPages} onClick={() => setPage(page + 1)}>Trang sau</button></div>}
    </>}
  </div>;
}

function ChatRoom({ conversation, onBack }: { conversation: Conversation; onBack?: () => void }) {
  const { profile, isSeller } = useAuth();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [product, setProduct] = useState<ChatProduct | null>(null);
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const readThrough = useRef(0);
  const pendingIntent = useRef<{ signature: string; clientMessageId: string } | null>(null);
  const initialScroll = useRef(true);
  const connected = useChatRealtime(`chat:room:${conversation.id}`);
  const selectedProduct = params.get('product');
  const productQuery = useQuery({ queryKey: ['product', selectedProduct], queryFn: () => getProductDetail(selectedProduct!), enabled: !!selectedProduct && !isSeller, retry: 1 });
  useEffect(() => {
    if (selectedProduct && productQuery.data) {
      // Synchronize the product fetched from an external navigation with the draft.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProduct(productQuery.data);
      setParams(previous => { const next = new URLSearchParams(previous); next.delete('product'); return next; }, { replace: true });
    }
  }, [productQuery.data, selectedProduct, setParams]);
  const messages = useInfiniteQuery({ queryKey: ['chat', profile?.id, 'messages', conversation.id],
    queryFn: ({ pageParam }) => chatApi.messages(conversation.id, pageParam), initialPageParam: null as number | null,
    getNextPageParam: last => last.nextBefore ?? undefined, refetchInterval: 15000, retry: 1 });
  const ordered = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    messages.data?.pages.forEach(p => p.content.forEach(m => map.set(m.id, m)));
    return [...map.values()].sort((a, b) => a.sequence - b.sequence);
  }, [messages.data]);
  const latest = ordered.at(-1);
  const latestSequence = latest?.sequence;
  const latestSenderId = latest?.senderId;
  const markRead = () => {
    if (document.visibilityState !== 'visible' || !nearBottom.current || !latest || readThrough.current >= latest.sequence) return;
    const sequence = latest.sequence;
    readThrough.current = sequence;
    void chatApi.read(conversation.id, sequence).then(() => queryClient.invalidateQueries({ queryKey: ['chat', profile?.id, 'unread'] }))
      .catch(() => { if (readThrough.current === sequence) readThrough.current = 0; });
  };
  useEffect(() => {
    markRead();
    document.addEventListener('visibilitychange', markRead);
    window.addEventListener('focus', markRead);
    return () => { document.removeEventListener('visibilitychange', markRead); window.removeEventListener('focus', markRead); };
  });
  useLayoutEffect(() => {
    if (!latestSequence || !timeline.current) return;
    if (initialScroll.current || nearBottom.current || latestSenderId === profile?.id) {
      timeline.current.scrollTop = timeline.current.scrollHeight;
      initialScroll.current = false;
      nearBottom.current = true;
      setNewMessages(false);
    } else setNewMessages(true);
  }, [latestSequence, latestSenderId, profile?.id]);
  async function older() {
    const el = timeline.current;
    const height = el?.scrollHeight || 0;
    const scroll = el?.scrollTop || 0;
    await messages.fetchNextPage();
    requestAnimationFrame(() => { if (el) el.scrollTop = scroll + el.scrollHeight - height; });
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (sending || (!content.trim() && !product)) return;
    const body = { content: content.trim(), ...(product ? { productId: product.id } : {}) };
    const signature = JSON.stringify(body);
    if (pendingIntent.current?.signature !== signature) pendingIntent.current = { signature, clientMessageId: crypto.randomUUID() };
    setSending(true); setSendError(null);
    try {
      await chatApi.send(conversation.id, { ...body, clientMessageId: pendingIntent.current.clientMessageId });
      pendingIntent.current = null;
      setContent(''); setProduct(null); nearBottom.current = true;
      await refreshChat(queryClient);
    } catch (error) { setSendError(userErrorMessage(error, 'Chưa gửi được tin. Nội dung của bạn vẫn được giữ lại để thử lại.')); }
    finally { setSending(false); }
  }
  return <section className="chat-room" aria-label="Cuộc trò chuyện">
    <header className="chat-room-header">
      {onBack && <button type="button" className="chat-icon-button chat-inbox-back" aria-label="Quay lại hộp thư" onClick={onBack}><ArrowLeft size={20} /></button>}
      <span className="chat-avatar"><MessageCircle size={23} aria-hidden="true" /></span>
      <div><h2>{isSeller ? conversation.customerName : 'Gian hàng Gói Ấm Trao Em'}</h2><p>{isSeller ? 'Hộp thư chung · Mọi người bán đều có thể trả lời' : 'Người bán trong gian hàng sẽ cùng hỗ trợ bạn'}</p></div>
    </header>
    <div className="chat-connection" role="status">{connected ? 'Đã kết nối trò chuyện' : 'Đang kết nối · Tin nhắn vẫn được tự động cập nhật'}</div>
    <div className="chat-timeline" ref={timeline} role="log" aria-label="Tin nhắn" aria-live="polite" aria-relevant="additions" onScroll={() => {
      const el = timeline.current!; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
      if (nearBottom.current) { setNewMessages(false); markRead(); }
    }}>
      {messages.hasNextPage && <button type="button" className="btn-secondary-sm chat-older" onClick={older} disabled={messages.isFetchingNextPage}>{messages.isFetchingNextPage ? 'Đang tải…' : 'Xem tin nhắn trước'}</button>}
      {messages.isLoading && <LoadingSpinner message="Đang mở cuộc trò chuyện…" />}
      {messages.isError && <ErrorMessage error={messages.error} onRetry={messages.refetch} />}
      {!messages.isLoading && !messages.isError && !ordered.length && <div className="chat-welcome"><span className="chat-welcome-icon"><MessageCircle size={38} aria-hidden="true" /></span><h3>Một lời nhắn, thêm chút ấm áp</h3><p>Bạn muốn hỏi về món nào? Gửi sản phẩm kèm câu hỏi để gian hàng hỗ trợ nhé.</p></div>}
      {ordered.map((m, index) => {
        const own = m.senderId === profile?.id;
        const day = new Date(m.createdAt).toLocaleDateString('vi-VN');
        const newDay = !index || day !== new Date(ordered[index - 1].createdAt).toLocaleDateString('vi-VN');
        return <div key={m.id}>{newDay && <div className="chat-day">{day}</div>}<article className={`chat-message ${own ? 'chat-message-own' : ''}`} data-sequence={m.sequence}>
          <span className="chat-sender">{own ? 'Bạn' : m.senderName}{m.senderRole === 'SELLER' && <span className="chat-seller-tag">Người bán</span>}</span>
          <div className="chat-bubble">{m.product && <ProductCard product={m.product} />}{m.content && <p>{m.content}</p>}</div>
          <span className="chat-message-meta"><time dateTime={m.createdAt}>{time(m.createdAt)}</time>{own && (conversation.recipientReadSequence >= m.sequence ? <span><CheckCheck size={14} aria-hidden="true" />Đã đọc</span> : <span><Check size={14} aria-hidden="true" />Đã gửi</span>)}</span>
        </article></div>;
      })}
    </div>
    {newMessages && <button type="button" className="chat-new-messages" onClick={() => { if (timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight; nearBottom.current = true; setNewMessages(false); markRead(); }}><ArrowDown size={16} />Tin nhắn mới</button>}
    <form className="chat-composer" onSubmit={send} aria-label="Gửi tin nhắn">
      {productQuery.isError && selectedProduct && <div role="alert" className="chat-send-error">Chưa tải được sản phẩm đã chọn. <button type="button" onClick={() => productQuery.refetch()}>Thử lại</button></div>}
      {product && <div className="chat-attachment"><Package size={20} aria-hidden="true" /><span><strong>{product.name}</strong><small>{money(product.price)} · Sản phẩm sẽ được gửi kèm</small></span><button type="button" className="chat-icon-button" disabled={sending} aria-label="Bỏ sản phẩm đính kèm" onClick={() => setProduct(null)}><X size={18} /></button></div>}
      {sendError && <p className="chat-send-error" role="alert">{sendError}</p>}
      <label className="sr-only" htmlFor="chat-message-input">Nội dung tin nhắn</label>
      <textarea id="chat-message-input" rows={2} maxLength={4000} placeholder={isSeller ? 'Nhắn lời hỗ trợ khách hàng…' : 'Bạn muốn hỏi gian hàng điều gì?'} value={content} disabled={sending} onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
      <div className="chat-composer-actions"><button type="button" className="btn-secondary-sm" disabled={sending} onClick={() => setPicker(true)}><Plus size={17} aria-hidden="true" />Thêm sản phẩm</button><span className="chat-character-count">{content.length} / 4.000</span><button type="submit" className="btn-primary" disabled={sending || (!content.trim() && !product)}><Send size={17} aria-hidden="true" />{sending ? 'Đang gửi…' : sendError ? 'Gửi lại' : 'Gửi tin'}</button></div>
    </form>
    <Modal isOpen={picker} onClose={() => setPicker(false)} title="Chọn sản phẩm để trò chuyện" className="chat-picker-modal"><ProductPicker onSelect={p => { setProduct(p); setPicker(false); document.getElementById('chat-message-input')?.focus(); }} /></Modal>
  </section>;
}

export function CustomerChatPage() {
  const { profile, isSeller } = useAuth();
  const own = useQuery({ queryKey: ['chat', profile?.id, 'own'], queryFn: chatApi.own, enabled: !isSeller, refetchInterval: 15000, retry: 1 });
  if (isSeller) return <Navigate to="/seller/chat" replace />;
  return <div className="container chat-page"><div className="chat-page-heading"><h1 className="page-title">Nhắn gian hàng</h1><p>Mọi thắc mắc đều có một nơi để gửi.</p></div>
    {own.isLoading ? <LoadingSpinner /> : own.isError ? <ErrorMessage error={own.error} onRetry={own.refetch} /> : own.data && <ChatRoom key={own.data.id} conversation={own.data} />}
  </div>;
}

export function SellerChatPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get('conversation');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const inbox = useQuery({ queryKey: ['chat', profile?.id, 'inbox', page, search], queryFn: () => chatApi.inbox(page, search), refetchInterval: 15000, retry: 1 });
  const detail = useQuery({ queryKey: ['chat', profile?.id, 'detail', id], queryFn: () => chatApi.detail(id!), enabled: !!id, refetchInterval: 15000, retry: 1 });
  return <div className="container chat-page chat-seller-page"><Link to="/seller" className="btn-back"><ArrowLeft size={16} aria-hidden="true" />Bàn làm việc</Link><div className="chat-page-heading"><h1 className="page-title">Hộp thư khách hàng</h1><p>Cùng nhau trả lời, cùng nhau trao chút ấm áp.</p></div>
    <div className={`chat-workspace ${id ? 'chat-has-selection' : ''}`}>
      <aside className="chat-inbox" aria-label="Hộp thư chung"><label className="chat-search"><Search size={18} aria-hidden="true" /><input aria-label="Tìm khách hàng" placeholder="Tìm tên khách hàng…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
        <p className="chat-inbox-note">Mọi người bán đều có thể trả lời. Tin chưa đọc được tính riêng cho bạn.</p>
        {inbox.isLoading ? <LoadingSpinner /> : inbox.isError ? <ErrorMessage error={inbox.error} onRetry={inbox.refetch} /> : <>
          {!inbox.data?.content.length && <div className="chat-inbox-empty"><MessageCircle size={30} aria-hidden="true" /><p>{search ? 'Không tìm thấy khách hàng.' : 'Chưa có lời nhắn từ khách hàng.'}</p></div>}
          <div className="chat-inbox-list">{inbox.data?.content.map(c => <button type="button" className={`chat-inbox-item ${c.id === id ? 'is-selected' : ''}`} key={c.id} aria-pressed={c.id === id} onClick={() => setParams({ conversation: c.id })}>
            <span className="chat-avatar">{c.customerName.charAt(0).toLocaleUpperCase('vi-VN')}</span><span className="chat-inbox-preview"><strong>{c.customerName}</strong><span>{c.lastMessage || 'Cuộc trò chuyện mới'}</span></span><span className="chat-inbox-meta">{c.lastMessageAt && <time>{time(c.lastMessageAt)}</time>}{c.unreadCount > 0 && <span className="chat-unread" aria-label={`${c.unreadCount} tin chưa đọc`}>{c.unreadCount}</span>}</span>
          </button>)}</div>
          {!!inbox.data && inbox.data.totalPages > 1 && <div className="pagination-controls"><button type="button" className="btn-secondary-sm" disabled={!page} onClick={() => setPage(page - 1)}>Trang trước</button><span>{page + 1} / {inbox.data.totalPages}</span><button type="button" className="btn-secondary-sm" disabled={page + 1 >= inbox.data.totalPages} onClick={() => setPage(page + 1)}>Trang sau</button></div>}
        </>}
      </aside>
      {id ? detail.isLoading ? <LoadingSpinner /> : detail.isError ? <div className="chat-room-error"><button type="button" className="btn-back" onClick={() => setParams({})}><ArrowLeft size={16} />Hộp thư</button><ErrorMessage error={detail.error} onRetry={detail.refetch} /></div> : detail.data && <ChatRoom key={id} conversation={detail.data} onBack={() => setParams({})} /> : <div className="chat-no-selection"><MessageCircle size={48} aria-hidden="true" /><h2>Sẵn sàng lắng nghe</h2><p>Chọn một cuộc trò chuyện để hỗ trợ khách hàng. Câu trả lời của bạn sẽ hiển thị cùng những người bán khác.</p></div>}
    </div>
  </div>;
}
