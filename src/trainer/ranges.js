// Your own starting-hand ranges, one per group of seats. When "Only deal me hands I'd play" is on,
// a hand outside the range for your seat is folded for you (checked when free), the same way junk
// hands used to be skipped, and the next hand is dealt. Ranges are lists of hand-class names
// ("AKs", "77", "T9o") so they save cleanly in the browser.
import { CLASS_COUNT, classInfo, classNames } from '../engine/hands.js';
import { HERO_PROFILE } from '../bots/profiles.js';

export const RANGE_GROUPS = [
  ['early', 'Early', 'UTG, UTG+1'],
  ['middle', 'Middle', 'LJ, HJ'],
  ['cutoff', 'Cutoff', 'CO'],
  ['button', 'Button', 'BTN'],
  ['sb', 'Small blind', 'SB'],
  ['bb', 'Big blind', 'BB'],
];

// Share of all starting hands in each preset, by seat group. Live full-ring opening ranges: tight
// in early position, wider towards the button; the big blind defends wider because it has already
// paid. The hands themselves are the top of the trainer's own starting-hand ranking.
export const PRESETS = {
  tight: { early: 0.09, middle: 0.12, cutoff: 0.18, button: 0.26, sb: 0.18, bb: 0.3 },
  standard: { early: 0.13, middle: 0.17, cutoff: 0.25, button: 0.38, sb: 0.28, bb: 0.45 },
  loose: { early: 0.19, middle: 0.24, cutoff: 0.34, button: 0.5, sb: 0.4, bb: 0.65 },
};

export const combosOf = (k) => {
  const info = classInfo(k);
  return info.pair ? 6 : info.suited ? 4 : 12;
};

// Which group a seat's position name belongs to (positionName in engine/game.js).
export function groupOf(pos) {
  if (pos === 'BB') return 'bb';
  if (pos === 'SB') return 'sb';
  if (pos === 'BTN' || pos === 'BTN/SB') return 'button';
  if (pos === 'CO') return 'cutoff';
  if (pos === 'LJ' || pos === 'HJ') return 'middle';
  return 'early'; // UTG, UTG+1, UTG+2 ...
}

// The top `share` of starting hands (by combos) in the trainer's ranking.
const ORDER = [...Array(CLASS_COUNT).keys()].sort((a, b) => HERO_PROFILE.playPct[b] - HERO_PROFILE.playPct[a]);
export function topShare(share) {
  const out = [];
  let combos = 0;
  for (const k of ORDER) {
    if (combos >= share * 1326 - 1e-9) break;
    out.push(classNames[k]);
    combos += combosOf(k);
  }
  return out;
}

export function presetRanges(name = 'standard') {
  const p = PRESETS[name];
  return Object.fromEntries(RANGE_GROUPS.map(([g]) => [g, topShare(p[g])]));
}

// Share of all 1,326 starting hands that a list of class names covers.
export function shareOf(names) {
  let combos = 0;
  for (const n of names) {
    const k = classNames.indexOf(n);
    if (k >= 0) combos += combosOf(k);
  }
  return combos / 1326;
}
