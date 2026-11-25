// The Ranges tab's ladder (DESIGN's combined range view, 24 Nov; MATH owns the buckets and numbers): an opponent's
// range, as combo weights, on a board, split into five rungs, with where the trainee's hand stands against each.
// Pure, and outside the Drill bank's version files: the coach's grading and the bots never read it.
//
//   ladderOf(w, board, hole)  -> shares, ahead-now and the "you" line, per rung and per hand class (cheap)
//   ladderEquity(lad, opts)   -> win-by-the-river equity per rung and per class (run-outs; cache the result)
//
// Rungs, strongest first: two pair or better; top pair or an overpair; a real draw (a flush or straight draw, before
// the river; a weak pair with a real draw is a draw: CEO 24 Nov); a weaker pair; nothing (MATH_RANGE_LADDER: not
// belief.grid's drawEquity >= 0.14, which counts backdoor and pair outs). On a board that alone makes two pair or better
// the coach tier replaces the features tier. The grid's cells take their rung from here too, so the two always agree.
import { COMBOS, comboClass, comboIndex, CLASS_COUNT } from '../engine/hands.js';
import { handFeatures, boardTexture, TIER, isRealDraw } from '../engine/features.js';
import { evaluate, categoryOf, CATEGORY } from '../engine/evaluator.js';
import { makeRng } from '../engine/cards.js';
import { coachTiersForRange } from './coachtier.js';

// plural: the rung in a sentence ("mostly top pairs and overpairs"); list: its noun in a list, which never carries its
// own "and" or "or" (DESIGN's one list builder: "Two pair, top pairs and draws can pay you")
export const RUNGS = [
  { name: 'Two pair or better', short: 'Two pair+', plural: 'two pair or better', list: 'two pair' },
  { name: 'Top pair or overpair', short: 'Top or overpair', plural: 'top pairs and overpairs', list: 'top pairs' },
  { name: 'Weaker pair', short: 'Weaker pair', plural: 'weaker pairs', list: 'weaker pairs' },
  { name: 'Draw', short: 'Draw', plural: 'draws', list: 'draws' },
  { name: 'Nothing', short: 'Nothing', plural: 'hands with nothing', list: 'air' },
];
// Boards that are two pair or better on their own (STRAT, DESIGN, 24 Nov): the five rungs stop describing the hands,
// so these replace them. A: the board alone is two pair or trips (no straight or flush on it). B: the board alone is
// a straight or better (the river). Draws get no rung of their own here: they sit by what they hold now.
export const RUNGS_PAIRED = [
  { name: 'Full house or better', short: 'Full house+', plural: 'full houses or better', list: 'full houses' },
  // a pocket pair above the board's lower pair, or a flush or straight made with the board (STRAT: true of all of them)
  { name: 'Beats the board', short: 'Beats board', plural: 'other hands that beat the board', list: 'hands that beat the board' },
  { name: 'Board + good kicker', short: 'Good kicker', plural: 'the board with a good kicker', list: 'good kickers' },
  { name: 'Board + weak kicker', short: 'Weak kicker', plural: 'the board with a weak kicker', list: 'weak kickers' },
  { name: 'Plays the board', short: 'Plays board', plural: 'hands that play the board', list: 'hands that play the board' },
];
export const RUNGS_MADE = [
  { name: 'Beats the board', short: 'Beats board', plural: 'hands that beat the board', list: 'hands that beat the board' },
  { name: 'Plays the board', short: 'Plays board', plural: 'hands that play the board', list: 'hands that play the board' },
];
// When you hold a full house on a board that is trips or two pair on its own (STRAT, 25 Nov): the top rung splits at your
// hand. fh: true on these rungs. On a trips board the third rung is named by the two highest ranks not on the board.
const RANK_WORD = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
const art = (w) => (/^[ae]/.test(w) ? 'an' : 'a');
export function rungsFullHouse(trips, topFree) {
  const top = [
    { name: 'Beats your full house', short: 'Beats yours', plural: 'hands that beat your full house', list: 'hands that beat your full house', fh: true },
    { name: 'Smaller full house', short: 'Below yours', plural: 'smaller full houses', list: 'smaller full houses', fh: true },
  ];
  const end = { name: 'Plays the board', short: 'Plays board', plural: 'hands that play the board', list: 'hands that play the board', fh: true };
  if (!trips) {
    return [...top,
      { name: 'Beats the board', short: 'Beats board', plural: 'other hands that beat the board', list: 'hands that beat the board', fh: true },
      { name: 'Board + kicker', short: 'Board+kicker', plural: 'the board with a kicker', list: 'kickers', fh: true },
      end];
  }
  const [a, b] = topFree.map((r) => RANK_WORD[r]);
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  // STRAT: straights and flushes made with a trips board get their own rung (it shows only when it holds hands)
  return [...top,
    { name: 'Beats the board', short: 'Beats board', plural: 'other hands that beat the board', list: 'hands that beat the board', fh: true },
    { name: `Board + ${a} or ${b}`, short: `${cap(a)} or ${b}`, plural: `the board with ${art(a)} ${a} or ${b}`, list: 'top kickers', fh: true },
    { name: 'Board + weak kicker', short: 'Weak kicker', plural: 'the board with a weak kicker', list: 'weak kickers', fh: true },
    end];
}
// which rung names a board takes: null (the five), 'paired' (A) or 'made' (B)
export function boardKind(board) {
  if (board.length < 3) return null;
  const cat = categoryOf(evaluate(board));
  if (board.length === 5 && cat >= CATEGORY.STRAIGHT) return 'made';
  if (cat === CATEGORY.TWO_PAIR || cat === CATEGORY.TRIPS) return 'paired';
  return null;
}
// display order on the ladder, strongest first (the bucket ids follow belief.grid: 0 strong, 1 good pair, 2 weak pair,
// 3 draw, 4 nothing)
export const LADDER_ORDER = [0, 1, 2, 3, 4];
export const HIDE_BELOW = 0.03; // a rung under 3% of the range is hidden (MATH)

