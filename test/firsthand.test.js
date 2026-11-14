// A new session starts at the first hand the trainee plays: hands folded for them before it
// are not counted (QA C1). Later skips count as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/trainer/session.js';
import { presetRanges, presetRaised } from '../src/trainer/ranges.js';

test('first hand: skips before it are not counted, and it is hand 1', () => {
  let checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const sess = new Session({ seed, samples: 10, game: '1/2', heroBuy: 200, heroRanges: presetRanges('tight'), heroRangesRaised: presetRaised('tight') });
    sess.startPlayable();
    assert.equal(sess.handNo, 1, `seed ${seed}`);
    assert.equal(sess.hand.no, 1);
    assert.equal(sess.hand.log[0].text, 'Hand 1');
    assert.equal(sess.heroNet(), 0, 'nothing lost before the first hand');
    assert.equal(sess.seats[0].stack, 200);
    assert.equal(sess.results.length, 0);
    assert.ok(!sess.news.some((n) => /Skipped/.test(n)), sess.news.join(' '));
    checked++;
  }
  assert.equal(checked, 12);
});

test('first hand: later skips still count', () => {
  const sess = new Session({ seed: 3, samples: 10, game: '1/2', heroBuy: 200, heroRanges: presetRanges('tight'), heroRangesRaised: presetRaised('tight') });
  sess.startPlayable();
  let sawSkip = false;
  for (let h = 0; h < 30 && !sawSkip; h++) {
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') sess.stepBot();
      else sess.heroAct({ type: sess.heroOptions().canCheck ? 'check' : 'fold' });
    }
    const before = sess.handNo;
    sess.startPlayable();
    if (sess.handNo > before + 1) {
      sawSkip = true;
      assert.ok(sess.news.some((n) => /Skipped \d+ hand/.test(n)), 'later skips are reported');
      assert.equal(sess.results.length, sess.handNo - (sess.hand.over ? 0 : 1), 'and counted (a walk is already over)');
    }
  }
  assert.ok(sawSkip);
});
