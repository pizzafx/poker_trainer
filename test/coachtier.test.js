// The coach's tier for hands the board makes (coachtier.js): the showdown rank, its cut points, and that every
// other hand keeps the tier handFeatures gives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, makeRng } from '../src/engine/cards.js';
import { handFeatures, TIER } from '../src/engine/features.js';
import { coachTier, showdownRank, COACH_CUTS } from '../src/trainer/coachtier.js';

const ct = (hole, board) => coachTier(parseCards(hole), parseCards(board));

test('coach tier: top kickers on a board that makes the hand read as pairs, not as nothing', () => {
  const a = ct('Ah Kc', '2h 2s 2c');
  assert.equal(a.raw, TIER.HIGH_CARD);
  assert.equal(a.boardMade, true);
  assert.equal(a.tier, TIER.TOP_PAIR_WEAK);
  assert.ok(a.rank > 0.86 && a.rank < 0.92, `AK on 2-2-2 ranks ${a.rank}`);
  assert.equal(ct('Ah Kc', '2h 2s 2c 7s').tier, TIER.MIDDLE_PAIR); // any 7, pocket pair or 2 now beats it
  assert.equal(ct('2d Ah', 'Kh 3c 3s Kd').tier, TIER.MIDDLE_PAIR);
  // on a two-pair river the top kickers rank about 0.6, on the line between a weak pair and middle pair
  for (const [h, b] of [['Ad Ks', '7s Tc 3h Ts 3c'], ['2d Ah', 'Kh 3c 3s Kd 5c']]) {
    const c = ct(h, b);
    assert.ok(c.tier === TIER.WEAK_PAIR || c.tier === TIER.MIDDLE_PAIR, `${h} on ${b}: ${c.tier}`);
    assert.ok(c.rank > 0.55 && c.rank < 0.66);
  }
});

test('coach tier: a low kicker reads as high card or nothing, and cards that do not play are marked', () => {
  const q = ct('Ts Qc', 'Jd 5s 2s 2c 2h');
  assert.equal(q.raw, TIER.AIR);
  assert.equal(q.tier, TIER.HIGH_CARD);
  const low = ct('2c 2s', '7d 8c 5c 8s 7s'); // counterfeited: plays the board's two pair and its 5... loses to almost all
  assert.equal(low.tier, TIER.AIR);
  assert.ok(low.rank < 0.1);
  const chop = ct('4d 2h', 'Ac Ad 5d 6c Ah');
  assert.equal(chop.boardMade, true);
  assert.equal(chop.plays, false);
  assert.equal(chop.tier, TIER.AIR);
  assert.equal(ct('Ah Kc', '2h 2s 2c').plays, true);
});

test('coach tier: never below the raw tier, never above top pair with a weak kicker (the lower-of scope: never above raw)', () => {
  const rng = makeRng(77);
  let made = 0;
  for (let t = 0; t < 30000 && made < 300; t++) {
    const deck = [...Array(52).keys()];
    const nb = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < nb + 2; i++) {
      const j = i + Math.floor(rng() * (52 - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const hole = deck.slice(0, 2);
    const board = deck.slice(2, 2 + nb);
    const raw = handFeatures(hole, board).tier;
    const c = coachTier(hole, board);
    assert.equal(c.raw, raw);
    if (!c.boardMade) {
      assert.equal(c.tier, raw);
      assert.equal(c.rank, null);
      continue;
    }
    made++;
    if (c.lower) {
      // quads or straight-flush board, or a counterfeited pocket pair (MATH, STRAT, 20 Nov): never above raw
      assert.ok(c.tier <= raw);
    } else {
      assert.ok(raw <= TIER.HIGH_CARD);
      assert.ok(c.tier >= raw && c.tier <= TIER.TOP_PAIR_WEAK);
    }
    assert.ok(c.rank >= 0 && c.rank <= 1);
  }
  assert.ok(made >= 100, `only ${made} board-made hands sampled`);
});

test('coach tier: hands outside the scope keep their tier', () => {
  for (const [hole, board] of [
    ['Ah Kc', '2h 2s 7c'], // one pair on the board: the owner's board-pair ruling, untouched
    ['Ah 7c', 'As 9d 4h 4c'], // the hole cards add the second pair
    ['Jh Jd', '7h 7s Qs Qh 6c'], // a pocket pair under a two-pair board has its own raw tier
    ['Ah Kc', 'Qs Jd 4h'],
    ['9h 9d', '9s 4c 4d'],
  ]) {
    const c = ct(hole, board);
    assert.equal(c.tier, c.raw, `${hole} on ${board}`);
    if (c.raw > TIER.HIGH_CARD || !c.boardMade) assert.equal(c.rank, null);
  }
});

test('coach tier: the rank counts ties as half and the cut points rise with each tier', () => {
  assert.equal(showdownRank(parseCards('4d 2h'), parseCards('As Ks Qs Js Ts')), 0.5); // a royal flush on the board: every hand ties
  const nuts = showdownRank(parseCards('Ah Ad'), parseCards('As Ac 7d 7h 2c'));
  assert.equal(nuts, 1);
  for (const row of COACH_CUTS) for (let i = 1; i < row.length; i++) assert.ok(row[i] > row[i - 1]);
  for (let i = 0; i < 4; i++) assert.ok(COACH_CUTS[0][i] > COACH_CUTS[1][i] && COACH_CUTS[1][i] > COACH_CUTS[2][i]);
});