export function rungOf(tier, f, boardCards) {
  return tier >= TIER.TWO_PAIR ? 0 : tier >= TIER.TOP_PAIR_WEAK ? 1 : boardCards < 5 && isRealDraw(f) ? 3 : tier >= TIER.WEAK_PAIR ? 2 : 4;
}

export const round5 = (x) => Math.round(x * 20) * 5;

// w: combo weights (1326), board: 3-5 cards, hole: the trainee's two cards.
export function ladderOf(w, board, hole) {
  const n = board.length;
  const dead = new Uint8Array(52);
  for (const c of [...board, ...hole]) dead[c] = 1;
  const tex = boardTexture(board);
  const feats = new Array(1326);
  const scores = new Array(1326).fill(null);
  const raw = new Array(1326).fill(0);
  for (let c = 0; c < 1326; c++) {
    const [p, q] = COMBOS[c];
    if (dead[p] || dead[q]) continue;
    feats[c] = handFeatures(COMBOS[c], board, tex);
    scores[c] = feats[c].score;
    raw[c] = feats[c].tier;
  }
  const hf = handFeatures(hole, board, tex);
  const hi = comboIndex(hole[0], hole[1]);
  // the hero's own combo is ranked with the range on a board-made board (as belief.coachTiers does)
  scores[hi] = hf.score;
  raw[hi] = hf.tier;
  const ct = coachTiersForRange(board, scores, raw);
  const heroTier = ct ? ct[hi] : hf.tier;
  // the rung rule on a board that is two pair or better on its own (STRAT)
  const kind = boardKind(board);
  const boardScore = kind ? evaluate(board) : 0;
  const boardRanks = new Set(board.map((c) => c >> 2));
  // the board's lower pair (paired boards) and the two highest ranks not on the board (a good kicker)
  const counts = {};
  for (const c of board) counts[c >> 2] = (counts[c >> 2] || 0) + 1;
  const pairs = Object.keys(counts).map(Number).filter((r) => counts[r] >= 2).sort((a, b) => b - a);
  const lowPair = pairs.length >= 2 ? pairs[1] : -1;
  const topFree = [];
  for (let r = 12; r >= 0 && topFree.length < 2; r--) if (!boardRanks.has(r)) topFree.push(r);
  // you hold a full house or better on a trips or two-pair board: the top rung splits at your hand (STRAT)
  const fh = kind === 'paired' && categoryOf(hf.score) >= CATEGORY.FULL_HOUSE;
  const tripsBoard = pairs.length === 1;
  const names = fh ? rungsFullHouse(tripsBoard, topFree) : kind === 'paired' ? RUNGS_PAIRED : kind === 'made' ? RUNGS_MADE : RUNGS;
  const nR = names.length;
  // the split rungs: above yours, then below yours (exact ties too: they don't beat you); on a two-pair board the
  // pocket pairs above the lower pair and the made straights and flushes beat the board, and every kicker is one rung
  const rungFH = (c, f) => {
    const cat = categoryOf(f.score);
    if (cat >= CATEGORY.FULL_HOUSE) return f.score > hf.score ? 0 : 1;
    const [p, q] = COMBOS[c];
    const rp = p >> 2;
    const rq = q >> 2;
    // a straight or flush made with the board is below your full house and above every kicker: Beats the board (STRAT)
    if (cat > categoryOf(boardScore)) return 2;
    if (!tripsBoard && rp === rq && rp > lowPair) return 2;
    const plays = tripsBoard ? 5 : 4;
    if (board.length === 5 && f.score <= boardScore) return plays;
    if (!tripsBoard) return 3;
    return topFree.includes(Math.max(rp, rq)) ? 3 : 4;
  };
  const rungPaired = (c, f) => {
    const cat = categoryOf(f.score);
    if (cat >= CATEGORY.FULL_HOUSE) return 0;
    const [p, q] = COMBOS[c];
    const rp = p >> 2;
    const rq = q >> 2;
    if (rp === rq && rp > lowPair && lowPair >= 0) return 1; // a pocket pair above the board's lower pair
    if (cat > categoryOf(boardScore) && cat < CATEGORY.FULL_HOUSE) return 1; // a straight or flush made with the board
    // on the river a hand plays only if it beats the board's own five; before it every hand has a card that plays
    if (board.length === 5 && f.score <= boardScore) return 4;
    const top = Math.max(rp, rq);
    return topFree.includes(top) ? 2 : 3;
  };
  const rungMade = (c, f) => (f.score > boardScore ? 0 : 1);
  const rung = new Int8Array(1326).fill(-1);
  const shares = new Array(nR).fill(0);
  const aheadW = new Array(nR).fill(0);
  const clsW = new Float64Array(CLASS_COUNT);
  const clsRung = Array.from({ length: CLASS_COUNT }, () => new Array(nR).fill(0));
  const clsAhead = new Float64Array(CLASS_COUNT);
  const clsBeats = new Float64Array(CLASS_COUNT); // weight of each class that beats you now
  let all = 0;
  let beat = 0;
  let max = 0;
  let live = 0;
  for (let c = 0; c < 1326; c++) {
    if (!feats[c]) continue;
    live++;
    const x = w[c] || 0;
    if (x > max) max = x;
    if (x <= 0) continue;
    const f = feats[c];
    const b = fh ? rungFH(c, f) : kind === 'paired' ? rungPaired(c, f) : kind === 'made' ? rungMade(c, f) : rungOf(ct ? ct[c] : f.tier, f, n);
    rung[c] = b;
    const k = comboClass[c];
    const part = hf.score > f.score ? x : hf.score === f.score ? x / 2 : 0;
    shares[b] += x;
    aheadW[b] += part;
    clsW[k] += x;
    clsRung[k][b] += x;
    clsAhead[k] += part;
    if (f.score > hf.score) clsBeats[k] += x;
    all += x;
    beat += part;
  }
  let kept = 0;
  if (max > 0) for (let c = 0; c < 1326; c++) if (feats[c] && w[c] > 0) kept += w[c] / max;
  const rungs = shares.map((s, b) => ({
    share: all > 0 ? s / all : 0,
    ahead: s > 0 ? aheadW[b] / s : null,
    examples: examplesOf(clsRung, b),
  }));
  const classes = [];
  for (let k = 0; k < CLASS_COUNT; k++) {
    let top = -1;
    if (clsW[k] > 0) {
      top = 0;
      for (let b = 1; b < nR; b++) if (clsRung[k][b] > clsRung[k][top]) top = b;
    }
    classes.push({ rung: top, ahead: clsW[k] > 0 ? clsAhead[k] / clsW[k] : null, beats: clsW[k] > 0 ? clsBeats[k] / clsW[k] : 0 });
  }
  // above the line: the ladder down to the lowest shown rung (at least HIDE_BELOW) that you beat under half of now,
  // unrounded (MATH confirmed, 24 Nov: comparing by category put the underpairs to a pocket pair under the line). Rungs
  // keep their order; every rung above the line is in "Beats you now" even if you beat most of one of them.
  let last = -1;
  rungs.forEach((r, b) => {
    if (r.share >= HIDE_BELOW && r.ahead != null && r.ahead < 0.5) last = b;
  });
  const above = names.map((_, b) => b).filter((b) => b <= last);
  return {
    board: board.slice(),
    hole: hole.slice(),
    w,
    rung,
    rungs,
    classes,
    heroTier,
    kind,
    fh,
    names,
    above,
    beaters: NAMES.map((name, k) => ({ name, w: clsBeats[k] })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w).map((x) => x.name),
    ahead: all > 0 ? beat / all : null, // the share of their range you beat now (ties count half)
    // the "Beats you now" total, the filter line and the guess: the share that beats you now, from the headline's own
    // number (MATH, CEO: a total only from the headline's measure; not the sum of the rungs above the line)
    beatsYou: all > 0 ? 1 - beat / all : null,
    kept: live > 0 ? kept / live : 0, // how wide the range is: each combo's weight against the fullest, over the live combos
  };
}

