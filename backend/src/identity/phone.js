import { ApiException } from '../common/api-exception.js';

export function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    throw new ApiException(
      400,
      'INVALID_PHONE',
      'Số điện thoại phải có 10 chữ số hoặc dạng +84 tương ứng.'
    );
  }
  let s = phone.replace(/[\s().-]/g, '');
  if (s.startsWith('+84')) {
    s = '0' + s.substring(3);
  }
  ApiException.check(
    /^0[0-9]{9}$/.test(s),
    400,
    'INVALID_PHONE',
    'Số điện thoại phải có 10 chữ số hoặc dạng +84 tương ứng.'
  );
  return s;
}
