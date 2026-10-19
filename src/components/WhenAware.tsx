"use client";
import { useEffect, useState } from "react";
import { isUpcoming } from "@/lib/format";

// Bits of a static page that depend on today's date, worked out in the visitor's browser (first paint: build date),
// so an event's labels change the day after it happens even before the site is rebuilt.
function useNow(builtAt: number) {
  const [now, setNow] = useState(builtAt);
  useEffect(() => setNow(Date.now()), []);
  return now;
}
export function PhaseLabel({ date, builtAt }: { date: string; builtAt: number }) {
  return <>{isUpcoming(date, useNow(builtAt)) ? "Upcoming event" : "Past event"}</>;
}
export function ResultsNote({ date, builtAt }: { date: string; builtAt: number }) {
  return <>{isUpcoming(date, useNow(builtAt)) ? "Actual results are filled in after the event." : "Actual results aren't recorded yet. Send the studio the headcount, the intro calls booked and any signings, and they'll sit next to the projection."}</>;
}
export function UpcomingCount({ dates, builtAt }: { dates: string[]; builtAt: number }) {
  const now = useNow(builtAt);
  return <>{dates.filter((d) => isUpcoming(d, now)).length}</>;
}
