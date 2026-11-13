// MATH's safeguard 3 (from POOL's foldcheck.js): the pool's fold rate to river bets must not fall
// as the bet grows, the sticky types (station, gambler) must not fold more than a bluff needs to
// break even (plus 5 points) at any size up to all-in, and an all-regular three-way field's chance of
// both folding must not jump by more than 15 points from a pot-sized bet to 1.5x the pot. It guards
// against the penalties in the opponent model stacking into a cliff. Range: random hands and boards,
// weighted by the type's own chance of calling a half-pot flop bet and a half-pot turn bet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { PROFILES } from '../src/bots/profiles.js';
import { postflopPolicy } from '../src/bots/policy.js';

test('opponents: folds to river bets have no cliffs (MATH safeguard 3)', () => {
  const rng = makeRng(17);
  const bb = 3;
  const potR = 20 * bb;
  const stack = 300 - potR / 2;
  const SIZES = [0.33, 0.5, 0.75, 1, 1.5, 2, 3, stack / potR];
  const STICKY = ['station', 'whale'];
  const TYPES = ['nit', 'abc', 'station', 'whale', 'maniac', 'gto', 'tag', 'lag', 'beginner'];
  const N = 3000;
  const deals = [];
  for (let i = 0; i < N; i++) {
    const deck = [...Array(52).keys()];
    for (let j = 51; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [deck[j], deck[k]] = [deck[k], deck[j]];
    }
    const hole = deck.slice(0, 2);
    const board = deck.slice(2, 7);
    deals.push({ fF: handFeatures(hole, board.slice(0, 3)), fT: handFeatures(hole, board.slice(0, 4)), fR: handFeatures(hole, board, boardTexture(board)) });
  }
  const call = (P, f, street, pot, toCall, st) => {
    const ctx = { street, pot: pot + toCall, toCall, canRaise: true, canCheck: false, minTo: 2 * toCall, maxTo: st, currentBet: toCall, myBet: 0, stack: st, bb, raises: 1, odds: toCall / (pot + 2 * toCall), nOpp: 1, inPosition: true, toActBehind: 0, callersIn: 0 };
    return 1 - postflopPolicy(ctx, P, f).fold;
  };
  const riverFold = (P, f, frac, behind) => {
    const toCall = Math.min(frac * potR, stack);
    const ctx = { street: 3, pot: potR + toCall, toCall, canRaise: true, canCheck: false, minTo: 2 * toCall, maxTo: stack, currentBet: toCall, myBet: 0, stack, bb, raises: 1, odds: toCall / (potR + 2 * toCall), nOpp: 1 + behind, inPosition: behind === 0, toActBehind: behind, callersIn: 0 };
    return postflopPolicy(ctx, P, f).fold;
  };
  const problems = [];
  const res = {};
  for (const id of TYPES) {
    const P = PROFILES[id];
    const w = deals.map((d) => call(P, d.fF, 1, 10 * bb, 5 * bb, 280) * call(P, d.fT, 2, 20 * bb, 10 * bb, 265));
    const W = w.reduce((a, b) => a + b, 0);
    res[id] = {};
    SIZES.forEach((s, i) => {
      const hu = deals.reduce((a, d, j) => a + w[j] * riverFold(P, d.fR, s, 0), 0) / W;
      const m3 = deals.reduce((a, d, j) => a + w[j] * riverFold(P, d.fR, s, 1), 0) / W;
      res[id][s] = { hu, m3 };
      const B = Math.min(s * potR, stack);
      const alpha = B / (potR + B);
      for (const k of ['hu', 'm3']) {
        if (i > 0 && res[id][s][k] < res[id][SIZES[i - 1]][k] - 0.03) problems.push(`(a) ${id} ${k}: fold drops from ${SIZES[i - 1]}x to ${s}x`);
        if (STICKY.includes(id) && res[id][s][k] > alpha + 0.05) problems.push(`(b) ${id} ${k} at ${s}x: fold ${(100 * res[id][s][k]).toFixed(0)}% > alpha ${(100 * alpha).toFixed(0)}%`);
      }
    });
  }
  for (const field of [['tag', 'tag'], ['nit', 'tag'], ['nit', 'nit']]) {
    const both = (s) => res[field[0]][s].m3 * res[field[1]][s].hu;
    if (both(1.5) - both(1) > 0.15) problems.push(`(c) ${field.join('+')}: both-fold climbs ${(100 * (both(1.5) - both(1))).toFixed(0)} points from pot to 1.5x pot`);
  }
  assert.deepEqual(problems, []);
});
