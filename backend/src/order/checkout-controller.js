import { Router } from 'express';
import { config } from '../config.js';
import { optionalAuth } from '../identity/auth-middleware.js';
import { getGuestSessions } from '../identity/guest-sessions.js';
import { getCheckoutService } from './checkout-service.js';
import { rateLimiter } from '../identity/request-filter.js';
import { ApiException } from '../common/api-exception.js';

const router = Router();
const sessions = getGuestSessions();
const checkout = getCheckoutService();

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/api/v1',
    maxAge: maxAgeMs,
  };
}

router.post('/checkout/session', (req, res, next) => {
  try {
    let token = req.cookies?.checkout_session;
    try {
      sessions.checkoutActor(token);
    } catch {
      token = sessions.checkout();
    }
    const actor = sessions.checkoutActor(token);

    res.cookie('checkout_session', token, cookieOptions(2 * 24 * 60 * 60 * 1000));
    res.json({
      sessionId: actor.scope.substring('guest:checkout:'.length),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/checkout/quote', optionalAuth, async (req, res, next) => {
  try {
    const data = await checkout.quote(req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/orders', optionalAuth, async (req, res, next) => {
  try {
    let actor = req.actor;
    if (!actor) {
      actor = sessions.checkoutActor(req.cookies?.checkout_session);
    }

    if (!await rateLimiter.allow(`create:${actor.scope}`, 5)) {
      res.setHeader('Retry-After', '60');
      throw new ApiException(429, 'RATE_LIMITED', 'Vui lòng thử lại sau.');
    }

    const key = req.headers['idempotency-key'];
    const result = await checkout.create(actor, key, req.body || {});

    if (actor.id == null) {
      const orderToken = sessions.order(result.orderId);
      res.cookie('guest_order', orderToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
    }

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export const checkoutRouter = router;
