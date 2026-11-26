// The verdict checker's fast subset (the full run is `node scripts/verdictcheck.js`): a few hundred
// decisions across the four styles, full ring and heads-up, a home game, every invariant at zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConfig, INVARIANTS } from '../scripts/verdictcheck.js';

const CONFIGS = [
  { style: 'sensible', game: '1/2', seats: 9, hands: 14, seed: 101 },
  { style: 'passive', game: '2/3', seats: 9, hands: 14, seed: 102 },
  { style: 'aggressive', game: '2/5', seats: 9, hands: 14, seed: 103 },
  { style: 'limper', game: '1/2', seats: 9, hands: 14, seed: 104 },
  { style: 'aggressive', game: '1/2', seats: 2, hands: 14, seed: 105 },
  { style: 'passive', home: true, hands: 10, seed: 106 },
];

test('verdict checker: no verdict breaks an invariant (fast subset)', () => {
  let decisions = 0;
  const bad = [];
  for (const cfg of CONFIGS) {
    const r = runConfig({ ...cfg, samples: 250 });
    decisions += r.decisions;
    for (const { invariant, record } of r.violations) bad.push(`${invariant} | ${cfg.style} ${cfg.home ? 'home' : cfg.game} hand ${record.hand}: ${record.headline}`);
  }
  assert.ok(decisions >= 100, `${decisions} decisions`);
  assert.deepEqual(bad, []);
});

// P7-1b and P7-1c (STRAT, batch 20 gate): the two "bets still to come" lines are checked separately
const P71B = 'P7-1b line 8a ("bets still to come") only when the judge prefers the fold';
const P71C = 'P7-1c "cost more than that edge. Fold." only when fold beats the call and E covers the price';
const LINE564 = "You'd win about 45% if it went to showdown and need 25%, but the bets still to come from these players cost more than that edge. Fold.";
// batch 20's gate hand (passive home game, seed 20, hand 55): A♦8♠ on 9♥ 2♦ 4♦, a fine fold
const rec = (E, callEv, extra = {}) => {
  const v = { grade: 'good', note: 'bluffRaise', mine: 0, best: 0, options: [{ type: 'fold', label: 'Fold', ev: 0 }, { type: 'call', label: 'Call $40', ev: callEv }, { type: 'raise', label: 'All-in $170 (4.3x)', ev: 18.1 }], runout: { E, hu: true }, anchors: { price: 0.25 }, ...extra };
  return [{ anchor: LINE564, verdict: v }, v];
};

test('verdict checker P7-1b: the line that names the fold and the bets still to come is not line 8a (batch 20 gate hand)', () => {
  const [d, v] = rec(0.45, -7.8);
  assert.equal(INVARIANTS[P71B](d, v), false);
  assert.equal(INVARIANTS[P71C](d, v), false, 'fold beats the call and E (45%) covers the price (25%)');
});

test('verdict checker P7-1b still catches line 8a when the judge does not prefer the fold', () => {
  const [d, v] = rec(0.45, -7.8, { line: '8a', a4: { raw: 'call' } });
  d.anchor = 'Close. The price is right for a call, but the bets still to come take most of that back. Nothing here is graded.';
  assert.equal(INVARIANTS[P71B](d, v), true);
  v.a4 = { raw: 'fold' };
  assert.equal(INVARIANTS[P71B](d, v), false);
});

test('verdict checker P7-1c flags "that edge" when E is under the price, or when the call beats the fold', () => {
  const [d1, v1] = rec(0.2, -7.8);
  assert.equal(INVARIANTS[P71C](d1, v1), true, 'E 20% < price 25%: there is no edge to cost');
  const [d2, v2] = rec(0.45, 3);
  assert.equal(INVARIANTS[P71C](d2, v2), true, 'the call is the better of call and fold');
  const [d3, v3] = rec(undefined, -7.8);
  assert.equal(INVARIANTS[P71C](d3, v3), true, 'no E: the line has no figure to stand on');
});
