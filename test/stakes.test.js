import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, GAMES } from '../src/trainer/session.js';

test('stakes: every casino game deals, posts its blinds and seats legal buy-ins', () => {
  assert.deepEqual(Object.keys(GAMES), ['1/3', '2/3', '2/5', '3/5']);
  for (const [key, g] of Object.entries(GAMES)) {
    assert.ok(g.sb < g.bb && g.minBuy < g.maxBuy, key);
    const sess = new Session({ game: key, seed: 11, samples: 40 });
    assert.equal(sess.game.bb, g.bb);
    assert.equal(sess.heroBuy, g.maxBuy);
    for (const p of sess.seats) if (!p.hero) assert.ok(p.stack >= g.minBuy, `${key}: ${p.nick} bought in for ${p.stack}`);
    sess.warmUp(60);
    sess.startPlayable();
    const s = sess.hand.state;
    assert.equal(s.bbAmt, g.bb);
    assert.equal(s.sbAmt, g.sb);
    assert.equal(s.total[s.bbSeat], Math.min(g.bb, s.startStacks[s.bbSeat]), `${key}: big blind posted`);
    for (const p of sess.seats) assert.ok(Number.isFinite(p.stack) && p.stack >= 0, `${key}: ${p.nick} has ${p.stack}`);
  }
});