const NAMES = (() => {
  const R = 'AKQJT98765432';
  const out = new Array(CLASS_COUNT);
  for (let c = 0; c < 1326; c++) {
    const k = comboClass[c];
    if (out[k]) continue;
    const [p, q] = COMBOS[c];
    const a = Math.max(p >> 2, q >> 2);
    const b = Math.min(p >> 2, q >> 2);
    const ra = R[12 - a];
    const rb = R[12 - b];
    out[k] = a === b ? ra + rb : ra + rb + ((p & 3) === (q & 3) ? 's' : 'o');
  }
  return out;
})();
// a rung's example hands: its heaviest classes, most first
function examplesOf(clsRung, b) {
  const ks = [];
  for (let k = 0; k < CLASS_COUNT; k++) if (clsRung[k][b] > 0) ks.push(k);
  ks.sort((x, y) => clsRung[y][b] - clsRung[x][b]);
  return ks.slice(0, 8).map((k) => NAMES[k]);
}

// Win by the river (all the cards dealt, no more betting): the trainee's equity against each combo in the range, over
// every run-out (all 1,081 turn and river pairs on the flop, every river on the turn, the showdown on the river; MATH:
// 120 sampled run-outs moved the rounded figures), the trainee's hand evaluated once per run-out, rolled up per rung,
// per class and overall. `runouts` samples instead (tests only). Heavy on the flop: the page runs it in a worker.
export function ladderEquity(lad, { runouts = 0, seed = 7 } = {}) {
  const { board, hole, w, rung } = lad;
  const need = 5 - board.length;
  const dead = new Uint8Array(52);
  for (const c of [...board, ...hole]) dead[c] = 1;
  const rest = [];
  for (let c = 0; c < 52; c++) if (!dead[c]) rest.push(c);
  const outs = [];
  if (need === 0) outs.push([]);
  else if (need === 1) for (const c of rest) outs.push([c]);
  else if (!runouts) {
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) outs.push([rest[i], rest[j]]);
  } else {
    const rng = makeRng(seed);
    for (let t = 0; t < runouts; t++) {
      const i = Math.floor(rng() * rest.length);
      let j = Math.floor(rng() * (rest.length - 1));
      if (j >= i) j++;
      outs.push([rest[i], rest[j]]);
    }
  }
  const heroScore = outs.map((o) => evaluate([...hole, ...board, ...o]));
  const seven = [0, 0, ...board, ...(need ? new Array(need).fill(0) : [])];
  const nR = lad.names ? lad.names.length : 5;
  const rungE = new Array(nR).fill(0);
  const rungW = new Array(nR).fill(0);
  const clsE = new Float64Array(CLASS_COUNT);
  const clsW = new Float64Array(CLASS_COUNT);
  let tot = 0;
  let totW = 0;
  for (let c = 0; c < 1326; c++) {
    const x = w[c] || 0;
    if (!(x > 0) || rung[c] < 0) continue;
    const [p, q] = COMBOS[c];
    seven[0] = p;
    seven[1] = q;
    let won = 0;
    let m = 0;
    for (let t = 0; t < outs.length; t++) {
      const o = outs[t];
      if (o.includes(p) || o.includes(q)) continue;
      for (let i = 0; i < need; i++) seven[2 + board.length + i] = o[i];
      const v = evaluate(seven);
      won += heroScore[t] > v ? 1 : heroScore[t] === v ? 0.5 : 0;
      m++;
    }
    if (!m) continue;
    const e = won / m;
    const b = rung[c];
    const k = comboClass[c];
    rungE[b] += x * e;
    rungW[b] += x;
    clsE[k] += x * e;
    clsW[k] += x;
    tot += x * e;
    totW += x;
  }
  return {
    equity: totW > 0 ? tot / totW : null,
    rung: rungE.map((e, b) => (rungW[b] > 0 ? e / rungW[b] : null)),
    cls: Array.from(clsE, (e, k) => (clsW[k] > 0 ? e / clsW[k] : null)),
  };
}

