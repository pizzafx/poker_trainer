// Drill bank: a spot record replays the table and the judge's pinned read exactly
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREET } from '../src/engine/game.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { HandBelief } from '../src/trainer/belief.js';
import { Session, APP_GAME } from '../src/trainer/session.js';
import { captureSpot, replaySpot, pinnedReads } from '../scripts/drill/spot.js';

// plays session hands with a pinned belief fed alongside (as the bank pipeline does), and returns the first
// hero decision on `street`
function liveSpot(street, seed) {
  const sess = new Session({ game: APP_GAME.game, rake: APP_GAME.rake, heroBuy: APP_GAME.heroBuy, seed, samples: 60, table: 'typical', seats: 8 });
  const types = sess.seats.map((p) => (p.hero ? null : p.type));
  for (let hand = 0; hand < 400; hand++) {
    sess.freshStack();
    sess.heat = 0;
    sess.startHand();
    const h = sess.hand;
    const s = h.state;
    const pinned = new HandBelief(pinnedReads(types), s.hole[0]);
    const ob = h.belief.observe.bind(h.belief);
    const sb = h.belief.setBoard.bind(h.belief);
    h.belief.observe = (seat, ctx, a) => (ob(seat, ctx, a), pinned.observe(seat, ctx, a));
    h.belief.setBoard = (b) => (sb(b), pinned.setBoard(b));
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 500) {
      if (sess.status() === 'bot') {
        sess.heat = 0;
        sess.stepBot();
        continue;
      }
      if (s.street === street) return { s, pinned, rec: captureSpot(s, { types, nicks: sess.seats.map((p) => p.nick) }) };
      sess.autoHero();
    }
  }
  throw new Error('no spot found');
}

for (const [name, street, seed] of [['preflop', STREET.PRE, 4], ['the turn', STREET.TURN, 9], ['the river', STREET.RIVER, 13]]) {
  test(`drill spot: a record on ${name} replays the table and the pinned read; the judge gives the same values`, () => {
    const { s, pinned, rec } = liveSpot(street, seed);
    const back = replaySpot(JSON.parse(JSON.stringify(rec)));
    assert.deepEqual(back.s.board, s.board);
    assert.deepEqual(back.s.stacks, s.stacks);
    assert.equal(back.s.toAct, 0);
    assert.equal(back.s.currentBet, s.currentBet);
    const opts = { samples: 400, seed: 7, heat: 0 };
    const a = judgeDecision(s, 0, pinned, null, opts);
    const b = judgeDecision(back.s, 0, back.belief, null, opts);
    assert.deepEqual(b.options.map((o) => [o.label, o.ev]), a.options.map((o) => [o.label, o.ev]));
  });
}
