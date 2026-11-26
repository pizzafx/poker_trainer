// Fixed deals (the tutorial's deal B, STRAT, CEO): a Session can fix the trainee's cards and the board of one hand;
// everyone else is dealt from what is left and plays as usual, and a session without them is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/trainer/session.js';
import { cardStr } from '../src/engine/cards.js';

const play = (sess) => {
  let guard = 0;
  while (sess.status() !== 'over' && guard++ < 400) {
    if (sess.status() === 'bot') sess.stepBot();
    else {
      const L = sess.heroOptions();
      sess.heroAct({ type: L.canCheck ? 'check' : 'call' });
    }
  }
};
const str = (cs) => cs.map(cardStr).join(' ');

test('a fixed hand gets the trainee its cards and the board its five, and no one else holds them', () => {
  const sess = new Session({ seed: 7, samples: 40, fixedHands: { 2: { hole: 'As Kd', board: 'Qh 7c 2s Jd 9c' } } });
  sess.startHand();
  play(sess);
  sess.startHand();
  const s = sess.hand.state;
  assert.equal(sess.handNo, 2);
  assert.equal(str(s.hole[0]), 'As Kd');
  const fixed = new Set(['As', 'Kd', 'Qh', '7c', '2s', 'Jd', '9c']);
  for (let i = 1; i < s.n; i++) for (const c of s.hole[i]) assert.ok(!fixed.has(cardStr(c)), `seat ${i} holds ${cardStr(c)}`);
  play(sess);
  // every street that was dealt came from the fixed board, in order
  assert.equal(str(s.board), 'Qh 7c 2s Jd 9c'.split(' ').slice(0, s.board.length).join(' '));
});
test('a session without fixed hands deals exactly as before', () => {
  const a = new Session({ seed: 11, samples: 40 });
  const b = new Session({ seed: 11, samples: 40, fixedHands: { 99: { hole: 'As Kd' } } });
  for (const x of [a, b]) x.startHand();
  assert.equal(str(a.hand.state.hole[0]), str(b.hand.state.hole[0]));
  assert.deepEqual(a.hand.state.hole.map(str), b.hand.state.hole.map(str));
});

// STRAT's interface for the tutorial's seed search
test('dealFixed: the next hand gets the hero\'s and a position\'s cards and the board; peekNextButton says who sits where', () => {
  const sess = new Session({ seed: 23, samples: 40 });
  sess.startHand();
  play(sess);
  const peek = sess.peekNextButton();
  sess.dealFixed({ hero: 'Ad Qd', byPosition: { HJ: 'Ts 7s' }, board: 'Qc 9d 8s 5h Jc' });
  const s = sess.hand.state;
  assert.equal(s.button, peek.button);
  assert.equal(str(s.hole[0]), 'Ad Qd');
  const hj = peek.seats.find((x) => x.pos === 'HJ');
  if (hj.seat !== 0) assert.equal(str(s.hole[hj.seat]), 'Ts 7s');
  play(sess);
  assert.equal(str(s.board), 'Qc 9d 8s 5h Jc'.split(' ').slice(0, s.board.length).join(' '));
  // the deal after it is natural again
  sess.startHand();
  assert.notEqual(str(sess.hand.state.hole[0]), 'Ad Qd');
});
test('the same seed and the same hero actions give the same bot actions (deterministic)', () => {
  const run = () => {
    const sess = new Session({ seed: 31, samples: 40 });
    sess.startHand();
    play(sess);
    sess.dealFixed({ hero: 'Ad Qd', board: 'Qc 9d 8s 5h Jc' });
    const out = [];
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') sess.stepBot();
      else {
        const L = sess.heroOptions();
        sess.heroCommitPending({ type: L.canCheck ? 'check' : 'call' });
      }
    }
    for (const e of sess.hand.state.history) out.push(`${e.seat}:${e.type}:${e.amount ?? ''}`);
    return out.join(' ');
  };
  assert.equal(run(), run());
});
test('dealFixed after quickSim folds out the hand in progress and deals the fixed one', () => {
  const sess = new Session({ seed: 41, samples: 40 });
  sess.quickSim(40);
  sess.dealFixed({ hero: 'Ad Qd', board: 'Qc 9d 8s 5h Jc' });
  assert.equal(str(sess.hand.state.hole[0]), 'Ad Qd');
  assert.equal(sess.hand.over, false);
});
