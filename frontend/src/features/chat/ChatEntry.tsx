import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, LogIn, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { Modal } from '../../components/Modal';
import { chatApi } from './api';
import { useChatRealtime } from './realtime';
import type { ChatProduct } from './api';

function LoginPrompt({ open, onClose, product }: { open: boolean; onClose: () => void; product?: ChatProduct }) {
  const target = '/account/chat' + (product ? `?product=${encodeURIComponent(product.id)}` : '');
  return <Modal isOpen={open} onClose={onClose} title="Đăng nhập để trò chuyện" className="chat-login-modal">
    <div className="chat-login-art"><MessageCircle size={32} aria-hidden="true" /></div>
    <p>Đăng nhập để nhắn tin với gian hàng và hỏi thêm về sản phẩm bạn thích.</p>
    {product && <p className="chat-login-product"><Package size={18} aria-hidden="true" />{product.name}</p>}
    <Link className="btn-primary full-width" to="/login" onClick={onClose} state={{ from: { pathname: target } }}><LogIn size={18} aria-hidden="true" />Đăng nhập để chat</Link>
    <button className="btn-secondary full-width" onClick={onClose} type="button">Để sau</button>
  </Modal>;
}

export function AskProductButton({ product, compact = false }: { product: ChatProduct; compact?: boolean }) {
  const { isAuthenticated, isSeller, isLoading } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(false);
  if (isSeller) return null;
  return <>
    <button type="button" className={compact ? 'chat-product-link' : 'btn-secondary chat-ask-product'} disabled={isLoading}
      aria-label={`Hỏi về ${product.name}`} onClick={event => {
        if (!isAuthenticated) { event.currentTarget.focus(); setPrompt(true); }
        else navigate(`/account/chat?product=${encodeURIComponent(product.id)}`);
      }}><MessageCircle size={18} aria-hidden="true" />{compact ? 'Hỏi về món này' : 'Hỏi người bán về sản phẩm'}</button>
    <LoginPrompt open={prompt} onClose={() => setPrompt(false)} product={product} />
  </>;
}

export function ChatLauncher() {
  const { isAuthenticated, isSeller, profile, isLoading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(false);
  const unread = useQuery({ queryKey: ['chat', profile?.id, 'unread'], queryFn: chatApi.unread,
    enabled: !!profile && isAuthenticated, refetchInterval: 15000, retry: 1 });
  useChatRealtime(profile ? (isSeller ? 'chat:inbox:sellers' : `chat:inbox:${profile.authUserId}`) : null);
  // User-specific query keys and removal prevent chat history leaking on logout.
  if (pathname === '/account/chat' || pathname === '/seller/chat' || pathname.startsWith('/auth/')) return null;
  return <>
    <button type="button" className="chat-launcher" disabled={isLoading} aria-label={isSeller ? 'Mở hộp thư khách hàng' : 'Chat với gian hàng'}
      onClick={event => { if (!isAuthenticated) { event.currentTarget.focus(); setPrompt(true); } else navigate(isSeller ? '/seller/chat' : '/account/chat'); }}>
      <MessageCircle size={22} aria-hidden="true" /><span>{isSeller ? 'Hộp thư' : 'Nhắn gian hàng'}</span>
      {!!unread.data?.count && <span className="chat-unread" aria-label={`${unread.data.count} tin chưa đọc`}>{unread.data.count > 99 ? '99+' : unread.data.count}</span>}
    </button>
    <LoginPrompt open={prompt} onClose={() => setPrompt(false)} />
  </>;
}
