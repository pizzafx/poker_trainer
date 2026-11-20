// POOL batch 19c (PRO, rule 4 v3.5; QA-OPP on gate 18800 hand 17-43): an all-in under 20bb counts as one raise only when it is
// not a full re-raise. 17-43: $12 open, a $35 (17.5bb) all-in that is a full re-raise, a call; the BB nit re-jammed 99 for
// 69.5bb. Against a full short re-raise the nit's jam3Cap (0.001) applies; an incomplete jam ($12 open, all-in to $15) stays
// one raise and keeps the exemption.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { classOf } from '../src/engine/hands.js';
import { buildContext, preflopPolicy } from '../src/bots/policy.js';
import { PROFILES } from '../src/bots/profiles.js';

function spot1743(shortStack) {
  const hole = ['Ac 5h', '2h 3s', '3h Qs', 'Qc Qh', 'Th Ad', '2s 2c', '4d 6c', '9s 9d'].map(parseCards);
  const s = newHand({ stacks: [129, 171, 128, shortStack, 160, 144, 74, 139], button: 5, sb: 1, bb: 2, hole, rng: () => 0.5 });
  const A = [['fold'], ['fold'], ['fold'], ['call'], ['raise', 12], ['call'], ['fold'], ['call'], ['raise', shortStack], ['call'], ['fold']];
  for (const [type, to] of A) applyAction(s, to ? { type, to } : { type }, () => 0.5);
  return s;
}
const jamShare = (ctx, pol) => pol.raise * (pol.sizes || []).reduce((a, z) => a + (z.to >= ctx.maxTo ? z.p : 0), 0);

test('17-43: a full 17.5bb re-raise all-in is a 3-bet; the nit re-jams 99 at most 0.1%', () => {
  const s = spot1743(35);
  assert.equal(s.toAct, 7);
  const ctx = buildContext(s);
  assert.ok(ctx.aggAllIn && ctx.lastRaiseFull, 'the $35 all-in is a full raise over $12');
  const pol = preflopPolicy(ctx, PROFILES.nit, classOf(s.hole[7][0], s.hole[7][1]));
  assert.ok(jamShare(ctx, pol) <= 0.001 + 1e-9, `jam ${jamShare(ctx, pol)}`);
});

test('an incomplete short all-in ($12 open, all-in to $15) is not a full raise', () => {
  const s = spot1743(15);
  const ctx = buildContext(s);
  assert.ok(ctx.aggAllIn && !ctx.lastRaiseFull);
});
