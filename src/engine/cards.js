// Cards are integers 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const makeCard = (rank, suit) => (rank << 2) | suit;

// Hole cards for display: high card first, as online clients show them (dealt 5-T reads T-5).
// Cards are rank * 4 + suit, so sorting high to low also gives pairs a fixed suit order
// (spades, hearts, diamonds, clubs). Returns a copy: the game state keeps the dealt order.
export const holeOrder = (cs) => (cs || []).slice().sort((a, b) => b - a);

export function cardStr(c) {
  return RANKS[c >> 2] + SUITS[c & 3];
}

export function parseCard(s) {
  const r = RANKS.indexOf(s[0].toUpperCase());
  const su = SUITS.indexOf(s[1].toLowerCase());
  if (r < 0 || su < 0) throw new Error(`bad card: ${s}`);
  return (r << 2) | su;
}

export function parseCards(s) {
  return s.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

export function fullDeck() {
  const d = new Array(52);
  for (let i = 0; i < 52; i++) d[i] = i;
  return d;
}

// Small, fast, seedable generator (mulberry32). Returns a function giving [0, 1).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Remove and return a random card from `remaining` (swap-pop, O(1)).
export function drawRandom(remaining, rng) {
  const i = Math.floor(rng() * remaining.length);
  const c = remaining[i];
  remaining[i] = remaining[remaining.length - 1];
  remaining.pop();
  return c;
}

// Remove a specific card from `remaining`. Returns false if it was not there.
export function removeCard(remaining, c) {
  const i = remaining.indexOf(c);
  if (i < 0) return false;
  remaining[i] = remaining[remaining.length - 1];
  remaining.pop();
  return true;
}
