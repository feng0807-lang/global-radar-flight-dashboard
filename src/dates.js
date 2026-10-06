export const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function monthValue(offset = 0) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function daysFromToday(date) {
  if (!date) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${date}T00:00:00`) - today) / 86400000);
}
