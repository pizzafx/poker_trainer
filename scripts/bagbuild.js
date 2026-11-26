// The Bag's data (GAME's pipeline, ported for the build; STRAT's gates are test/bag.test.js). Every hand and count the
// game shows comes from here, from the bots and the read tracker as they are; nothing is typed in by hand.
//
//   node scripts/bagbuild.js            writes src/bag/bags.json
//   node scripts/bagbuild.js --check    exits 1 if src/bag/bags.json is not what the build makes today
//
// A set: on its own river board the station limps, the trainee raises to 15 and the station calls, then calls 25 on the
// flop and 60 on the turn, and leads 150 on the river. The station's range is snapshotted before each of its actions
// (belief.range), bucketed on the river board by the Ranges ladder (rows: two pair or better, top pair or overpair,
// weaker pair, draw, nothing) and shown as 20 real hands drawn by weight (sampleHands). The same line from a nit gives the
// careful player's bag, and a river check instead of the lead gives the "What if they'd checked?" bag.
// Basics: eight preflop hands and whether a straightforward player raises each first in from the hijack.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HandBelief } from '../src/trainer/belief.js';
import { build } from './gradeall.js';
import { ladderOf, rungOf } from '../src/trainer/rangeladder.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { parseCards, cardStr } from '../src/engine/cards.js';
import { COMBOS, classIndex } from '../src/engine/hands.js';
import { TYPE_IDS, PROFILES } from '../src/bots/profiles.js';
import { preflopPolicy } from '../src/bots/policy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = 6;

// The pool (GAME, STRAT 26 Nov): T1 is always the first play; the rest rotate on replays
export const SETS = [
  { id: 'T1', board: 'Kh 7c 2d 4s 9h', hole: 'As Kc', hole2: 'Kd 7d' },
  { id: 'V1', board: 'Ks 8d 3c 6h Jd', hole: 'Ah Kd' },
  { id: 'V2', board: 'Ad 9c 4h 2s Jh', hole: 'As Kh' },
  { id: 'V4', board: 'Kc 9h 5d 2s Qs', hole: 'Ad Kh' },
  { id: 'V5', board: 'As 8h 3d 6c Ts', hole: 'Ac Kd' },
  { id: 'V8', board: 'Ah Tc 6s 3d Kh', hole: 'Ad Qc' },
];
export const LINE = '6c 0r15 6c | 6x 0b25 6c | 6x 0b60 6c | 6b150';
export const CHECK_LINE = '6c 0r15 6c | 6x 0b25 6c | 6x 0b60 6c | 6x';

// STRAT's judge checks (26 Nov), stored with the inputs they were made on (GAME's option b): facing the station's lead the
// best play is a fold (the call is never graded fine on the V-sets, not graded or a mistake, and no copy grades the call); facing a check, a value bet
// is best and checking a blunder. If a set's inputs change, the build test fails until STRAT re-checks and the stored hash
// is updated.
export const VERDICTS = {
  T1: { lead: 'fold', check: 'bet' },
  V1: { lead: 'fold', check: 'bet' },
  V2: { lead: 'fold', check: 'bet' },
  V4: { lead: 'fold', check: 'bet' },
  V5: { lead: 'fold', check: 'bet' },
  V8: { lead: 'fold', check: 'bet' },
};
// the files a set's hands and the judge's verdicts rest on: every file reachable by import from the bots, the read
// tracker, the ladder, the judge and the grading (CEO, stability batch: a judge or data-table change must fail the test
// until STRAT re-checks; a fixed list missed the judge and the bots' data tables)
const INPUT_ROOTS = ['src/bots/policy.js', 'src/bots/profiles.js', 'src/trainer/belief.js', 'src/trainer/rangeladder.js', 'src/trainer/coachtier.js',
  'src/trainer/judge.js', 'src/trainer/grade.js', 'src/trainer/best.js'];
