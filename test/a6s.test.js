// The owner's disputed hand (notes/PRO_SPOT_A6s.md): button A♠6♠, board 2♥ T♣ A♥ 8♦, three-way
// against a solid regular (who led the flop for the pot and checked the turn) and a station.
// Checking the turn with top pair and a weak kicker is never flagged; it gets a green note that
// quotes a bet of at most three-quarters of the pot and names the station.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, makeRng } from '../src/engine/cards.js';
import { newHand, applyAction } from '../src/engine/game.js';
import { buildContext } from '../src/bots/policy.js';
import { TYPE_IDS } from '../src/bots/profiles.js';
import { HandBelief, newRead } from '../src/trainer/belief.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { explain } from '../src/trainer/explain.js';
import { Session } from '../src/trainer/session.js';

const readFor = (type, conf = 0.85) => newRead(TYPE_IDS.map((id) => (id === type ? conf : (1 - conf) / (TYPE_IDS.length - 1))));

test('A6s: checking weak top pair on the turn is green, with a note naming the station', () => {
  // Seats: 0 hero (button), 1 small blind, 2 Shades (big blind, solid regular), 3 Jeans (station).
  const sess = new Session({ seed: 4, samples: 60, custom: { sb: 1, bb: 3, minBuy: 100, maxBuy: 500 }, lineup: ['nit', 'tag', 'station'] });
  const types = [null, 'nit', 'tag', 'station'];
  const nicks = [null, 'Ball Cap', 'Shades', 'Jeans'];
  for (let i = 1; i < 4; i++) Object.assign(sess.seats[i], { type: types[i], nick: nicks[i], read: readFor(types[i]) });

  const rng = makeRng(42);
  const board = parseCards('2h Tc Ah 8d');
  const s = newHand({ stacks: [500, 300, 300, 300], button: 0, sb: 1, bb: 3, rng, hole: [parseCards('As 6s'), null, null, null] });
  for (let i = 1; i < 4; i++) {
    for (let k = 0; k < 2; k++) {
      if (board.includes(s.hole[i][k])) {
        const repl = s.remaining.find((c) => !board.includes(c));
        s.remaining.splice(s.remaining.indexOf(repl), 1, s.hole[i][k]);
        s.hole[i][k] = repl;
      }
    }
  }
  let dealt = 0;
  const fixedRng = () => (s.remaining.indexOf(board[dealt++]) + 0.5) / s.remaining.length;
  const belief = new HandBelief([null, ...types.slice(1).map((t) => sess.seats[types.indexOf(t)].read)], s.hole[0]);
  const C = { type: 'call' };
  const X = { type: 'check' };
  const F = { type: 'fold' };
  // Jeans limps, hero limps, small blind folds, Shades checks; Shades leads the flop for the pot,
  // Jeans and hero call; turn checked to hero.
  const script = [[3, C], [0, C], [1, F], [2, X], [2, { type: 'raise', to: 10 }], [3, C], [0, C], [2, X], [3, X]];
  let seen = 0;
  for (const [seat, a] of script) {
    assert.equal(s.toAct, seat);
    const ctx = buildContext(s);
    if (seat !== 0) belief.observe(seat, ctx, a);
    applyAction(s, a, fixedRng);
    if (s.board.length > seen) {
      seen = s.board.length;
      belief.setBoard(s.board);
    }
  }
  assert.equal(s.toAct, 0);
  assert.equal(s.board.length, 4);
  sess.hand = { state: s, belief };

  const ctx = buildContext(s);
  const action = { type: 'check' };
  const opts = { samples: 1500, seed: 5, heat: 0 };
  const v = judgeDecision(s, 0, belief, action, opts);
  const bestBefore = v.options[v.best];
  const flaggedBefore = v.grade !== 'good';
  sess.temper(v, s, ctx, action, opts);
  const out = explain({ verdict: v, street: s.street, tier: 4, regularIn: true });

  assert.ok(bestBefore.type === 'raise', `the judge prefers a bet (${bestBefore.label})`);
  assert.ok(flaggedBefore, 'the raw verdict flags the check, so the rule is what turns it green');
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'thinValue');
  assert.ok(v.thin, 'a smaller bet rates higher, so there is a note');
  assert.equal(v.thin.nick, 'Jeans');
  assert.ok(v.thin.to - s.currentBet <= 0.75 * v.pot + 0.5, `quoted bet $${v.thin.to} is at most 75% of the $${v.pot} pot`);
  // QA K2/K3: in parentheses, a comma after the name, and the real figure once it reaches the yellow bar
  assert.match(out.headline, /^Check: fine\. \(Against Jeans, a bet of about (a third|half|three-quarters) of the pot (rates a little higher|does about \$\d+ better)\.\)$/);
  assert.equal(out.cost, 0);
});
