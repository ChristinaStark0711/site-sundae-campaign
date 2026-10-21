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

// Today's date in Pacific time (California), worked out with Intl so it follows PST and PDT: an event's labels flip at
// midnight there whatever the visitor's own time zone, and day counts are whole calendar days.
const PT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" });
function pacificToday(now: number) {
  const p: Record<string, number> = {};
  for (const { type, value } of PT.formatToParts(now)) p[type] = Number(value);
  return { y: p.year, m: p.month, d: p.day };
}

// An event counts as upcoming through its whole day, and a month-only event through the last day of that month.
export function isUpcoming(iso: string, now: number) {
  const e = parts(iso), t = pacificToday(now);
  return e.y * 10000 + e.m * 100 + (e.d || 31) >= t.y * 10000 + t.m * 100 + t.d;
}

// Whole calendar days from today until the event's day (0 on the day itself); negative once it has passed.
// A month-only event counts from the 1st of its month.
export function daysUntil(iso: string, now: number) {
  const e = parts(iso), t = pacificToday(now);
  return Math.round((Date.UTC(e.y, e.m - 1, e.d || 1) - Date.UTC(t.y, t.m - 1, t.d)) / 86400000);
}

export const nbsp = (s: string) => s.replace(/ (\d)/g, " $1");

// An event's date and place lines. While the venue is not set (new-event.mjs --no-creative writes "Venue to be
// announced") and no start time is on record, the place line reads "Time and venue to be announced".
// An optional end time shows as an AP range ("6-8:30 p.m."), and a venue note replaces "Venue to be announced" when the
// venue is shared another way (e.g. "Location sent to registered guests").
type WhenWhere = { date: string; time?: string; timeEnd?: string; venue: string; venueNote?: string; space?: string };
export const VENUE_TBA = "Venue to be announced";
const timeRange = (a: string, b?: string) => {
  if (!b) return a;
  const sa = a.match(/ ([ap]\.m\.)$/)?.[1], sb = b.match(/ ([ap]\.m\.)$/)?.[1];
  return `${sa && sa === sb ? a.slice(0, -sa.length - 1) : a}-${b}`;
};
export const whenLine = (e: WhenWhere) => `${apDate(e.date, { weekday: e.date.length > 7 })}${e.time ? `, ${timeRange(e.time, e.timeEnd)}` : ""}`;
export const whereLine = (e: WhenWhere) => (e.venue === VENUE_TBA ? (e.venueNote ?? (e.time ? VENUE_TBA : "Time and venue to be announced")) : `${e.space ? `${e.space} at ` : ""}${e.venue}`);
