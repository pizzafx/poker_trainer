// POOL batch 19e (PRO, STRAT, CEO; 19d gate 25200 13-18): a regular's river call with air below 10:1 against a bettor who
// also bet the flop and the turn is capped (tag/gto 3 heads-up, 1 multiway or with a player behind; lag 6/2; aimed at
// 0.85 of the line); the tiny-bet floor does not lift it. Maniac and the stand-in untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, HERO_PROFILE } from '../src/bots/profiles.js';

function threeBarrel(riverBet) {
  const s = newHand({ stacks: [600, 600, 600], button: 0, sb: 1, bb: 2, hole: ['Ac Qd', 'Jd 6d', 'Ks Qh'].map(parseCards), rng: Math.random });
  s.plan = parseCards('9d 8d 4d 3h Jh');
  const A = [{ type: 'raise', to: 6 }, { type: 'call' }, { type: 'call' },
    { type: 'raise', to: 12 }, { type: 'call' }, { type: 'call' }, // flop: seat 1 bets, seats 2 and 0 call
    { type: 'raise', to: 30 }, { type: 'call' }, { type: 'call' }, // turn: the same
    { type: 'raise', to: riverBet }]; // river: seat 1 bets
  for (const a of A) applyAction(s, a, Math.random);
  return s;
}

test('19e: a gto or tag with king-high facing a third barrel multiway below 10:1 continues at most 1%', () => {
  for (const bet of [20, 60]) {
    const s = threeBarrel(bet);
    assert.equal(s.toAct, 2);
    const ctx = buildContext(s);
    assert.ok(ctx.odds > 0.1);
    for (const t of ['gto', 'tag']) {
      const p = postflopPolicy(ctx, PROFILES[t], handFeatures(s.hole[2], s.board, boardTexture(s.board)));
      assert.ok(1 - p.fold <= 0.01 + 1e-9, `${t} continues ${(1 - p.fold).toFixed(3)} with K-high against $${bet}`);
    }
  }
  assert.equal(PROFILES.maniac.riverAirCall ?? null, null);
  assert.equal(HERO_PROFILE.riverAirCall ?? null, null);
});
