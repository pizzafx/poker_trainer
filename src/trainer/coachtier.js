// The coach's strength for a hand the board makes (STRAT and MATH, Nov 2026; QA-VERDICT's kicker-board finding).
// When the board alone makes two pair or better and the hole cards add no category, handFeatures rates the hand
// "nothing" or "ace or king high", which is right for the bots' policy tables but wrong for the coach's wording
// and rule routing: AK on 2-2-2 beats most hands. The coach reads those hands on one scale, the showdown rank:
// the share of the other two-card hands this hand beats on the board as it stands (a tie counts half). The rank
// becomes the tier that the same rank means on an unpaired board, per street, never below the raw tier and at
// most top pair with a weak kicker (above that the real tiers' ranks overlap). No read and no run-outs, so the
// label and the rules agree and do not move with the opponents. The bots never call this.
import { evaluate, categoryOf, CATEGORY } from '../engine/evaluator.js';
import { handFeatures, TIER, TIER_NAMES } from '../engine/features.js';
import { COMBOS } from '../engine/hands.js';

// The lowest rank that reads as: ace or king high, a weak pair, middle pair, top pair with a weak kicker; by
// street (flop, turn, river). Halfway between the median ranks of neighbouring tiers on unpaired boards
// (8,000 random deals a street; notes/MATH_KICKER_STRENGTH.md).
export const COACH_CUTS = [
  [0.37, 0.6, 0.74, 0.86],
  [0.29, 0.5, 0.68, 0.82],
  [0.21, 0.4, 0.61, 0.76],
];
const CUT_TIERS = [TIER.HIGH_CARD, TIER.WEAK_PAIR, TIER.MIDDLE_PAIR, TIER.TOP_PAIR_WEAK];

// The share of the other two-card hands that `hole` beats on `board` (three to five cards), ties as half.
export function showdownRank(hole, board) {
  const used = new Set([...hole, ...board]);
  const me = evaluate([...hole, ...board]);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  let w = 0;
  let n = 0;
  let losses = 0;
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const o = evaluate([deck[i], deck[j], ...board]);
      w += me > o ? 1 : me === o ? 0.5 : 0;
      if (o > me) losses++;
      n++;
    }
  }
  lastLosses = losses;
  return w / n;
}
let lastLosses = 0; // showdownRank's losses on its last call (coachTier reads it for the nuts exception)

// { tier, raw, boardMade, rank, plays, category }: `tier` is the coach's tier and `raw` handFeatures' own.
// boardMade: the board alone makes two pair or better, the hole cards add no category and the raw tier is ace or
// king high or lower; only then can `tier` differ from `raw`, and `rank` is set. `plays` is false when the best
// five cards are the board's own (the hole cards do not play). `category` is the board's hand (evaluator CATEGORY).
export function coachTier(hole, board, hf = null) {
  const raw = (hf || handFeatures(hole, board)).tier;
  const out = { tier: raw, raw, boardMade: false, rank: null, plays: true, category: null };
  if (board.length < 3) return out;
  const boardScore = evaluate(board);
  const bcat = categoryOf(boardScore);
  const lower = lowerRule(hole, board, bcat, raw);
  if (raw > TIER.HIGH_CARD && !lower) return out;
  const score = evaluate([...hole, ...board]);
  if (bcat < CATEGORY.TWO_PAIR || categoryOf(score) !== bcat) return out;
  out.boardMade = true;
  out.category = bcat;
  out.plays = score !== boardScore;
  out.rank = showdownRank(hole, board);
  out.nuts = lastLosses === 0; // no other two-card hand scores higher on this board
  out.lower = lower; // the quads or straight-flush board, or a counterfeited pocket pair
  out.tier = tierFromRank(out.rank, raw, board.length, lower, bcat >= CATEGORY.QUADS, out.nuts && out.plays);
  return out;
}

