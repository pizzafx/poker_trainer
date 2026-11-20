// Drill bank: merge the generator's accepted entries into the shipped bank, and report each skill against the
// ship bar (150 spots or more, across 4 or more opponent types where the rule allows, and 3 or more seats).
//
//   node scripts/drillmerge.js <run dir> [--write] [--all] [--out path]   (--write writes src/drill/bank.json, or --out)
//
// Only entries made at the current bank version are taken; duplicates (the same cards, board and action) are
// dropped. A skill below the ship bar is reported and left out of the written bank unless --all is passed.

import { partnerGaps } from '../src/drill/learn.js';
import { checkBankRuns, buildRun } from '../src/drill/game.js';
import { nextPractice, freshLearn, answer } from '../src/drill/learn.js';
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
// P1 spots rejected by drillentry's limp-and-fold-wrong rule, from the run logs (this bank version)
let p1Dropped = 0;
// D3's nit clause drops (CEO, CURR, 19 Nov): strict-board sets against a nit dropped because the call is not best or
// fine, by the raise family (how many call-wrong spots have raise best decides "calls" or "continues"), and the other
// two pair+ spots the clause took out
const d3Nit = { callDrop: {}, clause: 0 };
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.log.jsonl'))) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) {
    try {
      const l = JSON.parse(line);
      if (l.skill === 'P1' && (l.bankVersion === version || process.argv.includes('--any-version')) && /^P1: .*not both wrong/.test(l.result || '')) p1Dropped++;
      if (l.skill === 'D3' && (l.bankVersion === version || process.argv.includes('--any-version'))) {
        const m = /^D3: a strict-board set vs a nit with the call (\w+) \(raise (\w+)\)/.exec(l.result || '');
        if (m) d3Nit.callDrop[`call ${m[1]}, raise ${m[2]}`] = (d3Nit.callDrop[`call ${m[1]}, raise ${m[2]}`] || 0) + 1;
        if (/^D3: not a strict-board set vs a nit/.test(l.result || '')) d3Nit.clause++;
      }
    } catch {
      // a partial line
    }
  }
}
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
// Serving weights (CEO, GAME, CURR, 19 Nov): a lesson is served toward its partner's cue mix instead of the partner
// being thinned to the lesson's. D1's spots get weights that bring D1-as-served to D3's street, pot and bettor mix
// (iterative proportional fitting on the three marginals), with no spot above WEIGHT_CAP x its uniform rate and none
// below WEIGHT_FLOOR x (every spot stays servable). The weights are written into the bank; the scheduler and the run
// builder use them only while the partner is open. D3 is then thinned only where served D1 still cannot match it.
const WEIGHTED = { D1: { toward: 'D3', keys: ['street', 'pot', 'bettor'] } };
export const WEIGHT_CAP = 2;
export const WEIGHT_FLOOR = 0.5; // CURR, 19 Nov: served down to 0.5x of uniform, never lower (measured, as the cap)
const WEIGHT_AIM = 1.4; // the fit's own cap, under WEIGHT_CAP: the served rate runs above the raw weight
const servedShare = (es, test) => {
  let all = 0;
  let hit = 0;
  for (const e of es) {
    const w = e.weight ?? 1;
    all += w;
    if (test(e)) hit += w;
  }
  return all ? hit / all : 0;
};
for (const [code, { toward, keys }] of Object.entries(WEIGHTED)) {
  const es = bySkill[code];
  const ps = bySkill[toward];
  if (!es || !ps || !es.length || !ps.length) continue;
  const tests = keys.flatMap((k) => CUE[k]);
  const target = tests.map(([, f]) => shareOf(ps, f));
  const marks = es.map((e) => tests.map(([, f]) => f(e)));
  let w = es.map(() => 1);
  const groups = keys.map((k) => CUE[k].map(([label]) => tests.findIndex(([l]) => l === label)));
  for (let it = 0; it < 200; it++) {
    for (const g of groups) {
      const tot = w.reduce((a, x) => a + x, 0);
      for (const j of g) {
        const cur = w.reduce((a, x, i) => a + (marks[i][j] ? x : 0), 0) / tot;
        if (cur > 0 && target[j] > 0) {
          const f = target[j] / cur;
          w = w.map((x, i) => (marks[i][j] ? x * f : x));
        }
      }
    }
    // within each difficulty (the scheduler and the run builder pick within one), mean 1, then the working cap and
    // the floor: the served rate runs above the raw weight, so the fit aims under the cap
    for (const d of [1, 2, 3]) {
      const ix = es.map((e, i) => (e.difficulty === d ? i : -1)).filter((i) => i >= 0);
      if (!ix.length) continue;
      const mean = ix.reduce((a, i) => a + w[i], 0) / ix.length;
      for (const i of ix) w[i] = Math.min(WEIGHT_AIM, Math.max(WEIGHT_FLOOR, w[i] / mean));
    }
  }
  es.forEach((e, i) => (e.weight = +w[i].toFixed(3)));
}
// The cap, measured as served (CURR, GAME): no weighted spot is served at more than WEIGHT_CAP x its uniform rate in
// 10,000 runs or in a long Practice simulation. A spot over the line has its weight scaled down and the check runs
// again; a bank that still fails is not written.
function servedRatios(spots, skills) {
  const tier1 = Object.keys(skills).filter((c) => skills[c].tier === 1 && spots.some((s) => s.skill === c));
  const plain = spots.map(({ weight, ...e }) => e);
  const runs = (sp) => {
    const c = {};
    const warn = console.warn;
    console.warn = () => {};
    for (let k = 0; k < 10000; k++) for (const id of buildRun(`cap-${k}`, sp, tier1) || []) c[id] = (c[id] || 0) + 1;
    console.warn = warn;
    return c;
  };
  const practice = (sp) => {
    const st = freshLearn();
    const c = {};
    let r = 7;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const sk = Object.fromEntries(tier1.map((k) => [k, skills[k]]));
    for (let i = 0; i < 40000; i++) {
      const now = Date.UTC(2026, 10, 19) + i * 600000;
      const x = nextPractice(st, sp, sk, { now, rnd });
      if (!x) break;
      c[x.spot.id] = (c[x.spot.id] || 0) + 1;
      answer(st, x.spot, i % 5 === 4 ? 'wrong' : 'best', now);
    }
    return c;
  };
  const out = {};
  for (const [name, f] of [['runs', runs], ['practice', practice]]) {
    const cw = f(spots);
    const cu = f(plain);
    for (const e of spots) {
      if (e.weight == null || (cu[e.id] || 0) < 30) continue;
      const n = cw[e.id] || 0;
      const r = n / cu[e.id];
      // the ratio's own sampling error (two counts): a spot is over or under only past 2 SE of the line
      const se = r * Math.sqrt(1 / Math.max(1, n) + 1 / cu[e.id]);
      const o = (out[e.id] ||= { hi: 0, lo: Infinity, hiLow: 0, loHigh: Infinity });
      o.hi = Math.max(o.hi, r);
      o.lo = Math.min(o.lo, r);
      o.hiLow = Math.max(o.hiLow, r - 2 * se); // the least the high side can be
      o.loHigh = Math.min(o.loHigh, r + 2 * se); // the most the low side can be
    }
  }
  return out;
}

