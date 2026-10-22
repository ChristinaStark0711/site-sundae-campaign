import EventCard from "@/components/EventCard";
import EventsBoard from "@/components/EventsBoard";
import { getEvents } from "@/lib/content";

// The hub is the events and their content (owner's choice, 2026-10-22): this list, and each event's own pages.
export default function Events() {
  const events = getEvents();
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <header className="py-16 md:py-24">
        <p className="eyebrow">Events</p>
        <h1 className="display h-bar h-bar-lg mt-5 max-w-4xl text-[clamp(2.375rem,4.6vw,4rem)]">Every Sundae event, city by city.</h1>
        <p className="lede mt-7 max-w-3xl">Each event has its creative library (images, flyers, videos and Reels) and its captions. Type a change in the box under any asset to update it or make a new variation. Upcoming events come first; past ones stay on record.</p>
      </header>
      <EventsBoard
        builtAt={Date.now()}
        items={events.map((e) => ({ slug: e.slug, date: e.date, asUpcoming: <EventCard e={e} upcoming />, asPast: <EventCard e={e} upcoming={false} /> }))}
        empty={<p className="card-mist max-w-3xl p-6 text-lg leading-relaxed">No upcoming event is booked yet. When the next one is set, it appears here with its own page.</p>}
      />
    </main>
  );
}
