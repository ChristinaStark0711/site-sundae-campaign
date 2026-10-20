// How a new event gets its page: shown on the Events page (and as the empty state when nothing is booked).
// It is its own section on both pages that show it, so its heading is an h2 (id "add-event", for the section's label).
export default function NewEventSteps({ compact = false }: { compact?: boolean }) {
  const steps: [string, string][] = [
    ["Ask for a new event", "In Sundae's Claude workspace, say “New Sundae event” with the date and the city (the venue and start time too, if they're set). Claude asks only for what's missing."],
    ["SHAI builds the event's page", "A photo of the city, a full creative library (images, flyers, videos and Reels), captions, organic and paid plans with budgets, a filming plan, an action plan and projected results."],
    ["Review it here", "The event appears under Upcoming events. Type a change under any asset to update it or make a variation. AI footage of a new venue waits for a credit quote and your yes."],
  ];
  return (
    <div className={`card-mist grid gap-8 p-8 md:p-12 ${compact ? "" : "lg:grid-cols-[1fr_1.6fr]"}`}>
      <div>
        <p className="eyebrow">Adding an event</p>
        <h2 id="add-event" className="display h-bar mt-4 text-[1.75rem] md:text-[2.125rem]">Give a date and a city. The page builds itself.</h2>
      </div>
      <ol className="grid gap-6">
        {steps.map(([t, d], i) => (
          <li key={t} className="grid grid-cols-[2.75rem_1fr] gap-4"><span className="dot-num">{i + 1}</span><div><p className="text-lg font-bold leading-snug">{t}</p><p className="mt-1 text-lg leading-relaxed">{d}</p></div></li>
        ))}
      </ol>
    </div>
  );
}
