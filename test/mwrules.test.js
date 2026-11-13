// Coach rules from the multiway spec round (Nov 2026) that are not covered by scripts/mwbench.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREET } from '../src/engine/game.js';
import { handFeatures, TIER } from '../src/engine/features.js';
import { POS } from '../src/bots/policy.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { limpOutsideTipFor } from '../src/trainer/grade.js';
import { build, gradeAll } from '../scripts/gradeall.js';

// STRAT: a call before the river with top pair or better and a draw is yellow at most, at any size.
test('top pair good kicker plus an open-ended draw, facing a nit\'s pot-sized turn bet: the call is never red', () => {
  const spot = { id: 'tp+oesd', button: 0, hole: 'Qs Jd', board: 'Qh Tc 4d 9s 2c', seats: { 2: 'nit' }, line: '0r9 2c | 2x 0b12 2c | 2b43' };
  const { s, belief, env } = build(spot);
  assert.equal(s.street, STREET.TURN);
  const hf = handFeatures(s.hole[0], s.board);
  assert.ok(hf.tier >= TIER.TOP_PAIR_WEAK && hf.drawEquity >= 0.14, `tier ${hf.tier}, draw ${hf.drawEquity}`);
  const opts = { samples: 1500, seed: 5 };
  const v0 = judgeDecision(s, 0, belief, null, opts);
  const call = gradeAll(s, v0, opts, env).find((r) => r.o.type === 'call');
  assert.ok(call, 'a call option');
  assert.notEqual(call.v.grade, 'blunder');
  // and the same rule on a verdict built to be red: the call far behind folding
  const forced = gradeAll(s, { ...v0, options: v0.options.map((o) => ({ ...o, ev: o.type === 'call' ? -300 : o.type === 'fold' ? 0 : -50 })) }, opts, env).find((r) => r.o.type === 'call');
  assert.notEqual(forced.v.grade, 'blunder');
});

// QA L1: a limp with a hand outside the Standard range, when the limp tip is vetoed, gets the
// outside-Standard tip instead; a dollar figure only when folding was clearly better.
test('a vetoed limp tip on an outside-Standard hand becomes the "usually a fold" tip', () => {
  const ctx = { street: STREET.PRE, raises: 0, limpers: 0, pos: POS.EP };
  const v = (foldEv, se) => ({ grade: 'good', mine: 1, best: 1, se, options: [{ type: 'fold', ev: foldEv }, { type: 'call', ev: 0 }, { type: 'raise', to: 12, ev: -4 }] });
  const plain = limpOutsideTipFor(v(1, 2), ctx, 'K7o', 'early');
  assert.equal(plain.kind, 'wideOpen');
  assert.equal(plain.where, 'early position');
  assert.equal(plain.text, 'K7o is outside the Standard range from early position; most players fold it here.');
  assert.match(limpOutsideTipFor(v(6, 0.5), ctx, 'K7o', 'early').text, /Here folding was about \$6 better\.$/);
  assert.equal(limpOutsideTipFor(v(1, 2), ctx, 'AKo', 'early'), null, 'inside the Standard range: no tip');
});