export function inputFiles(roots = INPUT_ROOTS) {
  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = readFileSync(join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) walk(join(dirname(rel), m[1]));
  };
  roots.forEach(walk);
  return [...seen].sort();
}
export function inputsHash(set) {
  const h = createHash('sha256');
  h.update(JSON.stringify([set.board, set.hole, set.hole2 || null, LINE, CHECK_LINE]));
  for (const f of inputFiles()) h.update(readFileSync(join(ROOT, f)));
  return h.digest('hex').slice(0, 12);
}

// the station's (or nit's) range before each of its actions, and at the end
function snaps(spot) {
  const out = [];
  const orig = HandBelief.prototype.observe;
  let last = null;
  const type = TYPE_IDS.indexOf(spot.seats[V]);
  const massOf = (bel) => { const w = bel.w[V][type]; let m = 0; for (let c = 0; c < 1326; c++) m += w[c]; return m; };
  HandBelief.prototype.observe = function (seat, ctx, action) {
    last = this;
    if (seat === V) out.push({ before: `${['pre', 'flop', 'turn', 'river'][ctx.street]} ${action.type}`, w: Float64Array.from(this.range(V)), mass: massOf(this) });
    return orig.call(this, seat, ctx, action);
  };
  try {
    build(spot);
  } finally {
    HandBelief.prototype.observe = orig;
  }
  out.push({ before: 'end', w: Float64Array.from(last.range(V)), mass: massOf(last) });
  return out;
}
const mk = (id, hole, board, type, line) => ({ id, name: id, button: 0, hole, board, seats: { [V]: type }, conf: { [V]: 0.9 }, line });
const at = (arr, tag) => arr.find((x) => x.before === tag);

// 20 tokens by largest remainder, rows in ladder order
const tokens20 = (shares) => {
  const tot = shares.reduce((a, b) => a + b, 0) || 1;
  const raw = shares.map((x) => (20 * x) / tot);
  const t = raw.map(Math.floor);
  const left = 20 - t.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - t[i], i]).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, i]) => t[i]++);
  return t;
};
const beatsShareOf = (w, B, H) => {
  const lad = ladderOf(w, B, H);
  return lad.ahead == null ? null : +(1 - lad.ahead).toFixed(3);
};

