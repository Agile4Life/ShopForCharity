import { Router } from 'express';
import { requireSeller } from '../identity/auth-middleware.js';
import { getSellerReadService } from './seller-read-service.js';

const router = Router();
const service = getSellerReadService();

router.get('/dashboard', requireSeller, async (req, res, next) => {
  try {
    const data = await service.dashboard(req.actor);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/notifications', requireSeller, async (req, res, next) => {
  try {
    const { page = 0, size = 20 } = req.query;
    const data = await service.notifications(
      req.actor,
      parseInt(page, 10),
      parseInt(size, 10)
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/:id/read', requireSeller, async (req, res, next) => {
  try {
    const data = await service.read(req.actor, req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', requireSeller, async (req, res, next) => {
  try {
    const { action, entityType, date, page = 0, size = 20 } = req.query;
    const data = await service.audit(
      req.actor,
      action,
      entityType,
      date,
      parseInt(page, 10),
      parseInt(size, 10)
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export const sellerReadRouter = router;
