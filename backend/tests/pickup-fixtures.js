// Tomorrow at 09:00 Vietnam time, or the first delivery day if it is later.
export function futurePickupTime() {
  const day = new Date(Math.max(Date.now() + 86400000, Date.parse('2026-10-18T02:00:00Z')));
  day.setUTCHours(2, 0, 0, 0);
  return day.toISOString();
}
