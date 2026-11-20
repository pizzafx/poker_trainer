// Drill bank: difficulty and the tricky features (CURR's ruling, 18 Nov 2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures } from '../src/engine/features.js';
import { SKILLS, difficultyOf, scaryBoard, d1DrawStatus, d1DrawRejects } from '../scripts/drill/skills.js';
import { TIER } from '../src/engine/features.js';

test('drill difficulty: tricky is 3; easy at 1.5x the gate floor (3 bars, 1.5bb raise-or-limp, 0.6bb fold-or-limp); else 2', () => {
  assert.equal(difficultyOf(SKILLS.D1, true, false, { marginBars: 9 }), 3);
  assert.equal(difficultyOf(SKILLS.D1, false, false, { marginBars: 3 }), 1);
  assert.equal(difficultyOf(SKILLS.D1, false, false, { marginBars: 2.9 }), 2);
  assert.equal(difficultyOf(SKILLS.P1, false, true, { marginBb: 1.5 }), 1);
  assert.equal(difficultyOf(SKILLS.P1, false, true, { marginBb: 1.4 }), 2);
  assert.equal(difficultyOf(SKILLS.P2, false, true, { marginBb: 0.6 }), 1);
  assert.equal(difficultyOf(SKILLS.P2, false, true, { marginBb: 0.55 }), 2);
});

test('drill tricky: a scary board is three of a suit, four to a straight, or paired', () => {
  const b = (s) => parseCards(s);
  assert.ok(scaryBoard(b('2c 7c Kc')));
  assert.ok(scaryBoard(b('5d 6h 7s 8c')));
  assert.ok(scaryBoard(b('Ah 2c 3d 4s')), 'the wheel');
  assert.ok(scaryBoard(b('9h 9c 3d')));
  assert.ok(!scaryBoard(b('Kh 7c 2d')));
  assert.ok(!scaryBoard(b('Kh 9c 5d 2s')));
});

test('D1 draw rule (CURR, STRAT): a pair plus a draw that falls short is tricky; one that covers the price is rejected', () => {
  const ctx = { pot: 100, toCall: 80 }; // an 80% bet: not the 50-60% band
  const pairDraw = { tier: TIER.MIDDLE_PAIR, realDraw: true };
  const noDraw = { tier: TIER.MIDDLE_PAIR, realDraw: false };
  assert.equal(SKILLS.D1.tricky({}, ctx, pairDraw, [], 'fails'), true, 'not enough: tricky');
  assert.equal(SKILLS.D1.tricky({}, ctx, pairDraw, [], 'even'), false, 'even: the margin decides');
  assert.equal(SKILLS.D1.tricky({}, ctx, noDraw, [], null), false);
  assert.equal(d1DrawRejects('works'), true, 'the draw covers the price: rejected from D1');
  assert.equal(d1DrawRejects('even'), true, 'about even: rejected from D1 (CURR)');
  assert.equal(d1DrawRejects('fails'), false, 'not enough: kept, and tricky');
  assert.equal(d1DrawRejects(null), false);
  // no pair plus a real draw, or no graded call: no status
  assert.equal(d1DrawStatus(noDraw, { options: [{ type: 'call' }] }, 1), null);
  assert.equal(d1DrawStatus(pairDraw, null, 1), null);
});

// D2 and D1 (CEO, 19 Nov): nobody left to act behind hero after the bettor
import { leftToAct, SKILLS as SK2 } from '../scripts/drill/skills.js';
test('drill leftToAct: live opponents short of the bet, not the bettor, not all-in', () => {
  const s = { n: 5, folded: [false, false, true, false, false], allIn: [false, false, false, false, true], bet: [0, 40, 0, 0, 10], currentBet: 40 };
  // seat 1 bet; seat 2 folded; seat 3 still to act; seat 4 all-in for less
  assert.deepEqual(leftToAct(s, 1), [3]);
  assert.deepEqual(leftToAct({ ...s, bet: [0, 40, 0, 40, 10] }, 1), []);
  assert.deepEqual(Object.keys(SK2).filter((c) => SK2[c].tier === 1).sort(), ['B1', 'D1', 'D2', 'D3', 'P1', 'P2', 'V1', 'V5']);
  assert.equal(SK2.B1.want, 'check');
  assert.ok(SK2.B1.allBets);
  assert.equal(SK2.V5.want, 'check');
  assert.equal(SK2.D2.want, 'call');
  assert.ok(SK2.V5.allBets);
});

