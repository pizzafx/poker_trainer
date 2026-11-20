// The coach's strength for a hand the board makes (STRAT and MATH, Nov 2026; QA-VERDICT's kicker-board finding).
// When the board alone makes two pair or better and the hole cards add no category, handFeatures rates the hand
// "nothing" or "ace or king high", which is right for the bots' policy tables but wrong for the coach's wording
// and rule routing: AK on 2-2-2 beats most hands. The coach reads those hands on one scale, the showdown rank:
// the share of the other two-card hands this hand beats on the board as it stands (a tie counts half). The rank
// becomes the tier that the same rank means on an unpaired board, per street, never below the raw tier and at
// most top pair with a weak kicker (above that the real tiers' ranks overlap). No read and no run-outs, so the
// label and the rules agree and do not move with the opponents. The bots never call this.
import { evaluate, categoryOf, CATEGORY } from '../engine/evaluator.js';
import { handFeatures, TIER } from '../engine/features.js';

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
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const o = evaluate([deck[i], deck[j], ...board]);
      w += me > o ? 1 : me === o ? 0.5 : 0;
      n++;
    }
  }
  return w / n;
}

// { tier, raw, boardMade, rank, plays, category }: `tier` is the coach's tier and `raw` handFeatures' own.
// boardMade: the board alone makes two pair or better, the hole cards add no category and the raw tier is ace or
// king high or lower; only then can `tier` differ from `raw`, and `rank` is set. `plays` is false when the best
// five cards are the board's own (the hole cards do not play). `category` is the board's hand (evaluator CATEGORY).
export function coachTier(hole, board, hf = null) {
  const raw = (hf || handFeatures(hole, board)).tier;
  const out = { tier: raw, raw, boardMade: false, rank: null, plays: true, category: null };
  if (board.length < 3 || raw > TIER.HIGH_CARD) return out;
  const boardScore = evaluate(board);
  const score = evaluate([...hole, ...board]);
  if (categoryOf(boardScore) < CATEGORY.TWO_PAIR || categoryOf(score) !== categoryOf(boardScore)) return out;
  out.boardMade = true;
  out.category = categoryOf(boardScore);
  out.plays = score !== boardScore;
  out.rank = showdownRank(hole, board);
  const cuts = COACH_CUTS[board.length - 3];
  let tier = TIER.AIR;
  for (let i = 0; i < cuts.length; i++) if (out.rank >= cuts[i]) tier = CUT_TIERS[i];
  out.tier = Math.max(raw, tier);
  return out;
}

// handFeatures with the coach's tier in place of the raw one (the coach reads this; the bots never do). `coach`
// carries coachTier's result, so the "you have" line and the wording can tell a board-made hand apart.
export function coachFeatures(hole, board, hf = null) {
  const f = hf || handFeatures(hole, board);
  const ct = coachTier(hole, board, f);
  return ct.tier === f.tier && !ct.boardMade ? { ...f, coach: ct } : { ...f, tier: ct.tier, coach: ct };
}

const BOARD_HAND = { [CATEGORY.TWO_PAIR]: 'two pair', [CATEGORY.TRIPS]: 'trips', [CATEGORY.STRAIGHT]: 'a straight', [CATEGORY.FLUSH]: 'a flush', [CATEGORY.FULL_HOUSE]: 'a full house', [CATEGORY.QUADS]: 'quads', [CATEGORY.STRAIGHT_FLUSH]: 'a straight flush' };
const RANK_WORD = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
const PHRASE = { [TIER.AIR]: 'nothing', [TIER.HIGH_CARD]: 'ace or king high', [TIER.WEAK_PAIR]: 'a weak pair', [TIER.MIDDLE_PAIR]: 'middle pair', [TIER.TOP_PAIR_WEAK]: 'top pair with a weak kicker' };
// The "you have" line for a board-made hand (STRAT's templates, 19 Nov): the board's hand, then the kicker, then the
// coach tier's phrase. null when the hand is not board-made (describeHand's line stands).
export function coachHandText(hole, board, ct) {
  if (!ct || !ct.boardMade) return null;
  const hand = BOARD_HAND[ct.category] || 'a made hand';
  if (!ct.plays) return `${hand} on the board; your cards don't play`;
  const onBoard = new Set(board.map((c) => c >> 2));
  const mine = hole.map((c) => c >> 2).filter((r) => !onBoard.has(r));
  const r = mine.length ? Math.max(...mine) : Math.max(...hole.map((c) => c >> 2));
  const tail = ct.tier <= TIER.AIR ? 'most hands beat it' : `about as strong as ${PHRASE[ct.tier]}`;
  if (ct.category === CATEGORY.STRAIGHT || ct.category === CATEGORY.FLUSH) return `${hand} on the board, your ${RANK_WORD[r]} makes it higher: ${tail}`;
  return `${hand} on the board with ${r === 12 || r === 6 ? 'an' : 'a'} ${RANK_WORD[r]} kicker: ${tail}`;
}

// The coach tier for every combo of a range on one board, from the scores the belief already holds (MATH: one sort,
// no enumeration). scores[c] is evaluate() of combo c with the board, or null for a combo the board blocks; raw[c]
// its features tier. Only combos that are board-made (raw tier ace or king high or lower, same category as the
// board) can move. Returns null when the board alone is not two pair or better.
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
  const cuts = COACH_CUTS[board.length - 3];
  const out = raw.slice();
  const n = live.length - 1;
  for (let c = 0; c < scores.length; c++) {
    const sc = scores[c];
    if (sc == null || raw[c] > TIER.HIGH_CARD || categoryOf(sc) !== bcat) continue;
    const below = lower(sc), ties = upper(sc) - below - 1;
    const rank = n > 0 ? (below + ties / 2) / n : 0;
    let tier = TIER.AIR;
    for (let i = 0; i < cuts.length; i++) if (rank >= cuts[i]) tier = CUT_TIERS[i];
    out[c] = Math.max(raw[c], tier);
  }
  return out;
}
