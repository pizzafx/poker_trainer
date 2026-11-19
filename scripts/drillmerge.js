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

// A partner differs from its lesson only by the hand (CEO, CURR): every non-hand cue's share in the partner stays within
// 10 points of the lesson's. One deterministic subsample over all the cues together: each step drops the spot (in id
// hash order) whose removal most cuts the total excess over 10 points, until none is left or no drop helps.
// B1 against V1 on street, pot size and opponent type (a station, a whale, an abc in the hand); D3 against D1 on
// street, pot size and the bettor's type (CURR: a station's bet must not mean "call").
const STREET_NAMES = ['pre', 'flop', 'turn', 'river'];
const BALANCE = { B1: { vs: 'V1', keys: ['street', 'pot', 'type'] }, D3: { vs: 'D1', keys: ['street', 'pot', 'bettor'] } };
const BAL_TYPES = ['station', 'whale', 'abc'];
const potCache = new Map();
const potBucket = (e) => {
  if (!potCache.has(e.id)) {
    const { s } = replayTable(e.spot);
    const pot = Math.round(potSize(s) / s.bbAmt);
    potCache.set(e.id, pot < 10 ? '<10' : pot < 20 ? '10-19' : pot < 40 ? '20-39' : pot < 80 ? '40-79' : '80+');
  }
  return potCache.get(e.id);
};
const typesIn = (e) => new Set(Object.values(e.reads || {}).map((r) => r.type));
const bettorOf = (e) => {
  const last = [...e.spot.actions].reverse().find((a) => a.type === 'raise' && a.seat !== 0);
  return last ? e.spot.types[last.seat] : null;
};
// each cue as a list of [label, test(e)]: a spot counts toward every label it passes
const CUE = {
  street: [1, 2, 3].map((k) => [`street ${STREET_NAMES[k]}`, (e) => e.street === k]),
  pot: ['<10', '10-19', '20-39', '40-79', '80+'].map((b) => [`pot ${b}`, (e) => potBucket(e) === b]),
  type: BAL_TYPES.map((ty) => [`has ${ty}`, (e) => typesIn(e).has(ty)]),
  bettor: ['nit', 'abc', 'station', 'beginner'].map((ty) => [`bettor ${ty}`, (e) => bettorOf(e) === ty]),
};
const balanceLeft = {};
const shareOf = (es, test) => (es.length ? es.filter(test).length / es.length : 0);
const thinned = {};
for (const [code, { vs, keys }] of Object.entries(BALANCE)) {
  if (!bySkill[code] || !bySkill[vs] || !bySkill[vs].length) continue;
  const tests = keys.flatMap((k) => CUE[k]);
  const target = tests.map(([, f]) => shareOf(bySkill[vs], f));
  const marks = (e) => tests.map(([, f]) => f(e));
  const h = (e) => crypto.createHash('sha1').update(e.id).digest('hex');
  let b = bySkill[code].slice().sort((x, y) => (h(x) < h(y) ? -1 : 1));
  // counts per cue, so a trial drop is cheap
  let m = b.map(marks);
  let cnt = tests.map((_, j) => m.filter((x) => x[j]).length);
  const excess = (c, n) => c.reduce((a, x, j) => a + Math.max(0, Math.abs(x / n - target[j]) - 0.1), 0);
  for (let cur = excess(cnt, b.length); cur > 1e-9 && b.length > 1; ) {
    let best = -1;
    let bestV = cur;
    for (let i = 0; i < b.length; i++) {
      const c = cnt.map((x, j) => x - (m[i][j] ? 1 : 0));
      const v = excess(c, b.length - 1);
      if (v < bestV - 1e-12) {
        bestV = v;
        best = i;
      }
    }
    if (best < 0) break;
    cnt = cnt.map((x, j) => x - (m[best][j] ? 1 : 0));
    b.splice(best, 1);
    m.splice(best, 1);
    cur = bestV;
    thinned[code] = (thinned[code] || 0) + 1;
  }
  bySkill[code] = b;
  // a cue the greedy stop leaves over 10 points is flagged, never passed silently (CURR)
  const left = tests.map(([label], j) => [label, cnt[j] / Math.max(1, b.length) - target[j]]).filter(([, d]) => Math.abs(d) > 0.1 + 1e-9);
  if (left.length) balanceLeft[code] = left.map(([l, d]) => `${l} ${d > 0 ? '+' : ''}${Math.round(100 * d)} pts`);
}
// the opponent a lesson's spot is about, for its type x difficulty cells (CURR, 19 Nov)
function primaryOf(e) {
  if (e.skill.startsWith('D')) return bettorOf(e);
  if (e.skill === 'P1') {
    const a = e.spot.actions.find((x) => x.type === 'call' && x.seat !== 0);
    return a ? e.spot.types[a.seat] : 'none';
  }
  const c = Object.values(e.reads || {}).map((r) => r.type).filter((ty) => ty === 'station' || ty === 'whale');
  return c.length ? [...new Set(c)].sort().join('+') : 'other';
}
// the non-hand cues side by side (CEO): street, pot at the decision, live opponents, the bettor's type
function cueTable(code) {
  const es = bySkill[code] || [];
  const out = { street: {}, potBb: {}, live: {}, bettor: {}, hasType: {} };
  for (const e of es) {
    const inc = (o, k) => (o[k] = (o[k] || 0) + 1);
    inc(out.street, STREET_NAMES[e.street]);
    inc(out.potBb, potBucket(e));
    inc(out.live, Object.keys(e.reads || {}).length);
    const last = [...e.spot.actions].reverse().find((a) => a.type === 'raise' && a.seat !== 0);
    if (last && code.startsWith('D')) inc(out.bettor, e.spot.types[last.seat]); // facing a bet: D lessons only
    for (const ty of typesIn(e)) inc(out.hasType, ty);
  }
  const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, `${Math.round((100 * x) / Math.max(1, es.length))}%`]));
  return { n: es.length, street: pct(out.street), potBb: pct(out.potBb), live: pct(out.live), hasType: pct(out.hasType), ...(Object.keys(out.bettor).length ? { bettor: pct(out.bettor) } : {}) };
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
  // D3 faces D1's bettors (abc, station, nit; no beginner D1-sized bets so far)
  const minTypes = { P2: 1, V1: 2, B1: 2, D1: 3, D3: 3, V5: 2, D2: 1 }[code] ?? 4;
  const ok = es.length >= MIN_SPOTS && Object.keys(types).length >= minTypes && Object.keys(seats).length >= 3;
  // CURR (18 Nov): at least 20% easy and 15% tricky; short of either, report to CURR and the CEO before it ships
  const split = es.length ? { d1: diff[1] / es.length, d3: diff[3] / es.length } : { d1: 0, d3: 0 };
  const splitOk = split.d1 >= 0.2 && split.d3 >= 0.15;
  report[code] = { name: sk.name, spots: es.length, ok, types, seats, difficulty: diff, bestOrFineOnly: noWrong, split, splitOk };
  if (ok || all) ship.push(code);
}
console.log(`bank version ${version}; ${stale} entries from older versions skipped; ${v1NoCaller} V1 spots with no station or whale dropped${Object.entries(thinned).map(([c, n]) => `; ${n} ${c} spots thinned to match ${BALANCE[c].vs}`).join('')}`);
for (const [code, { vs }] of Object.entries(BALANCE)) if (bySkill[code] || bySkill[vs]) for (const c of [vs, code]) console.log(`cues ${c}: ${JSON.stringify(cueTable(c))}`);
for (const [code, left] of Object.entries(balanceLeft)) console.log(`BALANCE NOT MET ${code} vs ${BALANCE[code].vs}: ${left.join(', ')} (report to CURR before it ships)`);
for (const [code, r] of Object.entries(report)) {
  console.log(`${code} ${r.name}: ${r.spots} spots ${r.ok ? 'SHIPS' : 'below the bar'} | difficulty ${JSON.stringify(r.difficulty)} (easy ${Math.round(100 * r.split.d1)}%, tricky ${Math.round(100 * r.split.d3)}%${r.splitOk ? '' : ': SHORT of 20% / 15%, report to CURR and the CEO'}) | no wrong answer ${r.bestOrFineOnly}`);
  console.log(`   against ${JSON.stringify(r.types)}`);
  console.log(`   seats ${JSON.stringify(r.seats)}`);
  // type x difficulty cells, keyed on the lesson's primary opponent (CURR): the bettor for D lessons, the first
  // limper for P1, the station or whale for V1 and B1; cells under 3 are named (they are dropped at release)
  const cells = {};
  for (const e of bySkill[code] || []) {
    const k = `${primaryOf(e)} d${e.difficulty}`;
    cells[k] = (cells[k] || 0) + 1;
  }
  const thin = Object.entries(cells).filter(([, n]) => n < 3);
  if (code !== 'P2') console.log(`   cells ${Object.keys(cells).length}${thin.length ? `, under 3: ${thin.map(([k, n]) => `${k} (${n})`).join(', ')}` : ', none under 3'}`);
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
