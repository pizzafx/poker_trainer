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
});

// STRAT (19 Nov, YB-T1 at the bar): the passive-trap forms only strictly under the bar; at the bar U1's figure wins.
// QA-VERDICT's case: aggressive 1/2 2-handed, seed 24, hand 48, BTN/SB 9s6s on Js Ts 3s Qs, bet $11; check $10.7
// against the bet's $4.6, the bar $6
test('YB-T1 at the bar: a check ahead by exactly the bar is named with its figure, not "scores about the same"', () => {
  const opts = [{ type: 'check', label: 'Check', ev: 10.7 }, { type: 'raise', to: 11, label: 'Bet $11 (50% pot)', ev: 4.6 }];
  const rec = (small, note) => ({
    street: 3, toCall: 0, currentBet: 0, raises: 0, opponents: 1, position: 'BTN/SB', tier: 8,
    hole: parseCards('9s 6s'), board: parseCards('Js Ts 3s Qs'), liveTypes: ['abc'],
    verdict: { grade: 'good', note, mine: 1, best: 0, small, options: opts },
  });
  for (const note of ['unclear', 'fragile']) {
    const at = explain(rec(6, note)).headline;
    assert.doesNotMatch(at, /scores about the same/, `${note} at the bar: ${at}`);
    const under = explain(rec(7, note)).headline;
    assert.match(under, /checking to trap scores about the same here/, `${note} under the bar: ${under}`);
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
