// Drill bank: merge the generator's accepted entries into the shipped bank, and report each skill against the
// ship bar (150 spots or more, across 4 or more opponent types where the rule allows, and 3 or more seats).
//
//   node scripts/drillmerge.js <run dir> [--write] [--all] [--out path]   (--write writes src/drill/bank.json, or --out)
//
// Only entries made at the current bank version are taken; duplicates (the same cards, board and action) are
// dropped. A skill below the ship bar is reported and left out of the written bank unless --all is passed.

import { partnerGaps } from '../src/drill/learn.js';
import { checkBankRuns } from '../src/drill/game.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { replayTable } from '../src/drill/card.js';
import { potSize } from '../src/engine/game.js';
import path from 'node:path';
import { SKILLS } from './drill/skills.js';
import { bankVersion } from './drill/version.js';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/drillmerge.js <run dir> [--write] [--all]');
const write = process.argv.includes('--write');
const all = process.argv.includes('--all');
const version = bankVersion();
export const MIN_SPOTS = 150;

const seen = new Set();
const bySkill = {};
let stale = 0;
let v1NoCaller = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl') && !x.endsWith('.log.jsonl'))) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(line);
    if (e.bankVersion !== version && !process.argv.includes('--any-version')) { // --any-version: a dev bank only
      stale++;
      continue;
    }
    // V1 is "vs callers": a spot with no station or whale still in the hand is dropped (CURR, 19 Nov, spec 2.2)
    if (e.skill === 'V1' && !Object.values(e.reads || {}).some((r) => r.type === 'station' || r.type === 'whale')) {
      v1NoCaller++;
      continue;
    }
    const key = JSON.stringify([e.spot.hole[0], e.spot.board, e.spot.actions, e.spot.button, e.spot.n]);
    if (seen.has(key)) continue;
    seen.add(key);
    (bySkill[e.skill] ||= []).push(e);
  }
}

// B1 and V1 differ only by the hand (CEO, CURR): keep each street's share of B1 within 10 points of V1's, by a
// deterministic subsample of the over-represented street (the spots whose id hashes first go first)
const STREET_NAMES = ['pre', 'flop', 'turn', 'river'];
const shares = (es) => {
  const c = {};
  for (const e of es) c[e.street] = (c[e.street] || 0) + 1;
  return Object.fromEntries([1, 2, 3].map((k) => [k, es.length ? (c[k] || 0) / es.length : 0]));
};
let b1Thinned = 0;
if (bySkill.B1 && bySkill.V1 && bySkill.V1.length) {
  const v = shares(bySkill.V1);
  const h = (e) => crypto.createHash('sha1').update(e.id).digest('hex');
  let b = bySkill.B1.slice().sort((x, y) => (h(x) < h(y) ? -1 : 1));
  for (;;) {
    const sb = shares(b);
    const over = [1, 2, 3].filter((k) => sb[k] - v[k] > 0.1).sort((x, y) => sb[y] - v[y] - (sb[x] - v[x]))[0];
    const under = [1, 2, 3].some((k) => v[k] - sb[k] > 0.1);
    if (over === undefined && !under) break;
    // an under-represented street is fixed by thinning the street most over V1's share
    const k = over ?? [1, 2, 3].sort((x, y) => sb[y] - v[y] - (sb[x] - v[x]))[0];
    const i = b.findIndex((e) => e.street === k);
    if (i < 0 || b.length <= 1) break;
    b.splice(i, 1);
    b1Thinned++;
  }
  bySkill.B1 = b;
}
// the non-hand cues side by side (CEO): street, pot at the decision, live opponents
function cueTable(code) {
  const es = bySkill[code] || [];
  const out = { street: {}, potBb: {}, live: {} };
  for (const e of es) {
    const { s } = replayTable(e.spot);
    const pot = Math.round(potSize(s) / s.bbAmt);
    const bucket = pot < 10 ? '<10' : pot < 20 ? '10-19' : pot < 40 ? '20-39' : pot < 80 ? '40-79' : '80+';
    out.street[STREET_NAMES[e.street]] = (out.street[STREET_NAMES[e.street]] || 0) + 1;
    out.potBb[bucket] = (out.potBb[bucket] || 0) + 1;
    const n = Object.keys(e.reads || {}).length;
    out.live[n] = (out.live[n] || 0) + 1;
  }
  const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, `${Math.round((100 * x) / Math.max(1, es.length))}%`]));
  return { n: es.length, street: pct(out.street), potBb: pct(out.potBb), live: pct(out.live) };
}

