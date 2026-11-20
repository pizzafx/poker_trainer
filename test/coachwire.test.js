// The coach tier wired in (MATH, STRAT, 19-20 Nov; notes kept apart): the routing tier, the "you have" line, the bet
// wording for board-made hands, and the range buckets
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/engine/cards.js';
import { TIER, handFeatures } from '../src/engine/features.js';
import { coachFeatures, coachHandText, coachTiersForRange, coachTier } from '../src/trainer/coachtier.js';
import { explain } from '../src/trainer/explain.js';
import { HandBelief, newRead } from '../src/trainer/belief.js';
import { TYPE_IDS } from '../src/bots/profiles.js';
import { classNames } from '../src/engine/hands.js';
import { COMBOS } from '../src/engine/hands.js';
import { evaluate } from '../src/engine/evaluator.js';

test('coach tier: a board-made hand routes by its showdown rank; other hands keep the features tier', () => {
  const f = coachFeatures(parseCards('Ad Kc'), parseCards('2s 2d 2h 7c'));
  assert.equal(f.coach.raw, TIER.HIGH_CARD);
  assert.equal(f.tier, TIER.MIDDLE_PAIR, 'AK on 2-2-2-7 reads as middle pair');
  assert.equal(f.coach.boardMade, true);
  const g = coachFeatures(parseCards('Ad Kc'), parseCards('Ah 9d 4c'));
  assert.equal(g.tier, handFeatures(parseCards('Ad Kc'), parseCards('Ah 9d 4c')).tier, 'a real pair: unchanged');
  assert.equal(g.coach.boardMade, false);
});

test('"you have": the board hand, the kicker, the coach phrase; the no-play and weak variants', () => {
  const t = (h, b) => coachHandText(parseCards(h), parseCards(b), coachTier(parseCards(h), parseCards(b)));
  assert.equal(t('Ad Kc', '2s 2d 2h 7c'), 'trips on the board with an ace kicker: about as strong as middle pair');
  assert.equal(t('Ad Ks', '7s Tc 3h Ts 3c'), 'two pair on the board with an ace kicker: about as strong as a weak pair');
  assert.equal(t('2c 2d', '7s 8d 5c 8h 7h'), "two pair on the board; your cards don't play");
  assert.equal(t('8d 4c', '9s 9h 7d 7c 2s'), 'two pair on the board with an eight kicker: most hands beat it');
  assert.equal(t('Ad Kc', 'Ah 9d 4c'), null, 'not board-made: describeHand stands');
});

// a river check-or-bet spot on a board-made hand, the passedBluff headline and the bet line
const rec = (W, need, evBet) => ({
  street: 3, toCall: 0, currentBet: 0, raises: 0, opponents: 1, position: 'BTN', tier: TIER.WEAK_PAIR, boardMade: true,
  hole: parseCards('Ad Ks'), board: parseCards('7s Tc 3h Ts 3c'), liveTypes: ['station'],
  verdict: { grade: 'good', note: 'passedBluff', mine: 0, best: 1, small: 6, anchors: {}, options: [{ type: 'check', label: 'Check', ev: 10 }, { type: 'raise', to: 20, label: 'Bet $20', ev: evBet, F: 0.2, C: 0.8, R: 0, W, need, alpha: 0.4 }] },
});
test('board-made headline: "A bet scores" when the bet wins when called as often as it needs, "A bluff" otherwise', () => {
  assert.match(explain(rec(0.7, 0.5, 20)).headline, /\(A bet scores about \$10 more/);
  assert.match(explain(rec(0.1, 0.5, 20)).headline, /\(A bluff scores about \$10 more/);
  // the same for every hand (STRAT, 20 Nov): "A bet scores" on a value bet, "A bluff" otherwise
  assert.match(explain({ ...rec(0.7, 0.5, 20), boardMade: false }).headline, /\(A bet scores/);
  assert.match(explain({ ...rec(0.1, 0.5, 20), boardMade: false }).headline, /\(A bluff scores/);
});

test('range buckets: on a board-made board, combos the board makes read by rank among the live combos', () => {
  const board = parseCards('2s 2d 2h 7c');
  const used = new Set(board);
  const scores = COMBOS.map(([a, b]) => (used.has(a) || used.has(b) ? null : evaluate([a, b, ...board])));
  const raw = COMBOS.map(([a, b]) => (used.has(a) || used.has(b) ? 0 : handFeatures([a, b], board).tier));
  const ct = coachTiersForRange(board, scores, raw);
  const idx = COMBOS.findIndex(([a, b]) => (a === parseCards('Ad')[0] && b === parseCards('Kc')[0]) || (a === parseCards('Kc')[0] && b === parseCards('Ad')[0]));
  assert.ok(ct[idx] >= TIER.MIDDLE_PAIR, 'AK reads at least middle pair');
  const lo = COMBOS.findIndex(([a, b]) => [a, b].sort().join() === parseCards('4c 3d').sort().join());
  assert.ok(ct[lo] <= TIER.HIGH_CARD, '43 reads as ace or king high or lower');
  assert.equal(coachTiersForRange(parseCards('Ks 9d 4h'), scores, raw), null, 'not a board-made board');
  // the grid's buckets use it: on 2-2-2-7 the AKo class is not "nothing" (bucket 4)
  const reads = [null, newRead(TYPE_IDS.map((id) => (id === 'station' ? 1 : 0)))];
  const bel = new HandBelief(reads, parseCards('Qh Jh'));
  bel.setBoard(board);
  const g = bel.grid(1);
  const ako = classNames.indexOf('AKo');
  assert.notEqual(g.cells[ako].kind, 4, 'AKo is not bucketed as nothing');
  assert.ok(g.mix[4] < 0.5, 'nothing is under half the range on 2-2-2-7');
});

import { anchorLine } from '../src/trainer/explain.js';
test('board-made bet lines: value lines when W >= need; the "do not bluff" line never within the bar of checking or better', () => {
  const r = (W, evBet, bm = true) => anchorLine({ ...rec(W, 0.5, evBet), boardMade: bm, verdict: { ...rec(W, 0.5, evBet).verdict, grade: 'mistake', line: '1', options: [{ type: 'check', label: 'Check', ev: 10, st: 'even' }, { type: 'raise', to: 20, label: 'Bet $20', ev: evBet, F: 0.2, C: 0.8, R: 0, W, need: 0.5, alpha: 0.4, st: 'fails' }] } });
  assert.match(r(0.7, 30), /when this bet is called you are ahead about 70%/, 'W over need: the value line');
  assert.doesNotMatch(r(0.1, 30), /Do not bluff|when this bet is called/, 'a bluff better than checking by more than the bar: the folds line, no "do not bluff"');
  assert.match(r(0.1, 13), /about the same as checking.*Fine, not needed/, 'within the bar: fine, not needed');
  assert.match(r(0.1, 3), /Do not bluff this field/, 'worse than checking by more than the bar: do not bluff');
  assert.match(r(0.1, 30, false), /when this bet is called you are ahead about 10%/, 'a real weak pair keeps the made-hand line');
});
