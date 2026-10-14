import { ApiException } from '../common/api-exception.js';

const firstPickupDate = '2026-10-18';
const vietnamOffsetMs = 7 * 60 * 60 * 1000;

// Validate both customer requests and seller confirmations in the shop's timezone.
export function validatePickupTime(value, now = new Date()) {
  const instant = typeof value === 'string' ? new Date(value) : new Date(NaN);
  ApiException.check(
    Number.isFinite(instant.getTime()) && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value),
    400, 'INVALID_PICKUP_TIME', 'Vui lòng chọn ngày và giờ nhận hợp lệ, có múi giờ.'
  );
  const local = new Date(instant.getTime() + vietnamOffsetMs);
  ApiException.check(
    local.toISOString().slice(0, 10) >= firstPickupDate,
    400, 'INVALID_PICKUP_TIME', 'Chỉ giao hàng sau ngày 17/10/2026, từ ngày 18/10/2026.'
  );
  const milliseconds = ((local.getUTCHours() * 60 + local.getUTCMinutes()) * 60 + local.getUTCSeconds()) * 1000 + local.getUTCMilliseconds();
  ApiException.check(
    milliseconds >= 8 * 60 * 60 * 1000 && milliseconds <= 17 * 60 * 60 * 1000,
    400, 'INVALID_PICKUP_TIME', 'Giờ giao hàng phải từ 08:00 đến 17:00 (giờ Việt Nam).'
  );
  ApiException.check(instant > now, 400, 'INVALID_PICKUP_TIME', 'Thời gian nhận phải trong tương lai.');
  return instant;
}