// Where the raw tier is too high for a board-made hand (MATH, STRAT, 20 Nov): a board that alone makes quads or a
// straight flush (handFeatures says top pair or a monster by the kicker), or a pocket pair below both pairs of a
// two-pair board (counterfeited: raw "a weak pair"). A quads or straight-flush board takes the rank's tier, capped,
// except a hand that cannot lose and whose cards play, which keeps raw; a counterfeited pair takes the lower of raw
// and the rank's tier. A pocket pair above a board pair (99 on 7-7-4-4) keeps its raw tier.
function lowerRule(hole, board, bcat, raw) {
  if (bcat >= CATEGORY.QUADS) return true;
  // a counterfeited pair already rated ace or king high or lower takes the ordinary raise-only path (MATH)
  if (bcat !== CATEGORY.TWO_PAIR || raw <= TIER.HIGH_CARD) return false;
  const [a, b] = hole.map((c) => c >> 2);
  if (a !== b) return false;
  const pr = pairsOf(board).slice(0, 2);
  return pr.length === 2 && pr.every((r) => r > a);
}
function tierFromRank(rank, raw, n, lower, quadsBoard, nutsPlays) {
  const cuts = COACH_CUTS[n - 3];
  let tier = TIER.AIR;
  for (let i = 0; i < cuts.length; i++) if (rank >= cuts[i]) tier = CUT_TIERS[i];
  if (!lower) return Math.max(raw, tier);
  // quads or a straight flush on the board (MATH, STRAT, 20 Nov): the rank's tier, capped; only a hand that cannot
  // lose and whose hole cards play keeps its raw tier (an ace on K-K-K-K-5)
  if (quadsBoard) return nutsPlays ? raw : tier;
  return Math.min(raw, tier); // a counterfeited pocket pair
}

// handFeatures with the coach's tier in place of the raw one (the coach reads this; the bots never do). `coach`
// carries coachTier's result, so the "you have" line and the wording can tell a board-made hand apart.
export function coachFeatures(hole, board, hf = null) {
  const f = hf || handFeatures(hole, board);
  const ct = coachTier(hole, board, f);
  return ct.tier === f.tier && !ct.boardMade ? { ...f, coach: ct } : { ...f, tier: ct.tier, coach: ct };
}

const BOARD_HAND = { [CATEGORY.TWO_PAIR]: 'two pair', [CATEGORY.TRIPS]: 'trips', [CATEGORY.STRAIGHT]: 'a straight', [CATEGORY.FLUSH]: 'a flush', [CATEGORY.FULL_HOUSE]: 'a full house', [CATEGORY.QUADS]: 'quads', [CATEGORY.STRAIGHT_FLUSH]: 'a straight flush' };
const RANK_PLURAL = ['twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces'];
const RANK_WORD = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
const PHRASE = { [TIER.AIR]: 'nothing', [TIER.HIGH_CARD]: 'ace or king high', [TIER.WEAK_PAIR]: 'a weak pair', [TIER.MIDDLE_PAIR]: 'middle pair', [TIER.TOP_PAIR_WEAK]: 'top pair with a weak kicker' };
// The "you have" line for a board-made hand (STRAT's templates, 19 Nov): the board's hand, then the kicker, then the
// coach tier's phrase. null when the hand is not board-made (describeHand's line stands).
export function coachHandText(hole, board, ct) {
  if (!ct || !ct.boardMade) return null;
  const hand = BOARD_HAND[ct.category] || 'a made hand';
  if (!ct.plays) {
    const [p, q] = hole.map((c) => c >> 2);
    const yours = p === q ? `your ${RANK_PLURAL[p]}` : 'your cards';
    // the split clause only on the river: before it, the hole cards may still come to play (STRAT)
    return `${hand} on the board; ${yours} don't play${board.length === 5 ? ': the best you can do is split the pot' : ''}`;
  }
  const onBoard = new Set(board.map((c) => c >> 2));
  const mine = hole.map((c) => c >> 2).filter((r) => !onBoard.has(r));
  const r = mine.length ? Math.max(...mine) : Math.max(...hole.map((c) => c >> 2));
  // the nuts on a quads or straight-flush board (STRAT): the best possible hand, and who splits it
  const nutsTail = ct.lower && ct.nuts && ct.tier > TIER.TOP_PAIR_WEAK ? `the best possible hand${ct.rank < 1 ? `; another ${RANK_WORD[r]} splits` : ''}` : null;
  const tail = nutsTail || (ct.tier <= TIER.AIR ? 'most hands beat it' : `about as strong as ${PHRASE[ct.tier] || TIER_NAMES[ct.tier]}`);
  if (ct.category === CATEGORY.STRAIGHT || ct.category === CATEGORY.FLUSH) return `${hand} on the board, made higher by your ${RANK_WORD[r]}: ${tail}`;
  return `${hand} on the board with ${r === 12 || r === 6 ? 'an' : 'a'} ${RANK_WORD[r]} kicker: ${tail}`;
}

