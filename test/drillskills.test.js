// Drill bank: difficulty and the tricky features (CURR's ruling, 18 Nov 2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/engine/cards.js';
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