// Real cards (owner: "this isn't geometry class"): n real hands drawn from a bag by systematic sampling over its combo
// weights (deterministic), each with its ladder row and whether it beats the hero. Display swaps only (UX-SIMPLE, QA, CEO,
// STRAT): never the same two cards twice, at most 3 of one rank pair; a swap keeps the same row and the same beats-you
// outcome, so no stated count changes, and uses only a hand with at least 10% of the heaviest hand's weight.
export function sampleHands(w, B, H, n = 20, waived = null) {
  const tex = boardTexture(B);
  const dead = new Set([...B, ...H]);
  const hf = handFeatures(H, B, tex);
  const items = [];
  let tot = 0;
  for (let c = 0; c < 1326; c++) {
    const [p, q] = COMBOS[c];
    if (w[c] <= 0 || dead.has(p) || dead.has(q)) continue;
    const f = handFeatures(COMBOS[c], B, tex);
    items.push({ c, w: w[c], row: rungOf(f.tier, f, B.length), score: f.score });
    tot += w[c];
  }
  items.sort((a, b) => a.row - b.row || b.score - a.score || a.c - b.c);
  const CAP = 3;
  const rk = (c) => {
    const [p2, q2] = COMBOS[c];
    const a2 = p2 >> 2;
    const b2 = q2 >> 2;
    return a2 > b2 ? a2 * 13 + b2 : b2 * 13 + a2;
  };
  const outcome = (it) => (it.score > hf.score ? 1 : it.score === hf.score ? 0.5 : 0);
  const maxW = Math.max(...items.map((x) => x.w));
  const MINW = 0.1 * maxW;
  const picks = [];
  let acc = 0;
  let k = 0;
  items.forEach((it, idx) => {
    acc += it.w;
    while (k < n && acc >= ((k + 0.5) * tot) / n) {
      picks.push(idx);
      k++;
    }
  });
  const used = new Set();
  const rkCount = {};
  const out = [];
  for (const idx of picks) {
    const it0 = items[idx];
    const okHere = (i) => !used.has(items[i].c) && (rkCount[rk(items[i].c)] || 0) < CAP;
    let j = idx;
    if (!okHere(idx)) {
      const cands = items.map((x, i) => i).filter((i) => i !== idx && okHere(i) && items[i].row === it0.row && outcome(items[i]) === outcome(it0) && items[i].w >= MINW);
      cands.sort((a2, b2) => Math.abs(a2 - idx) - Math.abs(b2 - idx));
      if (cands.length) j = cands[0];
      else if (used.has(it0.c)) {
        // a true duplicate must still go: same row and outcome, any real weight, the cap ignored
        const any = items.map((x, i) => i).filter((i) => !used.has(items[i].c) && items[i].row === it0.row && outcome(items[i]) === outcome(it0) && items[i].w >= 0.02 * maxW);
        any.sort((a2, b2) => Math.abs(a2 - idx) - Math.abs(b2 - idx));
        if (any.length) j = any[0];
      }
    }
    const it = items[j];
    // the cap gave way (no real-weight swap, or a true duplicate's replacement): recorded for the build test
    if (waived && (rkCount[rk(it.c)] || 0) >= CAP) waived.add(rk(it.c));
    used.add(it.c);
    rkCount[rk(it.c)] = (rkCount[rk(it.c)] || 0) + 1;
    const [p, q] = COMBOS[it.c];
    out.push({ cards: [cardStr(p), cardStr(q)], row: it.row, beatsYou: outcome(it), w: +(it.w / maxW).toFixed(3) });
  }
  out.sort((x, y) => x.row - y.row);
  return out;
}

export function makeSet({ id, board, hole, hole2 }) {
  const st = snaps(mk(id, hole, board, 'station', LINE));
  const nit = snaps(mk(id + 'n', hole, board, 'nit', LINE));
  const chk = snaps(mk(id + 'x', hole, board, 'station', CHECK_LINE));
  const B = parseCards(board);
  const afterPre = at(st, 'flop check').w;
  const afterTurn = at(st, 'river raise').w;
  const beforeLead = afterTurn;
  const afterLead = at(st, 'end').w;
  const nitTurn = at(nit, 'river raise').w;
  const chkEnd = at(chk, 'end').w;
  // the hero hand the rounds use: the first whose beats-you shares sit clear of the bands' edges (0.25, 0.6)
  const edge = (x) => Math.min(Math.abs(x - 0.25), Math.abs(x - 0.6));
  const heroes = [hole, ...(hole2 ? [hole2] : [])].map((h) => {
    const H = parseCards(h);
    return { hero: h, H, before: beatsShareOf(beforeLead, B, H), after: beatsShareOf(afterLead, B, H), checked: beatsShareOf(chkEnd, B, H) };
  });
  const r2h = heroes.find((r) => edge(r.before) >= 0.1 && edge(r.after) >= 0.1 && r.before >= 0.05) || heroes[0];
  const capWaived = {};
  const cardsOf = (key, w) => {
    const wv = new Set();
    const hs = sampleHands(w, B, r2h.H, 20, wv);
    if (wv.size) capWaived[key] = [...wv].sort((a, b) => a - b);
    return hs;
  };
  const cards = { hero: r2h.hero, start: cardsOf('start', afterPre), afterCalls: cardsOf('afterCalls', afterTurn), nitAfterCalls: cardsOf('nitAfterCalls', nitTurn), afterBigBet: cardsOf('afterBigBet', afterLead), ifChecked: cardsOf('ifChecked', chkEnd) };
  // the fade after the big bet: of the 20 hands after the calls, how many per row stay (the after-bet mix scaled to the
  // share of the bag that bets, by largest remainder, never more in a row than were there)
  const keepFrac = at(st, 'end').mass / at(st, 'river raise').mass;
  const n = Math.max(1, Math.round(20 * keepFrac));
  const R = tokens20(ladderOf(afterLead, B, r2h.H).rungs.map((r) => r.share));
  const Bf = [0, 1, 2, 3, 4].map((r) => cards.afterCalls.filter((h) => h.row === r).length);
  const raw = R.map((x) => (x * n) / 20);
  const keepRows = raw.map((x, i) => Math.min(Bf[i], Math.floor(x)));
  let left = n - keepRows.reduce((a, x) => a + x, 0);
  raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
    if (left > 0 && keepRows[i] < Bf[i]) {
      keepRows[i]++;
      left--;
    }
  });
  for (let i = 0; left > 0 && i < 5; i++) {
    while (left > 0 && keepRows[i] < Bf[i]) {
      keepRows[i]++;
      left--;
    }
  }
  const strong = (a) => a.filter((h) => h.row === 0).length;
  const weak = (a) => a.filter((h) => h.row >= 2).length;
  const beats = (a) => a.filter((h) => h.beatsYou === 1).length;
  return {
    id,
    board: board.split(' '),
    hero: cards.hero,
    cards,
    keepRows,
    showIfChecked: beats(cards.ifChecked) <= 4,
    capWaived, // rank pairs (rank-index code) over the cap of 3 because no real-weight swap existed
    gate: {
      leadFreq: +keepFrac.toFixed(4),
      beatsTopPairAfter: heroes[0].after,
      ifCheckedShare: r2h.checked,
      callsStrong: strong(cards.afterCalls),
      bigBetStrong: strong(cards.afterBigBet),
      callsWeak: weak(cards.afterCalls),
      nitWeak: weak(cards.nitAfterCalls),
      checkedBeats: beats(cards.ifChecked),
    },
    verdict: { ...VERDICTS[id], inputs: inputsHash({ board, hole, hole2 }) },
  };
}

