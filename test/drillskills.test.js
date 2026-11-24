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
  assert.equal(m(0, '7d 7c', { 3: 'abc', 4: 'abc' }, '3c 4c'), true, '77 behind 2 on the button: in');
  assert.equal(m(0, '7d 7c', { 3: 'abc', 4: 'abc', 5: 'station' }, '3c 4c 5c'), false, '77 behind 3: out (P6)');
  assert.equal(m(0, 'Kd Jc', { 3: 'abc', 4: 'abc', 5: 'station' }, '3c 4c 5c'), true, 'KJo behind 3 on the button: in');
  assert.equal(m(0, 'Kd Qc', { 3: 'nit', 4: 'nit' }, '3c 4c'), false, 'KQo behind 2 nits: out');
  assert.equal(m(0, 'Kd Qc', { 3: 'nit', 4: 'abc' }, '3c 4c'), true, 'KQo behind a nit and an abc: in');
  assert.equal(m(0, 'Ad Jc', { 3: 'nit', 4: 'nit' }, '3c 4c'), true, 'AJo behind 2 nits: in (not in the nit scope)');
});

// D3's nit clause (STRAT, PRO, CURR): tier 6 against a nit's river bet after a checked-through turn is out
import { turnCheckedThrough, nitRiverOut, strictQuiet } from '../scripts/drill/skills.js';
test('drill D3 nit clause: tier 6 out after a checked turn, in after the nit bet the turn; tier 7 unaffected', () => {
  const s = (turnActs, hole, board) => ({ street: 3, hole: [parseCards(hole)], board: parseCards(board), history: [{ street: 2, seat: 1, type: turnActs[0] }, { street: 2, seat: 0, type: turnActs[1] }] });
  assert.equal(turnCheckedThrough(s(['check', 'check'], 'Qd Qc', 'Td 7c 2h 4s 9d')), true);
  assert.equal(turnCheckedThrough(s(['raise', 'call'], 'Qd Qc', 'Td 7c 2h 4s 9d')), false);
  // the line stays as it is (CEO's final ruling): the cell is dropped, the words are not changed
  assert.match(SK2.D3.rule, /calls a station, folds to a nit, and is close against others\. Against a nit’s big river bet, two pair is close at best, and a set calls or raises on a quiet board: no pair, and never three cards of one suit or three cards to a straight\.$/);
});

test('drill D3 nit clause in the predicate: out only for an under-pot nit lead after a checked turn when the nit did not bet the flop', () => {
  // heads-up river, the nit (seat 1) leads `lead` into $60; flop and turn as given; hero has $150 behind
  const spot = (hole, flop, turn, lead, bettor = 'nit', board = 'Td 7c 2h 4s 9d') => {
    const hist = [...flop.map(([seat, type]) => ({ street: 1, seat, type })), ...turn.map(([seat, type]) => ({ street: 2, seat, type })), { street: 3, seat: 1, type: 'raise', to: lead }];
    const s = { n: 2, street: 3, hole: [parseCards(hole), []], board: parseCards(board), folded: [false, false], allIn: [false, false], bet: [0, lead], currentBet: lead, history: hist };
    const ctx = { toCall: lead, aggressor: 1, pot: 60 + lead, bb: 2, raises: 1, stack: 150 };
    return SK2.D3.match(s, ctx, handFeatures(s.hole[0], s.board), [null, bettor]);
  };
  const checks = [[1, 'check'], [0, 'check']];
  assert.equal(spot('Qd Qc', checks, checks, 45), false, '3/4-pot lead after a checked flop and turn: out');
  assert.equal(spot('Qd Qc', checks, checks, 60), true, 'pot-size lead after a checked flop and turn: in');
  assert.equal(spot('Qd Qc', [[1, 'raise'], [0, 'call']], checks, 40), true, '2/3 lead when the nit bet the flop and the turn checked: in');
  assert.equal(spot('Qd Qc', checks, checks, 40, 'station'), true, 'against a station on the 2/3 line: in');
  assert.equal(spot('Qd Qc', [[1, 'check'], [0, 'raise'], [1, 'call']], checks, 40), false, 'hero bet the flop, the nit called, the turn checked, a 2/3 lead: out');
  assert.equal(spot('Qd Qc', checks, [[1, 'check'], [0, 'raise'], [1, 'call']], 40), true, 'the nit called a turn bet, then leads 2/3: in (PRO)');
  // a river king changes nothing, so rule 1 allows two pair after a checked turn
  // two pair against a nit's big river bet is out on any board now (the nit clause, 19 Nov); against a station it stays
  assert.equal(spot('Td 7d', checks, checks, 40, 'nit', 'Td 7c 2h 4s Kh'), false, 'two pair vs a nit after a checked turn: out (nit clause)');
  assert.equal(spot('Td 7d', checks, checks, 40, 'station', 'Td 7c 2h 4s Kh'), true, 'two pair vs a station: in');
});

