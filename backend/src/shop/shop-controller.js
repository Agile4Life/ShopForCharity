import { Router } from 'express';
import { requireSeller } from '../identity/auth-middleware.js';
import { getShopService } from './shop-service.js';

const router = Router();
const service = getShopService();

// Public shop info
router.get('/shop', async (req, res, next) => {
  try {
    const data = await service.get(false, null);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Seller shop settings
router.get('/seller/shop-settings', requireSeller, async (req, res, next) => {
  try {
    const data = await service.get(true, req.actor);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/seller/shop-settings', requireSeller, async (req, res, next) => {
  try {
    const data = await service.update(req.actor, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Seller pickup points
router.get('/seller/pickup-points', requireSeller, async (req, res, next) => {
  try {
    const data = await service.points(true);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/seller/pickup-points', requireSeller, async (req, res, next) => {
  try {
    const data = await service.savePoint(req.actor, null, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/seller/pickup-points/:id', requireSeller, async (req, res, next) => {
  try {
    const data = await service.savePoint(req.actor, req.params.id, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export const shopRouter = router;
