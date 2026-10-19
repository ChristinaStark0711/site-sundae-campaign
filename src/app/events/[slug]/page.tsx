import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import DaysStat from "@/components/DaysStat";
import { PhaseLabel, ResultsNote } from "@/components/WhenAware";
import EventFunnel from "@/components/EventFunnel";
import { Icon } from "@/components/Icon";
import { getCaptions, getCities, getEvent, getEventProjections, getLibrary, libraryCount, originals, type City, type EventRec } from "@/lib/content";
import { apDate } from "@/lib/format";
import { ver } from "@/lib/ver";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = getEvent((await params).slug);
  return { title: e ? `${e.city} · ${e.name}` : "Event" };
}

const when = (e: EventRec) => `${apDate(e.date, { weekday: e.date.length > 7 })}${e.time ? `, ${e.time}` : ""}`;

const CityPhoto = ({ city, className = "" }: { city: City; className?: string }) => (
  <figure className={className}>
    <div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] border border-gray bg-mist">
      <Image src={city.file} alt={city.alt} fill priority sizes="(max-width:1024px) 100vw, 45vw" className="object-cover" style={{ objectPosition: city.focus ?? "50% 50%" }} />
    </div>
    <figcaption className="mt-3 text-base leading-snug">Photo: <a className="link !font-normal" href={city.credit.sourceUrl} target="_blank" rel="noopener">{city.credit.title}</a> by {city.credit.creator} · <a className="link !font-normal" href={city.credit.licenseUrl} target="_blank" rel="noopener">{city.credit.license}</a></figcaption>
  </figure>
);