// The coach tier for every combo of a range on one board, from one sort of the scores (MATH): the same function of
// (combo, board) as showdownRank. scores[c] is evaluate() of combo c with the board for every combo the board does not
// block (hero's cards included: they get no tier and no weight, but they are hands a combo is ranked against), or
// null; raw[c] its features tier. Each combo is ranked against the combos that share no card with it. Only combos
// that are board-made (raw tier ace or king high or lower, same category as the board) can move. Returns null when
// the board alone is not two pair or better.
const BY_CARD = Array.from({ length: 52 }, () => []);
COMBOS.forEach(([a, b], c) => { BY_CARD[a].push(c); BY_CARD[b].push(c); });
export function coachTiersForRange(board, scores, raw) {
  if (board.length < 3) return null;
  const boardScore = evaluate(board);
  const bcat = categoryOf(boardScore);
  if (bcat < CATEGORY.TWO_PAIR) return null;
  const live = [];
  for (let c = 0; c < scores.length; c++) if (scores[c] != null) live.push(scores[c]);
  live.sort((a, b) => a - b);
  const lower = (x) => { let lo = 0, hi = live.length; while (lo < hi) { const m = (lo + hi) >> 1; if (live[m] < x) lo = m + 1; else hi = m; } return lo; };
  const upper = (x) => { let lo = 0, hi = live.length; while (lo < hi) { const m = (lo + hi) >> 1; if (live[m] <= x) lo = m + 1; else hi = m; } return lo; };
  const out = raw.slice();
  for (let c = 0; c < scores.length; c++) {
    const x = scores[c];
    if (x == null || categoryOf(x) !== bcat) continue;
    const low = lowerRule(COMBOS[c], board, bcat, raw[c]); // the same scope as coachTier
    if (raw[c] > TIER.HIGH_CARD && !low) continue;
    let below = lower(x), ties = upper(x) - below, tot = live.length;
    let above = live.length - upper(x);
    const [a, b] = COMBOS[c];
    // take out the combos that share a card with c (c itself once)
    for (const card of [a, b]) for (const d of BY_CARD[card]) {
      const y = scores[d];
      if (y == null || (d === c && card === b)) continue;
      tot--;
      if (y < x) below--;
      else if (y === x) ties--;
      else above--;
    }
    const rank = tot > 0 ? (below + ties / 2) / tot : 0;
    out[c] = tierFromRank(rank, raw[c], board.length, low, bcat >= CATEGORY.QUADS, above === 0 && x !== boardScore);
  }
  return out;
}