// P1's pairs (CURR, STRAT): 77/88 only from the cutoff and the button, and only where the limp scores wrong
import { derive } from '../scripts/drillentry.js';
test('drill P1: 88 from the lojack out of the predicate; any P1 spot with a fine limp or fold is rejected, both wrong kept', () => {
  const m = (button, hole, seats, line) => {
    const { s } = build({ id: 'p1p', button, hole, board: '', seats, line });
    const types = Array.from({ length: s.n }, (_, i) => (i === 0 ? null : seats[i] || 'abc'));
    return { s, ok: SK2.P1.match(s, buildContext(s), null, types), types };
  };
  // hero on the button (button 0) behind one limper; the same hand three seats earlier is the lojack
  assert.equal(m(0, '8d 8c', { 3: 'abc' }, '3c').ok, true, '88 behind 1 on the button: in');
  const lj = m(3, '8d 8c', { 6: 'abc' }, '6c');
  assert.equal(lj.ok, false, '88 behind 1 from the lojack: out');
  // the family rule, on a button spot: limp wrong kept, limp fine (L2 silent) rejected
  const bt = m(0, '7d 7c', { 3: 'abc', 4: 'abc' }, '3c 4c');
  const r = (call) => ({ families: { raise: 'best', fold: 'wrong', call }, graded: {}, marginBb: 1, marginBars: 0 });
  assert.equal(derive('P1', bt.s, null, null, bt.types, r('wrong'), null).reject, null, '77 behind 2 on the button with L2 firing: in');
  assert.match(derive('P1', bt.s, null, null, bt.types, r('fine'), null).reject, /limp fine/, '77 with a fine limp: out');
  // every P1 hand now (CURR, STRAT): AJo in the cutoff behind one limper with a tag and a lag still to act, L2 silent
  // (the limp fine), is out; with the limp wrong it is in
  const aj = m(1, 'Ad Jc', { 4: 'station', 2: 'tag', 3: 'lag' }, '4c 5f 6f 7f');
  assert.equal(aj.ok, true, 'AJo in the cutoff behind one limper is a P1 candidate');
  assert.match(derive('P1', aj.s, null, null, aj.types, r('fine'), null).reject, /limp fine/, 'AJo with a fine limp: out');
  assert.equal(derive('P1', aj.s, null, null, aj.types, r('wrong'), null).reject, null, 'AJo with a wrong limp: in');
  // the fold must be wrong too
  assert.match(derive('P1', aj.s, null, null, aj.types, { ...r('wrong'), families: { raise: 'best', fold: 'fine', call: 'wrong' } }, null).reject, /fold fine/);
});

