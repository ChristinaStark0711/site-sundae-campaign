import type { Metadata } from "next";
import EventCard from "@/components/EventCard";
import EventsBoard from "@/components/EventsBoard";
import NewEventSteps from "@/components/NewEventSteps";
import { getEvents } from "@/lib/content";

export const metadata: Metadata = { title: "Events" };

export default function Events() {
  const events = getEvents();
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <header className="py-16 md:py-24">
        <p className="eyebrow">Events</p>
        <h1 className="display h-bar h-bar-lg mt-5 max-w-4xl text-[clamp(2.375rem,4.6vw,4rem)]">Every Sundae dinner, city by city.</h1>
        <p className="lede mt-7 max-w-3xl">Each event has its own page: the creative library, captions, organic and paid plans with budgets, the filming and action plans, and projected results. Upcoming dinners come first; past ones stay on record.</p>
      </header>
      <EventsBoard
        builtAt={Date.now()}
        items={events.map((e) => ({ slug: e.slug, date: e.date, asUpcoming: <EventCard e={e} upcoming />, asPast: <EventCard e={e} upcoming={false} /> }))}
        empty={<p className="card-mist max-w-3xl p-6 text-lg leading-relaxed">No upcoming dinner is booked yet. When the next one is set, it appears here with its own page. See below for how to add it.</p>}
      />
      <section className="mt-24" aria-label="Adding an event"><NewEventSteps /></section>
    </main>
  );
}
