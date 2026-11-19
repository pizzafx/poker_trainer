// STRAT L4 (CURR, PRO's P1 blind check): folding a raising hand behind limpers gets a tip, never a flag.
// Rule-based: it fires unless the judge clearly prefers the fold, or the limp, to the best raise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREET } from '../src/engine/game.js';
import { POS } from '../src/bots/policy.js';
import { isoFoldTipFor, isoFoldHand, ISO_FOLD, gradeDecision } from '../src/trainer/grade.js';
import { build } from '../scripts/gradeall.js';
import { isoTo, candidateActions } from '../src/trainer/judge.js';
import { isoQuote } from '../src/trainer/grade.js';

// A graded-fine fold: fold, limp (call $3), raise to $12 and to $18, with one standard error for every gap.
function verdict({ limp = -1, r12 = 3, r18 = 2.5, mine = 0, grade = 'good', se = 1 } = {}) {
  return {
    grade,
    mine,
    best: 2,
    se,
    options: [
      { type: 'fold', ev: 0, label: 'Fold' },
      { type: 'call', ev: limp, label: 'Call $3' },
      { type: 'raise', to: 12, ev: r12, label: 'Raise to $12' },
      { type: 'raise', to: 18, ev: r18, label: 'Raise to $18' },
    ],
  };
}
const behind = (pos, limpers = 1) => ({ street: STREET.PRE, raises: 0, limpers, pos });

test('L4: AJo folded on the button behind a limper gets the isolation tip; the dollar figure only when raising clears', () => {
  const tip = isoFoldTipFor(verdict({ r12: 6, r18: 5, se: 1 }), behind(POS.LP, 1), 'AJo', 'button');
  assert.equal(tip.kind, 'isoFold');
  assert.equal(tip.to, 12);
  assert.equal(tip.text, 'AJo is a raise behind limpers from the button: most players isolate with it here, to about $12. Here raising was about $6 better.');
  // the raise ahead but inside the noise: the tip still fires (rule-based), without the dollar figure
  const quiet = isoFoldTipFor(verdict({ r12: 1.5, r18: 1, se: 1 }), behind(POS.LP, 1), 'AJo', 'button');
  assert.equal(quiet.text, 'AJo is a raise behind limpers from the button: most players isolate with it here, to about $12.');
  // ahead by 2.2 SE but under $1: no dollar figure either
  assert.doesNotMatch(isoFoldTipFor(verdict({ r12: 0.8, r18: 0, se: 0.1 }), behind(POS.LP, 1), 'AJo', 'button').text, /better/);
});

test('L4: silent when the judge clearly prefers the fold, or the limp, to the best raise', () => {
  assert.equal(isoFoldTipFor(verdict({ r12: -4, r18: -5, se: 1 }), behind(POS.LP, 1), 'KQo', 'cutoff'), null, 'the fold clearly ahead');
  assert.ok(isoFoldTipFor(verdict({ r12: -0.8, r18: -2, se: 1 }), behind(POS.LP, 1), 'KQo', 'cutoff'), 'the fold ahead by under 1 SE: still a tip');
  assert.equal(isoFoldTipFor(verdict({ r12: -1.5, r18: -2, se: 1 }), behind(POS.LP, 1), 'KQo', 'cutoff'), null, 'the fold ahead by over 1 SE (MATH, STRAT): silent');
  assert.equal(isoFoldTipFor(verdict({ limp: 6, r12: 2, r18: 1, se: 1 }), behind(POS.LP, 1), 'KQo', 'cutoff'), null, 'the limp clearly ahead');
});

test('L4: only on a fold, behind one or more limpers with no raise, outside the blinds, graded fine', () => {
  const v = () => verdict({ r12: 6, se: 1 });
  assert.equal(isoFoldTipFor(verdict({ r12: 6, se: 1, mine: 1 }), behind(POS.LP, 1), 'AJo', 'button'), null, 'a limp, not a fold');
  assert.equal(isoFoldTipFor(v(), behind(POS.LP, 0), 'AJo', 'button'), null, 'first in');
  assert.equal(isoFoldTipFor(v(), { ...behind(POS.LP, 1), raises: 1 }, 'AJo', 'button'), null, 'facing a raise');
  assert.equal(isoFoldTipFor(v(), behind(POS.SB, 1), 'AJo', 'sb'), null, 'the blinds');
  assert.equal(isoFoldTipFor(v(), behind(POS.BB, 1), 'AJo', 'bb'), null, 'the blinds');
  assert.equal(isoFoldTipFor({ ...v(), grade: 'mistake' }, behind(POS.LP, 1), 'AJo', 'button'), null, 'a flagged decision');
  assert.equal(isoFoldTipFor({ ...v(), options: v().options.slice(0, 2) }, behind(POS.LP, 1), 'AJo', 'button'), null, 'no raise offered');
});

