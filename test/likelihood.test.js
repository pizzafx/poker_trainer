// The chance a policy makes the action seen (actionLikelihood): a bet is credited by how close its size is to the
// sizes any hand can bet in the spot, not by the hand's own nearest size however far away (QA-VERDICT's D3 finding;
// MATH's size grid).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, makeRng } from '../src/engine/cards.js';
import { newHand, applyAction, STREET } from '../src/engine/game.js';
import { COMBOS } from '../src/engine/hands.js';
import { handFeatures, TIER } from '../src/engine/features.js';
import { buildContext, postflopPolicy, actionLikelihood, betGrid, SIZE_ANY } from '../src/bots/policy.js';
import { TYPE_IDS, PROFILES } from '../src/bots/profiles.js';
import { HandBelief, newRead } from '../src/trainer/belief.js';

const air = { fold: 0, check: 0.96, call: 0, raise: 0.04, sizes: [{ to: 6, p: 0.35 }, { to: 10, p: 0.45 }, { to: 14, p: 0.2 }] };
const value = { fold: 0, check: 0.3, call: 0, raise: 0.7, sizes: [{ to: 10, p: 0.15 }, { to: 14, p: 0.45 }, { to: 19, p: 0.35 }, { to: 29, p: 0.05 }] };
const GRID = [6, 10, 14, 19, 29]; // a $19 pot: 1/3, 1/2, 3/4, pot, 1.5x
const bet = (to) => ({ type: 'bet', to });
const near = (a, b, rel = 0.02) => Math.abs(a - b) <= rel * b;
const L = (pol, to, grid = GRID) => actionLikelihood(pol, bet(to), grid);

test('likelihood: a size on the grid is credited with the hand\'s own share of that size', () => {
  assert.ok(near(L(value, 19), 0.7 * 0.35));
  assert.ok(near(L(value, 14), 0.7 * 0.45));
  assert.ok(near(L(air, 10), 0.04 * 0.45));
  assert.ok(near(actionLikelihood(air, { type: 'raise', to: 10 }, GRID), 0.04 * 0.45), 'a raise reads like a bet');
});

test('likelihood: a hand whose menu lacks the size gets only the any-size share (the nit\'s pot bet)', () => {
  const was = actionLikelihood(air, bet(19)); // no grid: the old nearest-size rule
  assert.ok(near(was, 0.04 * 0.2), 'the old rule credits air with its 14 share for a bet of 19');
  const now = L(air, 19);
  assert.ok(near(now, 0.04 * SIZE_ANY, 1e-9));
  assert.ok(L(value, 19) / now > 500, 'air against value for the pot bet, hand for hand');
  assert.ok(near(L(air, 29), 0.04 * SIZE_ANY, 1e-9) && near(L(value, 6), 0.7 * SIZE_ANY, 1e-9));
});

test('likelihood: a size between two grid sizes is split between them by closeness', () => {
  const pol = { check: 0.5, raise: 0.5, sizes: [{ to: 10, p: 0.8 }, { to: 14, p: 0.2 }] };
  const l10 = L(pol, 10), l11 = L(pol, 11), l12 = L(pol, 12), l13 = L(pol, 13), l14 = L(pol, 14);
  assert.ok(l10 > l11 && l11 > l12 && l12 > l13 && l13 > l14, 'moves steadily from one size\'s share to the other\'s');
  const mid = Math.sqrt(10 * 14); // the same ratio from both: half each
  assert.ok(near(L(pol, mid), 0.5 * 0.5, 0.02));
  // no jump next to a grid size
  assert.ok(near(L(pol, 10.01), l10, 0.01) && near(L(pol, 13.99), l14, 0.02));
  // between a size the hand has and one it lacks: air's 16 is part 14, part 19 (which air never bets)
  assert.ok(L(air, 16) < L(air, 14) && L(air, 16) > L(air, 19));
});

test('likelihood: a size under the smallest or over the largest reads as the smallest or the largest', () => {
  assert.equal(L(air, 2), L(air, 6));
  assert.equal(L(value, 2), L(value, 6));
  assert.equal(L(value, 150), L(value, 29));
  assert.equal(L(air, 150), L(air, 29));
  assert.ok(L(air, 2) > 20 * L(value, 2) * (0.04 / 0.7), 'a tiny bet is the small size: the hands that bet small');
});

test('likelihood: all-ins. Grid sizes clamped to the stack are one size, and the shove is credited in full', () => {
  // an $80 stack into a $100 pot: 1/3 and 1/2 stay, 3/4 and up are all the shove
  const grid = [33, 50, 80];
  const jam = { fold: 0, check: 0.5, raise: 0.5, sizes: [{ to: 80, p: 1 }] };
  assert.ok(near(actionLikelihood(jam, bet(80), grid), 0.5, 0.001));
  const two = { check: 0.5, raise: 0.5, sizes: [{ to: 33, p: 0.6 }, { to: 80, p: 0.4 }] };
  assert.ok(near(actionLikelihood(two, bet(80), grid), 0.5 * 0.4), 'the shove is not credited with the small size');
  assert.ok(near(actionLikelihood(two, bet(33), grid), 0.5 * 0.6));
  assert.ok(near(actionLikelihood(two, bet(50), grid), 0.5 * SIZE_ANY, 1e-9), 'a size the hand lacks, between two it has');
  // two menu entries of one size add up, never over the chance of betting
  const dup = { check: 0.5, raise: 0.5, sizes: [{ to: 80, p: 0.5 }, { to: 80, p: 0.5 }] };
  assert.ok(near(actionLikelihood(dup, bet(80), grid), 0.5, 0.001));
  // a one-size grid (every size is the shove)
  assert.ok(near(actionLikelihood(jam, bet(80), [80]), 0.5, 0.001) && near(actionLikelihood(jam, bet(40), [80]), 0.5, 0.001));
});