// "Keeps N% of hands" (MATH, 24 Nov): the surviving mass. Every combo starts at weight 1 for every type, so the share
// of hands still in the range is the sum over types of the read's posterior times that type's total weight, over the
// combos not blocked by dead cards (yours and the board). Taken when the snapshot is (the weights move on).
// arrs: the belief's per-type weights for the seat; post: the read's posterior; dead: the belief's dead-card flags.
export function survivingMass(arrs, post, dead) {
  let live = 0;
  for (let c = 0; c < 1326; c++) if (!dead[COMBOS[c][0]] && !dead[COMBOS[c][1]]) live++;
  if (!live) return 0;
  let m = 0;
  for (let t = 0; t < arrs.length; t++) {
    let tot = 0;
    const a = arrs[t];
    for (let c = 0; c < 1326; c++) tot += a[c];
    m += post[t] * tot;
  }
  return m / live;
}

// How wide a range is: each live combo's weight against the fullest combo, over the combos not blocked by `dead` cards
// (MATH's acceptable form: 100% before they act). Used before the flop, where there is no ladder.
export function keptOf(w, dead) {
  const d = new Uint8Array(52);
  for (const c of dead) d[c] = 1;
  let max = 0;
  let live = 0;
  for (let c = 0; c < 1326; c++) {
    if (d[COMBOS[c][0]] || d[COMBOS[c][1]]) continue;
    live++;
    if (w[c] > max) max = w[c];
  }
  if (!(max > 0)) return 0;
  let k = 0;
  for (let c = 0; c < 1326; c++) if (!d[COMBOS[c][0]] && !d[COMBOS[c][1]] && w[c] > 0) k += w[c] / max;
  return k / live;
}

