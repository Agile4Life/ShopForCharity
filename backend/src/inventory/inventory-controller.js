import { Router } from 'express';
import { requireSeller } from '../identity/auth-middleware.js';
import { getInventoryService } from './inventory-service.js';

const router = Router();
const inventory = getInventoryService();

router.post(
  '/:id/stock-adjustments',
  requireSeller,
  async (req, res, next) => {
    try {
      const key = req.headers['idempotency-key'];
      const data = await inventory.adjust(
        req.actor,
        req.params.id,
        key,
        req.body || {}
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

export const inventoryRouter = router;
