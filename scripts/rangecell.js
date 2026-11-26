// Stage 2 tuning: the tag's bet rate in two scorecard cells, on seeds the scorecard does not use, for several
// values of rangeTop. Cell A: flop, the preflop raiser, heads-up, nobody has bet, top pair or an overpair.
// Cell B: flop, out of position, multiway, first to act with the raiser behind, TPTK or an overpair.
// node scripts/rangecell.js [hands] [seeds] [tops]
import { walk } from './rangelib.js';
import { RangeTrack } from '../src/bots/rangetrack.js';
import { RANGE_TABLES } from '../src/bots/rangetables.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES } from '../src/bots/profiles.js';
import { handFeatures, boardTexture, TIER } from '../src/engine/features.js';
const HANDS = +(process.argv[2] || 15000);
const SEEDS = (process.argv[3] || '71,72').split(',').map(Number);
const TOPS = (process.argv[4] || '0.05,0.07,0.085,0.105').split(',').map(Number);
const V = [['off', { ...PROFILES.tag, rangeRead: null }], ...TOPS.map((x) => [`top ${x}`, { ...PROFILES.tag, rangeTop: x }])];
const acc = { A: V.map(() => 0), B: V.map(() => 0), nA: 0, nB: 0 };
for (const seed of SEEDS) walk({ seed, hands: HANDS, trackers: [new RangeTrack(RANGE_TABLES)], noBelief: true,
  onPoint: ({ s, seat, sess, sit }) => {
    if (sit.facing || seat === 0 || s.street !== 1) return;
    const p = sess.seats[seat];
    if (p.type !== 'tag' || p.tilt) return;
    const ctx = buildContext(s);
    if (!ctx.canRaise) return;
    const f = handFeatures(s.hole[seat], s.board, boardTexture(s.board));
    const cellA = ctx.initiative && ctx.nOpp === 1 && f.tier >= TIER.TOP_PAIR_WEAK && f.tier <= TIER.OVERPAIR_TPTK;
    const cellB = !ctx.inPosition && ctx.nOpp >= 2 && ctx.aggressorBehind && f.tier === TIER.OVERPAIR_TPTK;
    if (!cellA && !cellB) return;
    V.forEach(([, P], i) => { acc[cellA ? 'A' : 'B'][i] += postflopPolicy(ctx, P, f).raise; });
    if (cellA) acc.nA++; else acc.nB++;
  } });
console.log(`tag, seeds ${SEEDS}, ${HANDS} hands each`);
console.log(`A c-bet top pair or overpair heads-up (n ${acc.nA}; ceiling 95): ` + V.map(([n], i) => `${n} ${(100 * acc.A[i] / acc.nA).toFixed(1)}`).join(' | '));
console.log(`B flop lead OOP multiway into the raiser, TPTK or overpair (n ${acc.nB}; floor 15): ` + V.map(([n], i) => `${n} ${(100 * acc.B[i] / acc.nB).toFixed(1)}`).join(' | '));
