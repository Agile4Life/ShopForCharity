import { verifyJwt } from './jwt.js';
import { getProfileService } from './profile-service.js';
import { ApiException } from '../common/api-exception.js';

const profiles = getProfileService();

export async function optionalAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.substring(7);
      const jwt = await verifyJwt(token);
      req.jwt = jwt;
      req.actor = await profiles.actor(jwt);
    }
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new ApiException(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập.');
    }
    const token = auth.substring(7);
    const jwt = await verifyJwt(token);
    req.jwt = jwt;
    req.actor = await profiles.actor(jwt);
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireSeller(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new ApiException(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập.');
    }
    const token = auth.substring(7);
    const jwt = await verifyJwt(token);
    req.jwt = jwt;
    req.actor = await profiles.actor(jwt);
    profiles.seller(req.actor);
    next();
  } catch (err) {
    next(err);
  }
}