// A percentage as the panel prints it, rounded to 5: never 0% or 100% unless exactly that (MATH).
export function pctText(x) {
  if (x == null || Number.isNaN(x)) return '–';
  if (x <= 0) return '0%';
  if (x >= 1) return '100%';
  const r = round5(x);
  return r <= 0 ? 'under 5%' : r >= 100 ? 'over 95%' : `${r}%`;
}
// "Beats you now": 100 minus the headline's rounded "ahead now", so the two always sum to 100 (MATH), with the same
// rule at the ends: under 5% / over 95% unless exact.
export function beatsPctText(ahead) {
  if (ahead == null || Number.isNaN(ahead)) return '–';
  if (ahead >= 1) return '0%';
  if (ahead <= 0) return '100%';
  const r = 100 - round5(ahead);
  return r <= 0 ? 'under 5%' : r >= 100 ? 'over 95%' : `${r}%`;
}

// Guess first, scored on the unrounded share that beats you (MATH): the band it falls in is right, and so is the
// neighbouring band when the share is within 2.5 points of the 25% or 60% edge between them.
export const GUESS_EDGES = [0.25, 0.6];
export function guessBandOf(x) {
  return x < 0.25 ? 0 : x <= 0.6 ? 1 : 2;
}
export function guessRight(g, x) {
  if (g === guessBandOf(x)) return true;
  return GUESS_EDGES.some((e, i) => Math.abs(x - e) <= 0.025 && (g === i || g === i + 1));
}

