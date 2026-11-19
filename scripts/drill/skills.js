// Drill bank: the Tier 1 skills. For each, the candidate test at a hero decision (the "tight node predicates"),
// the answer family its rule names, its tier, leak key and rule line, and what makes a spot of it tricky
// (difficulty 3: the surface points the other way). Predicates follow MATH's gate runs (15 Nov) and STRAT's and
// PRO's later rulings.

import { classOf, classNames } from '../../src/engine/hands.js';
import { STREET, positionName } from '../../src/engine/game.js';
import { TIER, isRealDraw, handFeatures } from '../../src/engine/features.js';
import { evaluate, categoryOf, CATEGORY } from '../../src/engine/evaluator.js';
import { presetRanges, groupOf } from '../../src/trainer/ranges.js';
import { ISO_LIMP_FEW, anchorStatus } from '../../src/trainer/grade.js';

const STD = presetRanges('standard');
const PASSIVE = new Set(['nit', 'abc', 'station', 'beginner']);
const CALLERS = new Set(['station', 'abc', 'beginner', 'whale']);
// the coach's own foldsBetter set: nits and regulars (tag); gto and lag out (CURR, STRAT, 19 Nov)
const FOLDS_BETTER = new Set(['nit', 'tag']);
// D1's bet shape, the hand aside (D1, D2 and D3 share it): turn or river, a pot of 15bb or more at the bet, a bet of
// half that pot or more (or a raise), and 10bb or more behind
function bigLateBetShape(s, ctx) {
  if (s.street !== STREET.TURN && s.street !== STREET.RIVER) return false;
  if (!(ctx.toCall > 0) || ctx.aggressor <= 0) return false;
  const before = ctx.pot - ctx.toCall;
  if (before < 15 * ctx.bb) return false;
  if (!(ctx.toCall >= 0.5 * before || ctx.raises >= 2)) return false;
  return ctx.stack >= 10 * ctx.bb;
}
// ...with one pair from weak pair to top pair good kicker (D1, D2)
const bigLateBet = (s, ctx, f) => bigLateBetShape(s, ctx) && f.tier >= TIER.WEAK_PAIR && f.tier <= TIER.TOP_PAIR_GOOD;
// What this street's card did to the board (PRO, D3's rule line): 'paired' (it pairs an earlier board card),
// 'flush' (a third card of a suit), 'straight' (three ranks within five, which was not so before), or null
export function boardChanged(board) {
  if (board.length < 4) return null;
  const prev = board.slice(0, -1);
  const last = board[board.length - 1];
  if (prev.some((c) => c >> 2 === last >> 2)) return 'paired';
  const suits = (b) => Math.max(...[0, 1, 2, 3].map((k) => b.filter((c) => (c & 3) === k).length));
  if (suits(board) >= 3 && suits(prev) < 3) return 'flush';
  const three = (b) => {
    const r = new Set(b.map((c) => (c >> 2) + 1));
    if (r.has(13)) r.add(0);
    for (let lo = 0; lo <= 9; lo++) if ([0, 1, 2, 3, 4].filter((d) => r.has(lo + d)).length >= 3) return true;
    return false;
  };
  if (three(board) && !three(prev)) return 'straight';
  return null;
}
// D3's rule 1 (STRAT, PRO, 19 Nov; final): what the last card does to a two pair+ hand.
// - the board just paired: two pair is out (a set there is a full house and stays)
// - a flush or straight just came in: two pair and sets (trips) are out; a straight or flush stays only at the
//   board-adjusted strength of PRO's v3.2 near-nuts (S >= 0.85), which also drops a straight when a flush card comes
// - a full house or better always stays
export function beatenByLastCard(s, f) {
  const change = boardChanged(s.board);
  if (!change) return false;
  const cat = categoryOf(evaluate([...s.hole[0], ...s.board]));
  if (cat >= CATEGORY.FULL_HOUSE) return false;
  if (change === 'paired') return cat === CATEGORY.TWO_PAIR;
  if (cat === CATEGORY.TWO_PAIR || cat === CATEGORY.TRIPS) return true;
  if (cat === CATEGORY.STRAIGHT || cat === CATEGORY.FLUSH) return !((f || handFeatures(s.hole[0], s.board)).strength >= 0.85);
  return false;
}
// D3's hands: overpair or top pair top kicker or better; two pair only from hero's own cards (each hole card pairs
// the board, no pocket pair)
function realHand(s, f) {
  if (f.tier < TIER.OVERPAIR_TPTK) return false;
  if (f.tier !== TIER.TWO_PAIR) return true;
  const h = s.hole[0].map((c) => c >> 2);
  const b = new Set(s.board.map((c) => c >> 2));
  return h[0] !== h[1] && b.has(h[0]) && b.has(h[1]);
}
// live opponents still to act after hero on this street (not the bettor, not all-in, short of the bet)
export const leftToAct = (s, agg) => {
  const o = [];
  for (let i = 1; i < s.n; i++) if (i !== agg && !s.folded[i] && !s.allIn[i] && s.bet[i] < s.currentBet) o.push(i);
  return o;
};
export const live = (s) => {
  const o = [];
  for (let i = 1; i < s.n; i++) if (!s.folded[i]) o.push(i);
  return o;
};
const limpers = (s) => s.history.filter((h) => h.type === 'call' && h.street === STREET.PRE && !s.folded[h.seat]).length;
const handName = (s) => classNames[classOf(s.hole[0][0], s.hole[0][1])];
const RANKS = '23456789TJQKA';
// a scary board for a one-pair value bet: three of a suit, four to a straight, or paired (CURR)
export function scaryBoard(board) {
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[c & 3]++;
  if (Math.max(...suits) >= 3) return true;
  const ranks = board.map((c) => c >> 2);
  if (new Set(ranks).size < ranks.length) return true;
  const u = [...new Set(ranks.map((r) => r + 1).concat(ranks.includes(12) ? [0] : []))].sort((a, b) => a - b);
  for (let lo = 0; lo <= 9; lo++) if (u.filter((r) => r >= lo && r <= lo + 4).length >= 4) return true;
  return false;
}

