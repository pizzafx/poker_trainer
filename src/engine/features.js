// Postflop hand reading: what a hand is relative to the board, in the terms a live player
// thinks in ("top pair good kicker", "nut flush draw"), plus a rough 0..1 strength number.

import { evaluate, categoryOf, CATEGORY } from './evaluator.js';
import { RANKS } from './cards.js';

// A real draw (STRAT, Nov 2026, the J♣T♣ fix): a flush or straight draw with at least 14% equity
// to come. Backdoors and pair-improvement outs never make a hand a draw. Takes handFeatures() output,
// or a record's { realDraw } where it was stored.
export const isRealDraw = (f) => (f.realDraw !== undefined ? !!f.realDraw : !!(f.flushDraw || f.straightDraw) && f.drawEquity >= 0.14);

export const TIER = {
  AIR: 0,
  HIGH_CARD: 1, // ace/king high
  WEAK_PAIR: 2, // bottom pair, small pocket pair
  MIDDLE_PAIR: 3,
  TOP_PAIR_WEAK: 4,
  TOP_PAIR_GOOD: 5,
  OVERPAIR_TPTK: 6,
  TWO_PAIR: 7,
  STRONG: 8, // set, trips, straight, flush
  MONSTER: 9, // nut flush, full house or better
};

export const TIER_NAMES = [
  'nothing',
  'ace or king high',
  'a weak pair',
  'middle pair',
  'top pair, weak kicker',
  'top pair, good kicker',
  'an overpair or top pair top kicker',
  'two pair',
  'a strong made hand',
  'a monster',
];

const TIER_STRENGTH = [0.04, 0.14, 0.3, 0.42, 0.54, 0.63, 0.72, 0.82, 0.92, 0.99];

function straightHigh(mask) {
  for (let h = 12; h >= 4; h--) if (((mask >> (h - 4)) & 31) === 31) return h;
  if ((mask & 0x100f) === 0x100f) return 3;
  return -1;
}

// Tier for a hand whose best feature is one pair made with `pr`, given distinct board ranks.
function pairTier(pr, h1, h2, boardRanksDesc) {
  const top = boardRanksDesc[0];
  if (h1 === h2) {
    if (pr > top) return TIER.OVERPAIR_TPTK;
    let above = 0;
    for (const r of boardRanksDesc) if (r > pr) above++;
    return above === 1 ? TIER.MIDDLE_PAIR : TIER.WEAK_PAIR;
  }
  if (pr === top) {
    const kicker = h1 === pr ? h2 : h1;
    const bestKicker = top === 12 ? 11 : 12;
    if (kicker >= bestKicker) return TIER.OVERPAIR_TPTK;
    if (kicker >= 8) return TIER.TOP_PAIR_GOOD;
    return TIER.TOP_PAIR_WEAK;
  }
  if (boardRanksDesc.length > 1 && pr === boardRanksDesc[1]) return TIER.MIDDLE_PAIR;
  return TIER.WEAK_PAIR;
}

export function boardTexture(board) {
  const suitCount = [0, 0, 0, 0];
  const rankCount = new Array(13).fill(0);
  let mask = 0;
  for (const c of board) {
    suitCount[c & 3]++;
    rankCount[c >> 2]++;
    mask |= 1 << (c >> 2);
  }
  let maxSuit = 0;
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] > maxSuit) {
      maxSuit = suitCount[s];
      flushSuit = s;
    }
  }
  let paired = 0;
  for (let r = 0; r < 13; r++) if (rankCount[r] >= 2) paired++;
  // Most board cards that sit inside any five-rank window: 3 = straight possible, 4 = four-liner.
  const lowMask = ((mask << 1) | ((mask >> 12) & 1)) & 0x3fff; // bit 0 = ace low, bit r+1 = rank r
  let connected = 0;
  for (let lo = 0; lo <= 9; lo++) {
    let k = 0;
    for (let i = 0; i < 5; i++) if (lowMask & (1 << (lo + i))) k++;
    if (k > connected) connected = k;
  }
  // Highest straight anyone could hold on this board (with any two cards), or -1.
  let nutStraight = -1;
  if (board.length >= 3) {
    for (let x = 0; x < 13; x++) {
      for (let y = x; y < 13; y++) {
        const sh = straightHigh(mask | (1 << x) | (1 << y));
        if (sh > nutStraight) nutStraight = sh;
      }
    }
  }
  return { maxSuit, flushSuit, paired, connected, mask, rankCount, nutStraight, top: 31 - Math.clz32(mask) };
}