// Basics (GAME v0.8): eight hands, strong to weak; stays = a straightforward (abc) player raises it first in from the
// hijack at least half the time (the bots' own preflopPolicy)
export function basics8() {
  let ctx = null;
  const orig = HandBelief.prototype.observe;
  HandBelief.prototype.observe = function (s2, c, a) {
    if (s2 === V && !ctx) ctx = c;
    return orig.call(this, s2, c, a);
  };
  try {
    build({ id: 'ctx', button: 0, hole: '2c 2d', board: 'Ks 7h 3d 9c 4s', seats: { [V]: 'abc' }, line: '6c' });
  } finally {
    HandBelief.prototype.observe = orig;
  }
  const pick = [['AA', 'As Ah'], ['KK', 'Kd Kc'], ['QQ', 'Qs Qd'], ['AKs', 'Ah Kh'], ['98s', '9c 8c'], ['K9o', 'Ks 9d'], ['J4o', 'Jh 4c'], ['72o', '7d 2s']];
  return pick.map(([cls, show]) => {
    const o = preflopPolicy(ctx, PROFILES.abc, classIndex(cls));
    return { cards: show.split(' '), cls, raise: +(o.raise || 0).toFixed(2), stays: (o.raise || 0) >= 0.5 };
  });
}

export function buildBag() {
  return { note: 'The Bag (scripts/bagbuild.js): every hand and count comes from the bots and the read tracker; STRAT gates in test/bag.test.js', firstPlay: 'T1', basics: basics8(), sets: SETS.map(makeSet) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = join(ROOT, 'src/bag/bags.json');
  const text = JSON.stringify(buildBag(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    let cur = '';
    try {
      cur = readFileSync(file, 'utf8');
    } catch {}
    if (cur !== text) {
      console.log('src/bag/bags.json is not what the build makes today: run node scripts/bagbuild.js');
      process.exitCode = 1;
    } else console.log('src/bag/bags.json is current');
  } else {
    writeFileSync(file, text);
    console.log(`wrote ${file}`);
  }
}