export const SKILLS = {
  D1: {
    tier: 1,
    name: "Don't pay off big late bets",
    leak: 'paidOff',
    // rule line (PRO, STRAT, 19 Nov): names the boundary D3 shares
    rule: 'A passive player’s big turn or river bet is rarely a bluff. With one pair, up to and including top pair with a good kicker, usually fold.',
    want: 'fold',
    // pot of 15bb or more at the bet (CURR); the shape D2 shares. Nobody left to act behind hero (CEO, 19 Nov):
    // a player behind is a cue D2 does not have (64 of the first 180 had one)
    match: (s, ctx, f, types) => bigLateBet(s, ctx, f) && PASSIVE.has(types[ctx.aggressor]) && leftToAct(s, ctx.aggressor).length === 0,
    // tricky (CURR, STRAT sign-off 18 Nov): top pair good kicker, a pair plus a real draw whose call the combined
    // test (19b) rates as not enough, or a bet of 50-60% of the pot; a passive player's big bet is the textbook case,
    // a station's included. (A pair plus a draw that covers the price is rejected from D1 in the bank script.)
    tricky: (s, ctx, f, types, drawSt) => {
      const before = ctx.pot - ctx.toCall;
      const frac = before > 0 ? ctx.toCall / before : 0;
      return f.tier === TIER.TOP_PAIR_GOOD || (isRealDraw(f) && drawSt === 'fails') || (frac >= 0.5 && frac <= 0.6);
    },
  },
  V1: {
    tier: 1,
    name: 'Value-bet top pair vs callers', // CURR, CEO-approved 17 Nov (was "thin")
    leak: 'missedValue',
    rule: 'Callers call with worse: bet top pair when it’s checked to you, even with a weak kicker or on a scary board. Checking gives up that value, and against these players it is often a real mistake.',
    want: 'raise',
    match: (s, ctx, f, types) => {
      if (s.street === STREET.PRE || ctx.toCall > 0 || !ctx.canRaise) return false;
      // top pair only, weak or good kicker (CURR, CEO-approved 17 Nov), on batch 15's hand classes
      if (f.tier < TIER.TOP_PAIR_WEAK || f.tier > TIER.TOP_PAIR_GOOD) return false;
      const o = live(s);
      if (o.length < 1 || o.length > 2) return false;
      return o.every((i) => CALLERS.has(types[i]));
    },
    // tricky (CURR, 18 Nov): a weak kicker, or a scary board (three of a suit, four to a straight, paired)
    tricky: (s, ctx, f) => f.tier <= TIER.TOP_PAIR_WEAK || scaryBoard(s.board),
  },
  // D1's partner (CEO, 19 Nov; STRAT, PRO): D1's bettors and bets, with a hand above D1's line; call (or raise)
  D3: {
    tier: 1,
    name: 'Call big bets with real hands',
    leak: 'overFold',
    rule: 'A passive player’s big turn or river bet is rarely a bluff, but it isn’t always the nuts. Above top pair with a good kicker, lean call. Two pair or better calls; slow down with two pair when the board just paired, and with two pair or a set when a flush or straight just came in. An overpair or top pair with the best kicker calls a station, folds to a nit, and is close against others.',
    want: ['call', 'raise'], // call and raise may both be right; fold must be wrong
    foldWrong: true,
    match: (s, ctx, f, types) => {
      if (!bigLateBetShape(s, ctx) || !PASSIVE.has(types[ctx.aggressor]) || leftToAct(s, ctx.aggressor).length) return false;
      if (!realHand(s, f)) return false;
      // the line's exception (PRO, STRAT): two pair or better where the last card paired the board or completed a
      // flush or straight that hero does not hold
      return !(f.tier >= TIER.TWO_PAIR && beatenByLastCard(s, f));
    },
    // tricky (STRAT, PRO): an overpair or top pair top kicker (the gate has fold wrong), two pair against a nit's bet,
    // or a station's bet
    tricky: (s, ctx, f, types) => f.tier === TIER.OVERPAIR_TPTK || (f.tier === TIER.TWO_PAIR && types[ctx.aggressor] === 'nit') || types[ctx.aggressor] === 'station',
  },
  // V1's partner (CEO, 19 Nov; STRAT's sign-off): V1's spots with no hand, so only the hand tells them apart. V1's
  // streets, V1's opponents (all callers, a station or whale among them), V1's bet sizes; every bet wrong
  B1: {
    tier: 1,
    name: "Don't bluff people who don't fold",
    leak: 'badBluff',
    rule: 'A bluff needs folds. Stations and crowds don’t fold: check.',
    want: 'check',
    allBets: true,
    match: (s, ctx, f, types) => {
      if (s.street === STREET.PRE || ctx.toCall > 0 || !ctx.canRaise) return false;
      if (f.tier > TIER.HIGH_CARD || isRealDraw(f)) return false;
      const o = live(s);
      if (o.length < 1 || o.length > 2) return false;
      return o.every((i) => CALLERS.has(types[i])) && o.some((i) => types[i] === 'station' || types[i] === 'whale');
    },
    // tricky: ace-high or two overcards to the board with no draw (the "I'll just bet" hand), or a scary board (a
    // bet "represents" something)
    tricky: (s, ctx, f) => {
      const hi = s.hole[0].map((c) => c >> 2);
      const top = Math.max(...s.board.map((c) => c >> 2));
      return hi.includes(12) || hi.every((r) => r > top) || scaryBoard(s.board);
    },
  },
  // V1's partner (CEO, 19 Nov; DRILL_CURRICULUM_SPEC 2.6): the same hands checked to on the river, against the
  // players who only call with better; the opponent's type is the only cue
  V5: {
    tier: 1,
    name: 'Check one pair on the river vs nits and regulars',
    leak: 'overplay',
    rule: 'Nits and regulars only call the river with better. One pair checks behind.',
    want: 'check',
    allBets: true, // every offered bet must be wrong, not only the best one (STRAT: no size cue)
    match: (s, ctx, f, types) => {
      if (s.street !== STREET.RIVER || ctx.toCall > 0 || !ctx.canRaise) return false;
      if (f.tier < TIER.TOP_PAIR_WEAK || f.tier > TIER.TOP_PAIR_GOOD) return false;
      const o = live(s);
      if (o.length < 1 || o.length > 2) return false;
      return o.every((i) => FOLDS_BETTER.has(types[i]));
    },
    // tricky: top pair good kicker (looks like a value bet), or an opponent called hero's turn bet (looks like a caller)
    tricky: (s, ctx, f) => {
      if (f.tier === TIER.TOP_PAIR_GOOD) return true;
      const turn = s.history.filter((h) => h.street === STREET.TURN);
      const heroBet = turn.findIndex((h) => h.seat === 0 && (h.type === 'bet' || h.type === 'raise'));
      return heroBet >= 0 && turn.slice(heroBet + 1).some((h) => h.seat !== 0 && h.type === 'call' && !s.folded[h.seat]);
    },
  },
  // D1's partner (CEO, 19 Nov; spec 2.6): D1's shape, but the bettor is a maniac (lags out) and nobody is left
  // behind hero; a call is the answer
  D2: {
    tier: 1,
    name: "Call the maniac's big bet",
    leak: 'overFold',
    rule: 'Wild players bluff a lot. One pair calls their big bet.',
    want: 'call',
    match: (s, ctx, f, types) => bigLateBet(s, ctx, f) && types[ctx.aggressor] === 'maniac' && leftToAct(s, ctx.aggressor).length === 0,
    // tricky: weak or middle pair (looks too thin to call; weak pair is kept only as tricky, the gate has the
    // fold wrong), or a bet of the pot or more (looks strong)
    tricky: (s, ctx, f) => {
      const before = ctx.pot - ctx.toCall;
      return f.tier === TIER.WEAK_PAIR || f.tier === TIER.MIDDLE_PAIR || ctx.toCall >= before;
    },
  },
  P2: {
    tier: 1,
    name: 'Fold the junk',
    leak: 'preLoose',
    rule: 'Off-range hands lose money even when it’s cheap to come in. Fold them.',
    want: 'fold',
    gate: { preBase: 0.4, preShift: 0.4, screenPre: 0.2 }, // fold-or-limp margins; screen at half the margin (MATH)
    match: (s, ctx) => {
      // first in only (CURR): nobody has limped or raised
      if (s.street !== STREET.PRE || ctx.raises !== 0 || !(ctx.toCall > 0) || limpers(s) > 0) return false;
      const g = groupOf(positionName(s, 0));
      if (g === 'bb') return false;
      return !STD[g].includes(handName(s));
    },
    // tricky (CURR, 18 Nov): playable-looking junk (suited, both cards 9 or higher, connected or one-gapped), or
    // first in from the cutoff or the button
    tricky: (s) => {
      const n = handName(s);
      const hi = RANKS.indexOf(n[0]);
      const lo = RANKS.indexOf(n[1]);
      const g = groupOf(positionName(s, 0));
      return n.endsWith('s') || (hi >= 7 && lo >= 7) || (hi !== lo && hi - lo <= 2) || g === 'cutoff' || g === 'button';
    },
  },
  P1: {
    tier: 1,
    name: 'Raise over limpers',
    leak: 'prePassive',
    rule: 'Raise limpers with your good hands, bigger for each limper. Don’t limp behind with them.',
    want: 'raise',
    gate: { Npre: 16000, NpreMax: 20000 }, // the 4 SE test needs 16,000 (MATH)
    match: (s, ctx) => {
      if (s.street !== STREET.PRE || ctx.raises !== 0 || limpers(s) < 1) return false;
      const g = groupOf(positionName(s, 0));
      if (g === 'bb' || g === 'sb') return false;
      const n = handName(s);
      if (!['AJo', 'ATo', 'KQo', 'KJo', '77', '88'].includes(n)) return false;
      // PRO (Nov 2026): with three or more limpers a raise rarely isolates; 77, 88, ATo and KJo are left out
      return !(limpers(s) >= 3 && ISO_LIMP_FEW.has(n));
    },
    // tricky (CURR, 18 Nov): 77-88, or raising from early or middle position; one limper with AJo/KQo in the cutoff
    // or on the button is the textbook case
    tricky: (s) => ['77', '88'].includes(handName(s)) || ['early', 'middle'].includes(groupOf(positionName(s, 0))),
  },
};