test('L4: ISO_FOLD is ISO_LIMP, STRONG_LIMP and ATs KJs KTs QJs at every limper count; KJo and ATo never from early position', () => {
  for (const g of ['early', 'middle', 'cutoff', 'button']) {
    for (const h of ['AJo', 'KQo', 'AA', '99', 'AQo', 'KQs', 'ATs', 'KJs', 'KTs', 'QJs', '88', '77']) assert.ok(isoFoldHand(h, g, 1), `${h} ${g}`);
    // KJo and ATo: not from early position at any limper count (STRAT)
    for (const h of ['KJo', 'ATo']) for (const n of [1, 2]) assert.equal(isoFoldHand(h, g, n), g !== 'early', `${h} ${g} ${n}`);
    for (const h of ['66', 'K9o', 'QTo', 'JTs', 'A5s']) assert.ok(!isoFoldHand(h, g, 2), `${h} ${g}`);
    // behind 3+ limpers the full list (PRO, 19 Nov), still without KJo and ATo from early position
    for (const h of ['88', '77']) assert.ok(isoFoldHand(h, g, 3) && isoFoldHand(h, g, 5), `${h} ${g} 3+`);
    for (const h of ['ATo', 'KJo']) assert.equal(isoFoldHand(h, g, 3), g !== 'early', `${h} ${g} 3+`);
    for (const h of ['AJo', 'KQo', 'KTs']) assert.ok(isoFoldHand(h, g, 4), `${h} ${g} 4`);
  }
  assert.deepEqual(Object.keys(ISO_FOLD), ['early', 'middle', 'cutoff', 'button']);
  assert.equal(isoFoldTipFor(verdict({ r12: 6, se: 1 }), behind(POS.LP, 2), '66', 'button'), null);
});

test('L4 pairs: 77 and 88 folded behind 3+ limpers get the raise-or-limp copy; the dollar figure only when the better clears the fold (PRO)', () => {
  // the limp ahead of the raise: still the pair copy (both are fine there), $Y is the limp over the fold
  const tip = isoFoldTipFor(verdict({ limp: 5, r12: 3, r18: 2, se: 1 }), { ...behind(POS.LP, 3), base: 2, bb: 2 }, '88', 'button');
  assert.equal(tip.kind, 'isoFoldPair');
  assert.equal(tip.text, '88 plays behind limpers from the button: raise to isolate, to about $18, or limp behind for set value; folding throws away a profitable hand. Here folding gave up about $5.');
  // inside the noise: no dollar figure; the fold clearly ahead of both: silent
  assert.doesNotMatch(isoFoldTipFor(verdict({ limp: 1, r12: 0.5, r18: 0, se: 1 }), behind(POS.LP, 3), '77', 'cutoff').text, /gave up/);
  assert.equal(isoFoldTipFor(verdict({ limp: -3, r12: -4, r18: -5, se: 1 }), behind(POS.LP, 3), '77', 'cutoff'), null);
  // behind 1-2 limpers, and other hands behind 3+: the single-raise copy
  assert.equal(isoFoldTipFor(verdict({ r12: 6, se: 1 }), behind(POS.LP, 2), '88', 'button').kind, 'isoFold');
  assert.equal(isoFoldTipFor(verdict({ r12: 6, se: 1 }), behind(POS.LP, 3), 'ATo', 'button').kind, 'isoFold');
  assert.equal(isoFoldTipFor(verdict({ r12: 6, se: 1 }), behind(POS.EP, 3), 'ATo', 'early'), null, 'ATo never from early position');
});

