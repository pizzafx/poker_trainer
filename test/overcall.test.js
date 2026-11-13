// Overcalls by player type (POOL, 13 Nov 2026): one pair facing a bet AND a call, three-way, against
// the same hand as first defender with one player still to act. Real one-pair combos on fixed turn
// and river boards, half pot and pot. Three guards:
//   1. no type continues more as overcaller than as first defender (the inversion SOLVER found);
//   2. the solver-style type and the theory baseline stay within 10 points of the equilibrium band;
//   3. no other type is tighter than equilibrium (the pool calls too much, it does not overfold).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, TYPE_IDS, BASELINE_PROFILE } from '../src/bots/profiles.js';

const bb = 3;
const SETS = {
  turn: [
    { board: 'Kh 8c 4d 2s', tp: ['As Kd', 'Kd Qc', 'Kc Jd', 'Ks 9d', 'Kd 6c'], mp: ['8s 7d', '9h 8d', 'Ah 8s', 'Qs Qd'] },
    { board: 'Qd Th 5c 3s', tp: ['Ad Qc', 'Qs Jd', 'Kc Qh', 'Qh 9s', 'Qc 7d'], mp: ['Ts 9d', 'Ac Tc', 'Jh Ts', 'Jc Jd'] },
  ],
  river: [
    { board: 'Kh 8c 4d 2s 6h', tp: ['As Kd', 'Kd Qc', 'Kc Jd', 'Ks 9d', 'Kd 7c'], mp: ['8s 7d', '9h 8d', 'Ah 8s', 'Qs Qd'] },
    { board: 'Qd Th 5c 3s 2d', tp: ['Ad Qc', 'Qs Jd', 'Kc Qh', 'Qh 9s', 'Qc 7d'], mp: ['Ts 9d', 'Ac Tc', 'Jh Ts', 'Jc Jd'] },
  ],
};
// SOLVER's equilibrium continue % for the overcaller, [low, high].
const EQ = {
  turn: { 0.5: { tp: [24, 24] }, 1: { tp: [2, 2] } },
  river: { 0.5: { tp: [12, 19], mp: [0, 0] }, 1: { tp: [0, 7], mp: [0, 0] } },
};

function cont(P, street, hole, board, frac, overcall) {
  const st = street === 'turn' ? 2 : 3;
  const pot0 = (st === 2 ? 30 : 50) * bb; // a typical three-way raised pot before the bet
  const toCall = Math.round(frac * pot0);
  const pot = pot0 + toCall * (overcall ? 2 : 1);
  const stack = 300 - pot0 / 3;
  const ctx = { street: st, pot, toCall, canRaise: true, canCheck: false, minTo: 2 * toCall, maxTo: stack, currentBet: toCall, myBet: 0, stack, bb, raises: 1, odds: toCall / (pot + toCall), nOpp: 2, inPosition: overcall, aggressorBehind: false, initiative: false, toActBehind: overcall ? 0 : 1, callersIn: overcall ? 1 : 0, iBetThisStreet: false };
  const cards = parseCards(board);
  return 1 - postflopPolicy(ctx, P, handFeatures(parseCards(hole), cards, boardTexture(cards))).fold;
}
const cell = (P, street, frac, key, oc) => {
  let s = 0;
  let n = 0;
  for (const S of SETS[street]) for (const h of S[key]) (s += cont(P, street, h, S.board, frac, oc)), n++;
  return (100 * s) / n;
};
// Known gaps in the approved values (13 Nov 2026): these cells still continue a little more as
// overcaller. Reported to POOL; any other inversion fails.
const KNOWN = new Set(['abc turn 1 mp', 'abc river 0.5 tp', 'abc river 0.5 mp', 'lag river 0.5 tp', 'beginner turn 1 mp', 'beginner river 0.5 tp', 'beginner river 0.5 mp']);
const ALL = [...TYPE_IDS.map((id) => [id, PROFILES[id]]), ['baseline', BASELINE_PROFILE]];

test('overcalls: no type continues more facing a bet and a call than facing the bet alone (known gaps aside)', (t) => {
  const bad = [];
  for (const [id, P] of ALL)
    for (const street of ['turn', 'river'])
      for (const frac of [0.5, 1])
        for (const key of ['tp', 'mp']) {
          const first = cell(P, street, frac, key, false);
          const over = cell(P, street, frac, key, true);
          if (over <= first + 0.5) continue;
          if (KNOWN.has(`${id} ${street} ${frac} ${key}`)) t.diagnostic(`known gap: ${id} ${street} ${frac} pot ${key}: ${first.toFixed(0)} first, ${over.toFixed(0)} over`);
          else bad.push(`${id} ${street} ${frac} pot ${key}: ${first.toFixed(0)} first, ${over.toFixed(0)} over`);
        }
  assert.deepEqual(bad, []);
});

test('overcalls: the solver-style type and the baseline sit within 10 points of equilibrium', () => {
  const bad = [];
  for (const [id, P] of ALL.filter(([id]) => id === 'gto' || id === 'baseline'))
    for (const street of ['turn', 'river'])
      for (const frac of [0.5, 1])
        for (const [key, [lo, hi]] of Object.entries(EQ[street][frac])) {
          const v = cell(P, street, frac, key, true);
          if (v < lo - 10 || v > hi + 10) bad.push(`${id} ${street} ${frac} pot ${key}: ${v.toFixed(0)} against ${lo}-${hi}`);
        }
  assert.deepEqual(bad, []);
});

test('overcalls: no pool type folds more than equilibrium', () => {
  const bad = [];
  for (const [id, P] of ALL.filter(([id]) => id !== 'gto' && id !== 'baseline'))
    for (const street of ['turn', 'river'])
      for (const frac of [0.5, 1])
        for (const [key, [lo]] of Object.entries(EQ[street][frac])) {
          const v = cell(P, street, frac, key, true);
          if (v < lo - 0.5) bad.push(`${id} ${street} ${frac} pot ${key}: ${v.toFixed(0)} below ${lo}`);
        }
  assert.deepEqual(bad, []);
});
