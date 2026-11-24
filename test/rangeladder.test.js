// The Ranges tab's ladder (DESIGN's combined range view; MATH owns the numbers): rungs, the "You" line, and the
// win-by-the-river run-outs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/engine/cards.js';
import { comboIndex, COMBOS } from '../src/engine/hands.js';
import { ladderOf, ladderEquity, round5, HIDE_BELOW, pctText, guessRight, keptOf } from '../src/trainer/rangeladder.js';

const flat = () => new Float64Array(1326).fill(1);

test('hand 559 shape: ace high with the nut flush draw has every pair above the line and draws and air below', () => {
  const lad = ladderOf(flat(), parseCards('8s 3s 9c'), parseCards('As Qs'));
  assert.deepEqual(lad.above, [0, 1, 2]);
  const sum = lad.rungs.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `shares sum to ${sum}`);
  // the section total is the headline's own measure, not the sum of the rungs above the line (MATH, CEO)
  assert.ok(Math.abs(lad.beatsYou - (1 - lad.ahead)) < 1e-9);
  for (const b of [0, 1, 2]) assert.equal(lad.rungs[b].ahead, 0, `rung ${b}: every pair beats ace high`);
  assert.ok(lad.rungs[3].ahead > 0.5 && lad.rungs[4].ahead > 0.5);
  const e = ladderEquity(lad);
  assert.ok(e.equity > 0.5 && e.equity < 0.85, `equity ${e.equity}`); // a big draw plus overcards against a wide range
  assert.ok(e.rung[0] < e.rung[4], 'it wins more often against air than against two pair or better');
});

test('the line follows ahead-now, not the category: underpairs to the board sit above a small pocket pair', () => {
  // 44 on J73: TT-88 are "weaker pairs" by category but beat 44, so that rung is above the line
  const lad = ladderOf(flat(), parseCards('Js 7s 3h'), parseCards('4c 4d'));
  assert.ok(lad.above.includes(2), `above ${lad.above}`);
  assert.ok(lad.rungs[2].ahead < 0.5);
});

test('a strong hand has nothing above the line; a hand the range cannot hold is never counted', () => {
  const hole = parseCards('Jc Jd');
  const board = parseCards('Js 7s 3h');
  const lad = ladderOf(flat(), board, hole);
  assert.deepEqual(lad.above, []);
  assert.equal(lad.beatsYou, 0);
  for (const c of [comboIndex(hole[0], hole[1]), comboIndex(board[0], board[1])]) assert.equal(lad.rung[c], -1);
});

test('on the river, win by the river is ahead now', () => {
  const lad = ladderOf(flat(), parseCards('8s 3s 9c 2d Kh'), parseCards('As Qs'));
  const e = ladderEquity(lad);
  assert.equal(round5(e.equity), round5(lad.ahead));
});

test('weights: a range of only sets puts everything above the line; kept measures width against the fullest combo', () => {
  const board = parseCards('8s 3s 9c');
  const w = new Float64Array(1326);
  for (let c = 0; c < 1326; c++) {
    const [p, q] = COMBOS[c];
    if (p >> 2 === q >> 2 && [6, 1, 7].includes(p >> 2)) w[c] = 1; // 88, 33, 99
  }
  const lad = ladderOf(w, board, parseCards('As Qs'));
  assert.ok(lad.rungs[0].share > 0.99);
  assert.ok(lad.kept < 0.01, `kept ${lad.kept}`);
  assert.ok(HIDE_BELOW === 0.03);
});

test('MATH: a weak pair with only a backdoor flush draw is a weaker pair, not a draw', () => {
  // 7d6d on K72 rainbow but one diamond: bottom pair plus a backdoor flush draw
  const w = new Float64Array(1326);
  const c = comboIndex(...parseCards('7d 6d'));
  w[c] = 1;
  const lad = ladderOf(w, parseCards('Ks 7c 2d'), parseCards('As Qh'));
  assert.equal(lad.rung[c], 2);
});

test('flop run-outs are exact (all 1,081), and the numbers print per MATH', () => {
  const lad = ladderOf(new Float64Array(1326).fill(1), parseCards('8s 3s 9c'), parseCards('As Qs'));
  const a = ladderEquity(lad);
  const b = ladderEquity(lad, { seed: 99 }); // the seed only matters when sampling
  assert.equal(a.equity, b.equity);
  assert.equal(pctText(0), '0%');
  assert.equal(pctText(1), '100%');
  assert.equal(pctText(0.01), 'under 5%');
  assert.equal(pctText(0.99), 'over 95%');
  assert.equal(pctText(0.42), '40%');
});

test('Guess first: the band is right, and a neighbour within 2.5 points of an edge is too', () => {
  assert.equal(guessRight(0, 0.1), true);
  assert.equal(guessRight(1, 0.1), false);
  assert.equal(guessRight(1, 0.24), true); // within 2.5 of 25
  assert.equal(guessRight(0, 0.26), true);
  assert.equal(guessRight(2, 0.59), true); // within 2.5 of 60
  assert.equal(guessRight(2, 0.55), false);
  assert.equal(guessRight(0, 0.7), false);
});

test('kept before the flop: 100% for an untouched range', () => {
  assert.equal(keptOf(new Float64Array(1326).fill(1), parseCards('As Qs')), 1);
});

test('beats you now sums with the rounded ahead now, under 5 and over 95 at the ends (MATH)', async () => {
  const { beatsPctText } = await import('../src/trainer/rangeladder.js');
  assert.equal(beatsPctText(0.6), '40%');
  assert.equal(beatsPctText(0.99), 'under 5%');
  assert.equal(beatsPctText(0.01), 'over 95%');
  assert.equal(beatsPctText(1), '0%');
});

test('keeps N%: the surviving mass, 100% before anyone acts', async () => {
  const { survivingMass } = await import('../src/trainer/rangeladder.js');
  const dead = new Uint8Array(52);
  for (const c of parseCards('As Qs')) dead[c] = 1;
  const arrs = [0, 1].map(() => {
    const a = new Float64Array(1326);
    for (let c = 0; c < 1326; c++) if (!dead[COMBOS[c][0]] && !dead[COMBOS[c][1]]) a[c] = 1;
    return a;
  });
  assert.ok(Math.abs(survivingMass(arrs, [0.5, 0.5], dead) - 1) < 1e-12);
  arrs[1].fill(0);
  assert.ok(Math.abs(survivingMass(arrs, [0.5, 0.5], dead) - 0.5) < 1e-12);
});
