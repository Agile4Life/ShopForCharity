import { apiFetch } from '../../lib/api-client';
import type { PageResponse } from '../../types/api';

export interface ChatProduct { id: string; slug: string; name: string; price: number; imageUrl?: string | null }
export interface Conversation {
  id: string; customerName: string; lastSequence: number; unreadCount: number;
  recipientReadSequence: number; lastMessage: string; lastMessageAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface ChatMessage {
  id: string; conversationId: string; sequence: number; senderId: string;
  senderName: string; senderRole: 'CUSTOMER' | 'SELLER'; clientMessageId: string;
  content: string; product: ChatProduct | null; createdAt: string;
}
export interface MessagePage { content: ChatMessage[]; nextBefore: number | null }
export const chatApi = {
  own: () => apiFetch<Conversation>('/chat/conversation', { method: 'POST', skipIdempotency: true }),
  unread: () => apiFetch<{ count: number }>('/chat/unread'),
  inbox: (page: number, q: string) => apiFetch<PageResponse<Conversation>>('/seller/chat/conversations', { params: { page, q, size: 20 } }),
  detail: (id: string) => apiFetch<Conversation>(`/chat/conversations/${id}`),
  messages: (id: string, before: number | null) => apiFetch<MessagePage>(`/chat/conversations/${id}/messages`, { params: { before } }),
  send: (id: string, input: { clientMessageId: string; content: string; productId?: string }) => apiFetch<ChatMessage>(`/chat/conversations/${id}/messages`, { method: 'POST', body: input }),
  read: (id: string, sequence: number) => apiFetch<{ success: boolean }>(`/chat/conversations/${id}/read`, { method: 'POST', body: { sequence }, skipIdempotency: true, silent: true }),
};
