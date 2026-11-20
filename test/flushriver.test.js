// POOL batch 19d (PRO's flush-river ceilings and the nit river lift; STRAT, CEO).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, HERO_PROFILE } from '../src/bots/profiles.js';

const pol = (s, P) => postflopPolicy(buildContext(s), P, handFeatures(s.hole[s.toAct], s.board, boardTexture(s.board)));
// three players, raise to $6 and two calls; flop and turn checked through; then `river` actions
function hand(holes, board, river) {
  const s = newHand({ stacks: [400, 400, 400], button: 0, sb: 1, bb: 2, hole: holes.map(parseCards), rng: Math.random });
  s.plan = parseCards(board);
  for (const a of [{ type: 'raise', to: 6 }, { type: 'call' }, { type: 'call' }]) applyAction(s, a, Math.random);
  for (let i = 0; i < 6; i++) applyAction(s, { type: 'check' }, Math.random);
  for (const a of river) applyAction(s, a, Math.random);
  return s;
}

test('19d: on a river that completes a flush, a straight with no flush facing a bet raises at most the ceiling and folds no more', () => {
  const CAP = { station: 0.03, nit: 0.03, abc: 0.05, beginner: 0.05, whale: 0.08, tag: 0.06, gto: 0.06, lag: 0.12, maniac: 0.25 };
  for (const [t, cap] of Object.entries(CAP)) {
    const s = hand(['Ac Qc', '4s 4c', 'Ts 6c'], '9h 8c 7d 2h Kh', [{ type: 'raise', to: 12 }]); // seat 1 bets $12, seat 2 holds T-high straight
    assert.equal(s.toAct, 2);
    const p = pol(s, PROFILES[t]);
    assert.ok(p.raise <= cap + 1e-9, `${t} raises ${p.raise.toFixed(3)} (ceiling ${cap})`);
    if (t === 'station') assert.ok(p.fold <= 0.03 + 1e-9, `station folds the straight ${p.fold.toFixed(3)} to a small bet`);
    if (t === 'whale') assert.ok(p.fold <= 0.06 + 1e-9, `whale folds the straight ${p.fold.toFixed(3)}`);
  }
  assert.equal(HERO_PROFILE.flushRiverRaiseCap ?? null, null);
});

test('19d: a nit with top pair good kicker, checked to on a dry river multiway, bets at least its floor', () => {
  const s = hand(['Kc Jd', '5s 5h', 'Qh Js'], 'Kd 8h 3s 6c 2d', [{ type: 'check' }, { type: 'check' }]); // seats 1 and 2 check; the nit (seat 0, KJ: 29% on 19c) is last
  assert.equal(s.toAct, 0);
  const p = pol(s, PROFILES.nit);
  assert.ok(p.raise >= 0.62 - 1e-9, `nit bets TPGK ${p.raise.toFixed(3)}`);
  assert.equal(HERO_PROFILE.riverTPFloor ?? null, null);
});
