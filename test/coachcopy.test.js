// Coach copy pinned on real records (QA-VERDICT's finds on 5b5dbdc)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explain, shownCost, t1Board } from '../src/trainer/explain.js';
import { parseCards } from '../src/engine/cards.js';
import { valueGain } from '../src/trainer/grade.js';

test('YB-V4b: an A2 headline does not cite the estimate below when that line is about the call (STRAT)', () => {
  const d = JSON.parse(readFileSync(new URL('./fixtures/records/ybv4b-a2.json', import.meta.url), 'utf8'));
  const e = explain(d);
  assert.equal(e.headline, 'Fold: fine. (All-in $875 scores about $192 more against these bots, but it is not a play that works against anyone here. Against call $295, folding gives up too little to flag.)');
  assert.doesNotMatch(e.headline, /estimate below/);
});

test('V4: a call flagged by the money-in rule shows a cost of at most its price', () => {
  const v = { grade: 'mistake', mine: 1, best: 0, moneyInCap: 16, options: [{ ev: 0 }, { ev: -19.4 }] };
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

import { openTipFor } from '../src/trainer/grade.js';
import { STREET } from '../src/engine/game.js';
test('open tip: "only from later seats" only when a later seat opens the hand; trash folds from every seat (STRAT)', () => {
  const ctx = { street: STREET.PRE, raises: 0, limpers: 0 };
  const v = { grade: 'good', mine: 1, se: 1, options: [{ type: 'fold', ev: 0 }, { type: 'raise', to: 8, ev: -1 }] };
  assert.match(openTipFor(v, ctx, '92o', 'early').text, /most players fold it from every seat\./);
  assert.match(openTipFor(v, ctx, 'K9o', 'early').text, /most players open it only from later seats\./);
  assert.match(openTipFor(v, ctx, '92o', 'button').text, /most players fold it here\./);
});

test('YB-T1 vs U1: a board that devalues a hand below a straight takes it out of the T1 copy (STRAT)', () => {
  const b = (h, s) => t1Board(parseCards(h), parseCards(s));
  assert.equal(b('7s Td', 'As Qc Kd Tc 7c'), false, 'bottom two pair, four to a straight (seed 24 hand 17)');
  assert.equal(b('7s 7d', '7c 8c 9h 2c Kd'), false, 'a set, three clubs and three to a straight');
  assert.equal(b('Ks 2s', 'Kd 2c 5h 9s Jd'), true, 'two pair on a dry river');
  assert.equal(b('Jh 9h', 'As Qc Kd Tc 7c'), true, 'a straight keeps it');
  assert.equal(b('Ah 3h', 'Kh 8h 4h 2c Jd'), true, 'a flush keeps it');
  assert.equal(b('Ks Kd', 'Kh 8h 4h 2h Jd'), false, 'a set on four hearts');
  // STRAT's two edges
  assert.equal(b('Js 9d', 'Th 8h 7h 2h Kd'), false, 'a straight on four hearts');
  assert.equal(b('2s 3d', '9c Tc Jd Qh Ks'), false, 'a board straight the hero only ties');
  assert.equal(b('As 2d', '9c Tc Jd Qh Ks'), true, 'the nut straight over a board straight');
  assert.equal(b('8s 2d', '9c Tc Jd Qh 3s'), true, 'a straight of its own, no four-flush');
  assert.equal(b('2c 3d', 'Ah Kh 8h 4h 9h'), false, 'a board flush the hero plays');
  // STRAT (YB-T1 item 2, CEO): a low flush on four of a suit, two unseen higher cards of the suit
  assert.equal(b('9s 6s', 'Js Ts 3s Qs'), false, 'a 9-high flush on four spades: K and A of spades are out');
  assert.equal(b('Ks 6s', 'Js Ts 3s Qs'), true, 'a K-high flush: only the ace is above');
  assert.equal(b('9s 6s', 'Js Ts 3s Qh'), true, 'three spades on board: no four-flush guard');
});

// STRAT (19 Nov, YB-T1 at the bar): the passive-trap forms only strictly under the bar; at the bar U1's figure wins.
// QA-VERDICT's case: aggressive 1/2 2-handed, seed 24, hand 48, BTN/SB 9s6s on Js Ts 3s Qs, bet $11; check $10.7
// against the bet's $4.6, the bar $6
test('YB-T1 at the bar: a check ahead by exactly the bar is named with its figure, not "scores about the same"', () => {
  const opts = [{ type: 'check', label: 'Check', ev: 10.7 }, { type: 'raise', to: 11, label: 'Bet $11 (50% pot)', ev: 4.6 }];
  const rec = (small, note, hole = '9s 6s') => ({
    street: 3, toCall: 0, currentBet: 0, raises: 0, opponents: 1, position: 'BTN/SB', tier: 8,
    hole: parseCards(hole), board: parseCards('Js Ts 3s Qs'), liveTypes: ['abc'],
    verdict: { grade: 'good', note, mine: 1, best: 0, small, options: opts },
  });
  for (const note of ['unclear', 'fragile']) {
    const at = explain(rec(6, note)).headline;
    assert.doesNotMatch(at, /scores about the same/, `${note} at the bar: ${at}`);
    // under the bar the trap copy needs a strong hand: a K-high flush keeps it; 9s6s, a low flush on four spades with
    // the K and A of spades out, no longer counts as one (STRAT's four-flush guard, CEO 24 Nov)
    const under = explain(rec(7, note, 'Ks 6s')).headline;
    assert.match(under, /checking to trap scores about the same here/, `${note} under the bar: ${under}`);
    const low = explain(rec(7, note)).headline;
    assert.doesNotMatch(low, /checking to trap/, `${note} under the bar, low flush: ${low}`);
  }
  assert.match(explain(rec(6, 'unclear')).headline, /better by about \$6/);
});

// STRAT, CEO, PRO (19 Nov): 77/88 limped on the button behind 3+ limpers who mostly read as stations: the pair reason
test('prePassive pair reason: 88 on the button behind three stations; not behind a mix, not AJo, not 77 in the cutoff', () => {
  const rec = (hole, position, types) => ({
    street: 0, toCall: 2, currentBet: 2, raises: 0, opponents: 4, position, hole: parseCards(hole), board: [], tier: null,
    ctx: { limpers: types.length, raises: 0 }, table: { n: 8 },
    snapshot: { actions: types.map((_, k) => ({ street: 'preflop', seat: 3 + k, type: 'call' })), seats: types.map((t2, k) => ({ seat: 3 + k, folded: false, read: [{ type: t2, p: 0.8 }] })) },
    verdict: { grade: 'mistake', mine: 1, best: 2, small: 2, loss: 4, options: [{ type: 'fold', ev: 0, label: 'Fold' }, { type: 'call', ev: 3, label: 'Call $2' }, { type: 'raise', to: 16, ev: 8, label: 'Raise to $16' }] },
  });
  const why = (h, p, t2) => explain(rec(h, p, t2)).reasons.join(' ');
  assert.match(why('8d 8c', 'BTN', ['station', 'station', 'station']), /^Behind three limpers who mostly call, raising 88 on the button makes more than limping: they call the raise with worse hands, and you play the bigger pot in position on all of them\.$/);
  assert.match(why('8d 8c', 'BTN', ['station', 'station', 'abc']), /limpers who mostly call/, 'two of three is most');
  for (const [h, p, t2] of [['8d 8c', 'BTN', ['abc', 'nit', 'station']], ['Ad Jc', 'BTN', ['station', 'station', 'station']], ['7d 7c', 'CO', ['station', 'station', 'station']], ['8d 8c', 'BTN', ['whale', 'whale', 'station']]]) {
    assert.match(why(h, p, t2), /plays best against few opponents/, `${h} ${p} ${t2}`);
  }
});

// STRAT YB-D2c (c), 19 Nov: a draw overbet's multiway-habit line carries D2's advice as plain text
test('YB-D2c: the draw-overbet habit line says "With a draw, bet smaller or check" (calling is cheaper facing a bet)', () => {
  const rec = (toCall) => ({
    street: 1, toCall, currentBet: toCall, raises: toCall ? 1 : 0, opponents: 2, position: 'BTN', tier: 1,
    hole: parseCards('As 4s'), board: parseCards('3d 6s 3s'),
    verdict: { grade: 'good', note: 'mwHabit', habit: 'drawOverbet', mine: 1, best: 0, small: 3, options: [{ type: 'check', label: 'Check', ev: 5 }, { type: 'raise', to: 39, label: 'Bet $39 (150% pot)', ev: 4.5 }] },
  });
  const h = explain(rec(0)).headline;
  assert.match(h, /An overbet with a draw into several players\. With a draw, bet smaller or check\.\)$/);
  assert.doesNotMatch(h, /your draw comes in/);
  assert.match(explain(rec(10)).headline, /With a draw, calling is cheaper\.\)$/);
});

