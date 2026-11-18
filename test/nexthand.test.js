// The "Next hand" countdown (DESIGN, NEXT_HAND_HANDOFF) on a fake clock: the deal, the pause rules, the hold,
// and the NH1 guard windows it shares with the table
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCountdown, countdownDue, armWindow, NEXT_MS, MIN_LEFT_MS } from '../src/ui/countdown.js';

// a 16ms frame clock: run(ms) advances time frame by frame and fires the scheduled tick
function rig(opts = {}) {
  let t = 0;
  let next = null;
  let blocked = false;
  let dealt = 0;
  const cd = createCountdown({
    now: () => t,
    schedule: (f) => ((next = f), 1),
    cancel: () => (next = null),
    blocked: () => blocked,
    onDone: () => dealt++,
    ...opts,
  });
  const run = (ms, step = 16) => {
    for (let k = 0; k < ms; k += step) {
      t += step;
      const f = next;
      next = null;
      if (f) f();
    }
  };
  return { cd, run, block: (b) => (blocked = b), dealt: () => dealt, jump: (ms) => (t += ms) };
}

test('it deals on its own after 3s, once', () => {
  const r = rig();
  r.cd.start();
  r.run(2900);
  assert.equal(r.dealt(), 0);
  r.run(200);
  assert.equal(r.dealt(), 1);
  r.run(2000);
  assert.equal(r.dealt(), 1);
  assert.equal(NEXT_MS, 3000);
});

test('no deal while a pop-up is open; it resumes with at least 1s left', () => {
  const r = rig();
  r.cd.start();
  r.run(2600);
  r.block(true);
  r.run(10000);
  assert.equal(r.dealt(), 0, 'paused');
  const atPause = r.cd.info();
  assert.equal(atPause.paused, true);
  r.block(false);
  r.run(16);
  assert.ok(r.cd.info().left >= MIN_LEFT_MS - 16, `resumed with ${r.cd.info().left}ms left`);
  r.run(900);
  assert.equal(r.dealt(), 0, 'not before the second is up');
  r.run(200);
  assert.equal(r.dealt(), 1);
});

test('an early pause resumes from where it stopped', () => {
  const r = rig();
  r.cd.start();
  r.run(1000);
  r.block(true);
  r.run(5000);
  r.block(false);
  r.run(16);
  const left = r.cd.info().left;
  assert.ok(left > 1900 && left <= 2000, `left ${left}`);
});

test('a hidden tab (a long gap between frames) counts as a pause', () => {
  const r = rig();
  r.cd.start();
  r.run(2800);
  r.jump(60000);
  r.run(16);
  assert.equal(r.dealt(), 0);
  assert.ok(r.cd.info().left >= MIN_LEFT_MS - 16);
});

test('a pointerdown on the button (freeze) stops the auto-deal; so does a hold', () => {
  const r = rig();
  r.cd.start();
  r.run(2950);
  r.cd.freeze();
  r.run(5000);
  assert.equal(r.dealt(), 0);
  assert.equal(r.cd.info().state, 'frozen');
  const s = rig();
  s.cd.start();
  s.run(1000);
  s.cd.stop();
  s.run(5000);
  assert.equal(s.dealt(), 0);
});

test('a flagged hand or a low stack shows no countdown', () => {
  const good = [{ verdict: { grade: 'good' } }, { verdict: { grade: 'good' } }];
  assert.equal(countdownDue(good, false), true);
  assert.equal(countdownDue([...good, { verdict: { grade: 'mistake' } }], false), false);
  assert.equal(countdownDue(good, true), false);
  assert.equal(countdownDue([], false), true, 'a hand with no decision of yours (you folded preflop to a raise, say)');
});

test('NH1: 400ms after a deal the player asked for (a click on the button), 1.2s after the fill completes', () => {
  assert.equal(armWindow('mouse', false), 400);
  assert.equal(armWindow('mouse', true), 1200);
  assert.equal(armWindow('touch', true), 600);
  assert.equal(armWindow('pen', false), 600);
});
