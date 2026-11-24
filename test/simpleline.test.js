// The simple-line floor (MATH, line (a) "fit or fold", CEO): before the river every
// non-fold option keeps the better of the stand-in's play-out and fit-or-fold, past a one-SE guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeDecision, pairedGap } from '../src/trainer/judge.js';
import { build } from '../scripts/gradeall.js';

// the owner's hand 551 (QA's h551s spot): TT isolates to $21, the station on the button 3-bets to $90
const H551 = { id: 'H551', button: 3, hole: 'Ts Th', board: '', seats: { 3: 'station', 6: 'pool', 7: 'pool' }, conf: { 3: 0.85 }, stacks: { 0: 1405, 3: 413 }, line: '6c 7c 0r21 3r90 6f 7f' };
const callVsFold = (simpleLine) => {
  const { s, belief } = build(H551);
  const v = judgeDecision(s, 0, belief, null, { samples: 1000, seed: 551, simpleLine });
  const call = v.options.findIndex((o) => o.type === 'call');
  const fold = v.options.findIndex((o) => o.type === 'fold');
  return { loss: pairedGap(v, fold, call).mean, simple: !!v.options[call].simple };
};

test("hand 551: the call's loss drops from red (over $36.3) to yellow once a fit-or-fold line may replace the stand-in", () => {
  const off = callVsFold(false);
  const on = callVsFold(true);
  assert.ok(off.loss > 36.3, `floor off: ${off.loss.toFixed(1)}`);
  assert.ok(on.loss < 36.3 && on.loss > 0, `floor on: ${on.loss.toFixed(1)}`);
  assert.equal(on.simple, true);
  assert.equal(off.simple, false);
});

test('on the river nothing changes: no option takes the simple line', () => {
  const { s, belief } = build({ id: 'R', button: 0, hole: 'Ad 8d', board: 'As 8h 4c Jd 2s', seats: { 7: 'station', 2: 'station' }, line: '7c 0r15 2c 7c | 2x 7x 0b25 2c 7c | 2x 7x' });
  const v = judgeDecision(s, 0, belief, null, { samples: 300, seed: 5 });
  assert.ok(v.options.every((o) => !o.simple));
});