// Returns { tier, strength, score, cat, flushDraw, straightDraw, outs, drawEquity, label }.
// flushDraw: 0 none, 1 flush draw, 2 nut flush draw. straightDraw: 0 none, 1 gutshot, 2 open-ended.
export function handFeatures(hole, board, tex = boardTexture(board)) {
  const cards = [hole[0], hole[1], ...board];
  const score = evaluate(cards);
  const cat = categoryOf(score);
  const boardScore = evaluate(board);
  const boardCat = categoryOf(boardScore);
  let h1 = hole[0] >> 2;
  let h2 = hole[1] >> 2;
  if (h1 < h2) [h1, h2] = [h2, h1];
  const boardRanksDesc = [];
  for (let r = 12; r >= 0; r--) if (tex.rankCount[r]) boardRanksDesc.push(r);
  const highCardTier = h1 >= 11 ? TIER.HIGH_CARD : TIER.AIR;

  // Does a hole card pair a board card or is it a pocket pair? Highest such rank.
  let myPair = -1;
  if (h1 === h2) myPair = h1;
  if (tex.rankCount[h1] && h1 > myPair) myPair = h1;
  else if (tex.rankCount[h2] && h2 > myPair) myPair = h2;

  let tier;
  let nutFlush = false;
  let rel = 1; // where the hand sits inside its class: top two vs bottom two, nut-ish vs low flush
  switch (cat) {
    case CATEGORY.HIGH_CARD:
      tier = highCardTier;
      break;
    case CATEGORY.PAIR:
      tier = boardCat === CATEGORY.PAIR ? highCardTier : pairTier(myPair, h1, h2, boardRanksDesc);
      break;
    case CATEGORY.TWO_PAIR:
      if (boardCat === CATEGORY.HIGH_CARD) {
        tier = TIER.TWO_PAIR;
        if (h1 === boardRanksDesc[0] && h2 === boardRanksDesc[1]) rel = 1.03; // top two
        else if (h1 !== boardRanksDesc[0]) rel = 0.94; // bottom two
      }
      else if (myPair < 0) tier = highCardTier;
      else if (boardCat === CATEGORY.TWO_PAIR && score === boardScore) tier = highCardTier;
      else tier = pairTier(myPair, h1, h2, boardRanksDesc);
      break;
    case CATEGORY.TRIPS:
      if (boardCat === CATEGORY.TRIPS) tier = highCardTier;
      else {
        tier = TIER.STRONG;
        if (boardCat === CATEGORY.PAIR) {
          // Trips with one hole card: the kicker decides who gets stacked.
          const tr = (score >> 16) & 15;
          const kicker = h1 === tr ? h2 : h1;
          rel = kicker >= 10 ? 0.99 : kicker >= 7 ? 0.95 : 0.9;
        } else rel = 1.01; // a set
      }
      break;
    case CATEGORY.STRAIGHT:
      tier = boardCat === CATEGORY.STRAIGHT && score === boardScore ? highCardTier : TIER.STRONG;
      if (tier === TIER.STRONG && ((score >> 16) & 15) < tex.nutStraight) rel = 0.95; // not the top straight
      break;
    case CATEGORY.FLUSH: {
      if (boardCat === CATEGORY.FLUSH && score === boardScore) {
        tier = highCardTier;
        break;
      }
      const fs = tex.flushSuit;
      let need = 12; // highest rank of the flush suit not on the board
      while (need >= 0 && board.some((c) => (c & 3) === fs && c >> 2 === need)) need--;
      nutFlush = hole.some((c) => (c & 3) === fs && c >> 2 === need);
      tier = nutFlush ? TIER.MONSTER : TIER.STRONG;
      if (!nutFlush) {
        // How many bigger flush cards are still out there?
        let mine = -1;
        let suited = 0;
        for (const c of hole) {
          if ((c & 3) === fs) {
            suited++;
            if (c >> 2 > mine) mine = c >> 2;
          }
        }
        let higher = 0;
        for (let r = 12; r > mine; r--) if (!board.some((c) => (c & 3) === fs && c >> 2 === r)) higher++;
        rel = higher <= 1 ? 0.99 : higher === 2 ? 0.95 : higher <= 4 ? 0.9 : 0.84;
        if (suited === 1 && higher >= 2) rel *= 0.93; // one-card flush on a four-flush board
      }
      break;
    }
    case CATEGORY.FULL_HOUSE:
      if (boardCat === CATEGORY.FULL_HOUSE && score === boardScore) tier = highCardTier;
      else tier = boardCat === CATEGORY.TRIPS && myPair < boardRanksDesc[0] ? TIER.STRONG : TIER.MONSTER;
      break;
    case CATEGORY.QUADS:
      tier = boardCat === CATEGORY.QUADS ? (h1 === 12 ? TIER.MONSTER : TIER.TOP_PAIR_GOOD) : TIER.MONSTER;
      break;
    default:
      tier = TIER.MONSTER;
  }

  // Strength number, marked down on boards where better hands are easy to have.
  const raw = Math.min(0.985, TIER_STRENGTH[tier] * rel) + (tier === TIER.MONSTER ? 0.005 : 0); // strength ignoring how dangerous the board is
  let strength = raw;
  if (tier >= TIER.WEAK_PAIR && tier < TIER.MONSTER) {
    const big = tier >= TIER.STRONG; // sets, trips, straights, flushes hold up better
    if (cat < CATEGORY.FLUSH) {
      if (tex.maxSuit >= 4) strength *= big ? 0.62 : 0.55;
      else if (tex.maxSuit === 3) strength *= big ? 0.93 : 0.85;
    }
    if (cat < CATEGORY.STRAIGHT) {
      if (tex.connected >= 4) strength *= big ? 0.82 : 0.72;
      else if (tex.connected === 3 && board.length >= 4 && !big) strength *= 0.95;
    }
    if (tex.paired && cat < CATEGORY.FULL_HOUSE && cat !== CATEGORY.TRIPS) {
      strength *= cat >= CATEGORY.STRAIGHT ? 0.88 : 0.93;
    }
    if (cat === CATEGORY.STRAIGHT && tier === TIER.STRONG) {
      // Low end of a four-liner is weaker than it looks.
      const sh = (score >> 16) & 15;
      let oneCardBeats = false;
      for (let x = 0; x < 13 && !oneCardBeats; x++) {
        if (straightHigh(tex.mask | (1 << x)) > sh) oneCardBeats = true;
      }
      if (oneCardBeats) strength *= 0.8;
    }
  }

  // Draws (only matter with cards to come).
  let flushDraw = 0;
  let straightDraw = 0;
  let outs = 0;
  if (board.length < 5) {
    if (cat < CATEGORY.FLUSH) {
      for (let s = 0; s < 4; s++) {
        let mine = 0;
        let bd = 0;
        for (const c of hole) if ((c & 3) === s) mine++;
        for (const c of board) if ((c & 3) === s) bd++;
        if (mine >= 1 && mine + bd === 4) {
          let need = 12;
          while (need >= 0 && board.some((c) => (c & 3) === s && c >> 2 === need)) need--;
          const nut = hole.some((c) => (c & 3) === s && c >> 2 === need);
          // One-card draws to a low flush are close to worthless.
          const hiMine = Math.max(...hole.filter((c) => (c & 3) === s).map((c) => c >> 2));
          if (mine === 2 || nut || hiMine >= 10) {
            flushDraw = nut ? 2 : 1;
            outs += 9;
          }
        } else if (mine === 2 && bd === 1 && board.length === 3) {
          outs += 1; // backdoor
        }
      }
    }
    if (cat < CATEGORY.STRAIGHT) {
      const mask = tex.mask | (1 << h1) | (1 << h2);
      let ranks = 0;
      for (let x = 0; x < 13; x++) {
        if (mask & (1 << x)) continue;
        const sh = straightHigh(mask | (1 << x));
        if (sh >= 0 && straightHigh(tex.mask | (1 << x)) !== sh) ranks++;
      }
      if (ranks >= 2) straightDraw = 2;
      else if (ranks === 1) straightDraw = 1;
      let so = ranks * 4;
      if (flushDraw) so -= ranks; // some straight outs are already flush outs
      if (tex.maxSuit >= 3 && !flushDraw) so *= 0.75; // tainted outs
      outs += so;
    }
    if (tier <= TIER.HIGH_CARD) {
      const top = boardRanksDesc[0];
      if (h1 > top) outs += 1.5;
      if (h2 > top) outs += 1.5;
    } else if (cat === CATEGORY.PAIR && tier <= TIER.TOP_PAIR_GOOD && tier >= TIER.WEAK_PAIR) {
      outs += h1 === h2 ? 2 : 3; // improve to set / two pair or trips (discounted)
    }
  }
  const perCard = board.length === 3 ? 0.038 : 0.022;
  const drawEquity = Math.min(0.6, outs * perCard);

  return { tier, strength, raw, score, cat, flushDraw, straightDraw, outs, drawEquity, nutFlush };
}

export function describeHand(f, board) {
  let s = TIER_NAMES[f.tier];
  // On a paired board everyone shares the board's pair, so "tens and eights" is really just
  // a pair of tens for practical purposes. Say so, since the showdown will call it two pair.
  if (f.cat === CATEGORY.TWO_PAIR && f.tier >= TIER.WEAK_PAIR && f.tier <= TIER.OVERPAIR_TPTK) {
    s += ' (two pair on paper, but the second pair is the board\'s and everyone has it)';
  }
  const draws = [];
  if (f.flushDraw === 2) draws.push('the nut flush draw');
  else if (f.flushDraw === 1) draws.push('a flush draw');
  if (f.straightDraw === 2) draws.push('an open-ended straight draw');
  else if (f.straightDraw === 1) draws.push('a gutshot');
  if (board.length < 5 && draws.length) {
    s = f.tier <= TIER.HIGH_CARD ? draws.join(' and ') : `${s} with ${draws.join(' and ')}`;
  }
  return s;
}

export const rankChar = (r) => RANKS[r];
