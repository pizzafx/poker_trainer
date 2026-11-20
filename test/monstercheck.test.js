// POOL batch 19c (monster-check fix, rule 1 / the hand-461 complaint; PRO, STRAT, CEO): a recreational type's strong hand
// that checked a checked-through flop bets the turn (it checks again at most 5%), and a station or whale checks a strong
// hand on a wet flop at most 22% where V5 scores. Regulars and the stand-in are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, HERO_PROFILE } from '../src/bots/profiles.js';

const pol = (s, P) => postflopPolicy(buildContext(s), P, handFeatures(s.hole[s.toAct], s.board, boardTexture(s.board)));
function spot(holes, board, flopChecks) {
  const s = newHand({ stacks: [400, 400, 400], button: 0, sb: 1, bb: 2, hole: holes.map(parseCards), rng: Math.random });
  s.plan = parseCards(board);
  for (const a of [{ type: 'raise', to: 6 }, { type: 'call' }, { type: 'call' }]) applyAction(s, a, Math.random);
  for (let i = 0; i < flopChecks; i++) applyAction(s, { type: 'check' }, Math.random);
  return s;
}

test('monster fix: a recreational set that checked a checked-through flop checks the turn at most 5%', () => {
  for (const t of ['nit', 'abc', 'station', 'whale', 'beginner']) {
    const s = spot(['Ah Qc', '7d 7h', 'Js Ts'], 'Kd 7c 2s 9h 4d', 3); // seat 1 (SB) has a set of sevens, first to act on the turn
    assert.equal(s.toAct, 1); assert.equal(s.board.length, 4);
    const p = pol(s, PROFILES[t]);
    assert.ok(1 - p.raise <= 0.05 + 1e-9, `${t} checks the set again ${(1 - p.raise).toFixed(3)}`);
  }
});

test('monster fix: not on a four-flush turn the hand does not beat (g1), and regulars keep their own line', () => {
  const s = spot(['Ah Qc', '7d 7h', 'Js Ts'], 'Kc 7c 2c 9c 4d', 3); // the turn is the fourth club; the set has no club
  const p = pol(s, PROFILES.station);
  assert.ok(1 - p.raise > 0.05, `station may check a set on a four-flush turn (${(1 - p.raise).toFixed(3)})`);
  assert.equal(PROFILES.tag.secondCheckCap ?? null, null);
  assert.equal(HERO_PROFILE.secondCheckCap ?? null, null);
});
