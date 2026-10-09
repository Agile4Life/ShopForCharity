import { Router } from 'express';
import { requireSeller, optionalAuth } from '../identity/auth-middleware.js';
import { getCatalogService } from './catalog-service.js';

const router = Router();
const catalog = getCatalogService();

// Health
router.get('/health', (req, res) => {
  res.json({ status: 'UP' });
});

// Categories
router.get('/categories', async (req, res, next) => {
  try {
    const data = await catalog.categories();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Public products / combos list
router.get(['/products', '/combos'], optionalAuth, async (req, res, next) => {
  try {
    const isCombo = req.path.includes('/combos');
    const { q, category, sort, page = 0, size = 20 } = req.query;
    const data = await catalog.list(
      isCombo,
      false,
      q,
      category,
      sort,
      parseInt(page, 10),
      parseInt(size, 10),
      req.actor || null
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Public detail (accepts UUID or slug)
router.get(['/products/:id', '/combos/:id'], async (req, res, next) => {
  try {
    const isCombo = req.path.startsWith('/combos');
    const data = await catalog.publicDetail(isCombo, req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Seller products / combos list
router.get(['/seller/products', '/seller/combos'], requireSeller, async (req, res, next) => {
  try {
    const isCombo = req.path.includes('/combos');
    const { q, category, sort, page = 0, size = 20 } = req.query;
    const data = await catalog.list(
      isCombo,
      true,
      q,
      category,
      sort,
      parseInt(page, 10),
      parseInt(size, 10),
      req.actor
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Seller detail
router.get(['/seller/products/:id', '/seller/combos/:id'], requireSeller, async (req, res, next) => {
  try {
    const isCombo = req.path.startsWith('/seller/combos');
    const data = await catalog.detail(isCombo, req.params.id, true, req.actor);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Seller product create / update
router.post('/seller/products', requireSeller, async (req, res, next) => {
  try {
    const data = await catalog.saveProduct(req.actor, null, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/seller/products/:id', requireSeller, async (req, res, next) => {
  try {
    const data = await catalog.saveProduct(req.actor, req.params.id, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Seller combo create / update
router.post('/seller/combos', requireSeller, async (req, res, next) => {
  try {
    const data = await catalog.saveCombo(req.actor, null, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/seller/combos/:id', requireSeller, async (req, res, next) => {
  try {
    const data = await catalog.saveCombo(req.actor, req.params.id, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Seller activate / archive
router.post(
  ['/seller/:kind(products|combos)/:id/:action(activate|archive)'],
  requireSeller,
  async (req, res, next) => {
    try {
      const isCombo = req.params.kind === 'combos';
      const newStatus = req.params.action === 'activate' ? 'ACTIVE' : 'ARCHIVED';
      const expectedVersion = req.body?.expectedVersion;
      const data = await catalog.status(
        req.actor,
        isCombo,
        req.params.id,
        newStatus,
        expectedVersion
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

export const catalogRouter = router;
