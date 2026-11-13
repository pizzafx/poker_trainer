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

// Standard first in, written out by hand (notes/STRAT_RANGES.md 1b with the live pro's edits,
// Nov 2026): every pair, the better suited hands, offsuit hands only from late position. All
// raise-or-fold. The big blind's "first in" only matters when the pot is limped to it (it checks),
// so it keeps the wide generated list.
const STANDARD_FIRST = {
  early: '22+ ATs+ A5s KTs+ QTs+ JTs T9s AQo+ KQo',
  middle: '22+ A9s+ A5s-A2s K9s+ Q9s+ J9s+ T9s 98s 87s ATo+ KJo+',
  cutoff: '22+ A2s+ K8s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 76s 65s 54s A9o+ KTo+ QTo+ JTo',
  button: '22+ A2s+ K5s+ Q8s+ J8s+ T7s+ 96s+ 86s+ 75s+ 64s+ 54s A7o+ A5o K9o+ Q9o+ J9o+ T9o 98o',
  sb: '22+ A2s+ K7s+ Q8s+ J8s+ T8s+ 97s+ 87s 76s 65s A8o+ A5o KTo+ QTo+ JTo',
};
// Tight: Standard without the small pairs, the suited wheel aces and the suited connectors in early
// and middle position (the live pro's derivation); elsewhere the tightest generated hands that are
// also in Standard. First-in folds are only flagged for hands in Tight.
const TIGHT_FIRST = {
  early: '66+ ATs+ KTs+ QTs+ JTs AQo+ KQo',
  middle: '66+ A9s+ K9s+ Q9s+ J9s+ ATo+ KJo+',
};

export function presetRanges(name = 'standard') {
  const std = Object.fromEntries(RANGE_GROUPS.map(([g]) => [g, STANDARD_FIRST[g] ? expandRange(STANDARD_FIRST[g]) : topShare(PRESETS.standard[g])]));
  if (name === 'standard') return std;
  if (name === 'tight') return Object.fromEntries(RANGE_GROUPS.map(([g]) => [g, TIGHT_FIRST[g] ? expandRange(TIGHT_FIRST[g]) : topShare(PRESETS.tight[g]).filter((n) => std[g].includes(n))]));
  // Loose: the generated loose list, plus anything Standard has that it lacks.
  return Object.fromEntries(RANGE_GROUPS.map(([g]) => [g, [...new Set([...topShare(PRESETS.loose[g]), ...std[g]])]]));
}

// Standard as it was before the hand-written presets, so ranges a player saved without changing
// them can be moved to the new Standard while customised ones are left alone.
export function previousStandard() {
  return {
    first: Object.fromEntries(RANGE_GROUPS.map(([g]) => [g, topShare(PRESETS.standard[g])])),
    raised: Object.fromEntries(RANGE_GROUPS.map(([g]) => [g, expandRange(PREVIOUS_RAISED_STANDARD[g])])),
  };
}

// Behind limpers, offsuit hands below these are folded first in (they are dominated and cannot
// isolate); not in the small blind, where completing is a cheap, different decision.
export const LIMPER_OFFSUIT = { default: 'ATo+ KJo+', button: 'A9o+ KTo+ QTo+ JTo' };

// Facing a big (5x or more) or early raise, every seat uses the next tighter facing-a-raise row.
export const TIGHTER_ROW = { early: 'early', middle: 'early', cutoff: 'middle', button: 'cutoff', sb: 'early', bb: 'middle' };

// Share of all 1,326 starting hands that a list of class names covers.
export function shareOf(names) {
  let combos = 0;
  for (const n of names) {
    const k = classNames.indexOf(n);
    if (k >= 0) combos += combosOf(k);
  }
  return combos / 1326;
}