// The river takeaway's "check, and let it go if [Name] bets" (STRAT, DESIGN): on the river, when you act first, the
// coach checks and most of their range (over 60%) beats you. Not against a seat read at 60% or more as a maniac or a
// lag (those types together): they bet most of their range, so you still win often enough when called (STRAT).
// ranked: the seat's read, [{ id, p }].
// How the takeaway names the range (STRAT, DESIGN, CEO 25 Nov), on the shares as printed (to 5%), taken in order:
// the biggest rung at 50% or more is "mostly X"; else the two biggest together at 60% or more are "mostly X and Y";
// unless the second is tied with the third; else "a mix, led by X and Y" ("led by X" when the second is tied). Bigger first, ties in rung order. rungs: the shown rung indexes; share(b): its share.
export function rangeMix(rungs, share) {
  const top = rungs.slice().sort((a, b) => round5(share(b)) - round5(share(a)) || a - b);
  if (top.length < 2 || round5(share(top[0])) >= 50) return { kind: 'mostly', top: top.slice(0, 1) };
  // the second group must be unique: tied with the third, there is no one Y to name (CEO), so "a mix, led by X"
  const tiedSecond = top.length > 2 && round5(share(top[1])) === round5(share(top[2]));
  if (!tiedSecond && round5(share(top[0])) + round5(share(top[1])) >= 60) return { kind: 'two', top: top.slice(0, 2) };
  return { kind: 'mix', top: top.slice(0, tiedSecond ? 1 : 2) };
}

