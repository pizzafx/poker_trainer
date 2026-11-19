// Drill bank: merge the generator's accepted entries into the shipped bank, and report each skill against the
// ship bar (150 spots or more, across 4 or more opponent types where the rule allows, and 3 or more seats).
//
//   node scripts/drillmerge.js <run dir> [--write] [--all] [--out path]   (--write writes src/drill/bank.json, or --out)
//
// Only entries made at the current bank version are taken; duplicates (the same cards, board and action) are
// dropped. A skill below the ship bar is reported and left out of the written bank unless --all is passed.

import fs from 'node:fs';
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
  const minTypes = { P2: 1, V1: 2, D1: 3 }[code] ?? 4;
  const ok = es.length >= MIN_SPOTS && Object.keys(types).length >= minTypes && Object.keys(seats).length >= 3;
  // CURR (18 Nov): at least 20% easy and 15% tricky; short of either, report to CURR and the CEO before it ships
  const split = es.length ? { d1: diff[1] / es.length, d3: diff[3] / es.length } : { d1: 0, d3: 0 };
  const splitOk = split.d1 >= 0.2 && split.d3 >= 0.15;
  report[code] = { name: sk.name, spots: es.length, ok, types, seats, difficulty: diff, bestOrFineOnly: noWrong, split, splitOk };
  if (ok || all) ship.push(code);
}
console.log(`bank version ${version}; ${stale} entries from older versions skipped; ${v1NoCaller} V1 spots with no station or whale dropped`);
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
  fs.writeFileSync(out, JSON.stringify(bank));
  console.log(`wrote ${out}: ${bank.spots.length} spots, ${ship.join(', ') || 'no skills'}`);
}
