// POOL batch 19i (CEO-approved; PRO, STRAT, MATH 24 Nov): PRO's river classes (kicker split, class correction), the one re-keyed
// river factor, the river air-fold factor (station, whale, beginner) and the lag/tag two-pair value-raise floor. The stand-in
// stays pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, postflopPolicy, pairClasses } from '../src/bots/policy.js';
import { PROFILES, HERO_PROFILE } from '../src/bots/profiles.js';
import { RIVER_PAIR_FOLD_REF3 } from '../src/data/riverpairref3.js';
import { RIVER_AIR_K } from '../src/data/riverairk.js';

// three-handed, seat 2 folds preflop; flop seat 1 checks and calls; turn checked through; river seat 1 checks, seat 0 bets.
function spot(hole, bet, board = 'Kd 8c 4s 2h 9d') {
  const s = newHand({ stacks: [600, 600, 600], button: 0, sb: 1, bb: 2, hole: ['As Qs', hole, '3c 3d'].map(parseCards), rng: Math.random });
  s.plan = parseCards(board);
  for (const a of [{ type: 'raise', to: 6 }, { type: 'call' }, { type: 'fold' }, { type: 'check' }, { type: 'raise', to: 8 }, { type: 'call' },
    { type: 'check' }, { type: 'check' }, { type: 'check' }, { type: 'raise', to: bet }]) applyAction(s, a, Math.random);
  assert.equal(s.toAct, 1);
  return { ctx: buildContext(s), f: handFeatures(s.hole[1], s.board, boardTexture(s.board)) };
}
const cls5 = (h, b) => pairClasses(parseCards(h), parseCards(b)).riverPairClass5;

test('19i: PRO river classes, the J+ kicker split and the top-rank board-pair correction', () => {
  assert.equal(cls5('Kh 5h', 'Kd 8c 4s 3h 2d'), 'topWeak');
  assert.equal(cls5('Kh Jh', 'Kd 8c 4s 3h 2d'), 'topGood');
  assert.equal(cls5('Kh Ah', 'Kd 8c 8s 3h 2d'), 'topGood'); // board pair below: the top unpaired rank
  assert.equal(cls5('Qh 9h', 'Kd Kc Qs 3h 2d'), 'mid'); // board paired at its top rank: the next rank is mid (PRO 21 Nov)
  assert.equal(cls5('Ac Ad', 'Kd Kc Qs 3h 2d'), 'ppOver');
  assert.equal(cls5('7c 7d', 'Kd 8c 4s 3h 2d'), 'ppUnder');
  assert.equal(cls5('8h 7h', 'Kd 8c 4s 3h 2d'), 'mid');
  assert.equal(cls5('Kh 5h', 'Kd 8c 8s 4h 4d'), null); // double-paired board: V9
});

test('19i: the river factor only turns folds into calls, and topWeak never folds less than topGood (one ref each, line + 10)', () => {
  for (const bet of [10, 20, 30, 45]) for (const t of ['beginner', 'abc', 'nit', 'tag', 'gto', 'lag', 'maniac']) {
    const off = { ...PROFILES[t], riverPairFoldCap: null };
    for (const hole of ['Kh 5h', 'Kh Jh', '8h 7h', '6c 6h']) {
      const { ctx, f } = spot(hole, bet), a = postflopPolicy(ctx, off, f), b = postflopPolicy(ctx, PROFILES[t], f);
      assert.ok(b.fold <= a.fold + 1e-9 && Math.abs(a.raise - b.raise) < 1e-9, `${t} ${hole} $${bet}`);
    }
  }
  if (RIVER_PAIR_FOLD_REF3.mode === 'one') assert.ok(RIVER_PAIR_FOLD_REF3.ref.Q?.unpaired?.calm?.tag?.HU?.topWeak?.length === 5);
});

test('19i: lag and tag raise two pair (both hole cards) on the river at least the floor, out of calls; others and the stand-in untouched', () => {
  const { ctx, f } = spot('Kh 8h', 20); // K8 on K-8-4-2-9: middle combination, average of top and bottom; dry board, HU
  for (const t of ['lag', 'tag']) {
    const off = { ...PROFILES[t], river2pRaise: null }, a = postflopPolicy(ctx, off, f), b = postflopPolicy(ctx, PROFILES[t], f);
    const F = PROFILES[t].river2pRaise, bf = ctx.toCall / Math.max(1, ctx.pot - ctx.toCall);
    const fl = ((F.top + F.bottom) / 2 + (bf <= 0.5 ? 10 : bf > 1 ? -10 : 0)) / 100;
    assert.ok(b.raise >= Math.min(fl, a.raise + a.call) - 1e-9, `${t} raise ${b.raise.toFixed(3)} vs floor ${fl}`);
    assert.ok(Math.abs(b.fold - a.fold) < 1e-12 && Math.abs(a.raise + a.call - b.raise - b.call) < 1e-9, `${t}: out of calls only`);
  }
  assert.equal(HERO_PROFILE.river2pRaise ?? null, null);
  assert.equal(HERO_PROFILE.riverAirFold ?? null, null);
  assert.equal(HERO_PROFILE.riverPairFoldCap ?? null, null);
  const fl = spot('Kh 8h', 20, 'Kd 8d 4d 2h 9c'); // three of a suit on board: no floor
  const a = postflopPolicy(fl.ctx, { ...PROFILES.lag, river2pRaise: null }, fl.f), b = postflopPolicy(fl.ctx, PROFILES.lag, fl.f);
  assert.ok(Math.abs(a.raise - b.raise) < 1e-12);
});

test('19i: river air facing a small first bet folds less for station, whale and beginner; ace-high still folds less than other air', () => {
  if (!RIVER_AIR_K.station) return; // placeholder data (k = 1)
  for (const t of ['station', 'whale', 'beginner']) for (const hole of ['Qh Jh', 'Ah 6h']) {
    const { ctx, f } = spot(hole, 10), a = postflopPolicy(ctx, { ...PROFILES[t], riverAirFold: null }, f), b = postflopPolicy(ctx, PROFILES[t], f);
    assert.ok(b.fold <= a.fold + 1e-9 && Math.abs(a.raise - b.raise) < 1e-9, `${t} ${hole}`);
  }
  for (const t of ['abc', 'nit', 'tag']) assert.equal(PROFILES[t].riverAirFold ?? null, null);
});