// ---- facing a raise ----
// A second range per seat group, used when someone has already raised before the action reaches
// you. Much tighter than first in: pairs, strong aces and broadway, suited connectors in late
// position and the big blind. Written in the usual notation and expanded below; each preset
// contains the one before it.
export const PRESETS_RAISED = {
  tight: {
    early: 'TT+ AQs+ AKo',
    middle: '99+ AJs+ KQs AQo+',
    cutoff: '88+ AJs+ KQs AQo+',
    button: '66+ ATs+ KJs+ QJs JTs AQo+ KQo',
    sb: '99+ AJs+ KQs AQo+',
    bb: '55+ A9s+ KTs+ QTs+ JTs T9s AJo+ KQo',
  },
  // notes/STRAT_RANGES.md 1e with the live pro's edit (no AJo on the button), Nov 2026
  standard: {
    early: '77+ AQs+ AKo',
    middle: '66+ AJs+ KQs AQo+',
    cutoff: '22+ ATs+ KJs+ QJs JTs T9s AQo+',
    button: '22+ ATs+ A5s-A4s KTs+ QTs+ JTs T9s 98s 87s 76s 65s AQo+ KQo',
    sb: '77+ AJs+ KQs AQo+',
    bb: '22+ A2s+ K9s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 75s+ 64s+ 54s ATo+ KTo+ QTo+ JTo',
  },
  loose: {
    early: '88+ ATs+ KJs+ QJs AJo+ KQo',
    middle: '77+ A9s+ KTs+ QTs+ JTs AJo+ KQo',
    cutoff: '55+ A8s+ A5s-A4s K9s+ Q9s+ J9s+ T9s 98s ATo+ KJo+',
    button: '22+ A2s+ K9s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 75s+ 65s 54s A9o+ KTo+ QTo+ JTo',
    sb: '77+ A9s+ KTs+ QTs+ JTs AJo+ KQo',
    bb: '22+ A2s+ K7s+ Q8s+ J8s+ T8s+ 97s+ 86s+ 75s+ 64s+ 54s A8o+ KTo+ QTo+ JTo',
  },
};

const PREVIOUS_RAISED_STANDARD = {
  early: '99+ AJs+ KQs AQo+',
  middle: '88+ ATs+ KJs+ QJs AQo+',
  cutoff: '77+ ATs+ KTs+ QTs+ JTs AJo+ KQo',
  button: '22+ A9s+ A5s-A4s KTs+ QTs+ JTs T9s 98s 87s 76s ATo+ KQo',
  sb: '88+ ATs+ KJs+ QJs AQo+',
  bb: '22+ A2s+ K9s+ Q9s+ J9s+ T9s 98s 87s 76s 65s ATo+ KJo+ QJo',
};

const RANK_ORDER = '23456789TJQKA';
const name2 = (hi, lo, kind) => (hi === lo ? hi + lo : hi + lo + kind);
// "88+" pairs from 88 up; "ATs+" A with T up to K, suited; "A5s-A4s" a run; "T9s" one hand.
export function expandRange(text) {
  const out = new Set();
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const run = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])-([2-9TJQKA])([2-9TJQKA])\3$/);
    if (run) {
      const [a, b] = [RANK_ORDER.indexOf(run[2]), RANK_ORDER.indexOf(run[5])].sort((x, y) => x - y);
      for (let i = a; i <= b; i++) out.add(name2(run[1], RANK_ORDER[i], run[3]));
      continue;
    }
    const m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)(\+?)$/);
    if (!m) throw new Error(`bad range token ${tok}`);
    const [, hi, lo, kind, plus] = m;
    const h = RANK_ORDER.indexOf(hi);
    const l = RANK_ORDER.indexOf(lo);
    if (h === l) {
      for (let i = h; i < (plus ? 13 : h + 1); i++) out.add(RANK_ORDER[i] + RANK_ORDER[i]);
    } else {
      for (let i = l; i < (plus ? h : l + 1); i++) out.add(name2(hi, RANK_ORDER[i], kind));
    }
  }
  return [...out];
}

export function presetRaised(name = 'standard') {
  const p = PRESETS_RAISED[name];
  const own = Object.fromEntries(RANGE_GROUPS.map(([g]) => [g, expandRange(p[g])]));
  if (name !== 'loose') return own;
  // Loose contains Standard
  const std = presetRaised('standard');
  return Object.fromEntries(RANGE_GROUPS.map(([g]) => [g, [...new Set([...own[g], ...std[g]])]]));
}
