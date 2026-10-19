// Date helpers in AP style (BRAND-SPEC: times "7 p.m.", dates "Thursday, Oct. 8, 2026"). Safe on client and server.
const MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// An event date is "YYYY-MM-DD", or "YYYY-MM" when only the month is on record.
const parts = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d: d || 0 }; };

export function apDate(iso: string, { weekday = false, year = true }: { weekday?: boolean; year?: boolean } = {}) {
  const { y, m, d } = parts(iso);
  if (!d) return `${MONTHS_FULL[m - 1]} ${y}`;
  const wd = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday ? wd + ", " : ""}${MONTHS[m - 1]} ${d}${year ? ", " + y : ""}`;
}

// The last instant of the event's day (or month) in Pacific time, as a UTC timestamp: an event counts as upcoming through its whole day.
export function eventEnd(iso: string) {
  const { y, m, d } = parts(iso);
  const end = d ? Date.UTC(y, m - 1, d + 1) : Date.UTC(y, m, 1);
  return end + 8 * 3600 * 1000;
}
export const isUpcoming = (iso: string, now: number) => eventEnd(iso) > now;

// Whole days from now until the event's day (0 on the day itself); negative once it has passed.
export function daysUntil(iso: string, now: number) {
  const { y, m, d } = parts(iso);
  const start = Date.UTC(y, m - 1, d || 1) + 8 * 3600 * 1000;
  return Math.ceil((start - now) / 86400000);
}

export const nbsp = (s: string) => s.replace(/ (\d)/g, " $1");
