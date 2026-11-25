// The judge's budget extension (MATH, CEO): when the time budget is first found spent and the trainee's
// option trails the best by the plain yellow bar or more, sampling goes on to 800, for at most one more budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeDecision } from '../src/trainer/judge.js';
import { build } from '../scripts/gradeall.js';

// a fake clock: the first reading starts the budget, every later one finds it spent
function withSpentClock(fn) {
  const real = performance.now.bind(performance);
  let calls = 0;
  performance.now = () => (calls++ === 0 ? 0 : 1e9);
  try {
    return fn();
  } finally {
    performance.now = real;
  }
}

const spot = { id: 'KcAs', button: 2, hole: 'Kc As', board: '7h Js Ac', seats: { 5: 'station', 6: 'abc', 7: 'station' }, conf: { 5: 0.79, 6: 0.74, 7: 0.84 }, stacks: { 0: 200, 5: 155, 6: 258, 7: 53 }, line: '5c 6c 7c 0r9 5c 6c 7c | 5x 6x 7x' };

test('a trainee option a yellow bar or more behind the best keeps sampling to 800, marked extended', () => {
  const { s, belief } = build(spot);
  const v = withSpentClock(() => judgeDecision(s, 0, belief, { type: 'check' }, { samples: 1000, seed: 5, budgetMs: 2000 }));
  const gap = v.options[v.best].ev - v.options[v.mine].ev;
  assert.ok(gap >= Math.max(3 * s.bbAmt, 0.1 * v.pot), `gap ${gap.toFixed(1)}`);
  assert.equal(v.samples, 800);
  assert.equal(v.extended, true);
  assert.equal(v.cutAt, 224); // a clock that stands still never trips the cap
});

test('a trainee option within the bar stops where the budget ran out (224), not extended', () => {
  const { s, belief } = build(spot);
  const first = judgeDecision(s, 0, belief, null, { samples: 600, seed: 5 });
  const bestOpt = first.options[first.best];
  const act = bestOpt.type === 'raise' ? { type: 'raise', to: bestOpt.to } : { type: bestOpt.type };
  const v = withSpentClock(() => judgeDecision(s, 0, belief, act, { samples: 1000, seed: 5, budgetMs: 2000 }));
  assert.equal(v.samples, 224);
  assert.equal(v.extended, false);
});

test('with no budget nothing changes: full samples, not extended', () => {
  const { s, belief } = build(spot);
  const v = judgeDecision(s, 0, belief, { type: 'check' }, { samples: 300, seed: 5 });
  assert.equal(v.samples, 300);
  assert.equal(v.extended, false);
});

// MATH, CEO: the cap. A clock that reads 0 at the start, 3000 ms when the budget (2000) is found spent at 224 samples,
// then 500 ms more at each 32-sample check: the extension stops at the first check past one more budget (2500 > 2000),
// at 384 samples, with the samples in hand
test('the extension stops after one more budget on a clock that keeps running, keeping its samples', () => {
  const { s, belief } = build(spot);
  const real = performance.now.bind(performance);
  let calls = 0;
  performance.now = () => {
    const k = calls++;
    return k === 0 ? 0 : 3000 + 500 * (k - 1);
  };
  let v;
  try {
    v = judgeDecision(s, 0, belief, { type: 'check' }, { samples: 1000, seed: 5, budgetMs: 2000 });
  } finally {
    performance.now = real;
  }
  assert.equal(v.extended, true);
  assert.equal(v.cutAt, 224);
  assert.equal(v.samples, 384);
  assert.equal(v.samples % 32, 0);
});
test('with no budget the cap never applies: the same verdict as before, no cutAt', () => {
  const { s, belief } = build(spot);
  const a = judgeDecision(s, 0, belief, { type: 'check' }, { samples: 400, seed: 5 });
  assert.equal(a.samples, 400);
  assert.equal(a.extended, false);
  assert.equal('cutAt' in a, false);
});