// The board's own category when it alone makes two pair or better, else null
export function boardCategory(board) {
  if (board.length < 3) return null;
  const c = categoryOf(evaluate(board));
  return c >= CATEGORY.TWO_PAIR ? c : null;
}
const CAT_OR_BETTER = { [CATEGORY.STRAIGHT]: 'a straight or better', [CATEGORY.FLUSH]: 'a flush or better', [CATEGORY.FULL_HOUSE]: 'a full house or better', [CATEGORY.QUADS]: 'quads or better', [CATEGORY.STRAIGHT_FLUSH]: 'a straight flush' };
// the paired ranks of a set of cards, highest count then highest rank first
const pairsOf = (cards) => {
  const n = {};
  for (const c of cards) n[c >> 2] = (n[c >> 2] || 0) + 1;
  return Object.entries(n).filter(([, k]) => k >= 2).map(([r, k]) => [+r, k]).sort((a, b) => b[1] - a[1] || b[0] - a[0]).map(([r]) => r);
};
// The range line's parts on a board that alone makes two pair or better (STRAT's and DESIGN's final ruling, 20 Nov):
// each live combo is placed by the evaluator against hero's own hand, so no label can be false. `combos` is
// [{ hole, score, w }]; `hero` is { hole, score }. Returns [[label, weight], ...] in order, or null.
export function boardRangeParts(board, combos, hero) {
  const bc = boardCategory(board);
  if (bc === null) return null;
  const parts = new Map();
  const add = (label, w) => parts.set(label, (parts.get(label) || 0) + w);
  const full = board.length === 5;
  const bs = evaluate(board);
  const hs = hero.score;
  const ct = coachTier(hero.hole, board);
  const order = [];
  const put = (label, w) => { if (!order.includes(label)) order.push(label); add(label, w); };
  if (!ct.boardMade || bc === CATEGORY.QUADS) {
    // hero improves on the board (77 on 2-2-2-7), or quads on the board (STRAT, DESIGN: only the kicker can differ):
    // the plain comparison
    for (const x of combos) if (x.w > 0) put(x.score > hs ? 'a better hand than yours' : x.score === hs ? 'the same hand: a split' : 'a worse hand', x.w);
  } else if (bc === CATEGORY.FULL_HOUSE && full && !ct.plays) {
    for (const x of combos) if (x.w > 0) put(x.score > bs ? 'quads or a higher full house' : 'nothing better than the board', x.w);
  } else if (!ct.plays) {
    // hero's cards do not play: better than the board, or the board
    const same = bc === CATEGORY.STRAIGHT ? 'a higher straight' : bc === CATEGORY.FLUSH ? 'a higher flush' : null;
    for (const x of combos) {
      if (x.w <= 0) continue;
      if (x.score === hs) put('the board: a split', x.w);
      else if (same && categoryOf(x.score) === bc) put(same, x.w);
      else put('a better hand than the board', x.w);
    }
  } else {
    // hero's kicker plays (AK on 2-2-2-7): the better categories, then the kicker against hero's
    let minBetter = null;
    for (const x of combos) { const k = categoryOf(x.score); if (k > bc && x.w > 0) minBetter = minBetter === null ? k : Math.min(minBetter, k); }
    const top = minBetter === null ? null : CAT_OR_BETTER[minBetter];
    const bp = pairsOf(board);
    for (const x of combos) {
      if (x.w <= 0) continue;
      const k = categoryOf(x.score);
      if (k > bc) put(top, x.w);
      else if (bc === CATEGORY.TWO_PAIR && pairsOf([...x.hole, ...board]).slice(0, 2).join() !== bp.slice(0, 2).join()) put('a higher two pair', x.w);
      else put(x.score > hs ? 'a higher kicker than yours' : x.score === hs ? 'your kicker: a split' : 'a lower kicker, or just the board', x.w);
    }
  }
  const RANKED = ['a straight or better', 'a flush or better', 'a full house or better', 'quads or better', 'a straight flush', 'a better hand than yours', 'a better hand than the board', 'quads or a higher full house', 'a higher straight', 'a higher flush', 'a higher two pair', 'a higher kicker than yours', 'your kicker: a split', 'the same hand: a split', 'the board: a split', 'a lower kicker, or just the board', 'a worse hand', 'nothing better than the board'];
  return RANKED.filter((l) => parts.get(l) > 0).map((l) => [l, parts.get(l)]);
}
