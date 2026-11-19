// Drill bank: a yield funnel for one predicate, without the gate. Deals session hands as drillbank does and, at
// every hero decision, counts how many pass each condition in turn, so the condition that starves a lesson shows.
//
//   node scripts/drillfunnel.js '<json>'   keys: skill (V5|D2), seed, table, hands (3000), warmup (60)

import { STREET } from '../src/engine/game.js';
import { handFeatures } from '../src/engine/features.js';
import { TIER, isRealDraw } from '../src/engine/features.js';
import { buildContext } from '../src/bots/policy.js';
import { Session, APP_GAME } from '../src/trainer/session.js';
import { live, leftToAct, boardChanged } from './drill/skills.js';

const cfg = JSON.parse(process.argv[2] || '{}');
const NB = new Set(['nit', 'tag']);
// the funnel steps per skill: [name, test(s, ctx, f, types)], each applied after the ones before it
const STEPS = {
  V5: [
    ['river', (s) => s.street === STREET.RIVER],
    ['checked to hero, can bet', (s, ctx) => !(ctx.toCall > 0) && ctx.canRaise],
    ['top pair (weak or good kicker)', (s, ctx, f) => f.tier >= TIER.TOP_PAIR_WEAK && f.tier <= TIER.TOP_PAIR_GOOD],
    ['1-2 live opponents', (s) => live(s).length >= 1 && live(s).length <= 2],
    ['all nit or tag', (s, ctx, f, t) => live(s).every((i) => NB.has(t[i]))],
  ],
  // V5 with the river rule lifted, per street: how much the river-only rule costs (CURR)
  V5any: [
    ['flop, turn or river', (s) => s.street !== STREET.PRE],
    ['checked to hero, can bet', (s, ctx) => !(ctx.toCall > 0) && ctx.canRaise],
    ['top pair (weak or good kicker)', (s, ctx, f) => f.tier >= TIER.TOP_PAIR_WEAK && f.tier <= TIER.TOP_PAIR_GOOD],
    ['1-2 live opponents', (s) => live(s).length >= 1 && live(s).length <= 2],
    ['all nit or tag', (s, ctx, f, t) => live(s).every((i) => NB.has(t[i]))],
  ],
  // V1 as built (skills.js): for side-by-side cue checks against its partner
  V1: [
    ['flop, turn or river', (s) => s.street !== STREET.PRE],
    ['checked to hero, can bet', (s, ctx) => !(ctx.toCall > 0) && ctx.canRaise],
    ['top pair (weak or good kicker)', (s, ctx, f) => f.tier >= TIER.TOP_PAIR_WEAK && f.tier <= TIER.TOP_PAIR_GOOD],
    ['1-2 live opponents', (s) => live(s).length >= 1 && live(s).length <= 2],
    ['all station, abc, beginner or whale', (s, ctx, f, t) => live(s).every((i) => ['station', 'abc', 'beginner', 'whale'].includes(t[i]))],
    ['a station or whale among them (spec 2.2)', (s, ctx, f, t) => live(s).some((i) => t[i] === 'station' || t[i] === 'whale')],
  ],
  // B1 as signed off (STRAT): checked to hero, flop to river, air or high card with no real draw, 1-2 live opponents
  // under V1's rule
  B1: [
    ['flop, turn or river', (s) => s.street !== STREET.PRE],
    ['checked to hero, can bet', (s, ctx) => !(ctx.toCall > 0) && ctx.canRaise],
    ['air or high card, no real draw', (s, ctx, f) => f.tier <= TIER.HIGH_CARD && !isRealDraw(f)],
    ['1-2 live opponents', (s) => live(s).length >= 1 && live(s).length <= 2],
    ['all station, abc, beginner or whale', (s, ctx, f, t) => live(s).every((i) => ['station', 'abc', 'beginner', 'whale'].includes(t[i]))],
    ['a station or whale among them (V1\'s rule)', (s, ctx, f, t) => live(s).some((i) => t[i] === 'station' || t[i] === 'whale')],
  ],
  // D1 as built, and its hand-cue partner D3 (STRAT's spec): the same bettors and bets, two pair or better
  D1: [
    ['turn or river', (s) => s.street === STREET.TURN || s.street === STREET.RIVER],
    ['facing a bet', (s, ctx) => ctx.toCall > 0 && ctx.aggressor > 0],
    ['pot 15bb+ at the bet', (s, ctx) => ctx.pot - ctx.toCall >= 15 * ctx.bb],
    ['bet half the pot+ or a raise', (s, ctx) => ctx.toCall >= 0.5 * (ctx.pot - ctx.toCall) || ctx.raises >= 2],
    ['10bb+ behind', (s, ctx) => ctx.stack >= 10 * ctx.bb],
    ['bettor passive (nit, abc, station, beginner)', (s, ctx, f, t) => ['nit', 'abc', 'station', 'beginner'].includes(t[ctx.aggressor])],
    ['nobody left behind', (s, ctx) => leftToAct(s, ctx.aggressor).length === 0],
    ['weak pair to top pair good', (s, ctx, f) => f.tier >= TIER.WEAK_PAIR && f.tier <= TIER.TOP_PAIR_GOOD],
  ],
  D3: [
    ['turn or river', (s) => s.street === STREET.TURN || s.street === STREET.RIVER],
    ['facing a bet', (s, ctx) => ctx.toCall > 0 && ctx.aggressor > 0],
    ['pot 15bb+ at the bet', (s, ctx) => ctx.pot - ctx.toCall >= 15 * ctx.bb],
    ['bet half the pot+ or a raise', (s, ctx) => ctx.toCall >= 0.5 * (ctx.pot - ctx.toCall) || ctx.raises >= 2],
    ['10bb+ behind', (s, ctx) => ctx.stack >= 10 * ctx.bb],
    ['bettor passive (nit, abc, station, beginner)', (s, ctx, f, t) => ['nit', 'abc', 'station', 'beginner'].includes(t[ctx.aggressor])],
    ['nobody left behind', (s, ctx) => leftToAct(s, ctx.aggressor).length === 0],
    // STRAT's revision: overpair/TPTK or better; two pair only from hero's own cards (each hole card pairs the
    // board, no pocket pair); every such hand is made, so no draw-only calls
    ['overpair/TPTK or better, two pair from the hole cards', (s, ctx, f) => {
      if (f.tier < TIER.OVERPAIR_TPTK) return false;
      if (f.tier !== TIER.TWO_PAIR) return true;
      const h = s.hole[0].map((c) => c >> 2);
      const b = new Set(s.board.map((c) => c >> 2));
      return h[0] !== h[1] && b.has(h[0]) && b.has(h[1]);
    }],
    // PRO's exception: two pair or better where the board just paired or a flush or straight just came in
    ['not two pair+ on a board that just changed', (s, ctx, f) => !(f.tier >= TIER.TWO_PAIR && boardChanged(s.board))],
  ],
  D2: [
    ['turn or river', (s) => s.street === STREET.TURN || s.street === STREET.RIVER],
    ['facing a bet', (s, ctx) => ctx.toCall > 0 && ctx.aggressor > 0],
    ['pot 15bb+ at the bet', (s, ctx) => ctx.pot - ctx.toCall >= 15 * ctx.bb],
    ['bet half the pot+ or a raise', (s, ctx) => ctx.toCall >= 0.5 * (ctx.pot - ctx.toCall) || ctx.raises >= 2],
    ['weak pair to top pair good', (s, ctx, f) => f.tier >= TIER.WEAK_PAIR && f.tier <= TIER.TOP_PAIR_GOOD],
    ['10bb+ behind', (s, ctx) => ctx.stack >= 10 * ctx.bb],
    ['bettor a maniac', (s, ctx, f, t) => t[ctx.aggressor] === 'maniac'],
    ['nobody left behind', (s, ctx) => leftToAct(s, ctx.aggressor).length === 0],
  ],
};
const steps = STEPS[cfg.skill];
if (!steps) throw new Error(`no funnel for ${cfg.skill}`);
const sess = new Session({ game: APP_GAME.game, rake: APP_GAME.rake, heroBuy: APP_GAME.heroBuy, seed: cfg.seed || 1, samples: 60, table: cfg.table || 'typical', seats: 8 });
const pass = steps.map(() => 0);
const byStreet = steps.map(() => ({}));
const cues = { street: {}, potBb: {}, live: {}, types: {}, bettor: {}, tier: {}, bettorByTier: {} };
const byBucket = {};
const lineups = {};
let decisions = 0;
for (let hands = 1; hands <= (cfg.hands || 3000); hands++) {
  sess.freshStack();
  sess.heat = 0;
  sess.startHand();
  const s = sess.hand.state;
  if (s.straddleAmt) {
    sess.finishAuto();
    continue;
  }
  const types = sess.seats.map((p) => (p.hero ? null : p.type));
  if (hands === 1 || hands % 500 === 0) for (const t of types.filter(Boolean)) lineups[t] = (lineups[t] || 0) + 1;
  let guard = 0;
  while (sess.status() !== 'over' && guard++ < 500) {
    if (sess.status() === 'bot') {
      sess.heat = 0;
      sess.stepBot();
      continue;
    }
    if (hands > (cfg.warmup ?? 60) && s.n > 3) {
      decisions++;
      const ctx = buildContext(s);
      const f = s.street === STREET.PRE ? null : handFeatures(s.hole[0], s.board);
      for (let k = 0; k < steps.length; k++) {
        if (!steps[k][1](s, ctx, f, types)) break;
        pass[k]++;
        byStreet[k][s.street] = (byStreet[k][s.street] || 0) + 1;
        // the non-hand cues of a full pass (CEO, CURR): street, pot in bb, live opponents, their types
        if (k === steps.length - 1) {
          const o = live(s);
          const pot = Math.round(ctx.pot / ctx.bb);
          const bucket = pot < 10 ? '<10' : pot < 20 ? '10-19' : pot < 40 ? '20-39' : pot < 80 ? '40-79' : '80+';
          // D3 (CURR): overpair/TPTK and two pair or better as separate buckets, each with its own cue split
          const tb = f && f.tier === TIER.OVERPAIR_TPTK ? 'tier6' : 'twoPairPlus';
          const per = (byBucket[tb] ||= { n: 0, street: {}, potBb: {}, live: {}, bettor: {} });
          if (cfg.skill === 'D3') per.n++;
          const add = (key, v) => {
            cues[key][v] = (cues[key][v] || 0) + 1;
            if (cfg.skill === 'D3' && per[key]) per[key][v] = (per[key][v] || 0) + 1;
          };
          add('street', ['pre', 'flop', 'turn', 'river'][s.street]);
          add('potBb', bucket);
          add('live', o.length);
          for (const i of o) add('types', types[i]);
          if (ctx.aggressor > 0) add('bettor', types[ctx.aggressor]);
          if (f) add('tier', f.tier);
          if (f && ctx.aggressor > 0) add('bettorByTier', `${f.tier} ${types[ctx.aggressor]}`);
        }
      }
    }
    sess.autoHero();
  }
}
console.log(JSON.stringify({ skill: cfg.skill, table: cfg.table || 'typical', seed: cfg.seed || 1, hands: cfg.hands || 3000, decisions, steps: steps.map(([n], k) => [n, pass[k], byStreet[k]]), lineupSample: lineups, cues, ...(cfg.skill === 'D3' ? { byBucket } : {}) }));