// the nit clause (CEO's final ruling, 19 Nov): against a nit's big river bet D3 keeps only a set on PRO's strict quiet
// board (ace low too); D1 drops top pair on D3's quiet-lead nit cell
test('drill D3 nit clause: only a set on the strict quiet board stays against a nit; stations unchanged', () => {
  // heads-up river, the nit (seat 1) bets the pot ($60) into $60 after it bet the flop and the turn (so the 7ac18ca
  // cell plays no part); hero has $150 behind
  const spot = (hole, board, bettor = 'nit') => {
    const hist = [{ street: 1, seat: 1, type: 'raise', to: 10 }, { street: 1, seat: 0, type: 'call' }, { street: 2, seat: 1, type: 'raise', to: 25 }, { street: 2, seat: 0, type: 'call' }, { street: 3, seat: 1, type: 'raise', to: 60 }];
    const s = { n: 2, street: 3, hole: [parseCards(hole), []], board: parseCards(board), folded: [false, false], allIn: [false, false], bet: [0, 60], currentBet: 60, history: hist };
    const ctx = { toCall: 60, aggressor: 1, pot: 120, bb: 2, raises: 1, stack: 150 };
    return SK2.D3.match(s, ctx, handFeatures(s.hole[0], s.board), [null, bettor]);
  };
  assert.equal(spot('7d 7h', 'Qd 7c 2h Ks Jh'), false, 'a set on Q-J-K (three to a straight): out');
  assert.equal(spot('7d 7h', 'Ts 7c 2h Ks 4d'), true, 'a set vs a nit on a strict quiet board: in');
  assert.equal(spot('Td 7d', 'Ts 7c 2h Ks 4d'), false, 'two pair vs a nit on the same board: out');
  assert.equal(spot('Td 7d', 'Ts 7c 2h Ks 4d', 'station'), true, 'two pair vs a station: in (unchanged)');
  assert.equal(spot('7d 7h', 'Ts 7s 2h Ks 4d'), false, 'a set, three spades from the turn and a blank river: out');
  assert.equal(spot('7d 7h', 'Ts 7c 2h Ks Td'), false, 'a set on a just-paired river (a full house): out (held)');
  assert.equal(spot('As Ah', 'Ad 3d 5c Kh 9s'), false, 'a set on A-3-5 (three to a straight, ace low): out');
  assert.equal(spot('8s 8h', 'Ad 8d 3c Kh 9s'), true, 'a set on A-8-3-K-9: in');
  assert.equal(spot('Ad Kd', 'Ac 7c 2h 4s As'), false, 'trips vs a nit: out');
  assert.equal(spot('Qd Qc', 'Ts 7c 2h 4s 9d'), true, 'an overpair vs a nit after it bet the flop: in (the 7ac18ca rule decides)');
  assert.equal(strictQuiet(parseCards('As 3d 5c Kh 9s')), false);
  assert.equal(strictQuiet(parseCards('As 8d 3c Kh 9s')), true);
  assert.equal(strictQuiet(parseCards('Ah 2d 4c 9h Ks')), false, 'A-2-4 counts');
});
test('drill nitRiverOut: a nit river bet only; a strict-board set stays', () => {
  const hist = [{ street: 1, seat: 1, type: 'raise', to: 10 }, { street: 1, seat: 0, type: 'call' }, { street: 2, seat: 1, type: 'raise', to: 25 }, { street: 2, seat: 0, type: 'call' }, { street: 3, seat: 1, type: 'raise', to: 60 }];
  assert.equal(nitRiverOut({ street: 3, hole: [parseCards('7d 7h')], board: parseCards('Ts 7c 2h Ks 4d'), history: hist }, { aggressor: 1 }, [null, 'nit']), false);
  assert.equal(nitRiverOut({ street: 3, hole: [parseCards('7d 7h')], board: parseCards('Ts 7c 2h Ks 4d'), history: hist }, { aggressor: 1 }, [null, 'station']), false);
  assert.equal(nitRiverOut({ street: 2, hole: [parseCards('Td 7d')], board: parseCards('Ts 7c 2h Ks'), history: hist }, { aggressor: 1 }, [null, 'nit']), false, 'a turn bet: unchanged');
});
test('drill D1 nit drop: top pair facing a nit 2/3 lead after a checked flop and turn is out; middle pair and pot-size leads are in', () => {
  const spot = (hole, lead, bettor = 'nit') => {
    const hist = [{ street: 1, seat: 1, type: 'check' }, { street: 1, seat: 0, type: 'check' }, { street: 2, seat: 1, type: 'check' }, { street: 2, seat: 0, type: 'check' }, { street: 3, seat: 1, type: 'raise', to: lead }];
    const s = { n: 2, street: 3, hole: [parseCards(hole), []], board: parseCards('Kh 7c 2h 4s 9d'), folded: [false, false], allIn: [false, false], bet: [0, lead], currentBet: lead, history: hist };
    const ctx = { toCall: lead, aggressor: 1, pot: 60 + lead, bb: 2, raises: 1, stack: 150 };
    return SK2.D1.match(s, ctx, handFeatures(s.hole[0], s.board), [null, bettor]);
  };
  assert.equal(spot('Kd Tc', 40), false, 'TPGK vs a nit 2/3 lead after a checked flop and turn: out');
  assert.equal(spot('9s 8c', 40), true, 'middle pair on the same line: in (the gate decides)');
  assert.equal(spot('Kd Tc', 60), true, 'TPGK vs a pot-size lead: in');
  assert.equal(spot('Kd Tc', 40, 'abc'), true, 'TPGK vs an abc: in');
  assert.match(SK2.D1.rule, /usually fold\.$/, "D1's line unchanged");
});

