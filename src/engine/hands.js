// Starting-hand bookkeeping: the 169 hand classes (AKs, 77, T9o ...) and the 1326 combos.

import { RANKS } from './cards.js';

// Class index: pairs 0..12 by rank; then suited and offsuit for each hi > lo.
export const CLASS_COUNT = 169;
export const classNames = new Array(169);
const classLookup = new Int16Array(13 * 13 * 2).fill(-1);

{
  let k = 0;
  for (let r = 0; r < 13; r++) {
    classNames[k] = RANKS[r] + RANKS[r];
    classLookup[(r * 13 + r) * 2] = k;
    classLookup[(r * 13 + r) * 2 + 1] = k;
    k++;
  }
  for (let hi = 1; hi < 13; hi++) {
    for (let lo = 0; lo < hi; lo++) {
      classNames[k] = RANKS[hi] + RANKS[lo] + 's';
      classLookup[(hi * 13 + lo) * 2 + 1] = k++;
      classNames[k] = RANKS[hi] + RANKS[lo] + 'o';
      classLookup[(hi * 13 + lo) * 2] = k++;
    }
  }
}

export function classOf(c1, c2) {
  let hi = c1 >> 2;
  let lo = c2 >> 2;
  if (hi < lo) [hi, lo] = [lo, hi];
  const suited = (c1 & 3) === (c2 & 3) ? 1 : 0;
  return classLookup[(hi * 13 + lo) * 2 + suited];
}

export function classIndex(name) {
  return classNames.indexOf(name);
}

// All 1326 two-card combos, as [c1, c2] with c1 > c2, plus the class of each.
export const COMBOS = [];
export const comboClass = new Uint8Array(1326);
const comboLookup = new Int16Array(52 * 52).fill(-1);
{
  let k = 0;
  for (let a = 51; a >= 1; a--) {
    for (let b = a - 1; b >= 0; b--) {
      COMBOS.push([a, b]);
      comboClass[k] = classOf(a, b);
      comboLookup[a * 52 + b] = k;
      comboLookup[b * 52 + a] = k;
      k++;
    }
  }
}

export const comboIndex = (c1, c2) => comboLookup[c1 * 52 + c2];

export function classInfo(k) {
  const name = classNames[k];
  const hi = RANKS.indexOf(name[0]);
  const lo = RANKS.indexOf(name[1]);
  return { name, hi, lo, pair: hi === lo, suited: name[2] === 's', gap: hi - lo };
}
