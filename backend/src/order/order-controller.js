import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireSeller } from '../identity/auth-middleware.js';
import { getGuestSessions } from '../identity/guest-sessions.js';
import { getGuestAccessService } from './guest-access-service.js';
import { getOrderService } from './order-service.js';
import { getPaymentService } from '../payment/payment-service.js';

const router = Router();
const sessions = getGuestSessions();
const guestAccess = getGuestAccessService();
const orders = getOrderService();
const payments = getPaymentService();

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/api/v1',
    maxAge: maxAgeMs,
  };
}

// Customer account orders (/api/v1/me/orders)
router.get('/me/orders', requireAuth, async (req, res, next) => {
  try {
    const { page = 0, size = 20 } = req.query;
    const data = await orders.list(
      req.actor,
      false,
      null,
      null,
      null,
      null,
      parseInt(page, 10),
      parseInt(size, 10)
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/orders/:id', requireAuth, async (req, res, next) => {
  try {
    const data = await orders.detail(req.actor, req.params.id, false);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/me/orders/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const key = req.headers['idempotency-key'];
    const data = await orders.action(req.actor, req.params.id, false, 'cancel', key, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/me/orders/:id/payment-report', requireAuth, async (req, res, next) => {
  try {
    const key = req.headers['idempotency-key'];
    const data = await payments.action(req.actor, req.params.id, false, 'payment-report', key, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/orders/:id/payment-instructions', requireAuth, async (req, res, next) => {
  try {
    const data = await payments.instructions(req.actor, req.params.id, false);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Guest orders (/api/v1/guest/orders)
router.post('/guest/orders/access', async (req, res, next) => {
  try {
    const orderId = await guestAccess.verify(req.body || {});
    const orderToken = sessions.order(orderId);
    res.cookie('guest_order', orderToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/guest/orders/:code', async (req, res, next) => {
  try {
    const actor = sessions.orderActor(req.cookies?.guest_order);
    const orderId = await orders.guestId(actor, req.params.code);
    const data = await orders.detail(actor, orderId, false);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/guest/orders/:code/cancel', async (req, res, next) => {
  try {
    const actor = sessions.orderActor(req.cookies?.guest_order);
    const orderId = await orders.guestId(actor, req.params.code);
    const key = req.headers['idempotency-key'];
    const data = await orders.action(actor, orderId, false, 'cancel', key, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/guest/orders/:code/payment-report', async (req, res, next) => {
  try {
    const actor = sessions.orderActor(req.cookies?.guest_order);
    const orderId = await orders.guestId(actor, req.params.code);
    const key = req.headers['idempotency-key'];
    const data = await payments.action(actor, orderId, false, 'payment-report', key, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/guest/orders/:code/payment-instructions', async (req, res, next) => {
  try {
    const actor = sessions.orderActor(req.cookies?.guest_order);
    const orderId = await orders.guestId(actor, req.params.code);
    const data = await payments.instructions(actor, orderId, false);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Seller orders (/api/v1/seller/orders)
router.get('/seller/orders', requireSeller, async (req, res, next) => {
  try {
    const { status, paymentStatus, orderCode, date, page = 0, size = 20 } = req.query;
    const data = await orders.list(
      req.actor,
      true,
      status,
      paymentStatus,
      orderCode,
      date,
      parseInt(page, 10),
      parseInt(size, 10)
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/seller/orders/:id', requireSeller, async (req, res, next) => {
  try {
    const data = await orders.detail(req.actor, req.params.id, true);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/seller/orders/:id/contact-attempts', requireSeller, async (req, res, next) => {
  try {
    const key = req.headers['idempotency-key'];
    const data = await orders.contact(req.actor, req.params.id, key, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/seller/orders/:id/:action(accept|reject|prepare|ready|complete|cancel)',
  requireSeller,
  async (req, res, next) => {
    try {
      const key = req.headers['idempotency-key'];
      const data = await orders.action(
        req.actor,
        req.params.id,
        true,
        req.params.action,
        key,
        req.body || {}
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/seller/orders/:id/:action(confirm-payment|dismiss-payment-report|confirm-refund)',
  requireSeller,
  async (req, res, next) => {
    try {
      const key = req.headers['idempotency-key'];
      const data = await payments.action(
        req.actor,
        req.params.id,
        true,
        req.params.action,
        key,
        req.body || {}
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/seller/orders/:id/payment-instructions', requireSeller, async (req, res, next) => {
  try {
    const data = await payments.instructions(req.actor, req.params.id, true);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export const orderRouter = router;
