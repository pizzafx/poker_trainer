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
  assert.equal(t('2c 2d', '7s 8d 5c 8h 7h'), "two pair on the board; your cards don't play: the best you can do is split the pot");
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

import { rangePicture } from '../src/trainer/judge.js';
import { STREET } from '../src/engine/game.js';
import { boardRangeParts } from '../src/trainer/coachtier.js';
import { categoryOf, CATEGORY } from '../src/engine/evaluator.js';
// STRAT's and DESIGN's fixture (20 Nov): on each board type no label is false for any hand under it
test('range line on board-made boards: every hand sits under a true label (trips, two pair, straight, flush, full house, quads)', () => {
  const hole = parseCards('Qh Jh');
  const cases = [
    ['2s 2d 2h 7c', ['a full house or better', 'a top kicker', 'a middling kicker', 'nothing better than the board']],
    ['Ts Td 3h 3c 7s', ['a full house or better', 'a higher two pair or a top kicker', 'a middling kicker', 'nothing better than the board']],
    ['Ks Kd Qc Qs 4s', null],
    ['5s 6d 7c 8c 9s', ['a higher straight', 'nothing better than the board']],
    ['Kd 9d 6d 4d 2d', ['a better hand than the board', 'a higher flush', 'nothing better than the board']],
    ['7s 7d 7c 2s 2d', ['quads or a higher full house', 'nothing better than the board']],
    ['Ks Kd Kc Kh 5s', ["a higher kicker than the board's", 'nothing better than the board']],
  ];
  for (const [B, want] of cases) {
    const board = parseCards(B);
    const bs = evaluate(board);
    const bc = categoryOf(bs);
    const reads = [null, newRead(TYPE_IDS.map((id) => (id === 'station' ? 1 : 0)))];
    const bel = new HandBelief(reads, hole);
    bel.setBoard(board);
    const street = board.length === 3 ? STREET.FLOP : board.length === 4 ? STREET.TURN : STREET.RIVER;
    const pic = rangePicture(bel, 1, { street, board, hole: [hole, []] }, 0);
    assert.ok(pic.boardParts && pic.boardParts.length, B);
    const labels = pic.boardParts.map(([l]) => l);
    if (want) for (const l of labels) assert.ok(want.includes(l), `${B}: unexpected label ${l}`);
    assert.ok(Math.abs(pic.boardParts.reduce((a, [, x]) => a + x, 0) - 1) < 1e-9, `${B}: parts sum to 1`);
    // each hand alone: its label is true of it
    const feats = bel.features(street);
    const ct = bel.coachTiers(street);
    for (let c = 0; c < 1326; c += 3) {
      if (!feats[c]) continue;
      const f = feats[c];
      const parts = boardRangeParts(board, [{ hole: COMBOS[c], score: f.score, tier: ct[c], draw: false, w: 1 }]);
      const [l] = parts[0];
      const k = categoryOf(f.score);
      const name = `${B}: combo ${c} under "${l}"`;
      if (/or better$|^a better hand|^a straight flush$/.test(l)) assert.ok(k > bc, name);
      else if (/^a higher (straight|flush|kicker)|^quads or a higher/.test(l)) assert.ok(f.score > bs && k >= bc, name);
      else if (l === 'a higher two pair or a top kicker') assert.equal(k, CATEGORY.TWO_PAIR, name);
      else assert.equal(k, bc, name); // a kicker, or nothing better than the board: the board's own category, no pair claimed
      if (l === 'nothing better than the board' && board.length === 5 && bc >= CATEGORY.STRAIGHT) assert.equal(f.score, bs, name);
      if ((l === 'a middling kicker' || l === 'nothing better than the board') && bc === CATEGORY.TWO_PAIR) {
        const [a, b] = COMBOS[c].map((x) => x >> 2);
        assert.ok(!(a === b && a > Math.min(...board.map((x) => x >> 2).filter((r, i, arr) => arr.indexOf(r) !== i))), `${name}: a higher pocket pair is a higher two pair`);
      }
    }
  }
});

// MATH (20 Nov): the range's tiers are the same function of (combo, board) as coachTier, hero's cards dead or not
test('range coach tiers equal coachTier for every board-made combo, with hero cards dead', () => {
  for (const [B, H] of [['2s 2d 2h 7c', 'Qh Jh'], ['Ts Td 3h 3c 7s', 'As Kd'], ['Ks Kd Qc Qs', '9h 8h'], ['8c 8d 8h Jc 4s', 'Ad 2c']]) {
    const board = parseCards(B);
    const bel = new HandBelief([null, newRead(TYPE_IDS.map((id) => (id === 'abc' ? 1 : 0)))], parseCards(H));
    bel.setBoard(board);
    const street = board.length === 4 ? STREET.TURN : STREET.RIVER;
    const ct = bel.coachTiers(street);
    const feats = bel.features(street);
    let n = 0;
    for (let c = 0; c < 1326; c++) {
      if (!feats[c]) continue;
      const e = coachTier(COMBOS[c], board, feats[c]);
      if (!e.boardMade) continue;
      n++;
      assert.equal(ct[c], e.tier, `${B}: combo ${c}`);
    }
    assert.ok(n > 100, `${B}: ${n} board-made combos checked`);
  }
});
