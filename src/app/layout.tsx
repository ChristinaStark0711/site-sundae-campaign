import type { Metadata, Viewport } from "next";
import { Lato, Merriweather } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import ScrollFx from "@/components/ScrollFx";
import { getBrandPlans, getEvents } from "@/lib/content";
import { apDate } from "@/lib/format";

// Sundae brand fonts (Creative Guidelines p.7): Merriweather for headlines and callouts, Lato for everything else.
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-merriweather", display: "swap" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-lato", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://site-sundae-campaign.vercel.app"),
  title: { default: "Sundae × SHAI — Events and Membership Growth Hub", template: "%s · Sundae × SHAI" },
  description: "Every Sundae city dinner (creative, captions, plans, budgets and projections) and the always-on membership (franchise) growth engine, run on SHAI.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${merriweather.variable} ${lato.variable}`}>
      <body className="min-h-screen">
        <ScrollFx />
        <Nav plans={getBrandPlans().map((p) => ({ href: `/plans/${p.slug}`, title: p.title }))} builtAt={Date.now()}
          events={getEvents().map((e) => ({ href: `/events/${e.slug}`, title: `${e.city} · ${apDate(e.date)}`, date: e.date, rsvp: e.rsvp }))} />
        {children}
        <footer className="mt-28 border-t border-gray bg-mist">
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-x-10 gap-y-3 px-5 py-12 text-base leading-relaxed md:px-8">
            <p>Prepared for <strong className="font-bold">Sundae</strong> by <strong className="font-bold">SHAI</strong> · Confidential working draft</p>
            <p className="max-w-2xl">Facts are sourced from sundae.com, Sundae&apos;s own event materials and each venue&apos;s website; each event page lists its sources. City photos are openly licensed and credited where they appear. Projections are labeled assumptions.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
