import express from 'express';
import { requireAuth, requireSeller } from '../identity/auth-middleware.js';
import { rateLimiter } from '../identity/rate-limiter.js';
import { ApiException } from '../common/api-exception.js';
import { chatService } from './chat-service.js';

export const chatRouter = express.Router();
const route = action => async (req, res, next) => {
  try { res.json(await action(req)); } catch (error) { next(error); }
};
chatRouter.get('/chat/unread', requireAuth, route(req => chatService.unread(req.actor)));
chatRouter.post('/chat/conversation', requireAuth, route(req => chatService.own(req.actor)));
chatRouter.get('/seller/chat/conversations', requireSeller, route(req => chatService.list(req.actor, req.query)));
chatRouter.get('/chat/conversations/:id', requireAuth, route(req => chatService.detail(req.actor, req.params.id)));
chatRouter.get('/chat/conversations/:id/messages', requireAuth, route(req => chatService.messages(req.actor, req.params.id, req.query)));
chatRouter.post('/chat/conversations/:id/messages', requireAuth, route(async req => {
  const allowed = await rateLimiter.allow(`chat:${req.actor.id}`, 30);
  ApiException.check(allowed, 429, 'RATE_LIMITED', 'Bạn gửi tin hơi nhanh. Vui lòng thử lại sau một phút.');
  return chatService.send(req.actor, req.params.id, req.body || {});
}));
chatRouter.post('/chat/conversations/:id/read', requireAuth, route(req => chatService.read(req.actor, req.params.id, req.body || {})));
