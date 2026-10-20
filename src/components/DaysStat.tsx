"use client";
import { useEffect, useState } from "react";
import { daysUntil } from "@/lib/format";

// "Days to the event" before it, "Days since the event" after it, counted in the visitor's browser (first paint: build date).
export default function DaysStat({ date, builtAt }: { date: string; builtAt: number }) {
  const [now, setNow] = useState(builtAt);
  useEffect(() => setNow(Date.now()), []);
  const d = daysUntil(date, now);
  return (
    <div className="flex flex-col justify-between bg-white p-6">
      <dt className="text-base leading-snug">{d > 0 ? "Days to the event" : d === 0 ? "The event is" : "Days since the event"}</dt>
      <dd className="stat mt-2 text-[2.75rem]">{d === 0 ? "Today" : Math.abs(d)}</dd>
    </div>
  );
}
