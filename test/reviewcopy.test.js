// The review card's headline words (STRAT, CEO, owner 26 Nov): the result as a result; a decision's figure as what it is
// worth on average, never "cost you"; "the cards that came" only when the cards decided the hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewWords } from '../src/ui/reviewcopy.js';

const money = (x) => `$${Math.round(x)}`;
const opt = (type, label) => ({ type, label });
// one decision: mine and best are indexes into [fold, call $20, raise to $60]
// options: [fold, call $20, raise to $60, check, bet $30]
const dec = (grade, mine, best, cost = 0) => ({ verdict: { grade, mine, best, options: [opt('fold', 'Fold'), opt('call', 'Call $20'), opt('raise', 'Raise to $60'), opt('check', 'Check'), opt('raise', 'Bet $30')] }, cost });
const words = (net, decisions, showdown, best = () => false) => reviewWords({ net, decisions, showdown, isBest: best, money });
const all = (w) => `${w.result} ${w.cost ? w.cost.text : ''}`;

test('review words: won at a showdown with one flagged call says the cards that came won it', () => {
  const w = words(42, [dec('mistake', 1, 0, 7)], true);
  assert.equal(w.result, 'You won $42 this hand.');
  assert.equal(w.cost.text, 'One call was worth about $7 less than folding on average: it won this time because of the cards that came.');
  assert.equal(w.cost.cls, 'neg');
});

test('review words: won because everyone folded stops at "on average" (no "cards that came")', () => {
  const w = words(42, [dec('mistake', 2, 1, 9)], false);
  assert.equal(w.cost.text, 'One raise was worth about $9 less than calling, on average.');
  assert.doesNotMatch(all(w), /cards/);
});

test('review words: a flagged check that still wins at a showdown stops at "on average" (STRAT: it won less, not because of the cards)', () => {
  const w = words(42, [dec('mistake', 3, 4, 11)], true);
  assert.equal(w.cost.text, 'One check was worth about $11 less than betting, on average.');
});

test('review words: a flagged bet that wins at a showdown says the cards that came', () => {
  assert.equal(words(42, [dec('mistake', 4, 3, 5)], true).cost.text, 'One bet was worth about $5 less than checking on average: it won this time because of the cards that came.');
});

test('review words: lost with one flagged call', () => {
  const w = words(-30, [dec('blunder', 1, 0, 7)], true);
  assert.equal(all(w), 'You lost $30 this hand. One call was worth about $7 less than folding, on average.');
});

test('review words: lost with no flags says the cards went against you', () => {
  assert.equal(all(words(-30, [dec('good', 1, 1)], true)), 'You lost $30 this hand. Every decision was fine: the cards went against you.');
  assert.equal(all(words(-30, [dec('good', 1, 1)], true, () => true)), 'You lost $30 this hand. Your decision was the best play: the cards went against you.');
  assert.equal(words(-30, [dec('good', 1, 1)], true).cost.cls, 'ok');
});

test('review words: won with no flags, and several flags', () => {
  assert.equal(all(words(42, [dec('good', 1, 1), dec('good', 1, 1)], true, () => true)), 'You won $42 this hand. Every decision fine, 2 of them the best play.');
  assert.equal(all(words(42, [dec('mistake', 1, 0, 7), dec('blunder', 2, 1, 20)], true)), 'You won $42 this hand. 2 plays were worth about $27 less than the best ones, on average.');
  assert.equal(all(words(0, [], false)).trim(), 'You broke even this hand.');
});

test('review words: never "cost", and every dollar figure for a decision says "on average"', () => {
  for (const net of [42, -30, 0]) for (const sd of [true, false]) {
    for (const ds of [[dec('mistake', 1, 0, 7)], [dec('mistake', 1, 0, 7), dec('mistake', 2, 1, 3)], [dec('good', 1, 1)]]) {
      const w = words(net, ds, sd);
      assert.doesNotMatch(all(w), /\bcosts?\b/, all(w));
      if (w.cost && /\$/.test(w.cost.text)) assert.match(w.cost.text, /on average/, w.cost.text);
    }
  }
});

test('the first-use table tip says another play would do better on average, not that a play costs you money (CEO)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  assert.ok(src.includes('The coach speaks up when another play would do better, on average.'));
  assert.ok(!/costs you money/.test(src));
});
