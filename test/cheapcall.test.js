// POOL batch 19 (PRO review 2, hand 14-03): a pair that uses a hole card never folds when the effective call is 10% of the
// final pot or less, for every type. 14-03: a station with $17 left folded 66 to a $28 river jam into $183 ($17 to win $200).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, TYPE_IDS } from '../src/bots/profiles.js';

function spot1403() {
  const hole = ['9c 3d', '6d 6s', '4c 8h', 'Kh 3h', '4h 4d', 'Jh 8s', 'Qh 9s', 'Th Ad'].map(parseCards);
  const s = newHand({ stacks: [200, 90, 118, 136, 101, 210, 198, 120], button: 5, sb: 1, bb: 2, hole, rng: () => 0.5 });
  s.plan = parseCards('2s 4s 9h 5c 7s');
  const A = [['fold'], ['call'], ['fold'], ['call'], ['raise', 18], ['fold'], ['fold'], ['call'], ['call'], ['call'],
    ['check'], ['check'], ['check'], ['raise', 55], ['fold'], ['call'], ['fold'], ['check'], ['check'], ['check'], ['raise', 28]];
  for (const [type, to] of A) applyAction(s, to ? { type, to } : { type }, () => 0.5);
  return s;
}

test('14-03: the last $17 against a $28 river jam into $183 (7.8% of the final pot) calls with 66, every type', () => {
  const s = spot1403();
  assert.equal(s.toAct, 1);
  const ctx = buildContext(s);
  assert.equal(ctx.toCall, 17, 'the effective call is the stack left, not the jam');
  assert.ok(ctx.odds <= 0.1, `odds ${ctx.odds}`);
  const f = handFeatures(s.hole[1], s.board, boardTexture(s.board));
  for (const t of TYPE_IDS) {
    const p = postflopPolicy(ctx, PROFILES[t], f);
    assert.ok(p.fold <= 0.01, `${t} folds ${p.fold}`);
    assert.ok(p.fold > 0, `${t}: rare, never zero`);
  }
});

// POOL batch 19c (item 6, CEO must-fix): gate 18000 hand 02-40, a tag folded AhQs (a gutshot and two overcards, 15% of
// draw equity) on Td Jd 4c 5c to an $8 all-in into $310 (38.8:1). At 20:1 or better on the flop or turn a hand with 10%+
// of draw equity continues, every type.
function spot0240() {
  const hole = ['3s 5d', 'Ac Qh', '3d Ad', '8c 5s', 'Ks 9c', 'Ah Qs', '2h Th', 'Js 8d'].map(parseCards);
  const s = newHand({ stacks: [154, 120, 270, 160, 76, 720, 128, 174], button: 0, sb: 1, bb: 2, hole, rng: () => 0.5 });
  s.plan = parseCards('Td Jd 4c 5c 6d');
  const A = [['fold'], ['call'], ['raise', 12], ['fold'], ['fold'], ['fold'], ['call'], ['fold'], ['call'],
    ['raise', 19], ['call'], ['raise', 100], ['call'], ['call'], ['raise', 120]];
  for (const [type, to] of A) applyAction(s, to ? { type, to } : { type }, () => 0.5);
  return s;
}

test('02-40: AhQs on Td Jd 4c 5c facing an $8 all-in into $310 (38.8:1) continues, every type', () => {
  const s = spot0240();
  assert.equal(s.toAct, 5);
  const ctx = buildContext(s);
  assert.equal(ctx.toCall, 8);
  assert.ok(ctx.odds <= 0.05, `odds ${ctx.odds}`);
  const f = handFeatures(s.hole[5], s.board, boardTexture(s.board));
  assert.ok(f.drawEquity >= 0.1 && f.tier <= 1, `drawEquity ${f.drawEquity}, tier ${f.tier}`);
  for (const t of TYPE_IDS) {
    const p = postflopPolicy(ctx, PROFILES[t], f);
    assert.ok(p.fold <= 0.005 + 1e-9, `${t} folds ${p.fold}`);
    assert.ok(p.fold > 0, `${t}: rare, never zero`);
  }
});
