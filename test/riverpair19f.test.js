// POOL batch 19f (item 0; PRO's one-pair river ceilings; CEO-approved, PRO + STRAT 20 Nov 2026): facing a single river
// bet with exactly one pair and no full call ahead, a type's fold is scaled by one factor per cell (type, heads-up or
// multiway, hole-card class, bet size), k = min(1, 0.85 x ceiling / measured pool-mix fold), so the kicker ordering is
// kept and the removed folds become calls. Station and whale top pair and the stand-in are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { CATEGORY } from '../src/engine/evaluator.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, HERO_PROFILE } from '../src/bots/profiles.js';
import { RIVER_PAIR_FOLD_REF } from '../src/data/riverpairref.js';

// three-handed, seat 2 folds preflop; seat 0 raises, seat 1 calls; flop seat 1 checks and calls a bet; turn checked
// through; river seat 1 checks and seat 0 bets `bet` into 30 (2/3 pot, pot, 1.5x pot). Board Kd 8c 4s 2h 9d.
function spot(hole, bet, board = 'Kd 8c 4s 2h 9d') {
  const s = newHand({ stacks: [600, 600, 600], button: 0, sb: 1, bb: 2, hole: ['As Qs', hole, '3c 3d'].map(parseCards), rng: Math.random });
  s.plan = parseCards(board);
  const A = [{ type: 'raise', to: 6 }, { type: 'call' }, { type: 'fold' },
    { type: 'check' }, { type: 'raise', to: 8 }, { type: 'call' },
    { type: 'check' }, { type: 'check' },
    { type: 'check' }, { type: 'raise', to: bet }];
  for (const a of A) applyAction(s, a, Math.random);
  assert.equal(s.toAct, 1);
  return { ctx: buildContext(s), f: handFeatures(s.hole[1], s.board, boardTexture(s.board)) };
}
const off = (t) => ({ ...PROFILES[t], riverPairFoldCap: null });
const TYPES = ['station', 'whale', 'beginner', 'abc', 'nit', 'tag', 'gto', 'lag', 'maniac'];

test('19f item 0: the hole-card class and the measured base are there for every type', () => {
  assert.equal(spot('Kh 5h', 30).ctx.riverPairClass, 'top');
  assert.equal(spot('8h 7h', 30).ctx.riverPairClass, 'mid');
  assert.equal(spot('6c 6h', 30).ctx.riverPairClass, 'ppUnder');
  for (const t of TYPES) for (const w of ['HU', 'MW']) for (const cl of ['top', 'mid', 'ppUnder']) assert.equal(RIVER_PAIR_FOLD_REF[t]?.[w]?.[cl]?.length, 5, `${t} ${w} ${cl}`);
});

test('19f item 0: one factor per cell (kicker order kept), folds only become calls, a tag folds middle pair far less', () => {
  for (const bet of [20, 30, 45]) for (const t of TYPES) {
    const r = [];
    for (const hole of ['Kh 5h', 'Kh Jh']) {
      const { ctx, f } = spot(hole, bet);
      const a = postflopPolicy(ctx, off(t), f), b = postflopPolicy(ctx, PROFILES[t], f);
      assert.ok(b.fold <= a.fold + 1e-9 && Math.abs(a.raise - b.raise) < 1e-9, `${t} ${hole} $${bet}`);
      r.push([a.fold, b.fold]);
    }
    if (r[0][0] > 0.01 && r[1][0] > 0.01) assert.ok(Math.abs(r[0][1] / r[0][0] - r[1][1] / r[1][0]) < 1e-6, `${t} $${bet}: one factor for weak and good kicker`);
    if (t === 'station' || t === 'whale') for (const [x, y] of r) assert.ok(Math.abs(x - y) < 1e-12, `${t} top pair untouched`);
  }
  const { ctx, f } = spot('8h 7h', 30);
  const a = postflopPolicy(ctx, off('tag'), f), b = postflopPolicy(ctx, PROFILES.tag, f);
  assert.ok(a.fold > 0.9 && b.fold < 0.75, `tag middle pair vs a pot bet: ${a.fold.toFixed(3)} -> ${b.fold.toFixed(3)}`);
});

test('19f item 0: two pair and the stand-in are untouched', () => {
  assert.equal(HERO_PROFILE.riverPairFoldCap ?? null, null);
  const tp = spot('Kh 8h', 30); // K8 on K-8-4-2-9
  assert.ok(tp.f.cat !== CATEGORY.PAIR && tp.ctx.riverPairClass === null);
  for (const t of TYPES) assert.ok(Math.abs(postflopPolicy(tp.ctx, PROFILES[t], tp.f).fold - postflopPolicy(tp.ctx, off(t), tp.f).fold) < 1e-12);
});