// the opponent type a spot is "against": the bettor for a call-or-fold spot, else every live opponent
const against = (e) => {
  const live = Object.values(e.reads).map((r) => r.type);
  const last = [...e.spot.actions].reverse().find((a) => a.type === 'raise' && a.seat !== 0);
  return last ? [e.spot.types[last.seat]] : live;
};

const report = {};
const ship = [];
for (const [code, sk] of Object.entries(SKILLS)) {
  const es = bySkill[code] || [];
  const types = {};
  const seats = {};
  const diff = { 1: 0, 2: 0, 3: 0 };
  let noWrong = 0;
  for (const e of es) {
    for (const t of new Set(against(e))) types[t] = (types[t] || 0) + 1;
    seats[e.position] = (seats[e.position] || 0) + 1;
    diff[e.difficulty]++;
    if (!Object.values(e.families).includes('wrong')) noWrong++;
  }
  // opponent types where the rule allows: 4; V1 has only its two calling types (CEO, 17 Nov); P2 is first in (no opponent acts);
  // D1 faces only the types that make big late bets (abc, station, nit; no beginner does in any run; CEO, 19 Nov)
  // V5 faces only nits and regulars (2 types); D2 only maniacs (1)
  const minTypes = { P2: 1, V1: 2, B1: 2, D1: 3, V5: 2, D2: 1 }[code] ?? 4;
  const ok = es.length >= MIN_SPOTS && Object.keys(types).length >= minTypes && Object.keys(seats).length >= 3;
  // CURR (18 Nov): at least 20% easy and 15% tricky; short of either, report to CURR and the CEO before it ships
  const split = es.length ? { d1: diff[1] / es.length, d3: diff[3] / es.length } : { d1: 0, d3: 0 };
  const splitOk = split.d1 >= 0.2 && split.d3 >= 0.15;
  report[code] = { name: sk.name, spots: es.length, ok, types, seats, difficulty: diff, bestOrFineOnly: noWrong, split, splitOk };
  if (ok || all) ship.push(code);
}
console.log(`bank version ${version}; ${stale} entries from older versions skipped; ${v1NoCaller} V1 spots with no station or whale dropped${b1Thinned ? `; ${b1Thinned} B1 spots thinned to match V1's streets` : ''}`);
if (bySkill.B1 || bySkill.V1) for (const c of ['V1', 'B1']) console.log(`cues ${c}: ${JSON.stringify(cueTable(c))}`);
for (const [code, r] of Object.entries(report)) {
  console.log(`${code} ${r.name}: ${r.spots} spots ${r.ok ? 'SHIPS' : 'below the bar'} | difficulty ${JSON.stringify(r.difficulty)} (easy ${Math.round(100 * r.split.d1)}%, tricky ${Math.round(100 * r.split.d3)}%${r.splitOk ? '' : ': SHORT of 20% / 15%, report to CURR and the CEO'}) | no wrong answer ${r.bestOrFineOnly}`);
  console.log(`   against ${JSON.stringify(r.types)}`);
  console.log(`   seats ${JSON.stringify(r.seats)}`);
}
if (write) {
  const bank = {
    version,
    built: new Date().toISOString().slice(0, 10),
    skills: Object.fromEntries(ship.map((c) => [c, { name: SKILLS[c].name, tier: SKILLS[c].tier, leak: SKILLS[c].leak, rule: SKILLS[c].rule }])),
    spots: ship.flatMap((c) => bySkill[c] || []).map(({ gate, ...e }) => ({ ...e, gate: { seeds: gate.seeds, samples: gate.samples, proChecked: gate.proChecked } })),
  };
  const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'src/drill/bank.json';
  // the shipped bank's checks (CEO, GAME, CURR): a lesson and its partner together, and every run it deals valid;
  // a dev bank (--out elsewhere) may be partial while it is built
  const gaps = partnerGaps(bank);
  const runs = checkBankRuns(bank);
  console.log(`runs: ${runs.checked} checked, ${runs.failed.length} invalid${gaps.length ? ` | partners: ${gaps.join('; ')}` : ''}`);
  if (out === 'src/drill/bank.json' && (gaps.length || runs.failed.length)) {
    console.log(`NOT written: ${gaps.length ? 'a lesson would ship without its partner' : 'the bank deals invalid runs'}`);
    process.exitCode = 1;
  } else {
    fs.writeFileSync(out, JSON.stringify(bank));
    console.log(`wrote ${out}: ${bank.spots.length} spots, ${ship.join(', ') || 'no skills'}`);
  }
}