// The groups a range phrase names, as one list: a name that has its own "and" gives its parts to the list (STRAT,
// DESIGN): "top pairs, overpairs and draws", never "top pairs and overpairs and draws"
export function joinGroups(plurals) {
  const parts = plurals.flatMap((x) => x.split(' and '));
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
// "mostly X", "mostly X and Y" or "a mix, led by X and Y" (rangeMix)
export function rangePhrase(mix, names) {
  return `${mix.kind === 'mix' ? 'a mix, led by' : 'mostly'} ${joinGroups(mix.top.map((b) => names[b].plural))}`;
}
// the read's maniac and lag weight together (STRAT: a wild seat bets too much air for a let-go line)
export const wildShare = (ranked) => (ranked || []).filter((r) => r.id === 'maniac' || r.id === 'lag').reduce((a, r) => a + r.p, 0);
// RV2-A (QA, STRAT, DESIGN, CEO): when you face a bet you have not answered yet, the takeaway never carries a play from
// an earlier decision. On the river, after a check the coach liked, it says "this is the bet to let go" only when 50% or
// more of the bet range beats you, the share you beat is at most the call price less 5 points, the seat is not read
// 60% or more as a maniac or a lag, and the coach's best for this decision, if already known, is a fold. Otherwise the
// plain range sentence, with no play. 'normal' when you don't face an unanswered bet.
export function facingMode({ facingNow, river, planCheck, wild, beatsYou, ahead, price, pendingBest = null }) {
  if (!facingNow) return 'normal';
  const letGo = river && planCheck && wild < 0.6 && beatsYou >= 0.5 && ahead != null && ahead <= price - 0.05 && (pendingBest == null || pendingBest === 'fold');
  return letGo ? 'letgo' : 'plain';
}
const aboutT = (txt) => (/^\d/.test(txt) ? `about ${txt}` : txt);
const capT = (w) => w.charAt(0).toUpperCase() + w.slice(1);
// The takeaway sentence (STRAT's branches; RV2-A's modes). opening: "After betting the turn, " or ''; subj: "Jo's bet";
// phrase: rangePhrase; fhTop: you hold a full house and the top rung is the biggest; bt: the share that beats you;
// beatsTxt: that share as printed; play: the coach's play for this decision or null; bestType: its best option's type;
// facedBet: that decision faced a bet; payList: "Top pairs and draws" or ''; drawing: a real draw with the equity.
// The play the takeaway names (STRAT, DESIGN, CEO 25 Nov): your own play when it was graded good ("calling works"),
// the coach's best when it was a mistake ("the coach prefers folding"). v: the decision's verdict; toCall: what it faced.
export function playWords(v, toCall) {
  if (!v || !v.options) return null;
  const good = v.mine === v.best || v.grade === 'good';
  const o = good && v.mine >= 0 && v.options[v.mine] ? v.options[v.mine] : v.options[v.best];
  if (!o) return null;
  const g = o.type === 'raise' ? (toCall > 0 ? 'raising' : 'betting') : o.type === 'call' ? 'calling' : o.type === 'check' ? 'checking' : o.type === 'fold' ? 'folding' : null;
  return g ? { type: o.type, text: good ? `${g} works` : `the coach prefers ${g}` } : null;
}
export function takeawayText({ opening = '', subj, phrase, fhTop = false, bt, beatsTxt, mode = 'normal', play = null, bestType = null, facedBet = false, payList = '', drawing = false }) {
  const lineOf = `${opening}${subj} is ${phrase}`;
  const qty = bt > 0.6 ? 'most' : aboutT(beatsTxt);
  const fhLine = () => `${opening}${opening ? qty : capT(qty)} of ${subj} beats your full house`;
  if (mode === 'letgo') return fhTop ? `<b>Most of ${subj} beats your full house</b>: this is the bet to let go.` : `<b>${lineOf}, and most of it beats you</b>: this is the bet to let go.`;
  if (mode === 'plain') return fhTop ? `<b>${fhLine()}</b>.` : `<b>${lineOf}, and ${bt < 0.25 ? 'little' : qty} of it beats you</b>.`;
  const p = play ? `: ${play}.` : '.';
  if (fhTop) return `<b>${fhLine()}</b>${p}`;
  // the clause and the play pull apart after you answer a bet: "but … at this price" (STRAT)
  // bestType: the type of the play named (playWords). A raise or bet into a range that mostly beats you works only as a
  // bluff, which a few words can't say: no play line; the verdict card carries the reason (STRAT)
  if (play && bt >= 0.6 && bestType === 'raise') return `<b>${lineOf}, and ${qty} of it beats you</b>.`;
  // "at this price" only with calling or folding (STRAT, DESIGN)
  if (play && facedBet && bt > 0.6 && bestType === 'call') return `<b>${lineOf}, and most of it beats you</b>, but ${play} at this price.`;
  if (play && facedBet && bt < 0.25 && bestType === 'fold') return `<b>${lineOf}, and little of it beats you</b>, but ${play} at this price.`;
  if (bt < 0.25) return `<b>${lineOf}, and little of it beats you</b>${p}${payList ? ` ${payList} can pay you.` : ''}`;
  if (drawing) return `<b>${lineOf}, and ${aboutT(beatsTxt)} of it beats you now</b>, but your draw has the outs${p} It can still win often.`;
  return `<b>${lineOf}, and ${qty} of it beats you</b>${p}`;
}

export function riverLetGo({ river, after, bestType, beatsYou, ranked }) {
  if (!river || !after || bestType !== 'check' || !(beatsYou > 0.6)) return false;
  return wildShare(ranked) < 0.6;
}
