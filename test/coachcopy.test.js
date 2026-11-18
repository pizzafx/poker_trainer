// Coach copy pinned on real records (QA-VERDICT's finds on 5b5dbdc)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explain, shownCost } from '../src/trainer/explain.js';
import { valueGain } from '../src/trainer/grade.js';

test('YB-V4b: an A2 headline does not cite the estimate below when that line is about the call (STRAT)', () => {
  const d = JSON.parse(readFileSync(new URL('./fixtures/records/ybv4b-a2.json', import.meta.url), 'utf8'));
  const e = explain(d);
  assert.equal(e.headline, 'Fold: fine. (All-in $875 scores about $192 more against these bots, but it is not a play that works against anyone here. Against call $295, folding gives up too little to flag.)');
  assert.doesNotMatch(e.headline, /estimate below/);
});

test('V4: a call flagged by the money-in rule shows a cost of at most its price', () => {
  const v = { grade: 'mistake', mine: 1, best: 0, priceCap: 16, options: [{ ev: 0 }, { ev: -19.4 }] };
  assert.equal(shownCost(v), 16);
});

test('YB-C: a value bet raised two-thirds of the time is not "works" (MATH value test)', () => {
  // the river spot: C 0.291, R 0.678, W 0.78 when called, need 0.5, a third of the pot
  const o = { type: 'raise', F: 0.031, R: 0.678, C: 0.291, W: 0.78, need: 0.5, alpha: 0.248 };
  assert.ok(valueGain(o) < 0);
  assert.ok(Math.abs(valueGain(o) - -0.17) < 0.02);
  // called more than raised, ahead when called: it works
  assert.ok(valueGain({ ...o, R: 0.05, C: 0.9 }) > 0);
});
