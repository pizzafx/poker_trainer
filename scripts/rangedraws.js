// STRAT's check (PRO's twin rule v1.2): how often each type bets a flush draw or open-ended straight draw with no
// pair when nobody has bet on the flop or turn (policy probability on real hands), against PRO's live ceilings
// for passive types. If the bots bet draws too often, a check removes too many draws from the tracker's ranges.
// node scripts/rangedraws.js [hands] [seeds] [table]
import { walk } from './rangelib.js';
import { RangeTrack } from '../src/bots/rangetrack.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, TYPE_IDS } from '../src/bots/profiles.js';
import { handFeatures, boardTexture, TIER } from '../src/engine/features.js';
for (const id of TYPE_IDS) PROFILES[id].rangeRead = null; // the population the tables are built from
const HANDS = +(process.argv[2] || 20000);
const SEEDS = (process.argv[3] || '81,82').split(',').map(Number);
const TABLE = process.argv[4] || 'typical';
const CEIL = { station: 15, whale: 20, beginner: 15, abc: 25, nit: 10 };
const acc = {};
const add = (k, p) => { const a = (acc[k] ||= { n: 0, s: 0 }); a.n++; a.s += p; };
for (const seed of SEEDS) walk({ seed, table: TABLE, hands: HANDS, trackers: [new RangeTrack(null)], noBelief: true,
  onPoint: ({ s, seat, sess, sit }) => {
    if (sit.facing || seat === 0 || s.street > 2) return;
    const p = sess.seats[seat];
    if (p.tilt) return;
    const f = handFeatures(s.hole[seat], s.board, boardTexture(s.board));
    if (f.tier > TIER.HIGH_CARD || !(f.flushDraw || f.straightDraw === 2)) return;
    const ctx = buildContext(s);
    if (!ctx.canRaise) return;
    const pr = postflopPolicy(ctx, PROFILES[p.type], f).raise;
    const st = s.street === 1 ? 'flop' : 'turn';
    add(`${p.type}|all`, pr);
    add(`${p.type}|${st}`, pr);
    if (ctx.checkedTo) add(`${p.type}|checked to`, pr);
    add(`${p.type}|${ctx.nOpp >= 2 ? 'MW' : 'HU'}`, pr);
    if (ctx.initiative) add(`${p.type}|as last aggressor`, pr); else add(`${p.type}|no initiative`, pr);
  } });
const g = (t, k) => { const a = acc[`${t}|${k}`]; return a ? `${(100 * a.s / a.n).toFixed(0)}% (${a.n})` : '-'; };
console.log(`${TABLE} table, seeds ${SEEDS}, ${HANDS} hands each. Bet rate with a flush draw or OESD and no pair, nobody having bet, flop or turn:`);
console.log('type      | all | checked to | no initiative | as last aggressor | flop | turn | HU | MW | PRO ceiling (checked to)');
for (const t of TYPE_IDS) if (acc[`${t}|all`]) console.log(`${t.padEnd(9)} | ${['all', 'checked to', 'no initiative', 'as last aggressor', 'flop', 'turn', 'HU', 'MW'].map((k) => g(t, k)).join(' | ')} | ${CEIL[t] ?? ''}`);