// Difficulty (CURR, 18 Nov): 3 when a tricky feature is present; 1 when not and the worst-scenario margin is at least
// 1.5x the gate's floor (postflop 3 bars; raise-or-limp 1.5bb; fold-or-limp 0.6bb); 2 otherwise
export function difficultyOf(skill, tricky, pre, r) {
  if (tricky) return 3;
  const floor = pre ? (skill.gate && skill.gate.preBase) || 1 : 2;
  return (pre ? r.marginBb : r.marginBars) >= 1.5 * floor - 1e-9 ? 1 : 2;
}

// D1 with a pair and a real draw (CURR, STRAT 18 Nov): the call's own combined-test status (19b), from the coach's
// grade of the call. 'works' (the draw covers the price) and 'even' (about even) reject the spot from D1: Drill never
// marks a fold right while the coach's line says calling is fine. 'fails' (not enough) makes it tricky.
export function d1DrawStatus(f, callVerdict, opp) {
  if (!f || f.tier < TIER.WEAK_PAIR || !isRealDraw(f) || !callVerdict) return null;
  const ci = callVerdict.options.findIndex((o) => o.type === 'call');
  return ci >= 0 ? anchorStatus(callVerdict.options[ci], callVerdict, f, opp) : null;
}
export const d1DrawRejects = (st) => st === 'works' || st === 'even';
