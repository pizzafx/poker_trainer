// The player-type settings you can change from the Players screen, in plain language.
// Each control reads a value from a type's numbers and writes back the override(s) needed.
// The full set of numbers (with comments) lives in src/bots/profiles.js.

const pct = (v) => `${Math.round(v * 100)}%`;
const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
const scale = (arr, ratio, cap) => arr.map((x) => Math.min(cap, x * ratio));

// Hand-strength scale used by the opponents, as words.
export function handWord(v) {
  if (v < 0.2) return 'ace high';
  if (v < 0.36) return 'any pair';
  if (v < 0.48) return 'middle pair';
  if (v < 0.585) return 'top pair, weak kicker';
  if (v < 0.675) return 'top pair, good kicker';
  if (v < 0.77) return 'an overpair or top pair top kicker';
  if (v < 0.87) return 'two pair';
  return 'a set or better';
}

// get(d): current value from a type's numbers. set(base, v): overrides, built from the
// shipped numbers `base` so that related numbers keep their proportions.
export const CONTROLS = [
  {
    group: 'Before the flop',
    key: 'played',
    label: 'Hands played',
    hint: 'Share of hands they enter from late position when nobody has raised. Other positions and how often they call raises move with it.',
    min: 0.05, max: 0.9, step: 0.01, fmt: pct,
    get: (d) => d.vpip[2],
    set: (b, v) => ({ vpip: scale(b.vpip, v / b.vpip[2], 0.95), callRaise: Math.min(0.8, (b.callRaise * v) / b.vpip[2]) }),
  },
  {
    key: 'raised',
    label: 'Hands raised',
    hint: 'Share of hands they raise first in from late position.',
    min: 0.01, max: 0.6, step: 0.01, fmt: pct,
    get: (d) => d.pfr[2],
    set: (b, v) => ({ pfr: scale(b.pfr, v / b.pfr[2], 0.7) }),
  },
  {
    key: 'openSize',
    label: 'Opening raise size',
    hint: 'In big blinds, before adding one per limper.',
    min: 2, max: 10, step: 0.5, fmt: (v) => `${v} big blinds`,
    get: (d) => d.openSize,
    set: (b, v) => ({ openSize: v }),
  },
  {
    key: 'threeBet',
    label: 'Re-raises for value',
    hint: 'Share of hands they 3-bet for value. 1.4% is queens or better; 2.6% adds ace-king.',
    min: 0.004, max: 0.08, step: 0.002, fmt: pct1,
    get: (d) => d.threeBet,
    set: (b, v) => ({ threeBet: v }),
  },
  {
    key: 'sizeTell',
    label: 'Bet size gives the hand away',
    hint: 'How reliably they raise bigger with their best hands. 0% = same size with everything.',
    min: 0, max: 1, step: 0.05, fmt: pct,
    get: (d) => d.sizeTell,
    set: (b, v) => ({ sizeTell: v }),
  },
  {
    group: 'Betting after the flop',
    key: 'cbet',
    label: 'Bluffs the flop after raising',
    hint: 'How often they bet the flop with nothing after raising preflop, heads-up. Multiway frequencies move with it.',
    min: 0.05, max: 0.95, step: 0.01, fmt: pct,
    get: (d) => d.cbet[0],
    set: (b, v) => ({ cbet: scale(b.cbet, v / b.cbet[0], 0.95) }),
  },
  {
    key: 'barrel',
    label: 'Keeps bluffing the turn',
    hint: 'How often they bet again with nothing after betting the flop. River bluffing moves with it.',
    min: 0.01, max: 0.9, step: 0.01, fmt: pct,
    get: (d) => d.barrel[0],
    set: (b, v) => ({ barrel: scale(b.barrel, v / b.barrel[0], 0.9) }),
  },
  {
    key: 'riverRaiseBluff',
    label: 'Bluff-raises the river',
    hint: 'How often they raise a river bet with nothing. Flop and turn bluff-raises move with it. For most live players this is close to zero.',
    min: 0, max: 0.15, step: 0.001, fmt: pct1,
    get: (d) => d.raiseBluff[2],
    set: (b, v) => ({ raiseBluff: b.raiseBluff[2] > 0 ? scale(b.raiseBluff, v / b.raiseBluff[2], 0.5) : [v * 4, v * 2, v] }),
  },
  {
    key: 'slowplay',
    label: 'Slow-plays big hands',
    hint: 'How often they check or just call with a very strong hand before the river.',
    min: 0, max: 0.8, step: 0.05, fmt: pct,
    get: (d) => d.slowplay,
    set: (b, v) => ({ slowplay: v }),
  },
  {
    group: 'Calling and folding',
    key: 'riverCall',
    label: 'Calls a half-pot river bet with',
    hint: 'The weakest hand they call with. Flop and turn calling move with it.',
    min: 0.12, max: 0.75, step: 0.01, fmt: (v) => `${handWord(v)} or better`,
    get: (d) => d.callThr[2],
    set: (b, v) => ({ callThr: b.callThr.map((x) => x + (v - b.callThr[2])) }),
  },
  {
    key: 'neverFold',
    label: 'Never folds to a bet with',
    hint: 'However big the bet. Against a raise they need a notch more.',
    min: 0.25, max: 0.9, step: 0.01, fmt: (v) => `${handWord(v)} or better`,
    get: (d) => d.neverFold,
    set: (b, v) => ({ neverFold: v }),
  },
  {
    key: 'chase',
    label: 'Price needed to chase a draw',
    hint: '100% = only calls when the pot odds are right. Lower = chases without the price.',
    min: 0.2, max: 1.2, step: 0.05, fmt: (v) => `${Math.round(v * 100)}% of the right price`,
    get: (d) => d.chase,
    set: (b, v) => ({ chase: v }),
  },
  {
    group: 'How common',
    key: 'share',
    label: 'Share of casino seats',
    hint: 'How often this type sits down at a casino table (before the table-type setting). Shares are rebalanced to add up to 100%.',
    min: 0, max: 0.6, step: 0.005, fmt: pct1,
    get: (d) => d.share,
    set: (b, v) => ({ share: v }),
  },
];
