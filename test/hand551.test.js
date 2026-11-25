// The owner's hand 551 (QA's h551s spot): TT isolates to $21, the station on the button 3-bets to $90. Calling is red
// against the stand-in's play-out; the simple-line floor that made it yellow is pulled pending its v2 (STRAT, CEO).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeDecision, pairedGap } from '../src/trainer/judge.js';
import { build } from '../scripts/gradeall.js';

const H551 = { id: 'H551', button: 3, hole: 'Ts Th', board: '', seats: { 3: 'station', 6: 'pool', 7: 'pool' }, conf: { 3: 0.85 }, stacks: { 0: 1405, 3: 413 }, line: '6c 7c 0r21 3r90 6f 7f' };

test("hand 551: the call's loss against the fold is red (over $36.3) with the stand-in's play-out, and no option takes a simple line", () => {
  const { s, belief } = build(H551);
  const v = judgeDecision(s, 0, belief, null, { samples: 1000, seed: 551 });
  const call = v.options.findIndex((o) => o.type === 'call');
  const fold = v.options.findIndex((o) => o.type === 'fold');
  const loss = pairedGap(v, fold, call).mean;
  assert.ok(loss > 36.3, `loss ${loss.toFixed(1)}`);
  assert.ok(v.options.every((o) => !o.simple));
});
