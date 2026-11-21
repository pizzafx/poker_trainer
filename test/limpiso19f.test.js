// POOL batch 19f (PRO, STRAT; CEO approval pending): item 1, a whale or station limper facing one iso raise folds more
// under 40bb effective (isoFoldMult.short) and less once someone has called the iso (isoFoldMult.caller); abc and nit
// (class floors) untouched. Item 2: the whale's real-draw, no-pair bet when nobody has bet is scaled by drawBetMult 0.8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { classOf } from '../src/engine/hands.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, preflopPolicy, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, HERO_PROFILE } from '../src/bots/profiles.js';

// seat 3 limps, seat 0 (button) isolates to 12 (5bb + 1bb), seat 1 folds, seat 2 calls or folds; seat 3 to act
function isoSpot(stack, caller, hole = '7d 2c') {
  const s = newHand({ stacks: [400, 400, 400, stack], button: 0, sb: 1, bb: 2, hole: ['As Ah', '8s 4d', 'Qs Jh', hole].map(parseCards), rng: Math.random });
  for (const a of [{ type: 'call' }, { type: 'raise', to: 12 }, { type: 'fold' }, caller ? { type: 'call' } : { type: 'fold' }]) applyAction(s, a, Math.random);
  assert.equal(s.toAct, 3);
  const ctx = buildContext(s); assert.ok(ctx.iLimped);
  return { ctx, cls: classOf(...s.hole[3]) };
}
const base = (t) => ({ ...PROFILES[t], isoFoldMult: { all: PROFILES[t].isoFoldMult.all } });

test('19f item 1: a short whale or station limper folds more to the iso, and less after a caller', () => {
  for (const t of ['whale', 'station']) {
    const sh = isoSpot(60, false); assert.ok(sh.ctx.effBB < 40);
    const fNew = preflopPolicy(sh.ctx, PROFILES[t], sh.cls).fold, fOld = preflopPolicy(sh.ctx, base(t), sh.cls).fold;
    assert.ok(fOld > 0 && fNew > fOld + 1e-6, `${t} short: ${fOld} -> ${fNew}`);
    assert.ok(Math.abs(fNew - Math.min(1, fOld * PROFILES[t].isoFoldMult.short)) < 1e-6 || fNew <= 1);
    const ca = isoSpot(400, true); assert.ok(ca.ctx.callers > 0 && ca.ctx.effBB >= 40);
    const cNew = preflopPolicy(ca.ctx, PROFILES[t], ca.cls).fold, cOld = preflopPolicy(ca.ctx, base(t), ca.cls).fold;
    assert.ok(cOld > 0 && Math.abs(cNew - cOld * PROFILES[t].isoFoldMult.caller) < 1e-6, `${t} caller: ${cOld} -> ${cNew}`);
    const dp = isoSpot(400, false); // deep, no caller: unchanged
    assert.ok(Math.abs(preflopPolicy(dp.ctx, PROFILES[t], dp.cls).fold - preflopPolicy(dp.ctx, base(t), dp.cls).fold) < 1e-9);
  }
  for (const t of ['abc', 'nit', 'beginner']) assert.equal(PROFILES[t].isoFoldMult.short ?? null, null);
  assert.equal(HERO_PROFILE.isoFoldMult ?? null, null);
});

test('19f item 2: the whale bets a no-pair draw on a checked-to flop 0.8 as often; the stand-in is untouched', () => {
  const s = newHand({ stacks: [400, 400, 400], button: 0, sb: 1, bb: 2, hole: ['Ah 5h', 'Kc Qd', '2s 3c'].map(parseCards), rng: Math.random });
  s.plan = parseCards('9h 7h 2d Jc 4s');
  for (const a of [{ type: 'call' }, { type: 'call' }, { type: 'check' }, { type: 'check' }, { type: 'check' }]) applyAction(s, a, Math.random);
  assert.equal(s.toAct, 0);
  const ctx = buildContext(s), f = handFeatures(s.hole[0], s.board, boardTexture(s.board));
  assert.ok(f.drawEquity >= 0.14);
  const pNew = postflopPolicy(ctx, PROFILES.whale, f).raise, pOld = postflopPolicy(ctx, { ...PROFILES.whale, drawBetMult: null }, f).raise;
  assert.ok(pOld > 0 && pNew < pOld - 1e-6 && pNew >= 0.8 * pOld - 1e-6, `whale draw bet ${pOld} -> ${pNew}`);
  assert.equal(HERO_PROFILE.drawBetMult ?? null, null);
});
