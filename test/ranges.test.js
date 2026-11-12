// Your own starting-hand ranges: presets, seat groups, and the rule that only hands inside the
// range for your seat reach you (the rest are folded for you, as junk hands used to be).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/cards.js';
import { newHand, positionName } from '../src/engine/game.js';
import { classOf, classNames } from '../src/engine/hands.js';
import { Session } from '../src/trainer/session.js';
import { RANGE_GROUPS, PRESETS, presetRanges, shareOf, groupOf } from '../src/trainer/ranges.js';

test('ranges: presets hit their shares and nest tight < standard < loose', () => {
  const t = presetRanges('tight');
  const s = presetRanges('standard');
  const l = presetRanges('loose');
  for (const [g] of RANGE_GROUPS) {
    for (const [name, r] of [['tight', t], ['standard', s], ['loose', l]]) {
      const share = shareOf(r[g]);
      assert.ok(Math.abs(share - PRESETS[name][g]) < 0.02, `${name} ${g}: ${share}`);
      assert.ok(r[g].includes('AA'), `${name} ${g} has aces`);
    }
    for (const n of t[g]) assert.ok(s[g].includes(n), `tight ${g} ${n} not in standard`);
    for (const n of s[g]) assert.ok(l[g].includes(n), `standard ${g} ${n} not in loose`);
  }
  // the hands that prompted this: never in the standard ranges
  for (const n of ['T6o', 'J5o', '72s', '72o']) for (const [g] of RANGE_GROUPS) assert.ok(!s[g].includes(n), `${n} in standard ${g}`);
});

test('ranges: every position at every table size has a seat group', () => {
  const groups = new Set(RANGE_GROUPS.map(([g]) => g));
  for (let n = 2; n <= 9; n++) {
    const s = newHand({ stacks: new Array(n).fill(300), button: 0, sb: 1, bb: 3, rng: makeRng(n) });
    for (let i = 0; i < n; i++) assert.ok(groups.has(groupOf(positionName(s, i))), `${n}-handed seat ${i}: ${positionName(s, i)}`);
  }
});

test('ranges: only hands inside your range for the seat reach you; skipped ones still move the table', () => {
  const ranges = presetRanges('tight');
  const sess = new Session({ seed: 9, samples: 20, heroRanges: ranges });
  let dealt = 0;
  let lastHand = 0;
  for (let i = 0; i < 60; i++) {
    sess.startPlayable();
    const s = sess.hand.state;
    assert.ok(sess.handNo > lastHand);
    lastHand = sess.handNo;
    if (sess.hand.over) continue; // 60 skips in a row: the table moved on without a playable hand
    const pos = positionName(s, 0);
    const k = classOf(s.hole[0][0], s.hole[0][1]);
    assert.ok(ranges[groupOf(pos)].includes(classNames[k]), `${classNames[k]} dealt in ${pos}`);
    dealt++;
    sess.foldOut();
  }
  assert.ok(dealt >= 50, `${dealt} playable hands`);
  assert.ok(sess.handNo > dealt * 2, 'tight ranges skip most hands, and skipped hands count');
  assert.equal(sess.decisions.length, 0, 'skipped and folded-out hands are never judged');
});

test('ranges: drills ignore the range filter', () => {
  const sess = new Session({ seed: 4, samples: 20, heroRanges: presetRanges('tight') });
  // dealUntil (drills) deals specific spots without the filter: a weak hand can come up.
  const found = sess.dealUntil((sp) => sp.street === 0 && sp.pct < 0.3, 200);
  assert.ok(found, 'a weak preflop spot is dealt in a drill');
});
