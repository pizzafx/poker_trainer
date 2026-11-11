// Drill mode: for each leak category, the kind of situation that produces it. The trainer
// deals hands (playing your earlier decisions for you) until one of these comes up.

import { TIER } from '../engine/features.js';

// x: { street, toCall, raises, canRaise, tier, drawEquity, opponents, pct }
// streets: streets (1 flop, 2 turn, 3 river) where this leak has actually shown up, or null.
const post = (x, streets) => x.street > 0 && (!streets || !streets.length || streets.includes(x.street));
const pre = (x) => x.street === 0;
const showdownValue = (x) => x.tier >= TIER.WEAK_PAIR && x.tier <= TIER.TWO_PAIR;

const facingBetWithAHand = (x, st) => post(x, st) && x.toCall > 0 && showdownValue(x);
const weakAndCanBet = (x, st) => post(x, st) && x.toCall === 0 && x.canRaise && x.tier <= TIER.MIDDLE_PAIR;
const goodAndCanBet = (x, st) => post(x, st) && x.toCall === 0 && x.canRaise && x.tier >= TIER.TOP_PAIR_WEAK;

export const DRILLS = {
  paidOff: { what: 'facing a bet or raise with a hand that might be good', match: facingBetWithAHand },
  overFold: { what: 'facing a bet or raise with a hand that might be good', match: facingBetWithAHand },
  chase: {
    what: 'facing a bet with a draw',
    match: (x, st) => post(x, st) && x.street < 3 && x.toCall > 0 && x.drawEquity >= 0.14 && x.tier <= TIER.MIDDLE_PAIR,
  },
  badBluff: { what: 'checked to you with a weak hand', match: weakAndCanBet },
  missedBluff: { what: 'checked to you with a weak hand', match: weakAndCanBet },
  missedValue: {
    what: 'holding a good hand with the chance to bet or raise',
    match: (x, st) => post(x, st) && x.canRaise && x.tier >= TIER.TOP_PAIR_WEAK,
  },
  overplay: {
    what: 'holding a decent but beatable hand with the chance to bet or raise',
    match: (x, st) => post(x, st) && x.canRaise && x.tier >= TIER.TOP_PAIR_WEAK && x.tier <= TIER.TWO_PAIR,
  },
  sizeSmall: { what: 'betting a good hand: choose the size', match: goodAndCanBet },
  sizeBig: { what: 'betting a good hand: choose the size', match: goodAndCanBet },
  preLoose: { what: 'preflop with a marginal hand', match: (x) => pre(x) && x.pct >= 0.4 && x.pct <= 0.85 },
  preTight: { what: 'preflop with a playable hand', match: (x) => pre(x) && x.pct >= 0.5 && x.pct <= 0.93 },
  prePassive: { what: 'preflop with a strong hand', match: (x) => pre(x) && x.canRaise && x.pct >= 0.7 },
  preRaise: { what: 'preflop facing a raise with a good hand', match: (x) => pre(x) && x.raises >= 1 && x.pct >= 0.75 },
  other: { what: 'any decision after the flop', match: (x) => x.street > 0 },
};
