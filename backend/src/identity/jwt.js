import * as jose from 'jose';
import { config } from '../config.js';
import { ApiException } from '../common/api-exception.js';

let remoteJWKS = null;

function getJWKS() {
  if (!remoteJWKS && config.jwt.jwksUri) {
    remoteJWKS = jose.createRemoteJWKSet(new URL(config.jwt.jwksUri));
  }
  return remoteJWKS;
}

export async function verifyJwt(token) {
  if (!token) {
    throw new ApiException(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập.');
  }

  const JWKS = getJWKS();
  if (!JWKS) {
    // If JWKS not configured, check if we can inspect unverified for testing or fail
    throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Auth service chưa được cấu hình.');
  }

  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    return payload;
  } catch (err) {
    if (err.code === 'ERR_JWT_EXPIRED') {
      throw new ApiException(401, 'INVALID_TOKEN', 'Phiên đăng nhập đã hết hạn.');
    }
    throw new ApiException(401, 'INVALID_TOKEN', 'Phiên đăng nhập không hợp lệ.');
  }
}
