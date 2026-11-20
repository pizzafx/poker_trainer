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
