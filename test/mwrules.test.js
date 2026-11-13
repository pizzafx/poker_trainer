// Coach rules from the multiway spec round (Nov 2026) that are not covered by scripts/mwbench.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREET, legal } from '../src/engine/game.js';
import { handFeatures, TIER } from '../src/engine/features.js';
import { POS } from '../src/bots/policy.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { limpOutsideTipFor, robustVerdict, anchorStatus, applyAnchors, needOf } from '../src/trainer/grade.js';
import { build, gradeAll } from '../scripts/gradeall.js';
import { SPOTS } from '../scripts/mwbench_spots.js';
import { explain, anchorLine } from '../src/trainer/explain.js';
import { buildContext } from '../src/bots/policy.js';

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

// MATH_BASELINE_SPEC 1: works / about break-even / fails, with the two-standard-error guard.
test('anchors: a play works, breaks even or fails on its own numbers', () => {
  const v = { anchors: { n: 3000, Q: 0.5, price: 0.2 } };
  const made = { tier: TIER.TOP_PAIR_GOOD, drawEquity: 0 };
  const air = { tier: TIER.HIGH_CARD, drawEquity: 0.02 };
  const draw = { tier: TIER.HIGH_CARD, drawEquity: 0.32 };
  const bet = (o) => ({ type: 'raise', to: 50, ...o });
  // value: ahead when called against what k callers need
  assert.equal(anchorStatus(bet({ W: 0.8, need: 0.45, called: 1500, F: 0.1, alpha: 0.35 }), v, made, 2), 'works');
  assert.equal(anchorStatus(bet({ W: 0.5, need: 0.45, called: 1500, F: 0.1, alpha: 0.35 }), v, made, 2), 'even');
  assert.equal(anchorStatus(bet({ W: 0.3, need: 0.45, called: 1500, F: 0.1, alpha: 0.35 }), v, made, 2), 'fails');
  assert.equal(anchorStatus(bet({ W: 0.4, need: 0.45, called: 30, F: 0.1, alpha: 0.35 }), v, made, 2), 'even', 'too few calls to tell');
  // nothing: folds against alpha; above it only by a margin
  assert.equal(anchorStatus(bet({ F: 0.45, alpha: 0.35, W: 0.05, need: 0.4, called: 900 }), v, air, 2), 'works');
  assert.equal(anchorStatus(bet({ F: 0.34, alpha: 0.35, W: 0.05, need: 0.4, called: 900 }), v, air, 2), 'even');
  assert.equal(anchorStatus(bet({ F: 0.1, alpha: 0.6, W: 0.05, need: 0.4, called: 900 }), v, air, 2), 'fails');
  // a draw works on folds or on its own equity
  assert.equal(anchorStatus(bet({ F: 0.02, alpha: 0.42, W: 0.01, need: 0.3, called: 900 }), v, draw, 2), 'works');
  assert.equal(anchorStatus(bet({ F: 0.02, alpha: 0.42, W: 0.01, need: 0.4, called: 900 }), v, draw, 2), 'fails');
  // a call: ahead right now against the price
  assert.equal(anchorStatus({ type: 'call' }, v, made, 2), 'works');
  assert.equal(anchorStatus({ type: 'call' }, { anchors: { n: 3000, Q: 0.05, price: 0.3 } }, made, 2), 'fails');
  assert.equal(anchorStatus({ type: 'check' }, v, made, 2), 'works');
});

// QA E1: a "fine" verdict's estimate line uses the same classification as the grade: a break-even
// bet gets the break-even wording, a failing one (within the flag bar) says it does not work.
test('estimate lines agree with the grade (F05, F06, F14)', () => {
  let checked = 0;
  for (const id of ['F05', 'F06', 'F14']) {
    const { s, belief, env } = build(SPOTS.find((x) => x.id === id));
    const opts = { samples: 1500, seed: 5 };
    const v0 = judgeDecision(s, 0, belief, null, opts);
    const hf = handFeatures(s.hole[0], s.board);
    const ctx = buildContext(s);
    for (const r of gradeAll(s, v0, opts, env)) {
      const e = explain({ verdict: r.v, street: s.street, tier: hf.tier, drawEquity: hf.drawEquity, opponents: s.folded.filter((f, i) => i && !f).length, toCall: ctx.toCall, raises: ctx.raises, board: s.board, villain: null });
      if (r.v.note === 'anchorEven') {
        checked++;
        assert.match(e.anchor, /breaks even|thin/, `${id} ${r.o.label}: ${e.anchor}`);
      }
      if (r.v.note === 'anchorFails') {
        checked++;
        assert.match(e.headline, /does not work/);
        assert.match(e.anchor, /Do not bluff|call with better/, `${id} ${r.o.label}: ${e.anchor}`);
      }
      if (e.anchor) assert.doesNotMatch(e.anchor, /only almost never/);
    }
  }
  assert.ok(checked >= 4, `${checked} anchor notes checked`);
});