const Facts = ({ e }: { e: EventRec }) => {
  const rows: [string, React.ReactNode][] = [
    ["When", when(e)],
    ["Where", <>{e.space ? `${e.space} at ` : ""}{e.venue}{e.address ? <><br />{e.address}</> : `, ${e.city}`}</>],
    ["Host", `${e.host}${e.hostTitle ? `, ${e.hostTitle}` : ""}`],
    ["Who it's for", e.audience],
  ];
  if (e.rsvp) rows.push(["RSVP page", <a key="r" href={e.rsvp} target="_blank" rel="noopener" className="link">{e.rsvp.replace(/^https?:\/\//, "")}</a>]);
  return (
    <dl className="card grid gap-0 p-6 md:p-7">
      {rows.map(([l, v]) => <div key={l} className="grid gap-1 border-b border-gray py-3.5 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:gap-4"><dt className="text-base font-bold">{l}</dt><dd className="text-lg leading-relaxed">{v}</dd></div>)}
    </dl>
  );
};

export default async function EventOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = getEvent(slug)!;
  const city = getCities()[e.citySlug];
  const builtAt = Date.now();

  if (e.kind === "record") return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <section className="grid gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="eyebrow">Past event · {apDate(e.date)}</p>
          <h1 className="display h-bar h-bar-lg mt-5 text-[clamp(2.375rem,4.6vw,3.75rem)]">{e.name} in {e.city}</h1>
          <p className="lede mt-7 max-w-2xl text-pretty">{e.summary}</p>
          <div className="mt-10"><Facts e={e} /></div>
          {e.sources && <p className="mt-6 text-base leading-relaxed">{e.sources}</p>}
        </div>
        <div className="grid content-start gap-10">
          {e.photo && (
            <figure>
              <div className="relative aspect-square overflow-hidden rounded-[1.25rem] border border-gray bg-mist"><Image src={`${e.media}/${e.photo.file}`} alt={e.photo.alt} fill sizes="(max-width:1024px) 100vw, 45vw" className="object-cover" /></div>
              <figcaption className="mt-3 text-base leading-snug">{e.photo.credit}</figcaption>
            </figure>
          )}
          {city && <CityPhoto city={city} />}
        </div>
      </section>
      <section className="card-mist p-8 md:p-12">
        <p className="eyebrow">Add the details</p>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed">Send the studio the exact date, the headcount and any intro calls or memberships that came from this dinner, and they&apos;ll be added here next to the other events.</p>
      </section>
    </main>
  );

  const lib = getLibrary(slug);
  const caps = getCaptions(slug);
  const pj = getEventProjections(slug);
  const b = `/events/${slug}`;
  const base = pj?.scenarios.base;
  const previews = originals(lib.images).slice(0, 5);
  const act = e.actuals;
  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-gray bg-white">
        <div aria-hidden className="shape-circle pointer-events-none absolute -right-24 -top-24 hidden h-72 w-72 opacity-50 lg:block" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="eyebrow"><PhaseLabel date={e.date} builtAt={builtAt} /> · {when(e)}</p>
            <h1 className="display h-bar h-bar-lg mt-7 max-w-3xl text-[clamp(2.375rem,4.2vw,3.75rem)] leading-[1.2]">{e.headline ?? `${e.name} in ${e.city}`}</h1>
            <p className="lede mt-8 max-w-2xl text-pretty">{e.summary}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href={`${b}/creative`} className="btn btn-blue">Open the creative library <Icon name="arrow-right" /></Link>
              <Link href={`${b}/projections`} className="btn btn-outline">See the projections</Link>
              {e.plans.some((p) => p.slug === "action-plan") && <Link href={`${b}/plans/action-plan`} className="btn btn-outline">What needs to be done</Link>}
            </div>
          </div>
          {city && <CityPhoto city={city} className="self-start" />}
        </div>
        <div className="relative mx-auto max-w-7xl px-5 pb-20 md:px-8">
          <div aria-hidden className="dots pointer-events-none absolute -bottom-8 right-0 hidden h-16 w-16 lg:block" />
          <dl className="relative grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-[1.25rem] border border-gray bg-gray shadow-[0_24px_48px_-36px_rgba(74,74,74,.5)] md:grid-cols-4">
            <DaysStat date={e.date} builtAt={builtAt} />
            <div className="flex flex-col justify-between bg-white p-6"><dt className="text-base leading-snug">Creative assets</dt><dd className="stat mt-2 text-[2.75rem]">{libraryCount(lib) + caps.length}</dd></div>
            {base && <div className="flex flex-col justify-between bg-white p-6"><dt className="text-base leading-snug">Guests seated (base)</dt><dd className="stat mt-2 text-[2.75rem]"><span data-count={base.attendees}>{base.attendees}</span></dd></div>}
            {base && <div className="flex flex-col justify-between bg-white p-6"><dt className="text-base leading-snug">Members within about 45 days (base)</dt><dd className="stat mt-2 text-[2.75rem]"><span data-count={base.members_signed_45d} data-dec="1">{base.members_signed_45d}</span></dd></div>}
          </dl>
        </div>
      </section>

      {/* FACTS + RESULTS */}
      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-24 md:px-8 lg:grid-cols-2" aria-labelledby="facts">
        <div>
          <p className="eyebrow" data-reveal>The event</p>
          <h2 id="facts" className="display h-bar mt-4 text-[2.25rem] md:text-[2.875rem]" data-reveal>The details</h2>
          <div className="mt-10"><Facts e={e} /></div>
        </div>
        <div>
          <p className="eyebrow" data-reveal>Results</p>
          <h2 className="display h-bar mt-4 text-[2.25rem] md:text-[2.875rem]" data-reveal>Projected and actual</h2>
          <div className="card mt-10 p-6 md:p-7">
            {base && (
              <table className="dtable">
                <thead><tr><th /><th className="!text-right">Projected (base)</th><th className="!text-right">Actual</th></tr></thead>
                <tbody>
                  {([["Paid budget", "paid_budget", "ad_spend", true], ["Applications", "applications", "applications"], ["Guests", "attendees", "attendees"], ["Intro calls booked", "intro_calls", "intro_calls"], ["Members signed", "members_signed_45d", "members_signed"]] as [string, string, keyof NonNullable<EventRec["actuals"]>, boolean?][]).map(([l, k, ak, money]) => (
                    <tr key={l}><td>{l}</td><td className="text-right font-bold">{money ? `$${base[k].toLocaleString("en-US")}` : base[k]}</td><td className="text-right">{act?.[ak] != null ? (money ? `$${Number(act[ak]).toLocaleString("en-US")}` : act[ak]) : "Not recorded"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-5 text-lg leading-relaxed">{act?.note ?? <ResultsNote date={e.date} builtAt={builtAt} />}</p>
          </div>
        </div>
      </section>

      {/* PLANS */}
      {e.plans.length > 0 && (
        <section className="bg-mist py-24" aria-labelledby="plans">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow" data-reveal>The plans</p><h2 id="plans" className="display h-bar mt-4 text-[2.25rem] md:text-[2.875rem]" data-reveal>Everything this event needs</h2></div><Link href={`${b}/plans/${e.plans[0].slug}`} className="btn btn-outline">Read the plans <Icon name="arrow-right" /></Link></div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4" data-stagger>
              {e.plans.map((p) => (
                <Link key={p.slug} href={`${b}/plans/${p.slug}`} className="card hover-lift group flex flex-col p-7">
                  <h3 className="section-title text-[1.25rem]">{p.title}</h3>
                  <p className="mt-2.5 flex-1 text-lg leading-relaxed">{p.blurb}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-lg font-bold text-blue"><span className="underline decoration-1 underline-offset-4 group-hover:decoration-2">Read</span><Icon name="arrow-right" /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CREATIVE PREVIEW: the one deliberate blue feature band */}
      {previews.length > 0 && (
        <section className="relative overflow-hidden bg-blue py-24 text-white" aria-labelledby="creative">
          <div aria-hidden className="dots-white pointer-events-none absolute right-8 top-10 hidden h-16 w-16 opacity-60 md:block" />
          <div className="relative mx-auto max-w-7xl px-5 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow !text-white">Creative library</p><h2 id="creative" className="display mt-4 max-w-4xl text-balance text-[2.25rem] !text-white md:text-[2.875rem]">{[[originals(lib.images).length, "images"], [originals(lib.flyers).length, "flyers"], [originals(lib.videos).length, "videos"], [originals(lib.reels).length, "Reels"], [caps.length, "captions"]].filter(([c]) => c).map(([c, l]) => `${c} ${l}`).join(" · ")}</h2></div><Link href={`${b}/creative`} className="btn btn-white">Open the library <Icon name="arrow-right" /></Link></div>
            <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-5 [&>*:nth-child(5)]:hidden md:[&>*:nth-child(5)]:block" data-stagger>
              {previews.map((a) => (
                <Link key={a.file} href={`${b}/creative#images`} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-white"><Image src={`${e.media}/images/${a.file}${ver(a)}`} alt={a.title} fill sizes="(max-width:768px) 50vw, 20vw" className="object-cover transition-transform duration-500 hover:scale-105" /></Link>
              ))}
            </div>
            {e.creativeNote && <p className="mt-8 max-w-3xl text-lg leading-relaxed">{e.creativeNote}</p>}
          </div>
        </section>
      )}

      {/* PROJECTIONS PREVIEW */}
      {pj && (
        <section className="mx-auto max-w-7xl px-5 py-24 md:px-8" aria-labelledby="proj">
          <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow" data-reveal>Projected results</p><h2 id="proj" className="display h-bar mt-4 text-[2.25rem] md:text-[2.875rem]" data-reveal>From applications to signed members</h2></div><Link href={`${b}/projections`} className="btn btn-outline">All three scenarios <Icon name="arrow-right" /></Link></div>
          <div className="mt-12 max-w-3xl"><EventFunnel pj={pj} /></div>
        </section>
      )}

      {/* MOVES */}
      {e.moves && e.moves.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 md:px-8" aria-labelledby="week">
          <div className="card-mist grid gap-10 p-8 md:grid-cols-[1fr_1.4fr] md:p-14">
            <div><p className="eyebrow">The week before</p><h2 id="week" className="display h-bar mt-4 text-[2.25rem]">The {e.moves.length === 5 ? "five" : e.moves.length} moves that fill the room</h2>{e.plans.some((p) => p.slug === "action-plan") && <Link href={`${b}/plans/action-plan`} className="btn btn-blue mt-9">Full action plan <Icon name="arrow-right" /></Link>}</div>
            <ol className="grid gap-6" data-stagger>
              {e.moves.map(([t, d], i) => (
                <li key={t} className="grid grid-cols-[2.75rem_1fr] gap-4"><span className="dot-num">{i + 1}</span><div><p className="text-lg font-bold leading-snug">{t}</p><p className="mt-1 text-lg leading-relaxed">{d}</p></div></li>
              ))}
            </ol>
          </div>
        </section>
      )}
      {e.sources && <p className="mx-auto mt-12 max-w-7xl px-5 text-base leading-relaxed md:px-8">{e.sources}{e.prepared ? ` Prepared ${apDate(e.prepared)}.` : ""}</p>}
    </main>
  );
}