test('likelihood: never over the chance of betting, never zero; other actions and no-grid calls unchanged', () => {
  for (const to of [1, 6, 8, 10, 12, 14, 16, 19, 25, 29, 60, 1000]) for (const pol of [air, value]) {
    const l = L(pol, to);
    assert.ok(l > 0 && l <= pol.raise + 1e-12);
  }
  assert.equal(actionLikelihood(air, { type: 'check' }, GRID), 0.96);
  assert.equal(actionLikelihood(value, { type: 'check' }), 0.3);
  assert.ok(actionLikelihood(air, { type: 'call' }) > 0 && actionLikelihood(air, { type: 'call' }) < 1e-4);
  assert.ok(L({ check: 1, raise: 0, sizes: null }, 10) < 1e-4, 'a hand that never bets');
  // preflop and raises over a bet pass no grid: nearest size on the hand's own menu, as before
  const open = { fold: 0.8, call: 0, raise: 0.2, sizes: [{ to: 15, p: 0.9 }, { to: 22, p: 0.1 }] };
  assert.equal(actionLikelihood(open, { type: 'raise', to: 9 }), 0.2 * 0.9);
  assert.equal(actionLikelihood(open, { type: 'raise', to: 30 }), 0.2 * 0.1);
});

test('likelihood: the grid is every size a hand can bet in the spot, the same for every hand', () => {
  const rng = makeRng(4);
  const s = newHand({ stacks: new Array(8).fill(300), button: 0, sb: 1, bb: 3, rng, rake: { pct: 0, cap: 0, promo: 0, noFlopNoDrop: true } });
  while (s.street === STREET.PRE && !s.done) applyAction(s, s.toAct === 0 ? { type: 'raise', to: 9 } : s.toAct === 2 ? { type: 'call' } : { type: 'fold' }, rng);
  const ctx = buildContext(s);
  const grid = betGrid(ctx);
  assert.deepEqual(grid, [...grid].sort((a, b) => a - b));
  assert.equal(new Set(grid).size, grid.length);
  for (const id of TYPE_IDS) for (let c = 0; c < 1326; c += 7) {
    if (s.board.includes(COMBOS[c][0]) || s.board.includes(COMBOS[c][1])) continue;
    const pol = postflopPolicy(ctx, PROFILES[id], handFeatures(COMBOS[c], s.board));
    for (const sz of pol.sizes || []) assert.ok(grid.includes(sz.to), `${id} bets ${sz.to}, not on the grid ${grid}`);
  }
});

// The line QA-VERDICT found: hero opens the button, a nit calls in the big blind, flop and turn are checked through,
// and the nit leads the river for the pot. Played forward, a nit never bets the pot there without two pair or better.
test('likelihood: a nit\'s pot-sized river lead after two checked streets is not read as air', () => {
  const NIT = TYPE_IDS.indexOf('nit');
  let airShare = 0, strongShare = 0, n = 0;
  for (const seed of [3, 5, 8, 13, 21, 34]) {
    const rng = makeRng(seed);
    const s = newHand({ stacks: new Array(8).fill(300), button: 0, sb: 1, bb: 3, rng, rake: { pct: 0, cap: 0, promo: 0, noFlopNoDrop: true }, hole: [parseCards('Ad Kc'), ...new Array(7).fill(null)] });
    const reads = new Array(8).fill(null);
    reads[2] = newRead(TYPE_IDS.map((id) => (id === 'nit' ? 0.9 : 0.1 / (TYPE_IDS.length - 1))));
    const belief = new HandBelief(reads, s.hole[0]);
    const act = (a) => { belief.setBoard(s.board); if (s.toAct === 2) belief.observe(2, buildContext(s), a); applyAction(s, a, rng); };
    while (s.street === STREET.PRE && !s.done) act(s.toAct === 0 ? { type: 'raise', to: 9 } : s.toAct === 2 ? { type: 'call' } : { type: 'fold' });
    while (s.street < STREET.RIVER && !s.done) act({ type: 'check' });
    if (s.done) continue;
    const pot = buildContext(s).pot;
    act({ type: 'bet', to: pot });
    const w = belief.w[2][NIT];
    let tot = 0, a = 0, st = 0;
    for (let c = 0; c < 1326; c++) {
      if (!w[c]) continue;
      const f = handFeatures(COMBOS[c], s.board);
      tot += w[c];
      if (f.tier <= TIER.HIGH_CARD) a += w[c];
      if (f.tier >= TIER.TWO_PAIR) st += w[c];
    }
    airShare += a / tot; strongShare += st / tot; n++;
  }
  assert.ok(n >= 4);
  assert.ok(airShare / n < 0.03, `air is ${(100 * airShare / n).toFixed(1)}% of the nit's pot-bet range`);
  assert.ok(strongShare / n > 0.93, `two pair or better is ${(100 * strongShare / n).toFixed(1)}%`);
});