const thinned = {};
for (const [code, { vs, keys }] of Object.entries(BALANCE)) {
  if (!bySkill[code] || !bySkill[vs] || !bySkill[vs].length) continue;
  const tests = keys.flatMap((k) => CUE[k]);
  // the lesson as served: weighted where it carries serving weights
  const target = tests.map(([, f]) => servedShare(bySkill[vs], f));
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
function cueTable(code, served = false) {
  const es0 = bySkill[code] || [];
  // as served: each spot counted by its weight (in thousandths, so the shares below stay simple counts)
  const es = served ? es0.flatMap((e) => Array(Math.max(1, Math.round(1000 * (e.weight ?? 1)))).fill(e)) : es0;
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
  return { n: es0.length, ...(served ? { asServed: true } : {}), street: pct(out.street), potBb: pct(out.potBb), live: pct(out.live), hasType: pct(out.hasType), ...(Object.keys(out.bettor).length ? { bettor: pct(out.bettor) } : {}) };
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
for (const [code, { vs }] of Object.entries(BALANCE)) if (bySkill[code] || bySkill[vs]) for (const c of [vs, code]) console.log(`cues ${c}${WEIGHTED[c] ? ' as served' : ''}: ${JSON.stringify(cueTable(c, !!WEIGHTED[c]))}`);
for (const [code] of Object.entries(WEIGHTED)) if (bySkill[code] && bySkill[code].some((e) => e.weight != null)) {
  const ws = bySkill[code].map((e) => e.weight);
  // effective variety (CURR): (sum w)^2 / sum w^2, the number of equally weighted spots the served lesson is worth
  const eff = ws.reduce((a, x) => a + x, 0) ** 2 / ws.reduce((a, x) => a + x * x, 0);
  console.log(`weights ${code}: max ${Math.max(...ws)}x, min ${Math.min(...ws)}x the uniform rate (cap ${WEIGHT_CAP}, floor ${WEIGHT_FLOOR}); effective variety ${eff.toFixed(0)} of ${ws.length} spots${eff < 60 ? ' (UNDER 60: to CURR before it ships)' : ''}`);
}
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
  // P1 (CURR, 19 Nov): the spots the limp-and-fold-wrong rule dropped (from the run logs), any fine limp left (none
  // should be: drillentry rejects them), and the 77/88 count from the cutoff and the button
  if (code === 'P1') {
    const fl = (bySkill.P1 || []).filter((e) => e.families.call === 'fine');
    const pairs = (bySkill.P1 || []).filter((e) => ['77', '88'].includes(e.hand) && ['CO', 'BTN'].includes(e.position)).length;
    console.log(`   dropped by the limp-and-fold-wrong rule: ${p1Dropped}; fine limps left: ${fl.length}; 77/88 from the CO and BTN: ${pairs}`);
  }
  if (code === 'D3') {
    const drops = Object.entries(d3Nit.callDrop).map(([k, n]) => `${k}: ${n}`).join('; ') || 'none';
    console.log(`   nit clause (from the run logs): strict-board sets dropped for the call (${drops}); other two pair+ vs a nit's river bet dropped in derive: ${d3Nit.clause}`);
  }
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
  // the served cap: measure, scale down any spot over the line, measure again (at most 5 rounds)
  // the served cap and floor (CURR): no weighted spot served above WEIGHT_CAP x or below WEIGHT_FLOOR x its uniform rate,
  // in runs or in Practice, past 2 standard errors of its own counts (a ratio of two sample counts reads about +-14%
  // at these sizes); a spot over is scaled down, one under scaled up, and the check runs again (5 rounds)
  let capFail = null;
  if (bank.spots.some((e) => e.weight != null)) {
    for (let round = 0; round < 5; round++) {
      const ratio = servedRatios(bank.spots, bank.skills);
      const over = bank.spots.filter((e) => ratio[e.id] && ratio[e.id].hiLow > WEIGHT_CAP);
      const under = bank.spots.filter((e) => ratio[e.id] && ratio[e.id].loHigh < WEIGHT_FLOOR);
      const vals = Object.values(ratio);
      // effective variety on served rates (CURR): (sum r)^2 / sum r^2, over the weighted lesson's spots (runs and Practice
      // worst case taken spot by spot as the larger rate)
      const rs = vals.map((o) => o.hi);
      const eff = rs.length ? rs.reduce((a, x) => a + x, 0) ** 2 / rs.reduce((a, x) => a + x * x, 0) : 0;
      console.log(`served, round ${round + 1}: max ${Math.max(0, ...vals.map((o) => o.hi)).toFixed(2)}x, min ${Math.min(Infinity, ...vals.map((o) => o.lo)).toFixed(2)}x the uniform rate; ${over.length} over ${WEIGHT_CAP}x and ${under.length} under ${WEIGHT_FLOOR}x past 2 SE; effective variety ${eff.toFixed(0)} of ${rs.length}${eff < 60 ? ' (UNDER 60: to CURR before it ships)' : ''}`);
      if (!over.length && !under.length) {
        capFail = eff < 60 ? `effective variety ${eff.toFixed(0)} is under 60` : null;
        break;
      }
      capFail = `${over.length} spots served over ${WEIGHT_CAP}x and ${under.length} under ${WEIGHT_FLOOR}x after 5 rounds (the cap and floor conflict there: thin D3 in those cells, CURR's fallback)`;
      for (const e of over) e.weight = +(e.weight * (0.9 * WEIGHT_CAP) / ratio[e.id].hi).toFixed(3);
      for (const e of under) e.weight = +(e.weight * (1.15 * WEIGHT_FLOOR) / ratio[e.id].lo).toFixed(3);
    }
  }
  const gaps = partnerGaps(bank);
  const runs = checkBankRuns(bank);
  console.log(`runs: ${runs.checked} checked, ${runs.failed.length} invalid${gaps.length ? ` | partners: ${gaps.join('; ')}` : ''}`);
  if (capFail) console.log(`SERVED CAP NOT MET: ${capFail}`);
  if (out === 'src/drill/bank.json' && (gaps.length || runs.failed.length || capFail)) {
    console.log(`NOT written: ${gaps.length ? 'a lesson would ship without its partner' : capFail ? 'a weighted spot is served over the cap' : 'the bank deals invalid runs'}`);
    process.exitCode = 1;
  } else {
    fs.writeFileSync(out, JSON.stringify(bank));
    console.log(`wrote ${out}: ${bank.spots.length} spots, ${ship.join(', ') || 'no skills'}`);
  }
}
