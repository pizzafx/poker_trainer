// POOL batch 19g (CEO-approved 20 Nov 2026; PRO's ceilings; PRO + STRAT): a second river pair-fold factor, measured on the
// 19f build, for (1) single-paired boards (the hand's own pair + the board pair), (2) pocket overpairs on both boards,
// (3) after a fold with no caller ahead, (4) behind a full caller. Folds only become calls, one factor per cell; trips,
// real two pair, double-paired boards and the stand-in are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, HERO_PROFILE } from '../src/bots/profiles.js';
import { RIVER_PAIR_FOLD_REF2 } from '../src/data/riverpairref2.js';

// four-handed, button 0: preflop seat 3 raises, 0, 1, 2 call; flop and turn checked through; river 1 checks, 2 checks,
// 3 bets `bet` into 24, then seat 0 acts: 'call' or 'fold'; seat 1 is the responder under test (behind a caller / after a fold)
const UNPAIRED = 'Kd 8c 4s 2h 9d', PAIRED = 'Kd 8c 4s 4h 9d';
function spot(hole, board, first, bet = 24) {
  const holes = first ? ['Qs Js', hole, '3c 3d', 'As Qd'] : [hole, 'Qs Js', '3c 3d', 'As Qd']; // the responder holds `hole`
  const s = newHand({ stacks: [600, 600, 600, 600], button: 0, sb: 1, bb: 2, hole: holes.map(parseCards), rng: Math.random });
  s.plan = parseCards(board);
  for (const a of [{ type: 'raise', to: 6 }, { type: 'call' }, { type: 'call' }, { type: 'call' }]) applyAction(s, a, Math.random);
  while (!(s.board.length === 5 && s.toAct === 3)) applyAction(s, { type: 'check' }, Math.random);
  applyAction(s, { type: 'raise', to: bet }, Math.random);
  assert.equal(s.toAct, 0);
  if (first) applyAction(s, { type: first }, Math.random);
  return s;
}
const ctxOf = (s) => ({ ctx: buildContext(s), f: handFeatures(s.hole[s.toAct], s.board, boardTexture(s.board)) });
const off = (t) => ({ ...PROFILES[t], riverPairFoldCap: null });
const TYPES = ['station', 'whale', 'beginner', 'abc', 'nit', 'tag', 'gto', 'lag', 'maniac'];

test('19g: classes on a single-paired board and for pocket overpairs', () => {
  const c = (hole, board, first) => { const s = spot(hole, board, first); assert.equal(s.toAct, first ? 1 : 0); return buildContext(s); };
  assert.equal(c('Kh 5h', PAIRED).riverPairClass2, 'top');
  assert.equal(c('8h 7h', PAIRED).riverPairClass2, 'mid');
  assert.equal(c('6c 6h', PAIRED).riverPairClass2, 'ppUnder');
  assert.equal(c('Ac Ad', PAIRED).riverPairClass2, 'ppOver');
  assert.equal(c('4c 7h', PAIRED).riverPairClass2, null); // trips
  assert.equal(c('Ac Ad', UNPAIRED).riverPairClass2, 'ppOver');
  assert.equal(c('Ac Ad', UNPAIRED).riverPairClass, null); // 19f's class is unchanged
  assert.equal(c('8h 7h', PAIRED).riverPairClass, null);
  assert.equal(c('Kh 5h', 'Kd 8c 8s 4h 4d').riverPairClass2, null); // double-paired board
  assert.equal(c('8h 7h', PAIRED, 'call').fullCallersIn, 1);
  assert.equal(c('8h 7h', PAIRED, 'fold').foldsIn, 1);
});

test('19g: folds only become calls, raises are unchanged, and the base is there for every type', () => {
  let moved = 0;
  for (const [hole, board] of [['8h 7h', PAIRED], ['Kh 5h', PAIRED], ['Ac Ad', UNPAIRED], ['Ac Ad', PAIRED], ['8h 7h', UNPAIRED]]) for (const first of [null, 'fold', 'call']) {
    const { ctx, f } = ctxOf(spot(hole, board, first));
    for (const t of TYPES) {
      const a = postflopPolicy(ctx, off(t), f), b = postflopPolicy(ctx, PROFILES[t], f);
      assert.ok(b.fold <= a.fold + 1e-9 && Math.abs(a.raise - b.raise) < 1e-9, `${t} ${hole} ${board} ${first}`);
      if (a.fold - b.fold > 0.05) moved++;
    }
  }
  assert.ok(moved >= 20, `the second factor moves the over cells (${moved})`);
  for (const t of TYPES) for (const sit of ['Q', 'F', 'S']) assert.ok(RIVER_PAIR_FOLD_REF2[sit]?.paired?.[t], `${sit} paired ${t}`);
});

test('19g: a tag folds middle pair on a paired board, and behind a caller, far less; the kicker order holds', () => {
  const p = ctxOf(spot('8h 7h', PAIRED));
  const a = postflopPolicy(p.ctx, off('tag'), p.f), b = postflopPolicy(p.ctx, PROFILES.tag, p.f);
  assert.ok(a.fold > 0.9 && b.fold < 0.8, `tag mid pair, paired board: ${a.fold.toFixed(3)} -> ${b.fold.toFixed(3)}`);
  const s = ctxOf(spot('8h 7h', UNPAIRED, 'call'));
  const c = postflopPolicy(s.ctx, off('station'), s.f), d = postflopPolicy(s.ctx, PROFILES.station, s.f);
  assert.ok(c.fold > d.fold + 0.1, `station mid pair behind a caller: ${c.fold.toFixed(3)} -> ${d.fold.toFixed(3)}`);
  const r = [];
  for (const hole of ['Kh 5h', 'Kh Jh']) { const q = ctxOf(spot(hole, PAIRED)); r.push([postflopPolicy(q.ctx, off('nit'), q.f).fold, postflopPolicy(q.ctx, PROFILES.nit, q.f).fold]); }
  // 19i: topGood and topWeak are their own cells now (PRO's kicker split); the weak kicker still folds at least as much
  assert.ok(r[0][1] >= r[1][1] - 1e-9, 'weak kicker folds at least as much as good');
});

test('19g: real two pair, trips and the stand-in are untouched', () => {
  assert.equal(HERO_PROFILE.riverPairFoldCap ?? null, null);
  for (const [hole, board] of [['Kh 8h', UNPAIRED], ['4c 7h', PAIRED]]) {
    const { ctx, f } = ctxOf(spot(hole, board));
    for (const t of TYPES) assert.ok(Math.abs(postflopPolicy(ctx, PROFILES[t], f).fold - postflopPolicy(ctx, off(t), f).fold) < 1e-12, `${t} ${hole}`);
  }
});
