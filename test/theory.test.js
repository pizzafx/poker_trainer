// "Why theory disagrees" says only what is true of the hand and the table (STRAT_THEORY_COPY).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/engine/cards.js';
import { STREET } from '../src/engine/game.js';
import { TIER } from '../src/engine/features.js';
import { TYPE_IDS } from '../src/bots/profiles.js';
import { explain, dryBoard, blockerHand } from '../src/trainer/explain.js';

const post = (id, p = 0.9) => TYPE_IDS.map((t) => (t === id ? p : (1 - p) / (TYPE_IDS.length - 1)));
const missedValue = (over = {}) => ({
  street: STREET.FLOP,
  hole: parseCards('Ac Qh'),
  board: parseCards('Ah 2c Qd'),
  tier: TIER.TWO_PAIR,
  opponents: 1,
  toCall: 0,
  raises: 0,
  pot: 20,
  odds: 0,
  position: 'BTN',
  regularIn: false,
  table: { n: 9, raked: true, voluntary: 1, oop: false },
  villain: { nick: 'Jeans', picture: { post: post('station'), buckets: { monster: 0, strong: 0.05, twoPair: 0.05, topPair: 0.3, weakPair: 0.3, draw: 0.04, air: 0.26 }, equity: 0.8 } },
  verdict: { grade: 'mistake', mine: 0, best: 1, loss: 10, se: 1, small: 3, pot: 20, options: [{ type: 'check', label: 'Check', ev: 10 }, { type: 'raise', to: 10, label: 'Bet $10 (50% pot)', ev: 20 }] },
  ...over,
});

test("theory: the owner's AQ on A-2-Q against a station names the blockers and what the station calls with", () => {
  const e = explain(missedValue());
  assert.equal(e.theory, "Why theory disagrees: theory sometimes checks here: your cards block many of the hands that would call, and on a dry board a free card rarely hurts. Against a calling station that doesn't matter: they call with weaker pairs.");
});

test('theory: top set says "most"; the river drops the free card; a wet board or a multiway pot has no line', () => {
  assert.match(explain(missedValue({ hole: parseCards('Ad As'), tier: TIER.STRONG })).theory, /block most of/);
  const river = explain(missedValue({ street: STREET.RIVER, board: parseCards('Ah 2c Qd 7s 9h') })).theory;
  assert.ok(!/free card/.test(river), river);
  assert.equal(explain(missedValue({ board: parseCards('Ah Qh 2c') })).theory, null);
  assert.equal(explain(missedValue({ opponents: 2 })).theory, null);
});

test('theory: two pair without the blockers gets the trap line; one pair keeps the pot-control line', () => {
  assert.match(explain(missedValue({ hole: parseCards('Ac 2d') })).theory, /^Why theory disagrees: on a dry board theory sometimes checks a hand this strong/);
  assert.match(explain(missedValue({ hole: parseCards('Ac Kd'), tier: TIER.TOP_PAIR_GOOD })).theory, /control the pot/);
});

test('theory: dry boards and blocker hands', () => {
  assert.equal(dryBoard(parseCards('Ah 2c Qd'), false), true);
  assert.equal(dryBoard(parseCards('Ah 2h Qd'), false), false, 'a suit twice');
  assert.equal(dryBoard(parseCards('Ah 2c 4d'), false), false, 'A-2-4 sits in a five-rank window, the ace low');
  assert.equal(dryBoard(parseCards('Ah 2h Qd Kc 7s'), true), false, 'A-K-Q');
  assert.equal(blockerHand(parseCards('Ac Qh'), parseCards('Ah 2c Qd')), 'two');
  assert.equal(blockerHand(parseCards('Ac Ad'), parseCards('Ah 2c Qd')), 'set');
  assert.equal(blockerHand(parseCards('Ac 2d'), parseCards('Ah 2c Qd')), null);
});

const preflop = (category, over = {}) => {
  const fold = { type: 'fold', label: 'Fold', ev: 0 };
  const call = { type: 'call', label: 'Call $6', ev: -3 };
  const raise = { type: 'raise', to: 18, label: 'Raise to $18 (3.0x)', ev: 4 };
  const opts = category === 'preLoose' ? [fold, call] : [fold, call, raise];
  return {
    street: STREET.PRE, hole: parseCards('Kc 9d'), board: [], tier: null, opponents: 2, toCall: 6, raises: 1, pot: 9, odds: 0.4, position: 'UTG',
    table: { n: 6, raked: false, voluntary: 1, oop: false }, ctx: { limpers: 0 },
    verdict: { grade: 'mistake', mine: 1, best: category === 'preLoose' ? 0 : 2, loss: 5, se: 1, small: 6, pot: 9, options: opts },
    ...over,
  };
};

test('theory: preflop clauses only when true', () => {
  // six-handed, no rake, one other player in: no clause is true, so no line
  assert.equal(explain(preflop('preLoose')).theory, null);
  const full = explain(preflop('preLoose', { table: { n: 9, raked: true, voluntary: 2, oop: true } }));
  assert.match(full.theory, /At a full table, raked, and headed for a multiway pot, this hand does not earn its way in\./);
  assert.ok(full.reasons.some((r) => /dominated or out of position in a raked pot/.test(r)));
  const loose = explain(preflop('preLoose'));
  assert.ok(loose.reasons.some((r) => /often be dominated\.$/.test(r)), loose.reasons.join(' | '));
  // a limp or flat where a raise was best: theory only facing a raise (or completing the small blind)
  assert.match(explain(preflop('prePassive')).theory || '', /keeps your range balanced/);
  assert.equal(explain(preflop('prePassive', { raises: 0, toCall: 2 })).theory, null);
});

test('theory: the river trap line has its own words; a river with three of a suit never says "dry" (STRAT T-2)', () => {
  const river = explain(missedValue({ street: STREET.RIVER, hole: parseCards('Ac 2d'), board: parseCards('Ah 2c Qd 7s 9h') })).theory;
  assert.equal(river, 'Why theory disagrees: on the river theory sometimes checks a hand this strong so that worse hands bet. Against a calling station, betting gets paid more: they call with weaker pairs.');
  const flush = explain(missedValue({ street: STREET.RIVER, hole: parseCards('2h Th'), board: parseCards('5h Kh 8d 3s Qh'), tier: TIER.STRONG })).theory;
  assert.ok(!/dry/.test(flush || ''), flush);
});
