// Projections for one event: the same funnel as the Manhattan Beach model (clients/sundae/marketing/projections/model.py,
// event_scenario), with this event's seat cap and budgets. Every input is a labeled assumption.
//   node engine/tools/event-model.mjs <slug> --seat-cap 60 [--budget 3000,5000,8000] [--cpl 75,60,50] [--organic 35,45,60]
// Writes src/content/events/<slug>/projections.json and prints the base case.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flags } from './ap.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const f = flags(process.argv.slice(2));
const slug = f._[0];
const dir = path.join(REPO, 'src/content/events', slug || '');
if (!slug || !fs.existsSync(path.join(dir, 'event.json'))) { console.error('usage: event-model.mjs <existing event slug> --seat-cap N [--budget c,b,a] [--cpl c,b,a] [--organic c,b,a]'); process.exit(2); }
const trio = (s, d) => (s ? String(s).split(',').map(Number) : d);
const cap = Number(f['seat-cap'] || 60);
const budget = trio(f.budget, [3000, 5000, 8000]), cpl = trio(f.cpl, [75, 60, 50]), organic = trio(f.organic, [35, 45, 60]);
const RATES = { conservative: { approve: 0.55, show: 0.62, call_rate: 0.25, sign_rate: 0.15 }, base: { approve: 0.55, show: 0.7, call_rate: 0.3, sign_rate: 0.18 }, aggressive: { approve: 0.5, show: 0.75, call_rate: 0.35, sign_rate: 0.2 } };
const round1 = (v) => Math.round(v * 10) / 10;
const pyRound = (v) => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 ? r - 1 : r; }; // Python's banker's rounding, to match model.py
function scenario(p) {
  const paidApps = p.paid_budget / p.paid_cpl;
  const apps = paidApps + p.organic_apps;
  const approved = Math.min(apps * p.approve, cap / p.show);
  const attend = Math.min(approved * p.show, cap);
  const calls = attend * p.call_rate;
  const signed = calls * p.sign_rate;
  return { paid_budget: p.paid_budget, paid_cpl: p.paid_cpl, paid_applications: pyRound(paidApps), organic_applications: p.organic_apps, applications: pyRound(apps), approved_seats: pyRound(approved), attendees: pyRound(attend), intro_calls: pyRound(calls), members_signed_45d: round1(signed), cost_per_attendee: pyRound(p.paid_budget / Math.max(attend, 1)), assumptions: p };
}
const keys = ['conservative', 'base', 'aggressive'];
const scenarios = Object.fromEntries(keys.map((k, i) => [k, scenario({ paid_budget: budget[i], paid_cpl: cpl[i], organic_apps: organic[i], ...RATES[k] })]));
const out = {
  generated: new Date().toISOString().slice(0, 10),
  notes: ['All inputs are labeled assumptions from industry benchmark ranges, not Sundae data.', `Seats are capped at the venue layout (${cap} for this dinner); the approved-seat count never exceeds it.`],
  seat_cap: cap, scenarios,
};
fs.writeFileSync(path.join(dir, 'projections.json'), JSON.stringify(out, null, 2) + '\n');
const b = scenarios.base;
console.log(`${slug}: base case $${b.paid_budget} paid → ${b.applications} applications → ${b.attendees} guests → ${b.intro_calls} intro calls → ${b.members_signed_45d} members (cap ${cap})`);