import { boardChanged } from '../scripts/drill/skills.js';
test('drill boardChanged: the board pairing, a third card of a suit, or a first three-to-a-straight on this street (D3, PRO)', () => {
  const B = (s) => parseCards(s);
  assert.equal(boardChanged(B('Kh 7d 2c')), null, 'the flop: nothing to compare');
  assert.equal(boardChanged(B('Kh 7d 2c 7s')), 'paired');
  assert.equal(boardChanged(B('Kh 7h 2c 4h')), 'flush');
  assert.equal(boardChanged(B('Kh 7d 2c 8s')), null, 'K 8 7 2: no three within five');
  assert.equal(boardChanged(B('Kh 9d 2c 8s')), null, 'K 9 8 2: only two within five');
  assert.equal(boardChanged(B('Kh 9d 2c 8s Ts')), 'straight', 'T 9 8 completes three to a straight');
  assert.equal(boardChanged(B('Ah 4d 9c 3s')), 'straight', 'A 4 3: the wheel counts');
  assert.equal(SK2.D3.want.join(), 'call,raise');
  assert.ok(SK2.D3.foldWrong);
});

import { beatenByLastCard } from '../scripts/drill/skills.js';
test('drill D3 rule 1 (final): two pair out on a paired board; below a flush out when a flush came in, below a straight when a straight did; the made hand itself only near-nuts', () => {
  const st = (h, b) => ({ hole: [parseCards(h)], board: parseCards(b) });
  assert.equal(beatenByLastCard(st('Kd 7d', 'Kh 7c 2d 2s')), true, 'two pair, the board pairs');
  assert.equal(beatenByLastCard(st('7h 7d', 'Kc 7s 2d 2h')), false, 'a set on the paired board is a full house');
  assert.equal(beatenByLastCard(st('Kd 7d', 'Kh 7h 2d 9h')), true, 'two pair, a third heart');
  assert.equal(beatenByLastCard(st('9d 9c', 'Kh 9h 2d 5h')), true, 'a set, a third heart');
  assert.equal(beatenByLastCard(st('Ah Qh', 'Kh 7h 2d 9h')), false, 'the nut flush stays');
  // a straight made on the card that brings the third heart: below a flush, out (STRAT, PRO)
  assert.equal(beatenByLastCard(st('6d 7c', 'Kh 9h 2d 5s 8h')), true, 'a straight as the third heart lands: out');
  // a straight on a card that completes a straight but no flush: stays at S >= 0.85
  assert.equal(beatenByLastCard(st('6d 7c', 'Kh 9c 2d 5s 8h')), false, 'hero made the straight on a rainbow-ish board: stays');
  assert.equal(beatenByLastCard(st('Kd 9d', 'Kh 9c 2d 5s 8h')), true, 'two pair when 9 8 5 opens a straight: out');
  // a fourth heart: the flush was already possible, so the last card brought nothing new (rule 1 does not apply)
  assert.equal(beatenByLastCard(st('6d 7c', '5h 9h 8h 2d 4h')), false, 'a fourth heart is not a flush that just came in');
  assert.equal(beatenByLastCard(st('Kd 7d', 'Kh 7c 2d 9s')), false, 'nothing changed');
});

