// POOL batch 19h (CEO-approved 21 Nov 2026; PRO's turn ceilings; PRO + STRAT): facing a single turn bet with one pair, a type's
// fold is scaled by one factor per cell (situation, board, draw, type, way, class, size): folds only become calls, raises are
// unchanged, the kicker order holds, the stand-in is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, HERO_PROFILE } from '../src/bots/profiles.js';
import { TURN_PAIR_FOLD_REF } from '../src/data/turnpairref.js';

// three-handed, seat 2 folds preflop; seat 0 raises, seat 1 calls; flop checked through; turn seat 1 checks and seat 0 bets `bet`
// into 13; seat 1 (holding `hole`) to act. Board Kd 8c 4s 2h (+ a river card that is never dealt).
function spot(hole, bet, board = 'Kd 8c 4s 2h') {
  const s = newHand({ stacks: [600, 600, 600], button: 0, sb: 1, bb: 2, hole: ['Qs Js', hole, '3c 3d'].map(parseCards), rng: Math.random });
  s.plan = parseCards(board + ' 9d');
  for (const a of [{ type: 'raise', to: 6 }, { type: 'call' }, { type: 'fold' }, { type: 'check' }, { type: 'check' }, { type: 'check' }, { type: 'raise', to: bet }]) applyAction(s, a, Math.random);
  assert.equal(s.toAct, 1); assert.equal(s.board.length, 4);
  return { ctx: buildContext(s), f: handFeatures(s.hole[1], s.board, boardTexture(s.board)) };
}
const off = (t) => ({ ...PROFILES[t], turnPairFoldCap: null });
const TYPES = ['station', 'whale', 'beginner', 'abc', 'nit', 'tag', 'gto', 'lag', 'maniac'];

test('19h: turn classes, and the measured base is there for every type', () => {
  assert.equal(spot('Kh 5h', 9).ctx.turnPairClass, 'topWeak');
  assert.equal(spot('Kh Jc', 9).ctx.turnPairClass, 'topGood');
  assert.equal(spot('8h 7h', 9).ctx.turnPairClass, 'mid');
  assert.equal(spot('Ac Ad', 9).ctx.turnPairClass, 'ppOver');
  assert.equal(spot('6c 6h', 9).ctx.turnPairClass, 'ppUnder');
  for (const t of TYPES) assert.ok(TURN_PAIR_FOLD_REF.Q?.unpaired?.nodraw?.[t]?.HU, `Q unpaired nodraw ${t}`);
});

test('19h: folds only become calls, raises unchanged, one factor per cell (kicker order kept)', () => {
  let moved = 0;
  for (const bet of [9, 13, 20]) for (const t of TYPES) {
    for (const hole of ['Kh 5h', 'Kh Jc', '8h 7h', '6c 6h', 'Ac Ad']) {
      const { ctx, f } = spot(hole, bet);
      const a = postflopPolicy(ctx, off(t), f), b = postflopPolicy(ctx, PROFILES[t], f);
      assert.ok(b.fold <= a.fold + 1e-9 && Math.abs(a.raise - b.raise) < 1e-9, `${t} ${hole} $${bet}`);
      if (a.fold - b.fold > 0.05) moved++;
    }
    // two weak-kicker top pairs in the same cell take the same factor
    const r = ['Kh 5h', 'Kh 6c'].map((hole) => { const { ctx, f } = spot(hole, bet); return [postflopPolicy(ctx, off(t), f).fold, postflopPolicy(ctx, PROFILES[t], f).fold]; });
    if (r[0][0] > 0.01 && r[1][0] > 0.01) assert.ok(Math.abs(r[0][1] / r[0][0] - r[1][1] / r[1][0]) < 1e-6, `${t} $${bet}: one factor per cell`);
  }
  assert.ok(moved >= 10, `the factor moves the over cells (${moved})`);
});

test('19h: the stand-in is untouched, and the river is not affected', () => {
  assert.equal(HERO_PROFILE.turnPairFoldCap ?? null, null);
  const { ctx, f } = spot('8h 7h', 13);
  assert.equal(postflopPolicy(ctx, HERO_PROFILE, f).fold, postflopPolicy(ctx, { ...HERO_PROFILE, turnPairFoldCap: null }, f).fold);
});
