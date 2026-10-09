export function size(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 20;
  return Math.max(1, Math.min(100, parsed));
}

export function toIso(date) {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString();
  return new Date(date).toISOString();
}

export function toInt(val) {
  if (val === null || val === undefined) return 0;
  return parseInt(val, 10);
}

export function toNumber(val) {
  if (val === null || val === undefined) return 0;
  return Number(val);
}
