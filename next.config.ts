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
      { source: "/events/:slug/projections", destination: "/events/:slug", permanent: false },
      { source: "/plans/event-organic", destination: `${MB}/plans/organic`, permanent: false },
      { source: "/plans/event-paid", destination: `${MB}/plans/paid`, permanent: false },
      { source: "/plans/filming", destination: `${MB}/plans/filming`, permanent: false },
      { source: "/plans/action-plan", destination: `${MB}/plans/action-plan`, permanent: false },
    ];
  },
};
export default nextConfig;
