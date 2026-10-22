import type { NextConfig } from "next";

// The Manhattan Beach plans moved under the event's own page when the hub became events-based (2026-10-19);
// old shared links keep working.
const MB = "/events/manhattan-beach-2026-10-08";
const nextConfig: NextConfig = {
  // localPatterns with no "search" key lets local images carry ?v=<rev>, which the change workflow bumps when it
  // replaces a file in place (see src/lib/ver.ts)
  images: { formats: ["image/avif", "image/webp"], localPatterns: [{ pathname: "/media/**" }, { pathname: "/brand/**" }] },
  async redirects() {
    return [
      // the hub is the events and their content (2026-10-22): the overview, brand library, membership plans and
      // projections pages are gone, so their old links land on the events list
      ...["/events", "/creative", "/captions", "/projections", "/plans/:slug"].map((source) => ({ source, destination: "/", permanent: false })),
      // each event is its creative library and captions (2026-10-22): its overview, plans and projections links open the library
      ...["/events/:slug", "/events/:slug/projections", "/events/:slug/plans/:plan"].map((source) => ({ source, destination: "/events/:slug/creative", permanent: false })),
      { source: "/plans/event-organic", destination: `${MB}/creative`, permanent: false },
      { source: "/plans/event-paid", destination: `${MB}/creative`, permanent: false },
      { source: "/plans/filming", destination: `${MB}/creative`, permanent: false },
      { source: "/plans/action-plan", destination: `${MB}/creative`, permanent: false },
    ];
  },
};
export default nextConfig;
