const DAY = 86_400_000;
export function todayBangkok(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function addDays(value: string, days: number): string {
  return new Date(Date.parse(value + "T00:00:00Z") + days * DAY)
    .toISOString()
    .slice(0, 10);
}
export function rentalDays(start: string, end: string): number {
  if (!validDate(start) || !validDate(end) || end < start) return 0;
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
}
export function blockedRange(
  start: string,
  end: string,
  before: number,
  after: number,
) {
  return { start: addDays(start, -before), end: addDays(end, after) };
}
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  return aStart <= bEnd && bStart <= aEnd;
}
export function monthRange(day = todayBangkok()) {
  const start = day.slice(0, 7) + "-01";
  const next = new Date(start + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, end: addDays(next.toISOString().slice(0, 10), -1) };
}
export function monthChanged(previousDay: string, currentDay: string) {
  return previousDay.slice(0, 7) !== currentDay.slice(0, 7);
}
export function thaiDate(day: string, full = false) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: full ? "long" : "short",
    year: full ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(day + "T00:00:00Z"));
}
export const money = (value: number) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(value);
