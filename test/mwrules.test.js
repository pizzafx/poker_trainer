// Coach rules from the multiway spec round (Nov 2026) that are not covered by scripts/mwbench.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREET, legal } from '../src/engine/game.js';
import { handFeatures, TIER } from '../src/engine/features.js';
import { POS } from '../src/bots/policy.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { limpOutsideTipFor, robustVerdict } from '../src/trainer/grade.js';
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

// STRAT (Nov 2026): folding one pair to a passive player's lead with a caller in is fine only when the
// lead is a quarter of the pot or more; against a smaller lead the fold is graded as usual.
test('R5b fold guard: the T05 spot with a lead under 25% of the pot grades the fold normally', () => {
  const t05 = (lead) => ({ id: 'T05', button: 0, hole: 'Qd Qh', board: '8s 5d 2c Jc 4h', seats: { 7: 'abc', 2: 'station' }, line: `7c 0r15 2c 7c | 2x 7x 0b25 2c 7c | 2b${lead} 7c` });
  const foldOf = (lead) => {
    const { s, belief, env } = build(t05(lead));
    const opts = { samples: 1500, seed: 5 };
    const v0 = judgeDecision(s, 0, belief, null, opts);
    return { fold: gradeAll(s, v0, opts, env).find((r) => r.o.type === 'fold'), pot: v0.pot, bets: s.bet.reduce((a, x) => a + x, 0) };
  };
  const small = foldOf(15); // STRAT's case: $15 into the pot, about 7 to 1
  assert.ok(15 < 0.25 * (small.pot - small.bets), `lead is under a quarter of the pot (${small.pot - small.bets})`);
  assert.notEqual(small.fold.v.note, 'passiveFold');
  assert.notEqual(small.fold.v.grade, 'good', 'folding queens to a small lead is flagged');
  const big = foldOf(45); // the benchmark's T05
  assert.equal(big.fold.v.grade, 'good');
  assert.equal(big.fold.v.note, 'passiveFold');
});

// QA M1 (hand 60): "not a habit to build" is for plays near the top, never a waiver for real losses.
test('a deep shove with a weak pair into a station\'s river lead and two callers is red, not "fine"', () => {
  const spot = { id: 'h60', button: 0, hole: 'Ac 5d', board: 'Kh 9d 5s 3c 2h', seats: { 3: 'beginner', 7: 'abc', 2: 'station' }, stacks: { 0: 1200, 2: 1200, 3: 1200, 7: 1200 },
    line: '3c 7c 0c 2x | 2x 3x 7x 0x | 2x 3x 7x 0x | 2b12 3c 7c' };
  const { s, belief, env } = build(spot);
  assert.equal(s.street, STREET.RIVER);
  assert.equal(handFeatures(s.hole[0], s.board).tier, TIER.WEAK_PAIR);
  const opts = { samples: 780, seed: 5 };
  // the trainee shoves: the judge adds that size to the options it compares, as in the app
  const v0 = judgeDecision(s, 0, belief, { type: 'raise', to: legal(s).maxTo }, opts);
  const rows = gradeAll(s, v0, opts, env);
  const shove = rows[rows.length - 1];
  assert.equal(shove.o.type, 'raise');
  assert.ok(shove.o.to > 1000, `the shove is ${shove.o.to}`);
  assert.equal(shove.v.grade, 'blunder');
  assert.notEqual(shove.v.note, 'mwHabit');
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

// MATH (Nov 2026): a play no single option beats everywhere, but which trails each scenario's best by
// 1.5 bars or more, is a yellow flag naming no option; at 1.4 bars it is not graded.
test('scenario test: the no-named-option flag needs 1.5 bars in every scenario', () => {
  // options: 0 mine (a call), 1 fold, 2 raise; the best alternates between fold and raise
  const opts = (scen) => robustVerdict(scen, 0, { usable: [false, true, true], bar: () => 9, significant: () => true, kind: (i) => ['call', 'fold', 'raise'][i], small: 9, notHabit: [true, true, true] });
  const fires = opts([[0, 14, 0], [0, 0, 14], [0, 14, 0]]); // trails the best by 14 = 1.56 bars each time
  assert.equal(fires.pick, -1);
  assert.equal(fires.dominated, 14);
  const quiet = opts([[0, 12.6, 0], [0, 0, 12.6], [0, 12.6, 0]]); // 1.4 bars
  assert.equal(quiet.dominated, undefined);
  assert.equal(quiet.unclear, true, 'the best kind changes: not graded');
  // and one option beating it by the bar everywhere is named instead
  const named = opts([[0, 10, 20], [0, 9.5, 12], [0, 11, 9.2]]);
  assert.equal(named.pick, 1);
});
