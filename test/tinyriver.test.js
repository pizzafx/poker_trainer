// POOL batch 19c item 9 (QA-VERDICT N3b, CEO must-fix): a small river bet into a big pot. The air caps count 10bb as a
// big bet whatever the pot; the tiny-bet floor now has the last word, and a hand that plays the board never folds a chop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHand, applyAction, potSize } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { buildContext, postflopPolicy } from '../src/bots/policy.js';
import { PROFILES, TYPE_IDS } from '../src/bots/profiles.js';

const TYPES = TYPE_IDS.filter((t) => PROFILES[t] && t !== 'baseline');
// three players, 1000bb deep; preflop raise to $600 and two calls; flop and turn checked through; seat 1 bets `bet` on the river
function river(holes, board, bet) {
  const s = newHand({ stacks: [2000, 2000, 2000], button: 0, sb: 1, bb: 2, hole: holes.map(parseCards), rng: Math.random });
  s.plan = parseCards(board);
  const pre = [['raise', 600], ['call'], ['call']];
  for (const [type, to] of pre) applyAction(s, to ? { type, to } : { type }, Math.random);
  for (let i = 0; i < 6; i++) applyAction(s, { type: 'check' }, Math.random);
  assert.equal(s.board.length, 5);
  const bettor = s.toAct; applyAction(s, { type: 'raise', to: bet }, Math.random);
  return { s, bettor };
}
const pol = (s, t) => postflopPolicy(buildContext(s), PROFILES[t], handFeatures(s.hole[s.toAct], s.board, boardTexture(s.board)));

test('item 9: a hand that plays a board straight never folds a chop to a 2% river bet (QA-VERDICT n_sens_25loose h82)', () => {
  // Jd Th 7h 8s 9c is a J-high straight on the board; seat 1 (Td Qc) bets, and the next to act (4s 5s) plays the board
  for (const t of TYPES) {
    const { s } = river(['2c 3d', 'Td Qc', '4s 5s'], 'Jd Th 7h 8s 9c', 36);
    assert.ok(36 / potSize(s) < 0.03);
    const p = pol(s, t);
    assert.ok(p.fold <= 0.006, `${t} folds a chop ${p.fold.toFixed(4)}`);
  }
});

test('item 9: air facing a 10bb+ bet of 4% of a big river pot folds at most 3x the pot odds, every type', () => {
  for (const t of TYPES) {
    const { s } = river(['6c 2d', 'As 9s', '4h 5h'], 'Kd Jc 8h 3s Qd', 76); // seat 1 bets 38bb into about $1,800; 4h 5h (no pair, no draw) responds
    const ctx = buildContext(s); assert.ok(ctx.toCall >= 20 && ctx.toCall / (ctx.pot - ctx.toCall) < 0.05);
    const p = pol(s, t);
    assert.ok(p.fold <= 3 * ctx.odds + 1e-9, `${t} folds ${p.fold.toFixed(3)} against a line of ${(3 * ctx.odds).toFixed(3)}`);
  }
});