// B1 on the flop (STRAT's ruling (b), PRO, CURR, 19 Nov): no card above the board's top card and no draw, a gutshot included
test('drill B1 flop narrowing: overcards and any straight or flush draw out on the flop; the turn and river unchanged', () => {
  const m = (hole, board, opp = 'station') => {
    const s = { n: 2, street: board.split(' ').length === 3 ? 1 : board.split(' ').length === 4 ? 2 : 3, hole: [parseCards(hole), []], board: parseCards(board), folded: [false, false], allIn: [false, false], bet: [0, 0], currentBet: 0, history: [] };
    return SK2.B1.match(s, { toCall: 0, canRaise: true, aggressor: -1, pot: 20, bb: 2 }, handFeatures(s.hole[0], s.board), [null, opp]);
  };
  assert.equal(m('Ad Qc', 'Jh 7s 3d'), false, 'AQo on J-7-3: out');
  assert.equal(m('Kd 4c', 'Jh 7s 3d'), false, 'one overcard (K on J-7-3): out');
  assert.equal(m('6d 5c', 'Kh Qs 9d'), true, '65o on K-Q-9 rainbow, no draw: in (the gate decides)');
  assert.equal(m('Td 8c', 'Jh 7s 2d'), false, 'a gutshot on the flop: out');
  assert.equal(m('6h 5h', 'Kh Qs 9h'), false, 'a flush draw on the flop: out');
  assert.equal(m('Kd 4c', 'Ah 7s 3d 2c Jd', 'station'), true, 'king-high on the river vs a station: in');
  assert.equal(m('Ad 4c', 'Kh 7s 3d 2c Jd', 'station'), true, 'ace-high on the river vs a station: in');
  assert.equal(m('Ad Qc', 'Jh 7s 3d 2c', 'whale'), true, 'AQo on the turn vs a whale: in (turn unchanged)');
  // the board alone holds trips or two pair (CURR, 19 Nov): out on any street; one pair on the board stays
  assert.equal(m('Ad Qc', '6s 6d 6h'), false, 'AQo on 6-6-6: out');
  assert.equal(m('3d 2c', '9s 9d 9h'), false, '32o on 9-9-9 (no overcard, no draw): out by the board rule');
  assert.equal(m('Ad Qc', 'Kh Ks 7d 7c'), false, 'AQo on K-K-7-7 at the turn: out');
  assert.equal(m('5d 4c', '9h 9s 2d'), true, '54o on 9-9-2: in (the gate decides)');
  assert.equal(m('Ad 3c', 'Kh Ks 7d 7c 2s'), false, 'ace-high on a two-pair river board: out');
  assert.equal(m('Ad 3c', 'Kh Ks 7d 4c 2s'), true, 'ace-high on a one-pair river board: in');
  assert.equal(m('Kc Qc', 'Qd 7d Td Ad Kd'), false, 'KQo under a five-diamond board: out');
  assert.equal(m('3c 2h', '9d Ts Jh Qs Kc'), false, '32o on a 9-T-J-Q-K board: out');
  assert.equal(m('3c 2h', '9d Td 5d Qd 7s'), true, 'a four-flush board, hero holds no diamond and has air: in');
  assert.equal(m('Kc 2c', '9d Ts Jh Qs 8c'), false, 'a board straight: out');
  assert.equal(m('5c 2h', '9d Ts Jh Qs 3c'), true, 'four to a straight on the board, hero no straight: in');
});

// B1's package (CEO, STRAT, PRO, GAME, CURR, 21 Nov): the rule line, the narrowed tricky test and B1's own easy rule
import { fourToFlushOrStraight, freshThreeFlush, B1_FRESH_FLUSH } from '../scripts/drill/skills.js';
test('drill B1 package: tricky by hand or a four-flush/four-straight board (and a fresh three-flush); easy at 2.5 bars with a 7.5bb, quarter-pot cost', () => {
  assert.equal(SK2.B1.rule, 'A bluff needs folds. Stations and crowds rarely fold a pair, and usually have one: check.');
  const tr = (hole, board) => SK2.B1.tricky({ hole: [parseCards(hole)], board: parseCards(board) }, {}, null);
  assert.equal(tr('7d 4c', 'Ks Kd 9h 2c Qh'), false, 'a paired-board river spot is not tricky');
  assert.equal(tr('7d 4c', 'Kh 9h 2c 5h'), B1_FRESH_FLUSH, 'a turn bringing the third heart is tricky (STRAT)');
  assert.equal(tr('7d 4c', 'Kh 9h 5h 2c Js'), false, 'a stale three-flush is not tricky');
  assert.equal(tr('7d 4c', 'Kh 9h 5h 2h Js'), true, 'four to a flush: tricky');
  assert.equal(tr('7d 2c', '9s Th Jc Qd 3s'), true, 'four to a straight: tricky');
  assert.equal(tr('Ad 4c', 'Ks 9d 6h 2c Qh'), true, 'ace-high: tricky');
  assert.equal(fourToFlushOrStraight(parseCards('As 2d 3h 4c Kh')), true, 'A-2-3-4 counts (ace low)');
  assert.equal(freshThreeFlush(parseCards('Kh 9h 5h')), true, 'a monotone flop counts');
  const r = (bars, cost, pot) => ({ marginBars: bars, costBb: { raise: cost }, potBb: pot });
  assert.equal(difficultyOf(SK2.B1, false, false, r(2.5, 8, 30)), 1, '2.5 bars, 8bb of a 30bb pot: easy');
  assert.equal(difficultyOf(SK2.B1, false, false, r(2.4, 8, 30)), 2, 'easy fails at 2.4 bars');
  assert.equal(difficultyOf(SK2.B1, false, false, r(3, 7, 20)), 2, 'easy fails when the cost is 7bb');
  assert.equal(difficultyOf(SK2.B1, false, false, r(3, 8, 40)), 2, 'easy fails under a quarter of the pot');
  assert.equal(difficultyOf(SK2.D1, false, false, { marginBars: 2.9 }), 2, 'other lessons keep the 3-bar cut');
});
