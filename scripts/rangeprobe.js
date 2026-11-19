// Stage 2 probe: on real hands, at every postflop decision with nobody having bet yet, the chance the type bets
// with the range read on (as the profile has it) and off (rangeRead null: the batch 19b policy), by street, hand
// and board, and the "ahead of the hands that continue" figure the read is based on.
// node scripts/rangeprobe.js [hands, default 6000] [seed, default 7] [table] [types, default abc,tag]
import { walk } from './rangelib.js';
import { RangeTrack } from '../src/bots/rangetrack.js';
import { RANGE_TABLES } from '../src/bots/rangetables.js';
import { binOf } from '../src/bots/rangetrack.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES } from '../src/bots/profiles.js';
import { handFeatures, boardTexture, TIER } from '../src/engine/features.js';

const HANDS = +(process.argv[2] || 6000);
const SEED = +(process.argv[3] || 7);
const TABLE = process.argv[4] || 'typical';
const TYPES = (process.argv[5] || 'abc,tag').split(',');
const OFF = Object.fromEntries(TYPES.map((t) => [t, { ...PROFILES[t], rangeRead: null }]));
// overrides for trying a setting: RR=<value read> BAR=<bar, all streets> UP=1 (rangeUpOnly), applied to every type listed
for (const t of TYPES) {
  if (process.env.RR) PROFILES[t].rangeRead = [+process.env.RR, 0];
  if (process.env.BAR) PROFILES[t].rangeBar = [+process.env.BAR, +process.env.BAR, +process.env.BAR];
  if (process.env.UP) PROFILES[t].rangeUpOnly = process.env.UP === '1';
}
const HAND = (f) => (f.tier >= TIER.STRONG ? '5 set+' : f.tier === TIER.TWO_PAIR ? '4 two pair' : f.tier === TIER.OVERPAIR_TPTK ? '3 overpair/TPTK' : f.tier === TIER.TOP_PAIR_GOOD ? '2 TPGK' : f.tier === TIER.TOP_PAIR_WEAK ? '1 TPWK' : f.tier >= TIER.WEAK_PAIR ? '0 weak/mid pair' : '- no pair');
const cells = new Map();
const add = (key, on, off, ahead) => {
  let c = cells.get(key);
  if (!c) cells.set(key, (c = { n: 0, on: 0, off: 0, ahead: 0, up: 0, down: 0 }));
  c.n++;
  c.on += on;
  c.off += off;
  c.ahead += ahead;
  if (on - off > 0.1) c.up++;
  if (off - on > 0.1) c.down++;
};
walk({
  seed: SEED,
  table: TABLE,
  hands: HANDS,
  trackers: [new RangeTrack(RANGE_TABLES)],
  noBelief: true,
  onPoint: ({ s, seat, sess, sit }) => {
    if (sit.facing || seat === 0) return;
    const p = sess.seats[seat];
    if (!TYPES.includes(p.type) || p.tilt) return;
    const ctx = buildContext(s);
    if (!ctx.canRaise) return;
    const f = handFeatures(s.hole[seat], s.board, boardTexture(s.board));
    const on = postflopPolicy(ctx, PROFILES[p.type], f).raise;
    const off = postflopPolicy(ctx, OFF[p.type], f).raise;
    const rd = s.rt.betRead(s, seat, binOf(f), PROFILES[p.type].rangeBetFrac);
    const scary = (f.mdFlush ?? 1) < 1 || (f.mdStraight ?? 1) < 1 ? 'scary' : 'dry';
    const st = ['flop', 'turn', 'river'][s.street - 1];
    const mw = ctx.nOpp >= 2 ? 'MW' : 'HU';
    add(`${p.type} ${st.padEnd(5)} ${HAND(f).padEnd(16)} ${scary.padEnd(5)} ${mw}`, on, off, rd.ahead);
    add(`${p.type} ${st.padEnd(5)} all`, on, off, rd.ahead);
    add(`${p.type} all`, on, off, rd.ahead);
  },
});
console.log(`${TABLE} table, seed ${SEED}, ${HANDS} hands. Bet rate with nobody having bet: read off -> on (decisions; mean "ahead when called"; share moved up / down by 10+ points)`);
for (const [k, c] of [...cells.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  if (c.n < 40) continue;
  console.log(`${k.padEnd(46)} ${(100 * c.off / c.n).toFixed(0).padStart(3)} -> ${(100 * c.on / c.n).toFixed(0).padStart(3)}   (${String(c.n).padStart(5)}; ${(100 * c.ahead / c.n).toFixed(0).padStart(3)}%; ${(100 * c.up / c.n).toFixed(0)}% / ${(100 * c.down / c.n).toFixed(0)}%)`);
}
