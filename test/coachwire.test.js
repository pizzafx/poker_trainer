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
// STRAT's and DESIGN's fixture (20 Nov, final): on each board type every hand's part is its evaluator comparison with
// hero's hand
test('range line on board-made boards: every hand sits under its comparison with hero\'s hand', () => {
  const cases = [
    // [board, hero, labels allowed]
    ['2s 2d 2h 7c', 'Ad Kc', ['a full house or better', 'quads or better', 'a higher kicker than yours', 'your kicker: a split', 'a lower kicker, or just the board']],
    ['Ts Td 3h 3c 7s', 'Ad Kc', ['a full house or better', 'a higher two pair', 'a higher kicker than yours', 'your kicker: a split', 'a lower kicker, or just the board']],
    ['Ks Kd Qc Qs 4s', 'Jd 9c', ['a flush or better', 'a full house or better', 'a higher two pair', 'a higher kicker than yours', 'your kicker: a split', 'a lower kicker, or just the board']],
    ['5s 6d 7c 8c 9s', 'Qh Jh', ['a better hand than the board', 'a higher straight', 'the board: a split']],
    ['Kd 9d 6d 4d 2d', 'Qh Jh', ['a better hand than the board', 'a higher flush', 'the board: a split']],
    ['7s 7d 7c 2s 2d', 'Qh Jh', ['quads or a higher full house', 'nothing better than the board']],
    // quads on the board are board-made whatever handFeatures says (STRAT): the kicker comparison, or the board
    ['Ks Kd Kc Kh 5s', 'Qh 3h', ['a higher kicker than yours', 'your kicker: a split', 'a lower kicker, or just the board']],
    ['Ks Kd Kc Kh 5s', '4h 3h', ['a better hand than the board', 'the board: a split']],
    // hero's cards do not play on a trips board; hero improves (77 on 2-2-2-7)
    ['2s 2d 2h Kc Qd', '4h 3h', ['a better hand than the board', 'the board: a split']],
    ['2s 2d 2h 7c', '7d 7h', ['a better hand than yours', 'the same hand: a split', 'a worse hand']],
  ];
  for (const [B, H, want] of cases) {
    const board = parseCards(B);
    const hole = parseCards(H);
    const bs = evaluate(board);
    const bc = categoryOf(bs);
    const hs = evaluate([...hole, ...board]);
    const reads = [null, newRead(TYPE_IDS.map((id) => (id === 'station' ? 1 : 0)))];
    const bel = new HandBelief(reads, hole);
    bel.setBoard(board);
    const street = board.length === 3 ? STREET.FLOP : board.length === 4 ? STREET.TURN : STREET.RIVER;
    const pic = rangePicture(bel, 1, { street, board, hole: [hole, []] }, 0);
    assert.ok(pic.boardParts && pic.boardParts.length, B);
    assert.ok(Math.abs(pic.boardParts.reduce((a, [, x]) => a + x, 0) - 1) < 1e-9, `${B}: parts sum to 1`);
    const feats = bel.features(street);
    for (let c = 0; c < 1326; c++) {
      if (!feats[c]) continue;
      const x = feats[c].score;
      const [[l]] = boardRangeParts(board, [{ hole: COMBOS[c], score: x, w: 1 }], { hole, score: hs });
      const name = `${B} vs ${H}: combo ${c} under "${l}"`;
      // alone, a combo names its own category in the top part ("quads or better"); in the range, the lowest present
      assert.ok(want.includes(l) || /or better$|^a straight flush$/.test(l), name);
      if (/or better$|^a straight flush$/.test(l)) assert.ok(categoryOf(x) > bc && x > hs, name);
      else if (/split/.test(l)) assert.equal(x, hs, name);
      else if (l === 'a lower kicker, or just the board' || l === 'a worse hand') assert.ok(x < hs, name);
      else if (l === 'nothing better than the board') assert.equal(x, bs, name);
      else if (l === 'a higher two pair') assert.ok(categoryOf(x) === CATEGORY.TWO_PAIR && x > hs, name);
      else assert.ok(x > hs, name); // higher kicker, higher straight or flush, better hand
    }
  }
});

// MATH (20 Nov): the range's tiers are the same function of (combo, board) as coachTier, hero's cards dead or not
test('range coach tiers equal coachTier for every board-made combo, with hero cards dead', () => {
  for (const [B, H] of [['2s 2d 2h 7c', 'Qh Jh'], ['Ts Td 3h 3c 7s', 'As Kd'], ['Ks Kd Qc Qs', '9h 8h'], ['8c 8d 8h Jc 4s', 'Ad 2c'], ['Ks Kd Kc Kh 5s', 'Qh 3h']]) {
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

test('the 15% "bets are nearly always real" test counts hands that only chop or lose to the board as air (STRAT)', () => {
  // a station's river bet on a board straight: hands that play the board are air for the test
  const board = parseCards('5s 6d 7c 8c 9s');
  const hole = parseCards('Qh Jh');
  const bel = new HandBelief([null, newRead(TYPE_IDS.map((id) => (id === 'station' ? 1 : 0)))], hole);
  bel.setBoard(board);
  const picture = rangePicture(bel, 1, { street: STREET.RIVER, board, hole: [hole, []] }, 0);
  const split = picture.boardParts.find(([l]) => l === 'the board: a split')[1];
  assert.ok(Math.abs(picture.boardAir - split) < 1e-9, 'the board-only hands are the air');
  assert.ok(picture.buckets.air < picture.boardAir, 'the coach-tier air bucket alone would undercount it');
});

test('quads on the board: the coach tier and "you have" come from the showdown rank, not handFeatures (STRAT)', () => {
  const b = parseCards('Ks Kd Kc Kh 5s');
  const q = coachTier(parseCards('Qh 3h'), b);
  assert.equal(q.raw, TIER.TOP_PAIR_GOOD, 'handFeatures calls Q3 top pair with a good kicker');
  assert.equal(q.boardMade, true);
  assert.equal(q.tier, TIER.TOP_PAIR_WEAK);
  assert.equal(coachHandText(parseCards('Qh 3h'), b, q), 'quads on the board with a queen kicker: about as strong as top pair with a weak kicker');
  const low = coachTier(parseCards('6h 3h'), b);
  assert.equal(low.tier, TIER.AIR, 'a six kicker: below the raw tier, no floor on a quads board');
  assert.equal(coachHandText(parseCards('6h 3h'), b, low), 'quads on the board with a six kicker: most hands beat it');
});