// STRAT, CEO (thin-value copy): a passed river bet that wins often enough when called reads as value, in two bands
const passed = (top, street = STREET.RIVER) => {
  const d = JSON.parse(readFileSync(new URL('./fixtures/records/ybv4b-a2.json', import.meta.url), 'utf8'));
  d.street = street;
  d.toCall = 0;
  d.board = street === STREET.RIVER ? [...d.board, 20] : d.board;
  d.verdict = { ...d.verdict, best: 1, mine: 0, grade: 'good', note: 'passedBluff', anchorWhy: null, small: 25, options: [{ type: 'check', label: 'Check', ev: 0 }, { type: 'raise', to: 35, label: 'Bet $35', ev: 27, F: 0.2, ...top, need: 0.5 }] };
  return explain(d).headline;
};
test('thin-value copy: a river value bet barely past its need once raises count (h73d214-like, wNet 0.529) is a thin value bet', () => {
  assert.equal(passed({ W: 0.59, C: 0.7, R: 0.0805 }), 'Check: fine. (A thin value bet scores about $27 more; once raises are counted it barely wins often enough, so checking is fine.)');
});
test('thin-value copy: a river bet whose wNet is need + 0.15 is a value bet', () => {
  assert.equal(passed({ W: 0.65, C: 0.8, R: 0 }), 'Check: fine. (A value bet scores about $27 more; it wins clearly more often than it needs when called, so betting is the better habit.)');
});
test('thin-value copy: raises that pull wNet under need keep the real-table line, as "a bet" (h14d37-like, wNet 0.29)', () => {
  assert.equal(passed({ W: 0.84, C: 0.29, R: 0.55 }), 'Check: fine. (A bet scores about $27 more against these bots; not enough to rely on at a real table.)');
  assert.match(passed({ W: 0.84, C: 0.4, R: 0.2 }), /A thin value bet/);
});
test('thin-value copy: a river bluff (W under need) and a turn passed bet keep the real-table line', () => {
  assert.equal(passed({ W: 0, C: 0.8, R: 0 }), 'Check: fine. (A bluff scores about $27 more against these bots; not enough to rely on at a real table.)');
  assert.match(passed({ W: 0.84, C: 0.8, R: 0 }, STREET.TURN), /against these bots; not enough to rely on at a real table/);
});

// QA-VERDICT (q2_sens_12 h11d23 and two more): an R5b call the scenario test leaves not graded (fragileRead) reads
// "not graded" in the headline, as the word and the card do, not R5b's "fine" line
test('R5b: a passive-lead call left not graded by the scenario test (fragileRead) has a "not graded" headline', () => {
  const opts = [{ type: 'fold', ev: 0, label: 'Fold' }, { type: 'call', ev: -14, label: 'Call $12' }];
  const rec = (note) => ({
    street: 3, toCall: 12, currentBet: 12, raises: 0, opponents: 3, position: 'CO', tier: 4,
    hole: parseCards('Kh Qd'), board: parseCards('Kc 8s 5d 2h 9c'), liveTypes: ['station', 'abc', 'abc'],
    verdict: { grade: 'good', rule: 'R5b', note, mine: 1, best: 0, small: 6, options: opts },
  });
  const h = explain(rec('fragileRead')).headline;
  assert.match(h, /^Call \$12: not graded\./, h);
  assert.doesNotMatch(h, /passive player leads into a crowd/);
  // with no note R5b keeps its line
  assert.equal(explain(rec(undefined)).headline, 'Call $12: fine. (When a passive player leads into a crowd, one pair is often beaten.)');
});
