import { Router } from 'express';
import { requireAuth } from './auth-middleware.js';
import { getProfileService } from './profile-service.js';

const router = Router();
const profiles = getProfileService();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const profile = await profiles.get(req.actor);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

router.patch('/', requireAuth, async (req, res, next) => {
  try {
    const updated = await profiles.patch(req.actor, req.body || {});
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export const identityRouter = router;
