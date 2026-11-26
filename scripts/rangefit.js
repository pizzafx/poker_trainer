// Stage 2 fit: for each type and street, the line that turns "ahead of the hands that continue" into today's
// distance from the value threshold, on real hands with a made pair or better and nobody having bet. The bar is
// the "ahead" at which today's policy sits exactly on its threshold; the scale is strength per unit of "ahead".
// With these, the range read agrees with today's play on average and differs only where the board and the action
// say something the hand's label does not.
// node scripts/rangefit.js [hands, default 20000] [seed, default 41] [table] [types]
import { walk } from './rangelib.js';
import { RangeTrack } from '../src/bots/rangetrack.js';
import { RANGE_TABLES } from '../src/bots/rangetables.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES } from '../src/bots/profiles.js';
import { handFeatures, boardTexture, TIER } from '../src/engine/features.js';

const HANDS = +(process.argv[2] || 20000);
const SEEDS = (process.argv[3] || '41').split(',').map(Number);
const TABLE = process.argv[4] || 'typical';
const TYPES = (process.argv[5] || 'abc,tag').split(',');
const acc = Object.fromEntries(TYPES.map((t) => [t, [0, 1, 2].map(() => ({ n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0, syy: 0 }))]));
// the fit reads the tracker with any profile that has a read on; the result does not depend on the bar it holds
const ON = Object.fromEntries(TYPES.map((t) => [t, { ...PROFILES[t], rangeRead: [1, 0], rangeBar: [0.5, 0.5, 0.5], rangeBetFrac: PROFILES[t].rangeBetFrac ?? 0.55 }]));
for (const seed of SEEDS) walk({
  seed, table: TABLE, hands: HANDS, trackers: [new RangeTrack(RANGE_TABLES)], noBelief: true,
  onPoint: ({ s, seat, sess, sit }) => {
    if (sit.facing || seat === 0) return;
    const p = sess.seats[seat];
    if (!TYPES.includes(p.type) || p.tilt) return;
    const f = handFeatures(s.hole[seat], s.board, boardTexture(s.board));
    if (f.tier < TIER.WEAK_PAIR || f.tier > TIER.TWO_PAIR) return; // the hands whose bet is a judgement
    const out = postflopPolicy(buildContext(s), ON[p.type], f);
    if (!out.fit) return;
    const [y, x] = out.fit; // y: S - valueThr today; x: ahead
    if (Math.abs(y) > 0.15) return; // only hands near the threshold tell us where the bar is
    const a = acc[p.type][s.street - 1];
    a.n++; a.sx += x; a.sy += y; a.sxx += x * x; a.sxy += x * y; a.syy += y * y;
  },
});
for (const t of TYPES) {
  const bars = [], scales = [];
  acc[t].forEach((a, st) => {
    const mx = a.sx / a.n, my = a.sy / a.n;
    const b = (a.sxy / a.n - mx * my) / (a.sxx / a.n - mx * mx); // strength per unit of ahead
    const r = (a.sxy / a.n - mx * my) / Math.sqrt((a.sxx / a.n - mx * mx) * (a.syy / a.n - my * my));
    const bar = mx - my / b;
    bars.push(+bar.toFixed(3)); scales.push(+b.toFixed(3));
    console.log(`${t} ${['flop', 'turn', 'river'][st]}: n ${a.n}, mean ahead ${(100 * mx).toFixed(1)}%, mean S - thr ${my.toFixed(3)}, slope ${b.toFixed(3)}, r ${r.toFixed(2)}, bar ${(100 * bar).toFixed(1)}%`);
  });
  console.log(`  ${t}: rangeBar: [${bars.join(', ')}], rangeScale: [${scales.join(', ')}]`);
}
