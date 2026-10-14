// The shop schedules collections in Vietnam, independently of the device timezone.
export const pickupInstant = (value: string) => new Date(`${value}:00+07:00`);

export const firstPickupDate = "2026-10-18";
export const pickupScheduleHelp = "Giao hàng từ 08:00 đến 17:00, bắt đầu ngày 18/10/2026 (giờ Việt Nam).";

export function pickupTimeError(value: string, now = Date.now()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(pickupInstant(value).getTime())) {
    return "Vui lòng chọn ngày và giờ nhận hợp lệ.";
  }
  if (value.slice(0, 10) < firstPickupDate) return "Chỉ giao hàng sau ngày 17/10/2026, từ ngày 18/10/2026.";
  const time = value.slice(11);
  if (time < "08:00" || time > "17:00") return "Giờ giao hàng phải từ 08:00 đến 17:00 (giờ Việt Nam).";
  if (pickupInstant(value).getTime() <= now) return "Giờ hẹn đã qua. Vui lòng chọn thời gian trong tương lai.";
  return null;
}
