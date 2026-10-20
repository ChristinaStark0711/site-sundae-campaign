// Projections for one event: the same funnel as the Manhattan Beach model (clients/sundae/marketing/projections/model.py,
// event_scenario), with this event's seat cap and budgets. Every input is a labeled assumption.
//   node engine/tools/event-model.mjs <slug> [--seat-cap 60] [--budget 5000 | 3000,5000,8000] [--cpl 75,60,50] [--organic 35,45,60]
// Each trio is conservative,base,aggressive: three positive numbers, digits only (no "$", no thousands commas). A single
// --budget N is the base case; the conservative (0.6 x N) and aggressive (1.6 x N) budgets, rounded to the nearest $500,
// are then labeled assumptions, and the projections notes say so. The seat cap is a whole number, 1 or more.
// Writes src/content/events/<slug>/projections.json and prints the base case.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flags, parseBudget, parseSeatCap, parseTrio, unknownFlags } from './ap.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USAGE = 'usage: event-model.mjs <existing event slug> [--seat-cap N] [--budget N | c,b,a] [--cpl c,b,a] [--organic c,b,a]';
const f = flags(process.argv.slice(2));
const slug = f._[0];
const dir = path.join(REPO, 'src/content/events', slug || '');
if (!slug || f._.length > 1 || !fs.existsSync(path.join(dir, 'event.json'))) { console.error(USAGE); process.exit(2); }
const capIn = parseSeatCap(f['seat-cap']), budgetIn = parseBudget(f.budget), cplIn = parseTrio(f.cpl, 'cpl', '75,60,50'), organicIn = parseTrio(f.organic, 'organic', '35,45,60');
const errors = [...unknownFlags(f, ['seat-cap', 'budget', 'cpl', 'organic']).map((k) => `unknown flag --${k}`), ...[capIn, budgetIn, cplIn, organicIn].map((x) => x.error).filter(Boolean)];
if (errors.length) { console.error(`event-model: ${errors.join('\nevent-model: ')}\n${USAGE}`); process.exit(2); }
const cap = capIn.value ?? 60;
const budget = budgetIn.value ?? [3000, 5000, 8000], cpl = cplIn.value ?? [75, 60, 50], organic = organicIn.value ?? [35, 45, 60];
const RATES = { conservative: { approve: 0.55, show: 0.62, call_rate: 0.25, sign_rate: 0.15 }, base: { approve: 0.55, show: 0.7, call_rate: 0.3, sign_rate: 0.18 }, aggressive: { approve: 0.5, show: 0.75, call_rate: 0.35, sign_rate: 0.2 } };
const round1 = (v) => Math.round(v * 10) / 10;
const pyRound = (v) => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 ? r - 1 : r; }; // Python's banker's rounding, to match model.py
// Attendees never exceed the seat cap. Approvals may: up to cap / show rate, so the expected no-shows still leave a full room.
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
const $ = (n) => `$${n.toLocaleString('en-US')}`;
const seats = `${cap} seat${cap === 1 ? '' : 's'}`;
const out = {
  generated: new Date().toISOString().slice(0, 10),
  notes: [
    'All inputs are labeled assumptions from industry benchmark ranges, not Sundae data.',
    `Attendance is capped at the venue layout: ${seats} for this event. Approvals can run higher, up to ${cap} divided by the show rate (about ${Math.round(cap / RATES.base.show)} in the base case), to allow for no-shows.`,
    ...(budgetIn.derived ? [`Only the base budget (${$(budget[1])}) was given. The conservative (${$(budget[0])}) and aggressive (${$(budget[2])}) budgets are 0.6 and 1.6 times it, rounded to the nearest $500: assumptions, not plans.`] : []),
  ],
  seat_cap: cap, scenarios,
};
fs.writeFileSync(path.join(dir, 'projections.json'), JSON.stringify(out, null, 2) + '\n');
const b = scenarios.base;
console.log(`${slug}: base case ${$(b.paid_budget)} paid → ${b.applications} applications → ${b.approved_seats} approved → ${b.attendees} guests → ${b.intro_calls} intro calls → ${b.members_signed_45d} members (cap ${cap})`);
if (budgetIn.derived) console.log(`  budgets: only the base was given; conservative ${$(budget[0])} and aggressive ${$(budget[2])} are labeled assumptions (0.6x and 1.6x, nearest $500), noted in projections.json`);