// QA F1 (hand 37): A4's "close, not graded" covers only the call and the fold; a raise $52 below the
// call keeps its flag. Hand 37's numbers on a real facing-a-bet spot (F10's board and players).
test('A4 never ungrades a raise outside the close call-or-fold pair (QA hand 37)', () => {
  const { s } = build(SPOTS.find((x) => x.id === 'F10'));
  const ctx = buildContext(s);
  const mk = (mine, grade) => ({
    options: [{ type: 'fold', ev: 0 }, { type: 'call', ev: 6.6 }, { type: 'raise', to: 122, ev: -45.6, F: 0.02, alpha: 0.45, W: 0.2, need: 0.4, called: 500, R: 0 }],
    best: 1, mine, grade, loss: mine === 2 ? 52 : 0, se: 2, sameKind: false, pot: 25, small: 9, anchors: { n: 1500, Q: 0.04, price: 0.3, topSizeBest: false },
  });
  const raise = mk(2, 'blunder');
  applyAnchors(raise, s, ctx);
  assert.equal(raise.grade, 'blunder');
  assert.notEqual(raise.note, 'closeCall');
  const call = mk(1, 'good'); // the call the close rule is about: not graded
  call.options[0].ev = 8; // the judge's best is a fold
  call.best = 0;
  call.anchors.Q = 0.6;
  applyAnchors(call, s, ctx);
  assert.equal(call.note, 'closeCall');
});

// QA F3: every template at every bucket: no "almost never of the time", no "get almost never", and no
// number under 5% or over 95%.
test('estimate wording at the extreme buckets reads properly in every template', () => {
  const vals = [0.01, 0.5, 0.99];
  const lines = [];
  const opp = { type: 'raise', to: 60 };
  for (const F of vals) for (const alpha of [0.3, 0.6]) for (const W of [...vals, null]) for (const need of [0.03, 0.4]) {
    for (const st of ['works', 'even', 'fails']) {
      for (const tier of [TIER.HIGH_CARD, TIER.TOP_PAIR_GOOD]) for (const line of ['auto', '5']) for (const toCall of [0, 20]) {
        const o = { ...opp, ev: 5, F, alpha, W, need: W === null ? null : need, called: W === null ? 0 : 100, st };
        const v = { line, anchors: { n: 1000, Q: F, price: need, topSizeBest: false }, options: [{ type: 'check', ev: 0, st: 'works' }, o], mine: 1, best: 1, grade: 'good', small: 9 };
        lines.push(anchorLine({ verdict: v, street: 2, tier, drawEquity: 0, opponents: 2, toCall, raises: 1 }));
        // a call or fold facing a bet, and a check measured against the bet
        const vc = { line: 'auto', anchors: { n: 1000, Q: F, price: need }, options: [{ type: 'fold', ev: 0 }, { type: 'call', ev: 1, st }], mine: 1, best: 1, grade: 'good', small: 9 };
        lines.push(anchorLine({ verdict: vc, street: 2, tier, drawEquity: tier === TIER.HIGH_CARD ? F : 0, opponents: 2, toCall: 10, raises: 1 }));
        const vk = { ...v, mine: 0, grade: 'mistake' };
        lines.push(anchorLine({ verdict: vk, street: 3, tier, drawEquity: 0, opponents: 2, toCall: 0, raises: 0 }));
      }
    }
  }
  const text = lines.filter(Boolean);
  assert.ok(text.length > 500, `${text.length} lines`);
  for (const l of text) {
    assert.doesNotMatch(l, /almost (never|always) of the time|get almost never|need almost never|fold almost (never|always) of|only almost/, l);
    for (const m of l.matchAll(/(\d+)%/g)) assert.ok(+m[1] >= 5 && +m[1] <= 95, `${m[0]} in: ${l}`);
  }
});

// MATH, 13 Nov addendum: no river tolerances, a river bluff must beat checking, a call's tolerance
// shrinks with a small price, and "about break-even" only vetoes small, pre-river flags.
test('anchors, 13 Nov rules: river exactness, beating the check, small prices, the even veto', () => {
  const made = { tier: TIER.TOP_PAIR_GOOD, drawEquity: 0 };
  const air = { tier: TIER.HIGH_CARD, drawEquity: 0 };
  // QA hand 24: almost never ahead against a 10% price, before the river: now "fails" (was "even")
  assert.equal(anchorStatus({ type: 'call' }, { street: 2, anchors: { n: 1000, Q: 0.02, price: 0.1 } }, made, 2), 'fails');
  // river value bet: ahead 50% against a 45% need works on the river (no 10-point margin), not on the turn
  const vb = { type: 'raise', to: 50, W: 0.5, need: 0.45, called: 3000, F: 0.1, alpha: 0.3 };
  assert.equal(anchorStatus(vb, { street: 3, anchors: { n: 3000 }, options: [] }, made, 2), 'works');
  assert.equal(anchorStatus(vb, { street: 2, anchors: { n: 3000 }, options: [] }, made, 2), 'even');
  // river bluff: it must fold enough to beat the check's value
  const v = { street: 3, pot: 100, anchors: { n: 3000 }, options: [{ type: 'check', ev: 40 }] };
  const b = { type: 'raise', to: 50, F: 0.45, alpha: 50 / 150 };
  assert.ok(Math.abs(needOf(b, v) - 90 / 150) < 1e-9, `need ${needOf(b, v)}`);
  assert.equal(anchorStatus(b, v, air, 2), 'fails'); // 45% of folds against 60% needed
  assert.equal(needOf(b, { ...v, street: 2 }), b.alpha);
  // a flag on the river is not vetoed by "about break-even"
  const { s } = build(SPOTS.find((x) => x.id === 'R05'));
  const ctx = buildContext(s);
  const flag = { options: [{ type: 'check', ev: 30 }, { type: 'raise', to: 13, ev: 5, F: 0.1, alpha: 0.5, W: 0.48, need: 0.5, called: 400 }], best: 0, mine: 1, grade: 'mistake', loss: 25, se: 2, sameKind: false, pot: 13, small: 9, street: 3, anchors: { n: 780, topSizeBest: false } };
  applyAnchors(flag, s, ctx);
  assert.equal(flag.grade, 'mistake');
  assert.equal(flag.line, null, 'no "close" line under a standing flag');
});
