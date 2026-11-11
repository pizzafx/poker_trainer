// Hand evaluator for 5 to 7 cards. Returns an integer; a higher number is a better hand.
// Layout: category << 20 | five 4-bit rank slots (most significant first).

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
};

export const CATEGORY_NAMES = [
  'high card',
  'pair',
  'two pair',
  'three of a kind',
  'straight',
  'flush',
  'full house',
  'four of a kind',
  'straight flush',
];

const rankCount = new Uint8Array(13);
const suitMask = new Uint16Array(4);
const suitCount = new Uint8Array(4);

function straightHigh(mask) {
  for (let h = 12; h >= 4; h--) {
    if (((mask >> (h - 4)) & 31) === 31) return h;
  }
  if ((mask & 0x100f) === 0x100f) return 3; // wheel: A-2-3-4-5, five high
  return -1;
}

// Pack the top `n` set bits of `mask` (highest first) into 4-bit slots starting at `shift`.
function packTop(mask, n, shift) {
  let out = 0;
  for (let r = 12; r >= 0 && n > 0; r--) {
    if (mask & (1 << r)) {
      out |= r << shift;
      shift -= 4;
      n--;
    }
  }
  return out;
}

export function evaluate(cards) {
  rankCount.fill(0);
  suitMask.fill(0);
  suitCount.fill(0);
  let mask = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const r = c >> 2;
    const s = c & 3;
    rankCount[r]++;
    suitMask[s] |= 1 << r;
    suitCount[s]++;
    mask |= 1 << r;
  }

  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) {
      const fm = suitMask[s];
      const sh = straightHigh(fm);
      if (sh >= 0) return (8 << 20) | (sh << 16);
      // With at most 7 cards a flush rules out quads and full houses.
      return (5 << 20) | packTop(fm, 5, 16);
    }
  }

  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = rankCount[r];
    if (n === 4) quad = r;
    else if (n === 3) {
      if (trip1 < 0) trip1 = r;
      else if (trip2 < 0) trip2 = r;
    } else if (n === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
    }
  }

  if (quad >= 0) {
    return (7 << 20) | (quad << 16) | packTop(mask & ~(1 << quad), 1, 12);
  }
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    const p = Math.max(trip2, pair1);
    return (6 << 20) | (trip1 << 16) | (p << 12);
  }
  const sh = straightHigh(mask);
  if (sh >= 0) return (4 << 20) | (sh << 16);
  if (trip1 >= 0) {
    return (3 << 20) | (trip1 << 16) | packTop(mask & ~(1 << trip1), 2, 12);
  }
  if (pair1 >= 0 && pair2 >= 0) {
    const rest = mask & ~(1 << pair1) & ~(1 << pair2);
    return (2 << 20) | (pair1 << 16) | (pair2 << 12) | packTop(rest, 1, 8);
  }
  if (pair1 >= 0) {
    return (1 << 20) | (pair1 << 16) | packTop(mask & ~(1 << pair1), 3, 12);
  }
  return packTop(mask, 5, 16);
}

export const categoryOf = (score) => score >> 20;