// one real judged spot, end to end: KJo in the hijack folding behind an abc limper (the L2 fixture's hand)
test('L4 fixture: KJo folded in the hijack behind an abc limper gets the isolation tip, graded fine', () => {
  const { s, belief, env } = build({ id: 'l4-kjo-hj', button: 2, hole: 'Kd Jc', board: '', seats: { 7: 'abc' }, line: '7c' });
  const v = gradeDecision(s, belief, { type: 'fold' }, { samples: 6000, seed: 1 }, env);
  assert.equal(v.grade, 'good');
  assert.equal(v.tip && v.tip.kind, 'isoFold');
  assert.match(v.tip.text, /^KJo is a raise behind limpers from (middle position|the cutoff): most players isolate with it here, to about \$\d+\.( Here raising was about \$\d+ better\.)?$/);
});

test('iso size: 5bb + 1bb per limper, 1bb more from the blinds; the judge offers it and the tips quote it (PRO, STRAT)', () => {
  assert.deepEqual([1, 2, 3].map((n) => isoTo(2, n, false)), [12, 14, 16]);
  assert.equal(isoTo(2, 1, true), 14);
  // the tips quote the raise offered nearest the iso size, not the smallest one
  const v = { options: [{ type: 'fold' }, { type: 'raise', to: 4 }, { type: 'raise', to: 12 }, { type: 'raise', to: 16 }] };
  assert.equal(isoQuote(v, { base: 2, bb: 2, limpers: 1, pos: POS.LP }), 12);
  assert.equal(isoQuote(v, { base: 2, bb: 2, limpers: 3, pos: POS.LP }), 16);
  // the judge's candidates behind one limper on the button, and first in (unchanged: 4bb and 6bb)
  const { s } = build({ id: 'iso-btn', button: 0, hole: 'Ad Jc', board: '', seats: { 3: 'abc' }, line: '3c' });
  const tos = candidateActions(s).filter((a) => a.type === 'raise').map((a) => a.to);
  assert.ok(tos.includes(isoTo(s.currentBet, 1, false)), tos.join(' '));
  const { s: s0 } = build({ id: 'iso-first', button: 0, hole: 'Ad Jc', board: '', seats: { 3: 'abc' }, line: '3f' });
  const first = candidateActions(s0).filter((a) => a.type === 'raise').map((a) => a.to);
  assert.ok(first.includes(4 * s0.currentBet) && first.includes(6 * s0.currentBet), first.join(' '));
});

// STRAT, MATH's tight-limper run: KQo, KJo and ATo get neither L4 nor L2 behind 2+ limpers all read as nits
import { allNitLimpers, NIT_SCOPE_HANDS } from '../src/trainer/grade.js';
test('nit scope: behind two nit limpers KQo folded gets no isolation tip; behind a nit and an abc it does', () => {
  assert.deepEqual([...NIT_SCOPE_HANDS].sort(), ['ATo', 'KJo', 'KQo']);
  const nits = build({ id: 'nit2-kqo', button: 0, hole: 'Kd Qc', board: '', seats: { 3: 'nit', 4: 'nit' }, line: '3c 4c' });
  assert.equal(allNitLimpers(nits.s, nits.env), true);
  const v = gradeDecision(nits.s, nits.belief, { type: 'fold' }, { samples: 1500, seed: 1 }, nits.env);
  assert.ok(!v.tip || !['isoFold', 'isoLimp'].includes(v.tip.kind), v.tip && v.tip.text);
  const vl = gradeDecision(nits.s, nits.belief, { type: 'call' }, { samples: 1500, seed: 1 }, nits.env);
  assert.ok(!vl.tip || vl.tip.kind !== 'isoLimp', vl.tip && vl.tip.text);
  // one nit and one abc: not all nits
  const mixed = build({ id: 'nitabc-kqo', button: 0, hole: 'Kd Qc', board: '', seats: { 3: 'nit', 4: 'abc' }, line: '3c 4c' });
  assert.equal(allNitLimpers(mixed.s, mixed.env), false);
  // a single nit limper: the rule needs two or more
  const one = build({ id: 'nit1-kqo', button: 0, hole: 'Kd Qc', board: '', seats: { 3: 'nit' }, line: '3c' });
  assert.equal(allNitLimpers(one.s, one.env), false);
});