// P1 for the rebuild (CURR, STRAT, 19 Nov): only spots where the coach names the raise on both the limp and the fold
import { build } from '../scripts/gradeall.js';
import { buildContext } from '../src/bots/policy.js';
test('drill P1 predicate: 77/88 out behind 3+ limpers; KJo/ATo out from early position; KQo/KJo/ATo out behind 2+ nit limpers', () => {
  const m = (button, hole, seats, line) => {
    const { s } = build({ id: 'p1', button, hole, board: '', seats, line });
    const types = Array.from({ length: s.n }, (_, i) => (i === 0 ? null : seats[i] || 'abc'));
    return SK2.P1.match(s, buildContext(s), null, types);
  };
  // the button (hero on the button: button 0), abc limpers
  assert.equal(m(0, '7d 7c', { 3: 'abc', 4: 'abc' }, '3c 4c'), true, '77 behind 2: in');
  assert.equal(m(0, '7d 7c', { 3: 'abc', 4: 'abc', 5: 'station' }, '3c 4c 5c'), false, '77 behind 3: out (P6)');
  assert.equal(m(0, 'Kd Jc', { 3: 'abc', 4: 'abc', 5: 'station' }, '3c 4c 5c'), true, 'KJo behind 3 on the button: in');
  assert.equal(m(0, 'Kd Qc', { 3: 'nit', 4: 'nit' }, '3c 4c'), false, 'KQo behind 2 nits: out');
  assert.equal(m(0, 'Kd Qc', { 3: 'nit', 4: 'abc' }, '3c 4c'), true, 'KQo behind a nit and an abc: in');
  assert.equal(m(0, 'Ad Jc', { 3: 'nit', 4: 'nit' }, '3c 4c'), true, 'AJo behind 2 nits: in (not in the nit scope)');
});

// D3's nit clause (STRAT, PRO, CURR): tier 6 against a nit's river bet after a checked-through turn is out
import { turnCheckedThrough } from '../scripts/drill/skills.js';
test('drill D3 nit clause: tier 6 out after a checked turn, in after the nit bet the turn; tier 7 unaffected', () => {
  const s = (turnActs, hole, board) => ({ street: 3, hole: [parseCards(hole)], board: parseCards(board), history: [{ street: 2, seat: 1, type: turnActs[0] }, { street: 2, seat: 0, type: turnActs[1] }] });
  assert.equal(turnCheckedThrough(s(['check', 'check'], 'Qd Qc', 'Td 7c 2h 4s 9d')), true);
  assert.equal(turnCheckedThrough(s(['raise', 'call'], 'Qd Qc', 'Td 7c 2h 4s 9d')), false);
  assert.match(SK2.D3.rule, /folds to a nit who bet the turn too, and is close against others\.$/);
});

test('drill D3 nit clause in the predicate: QQ vs a nit river bet out after a checked turn, in after a turn bet; two pair in', () => {
  // heads-up river, nit (seat 1) bets 2/3 pot into $60, hero has $150 behind; the turn checked through or the nit bet it
  const spot = (hole, turnActs, bettor = 'nit', board = 'Td 7c 2h 4s 9d') => {
    const s = {
      n: 2, street: 3, hole: [parseCards(hole), []], board: parseCards(board), folded: [false, false], allIn: [false, false], bet: [0, 40], currentBet: 40,
      history: [{ street: 2, seat: 1, type: turnActs[0] }, { street: 2, seat: 0, type: turnActs[1] }, { street: 3, seat: 1, type: 'raise', to: 40 }],
    };
    const ctx = { toCall: 40, aggressor: 1, pot: 100, bb: 2, raises: 1, stack: 150 };
    const f = handFeatures(s.hole[0], s.board);
    return SK2.D3.match(s, ctx, f, [null, bettor]);
  };
  assert.equal(spot('Qd Qc', ['check', 'check']), false, 'tier 6 vs a nit after a checked turn: out');
  assert.equal(spot('Qd Qc', ['raise', 'call']), true, 'tier 6 vs a nit who bet the turn: in');
  assert.equal(spot('Qd Qc', ['check', 'check'], 'station'), true, 'tier 6 vs a station after a checked turn: in');
  // a river king changes nothing (no pair, no third suit, no new straight), so rule 1 allows two pair
  assert.equal(spot('Td 7d', ['check', 'check'], 'nit', 'Td 7c 2h 4s Kh'), true, 'two pair vs a nit after a checked turn: in (rule 1 allows it)');
});
