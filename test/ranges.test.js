// Your own starting-hand ranges: presets, seat groups, and the rule that only hands inside the
// range for your seat reach you (the rest are folded for you, as junk hands used to be).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/cards.js';
import { newHand, positionName } from '../src/engine/game.js';
import { classOf, classNames } from '../src/engine/hands.js';
import { Session } from '../src/trainer/session.js';
import { RANGE_GROUPS, PRESETS, presetRanges, shareOf, groupOf } from '../src/trainer/ranges.js';

test('ranges: presets are about the right width and nest tight < standard < loose', () => {
  const t = presetRanges('tight');
  const s = presetRanges('standard');
  const l = presetRanges('loose');
  // Standard is hand-written now (notes/STRAT_RANGES.md, with the live pro's edits)
  const want = { early: 0.122, middle: 0.176, cutoff: 0.252, button: 0.351, sb: 0.273, bb: PRESETS.standard.bb };
  for (const [g] of RANGE_GROUPS) {
    assert.ok(Math.abs(shareOf(s[g]) - want[g]) < 0.005, `standard ${g}: ${shareOf(s[g])}`);
    assert.ok(shareOf(t[g]) < shareOf(s[g]) && shareOf(s[g]) < shareOf(l[g]), g);
    for (const [name, r] of [['tight', t], ['standard', s], ['loose', l]]) assert.ok(r[g].includes('AA'), `${name} ${g} has aces`);
    if (g !== 'bb') assert.ok(s[g].includes('22'), `every pair opens from ${g} in Standard`);
    if (g === 'early') assert.ok(!s[g].includes('AJo') && !s[g].includes('A4s'), 'the live pro took AJo and A4s out of Early');
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

import { expandRange, presetRaised, PRESETS_RAISED, LIMPER_OFFSUIT, TIGHTER_ROW } from '../src/trainer/ranges.js';
import { buildContext } from '../src/bots/policy.js';

test('ranges: range notation expands as poker players write it', () => {
  assert.deepEqual(expandRange('QQ+').sort(), ['AA', 'KK', 'QQ']);
  assert.deepEqual(expandRange('ATs+').sort(), ['AJs', 'AKs', 'AQs', 'ATs']);
  assert.deepEqual(expandRange('A5s-A3s').sort(), ['A3s', 'A4s', 'A5s']);
  assert.deepEqual(expandRange('KQo T9s 22'), ['KQo', 'T9s', '22']);
  assert.throws(() => expandRange('AXs'));
});

test('ranges: facing-a-raise presets are much tighter, nest, and keep junk out', () => {
  const first = presetRanges('standard');
  for (const [g] of RANGE_GROUPS) {
    const t = presetRaised('tight')[g];
    const s = presetRaised('standard')[g];
    const l = presetRaised('loose')[g];
    for (const n of t) assert.ok(s.includes(n), `${g}: tight ${n} not in standard`);
    for (const n of s) assert.ok(l.includes(n), `${g}: standard ${n} not in loose`);
    assert.ok(shareOf(s) < shareOf(first[g]) * 0.65, `${g}: facing a raise ${shareOf(s)} vs first in ${shareOf(first[g])}`);
    for (const n of ['T3o', 'K9o', 'J5o', '72s']) assert.ok(!s.includes(n), `${g}: ${n}`);
    assert.ok(Object.keys(PRESETS_RAISED.standard).includes(g));
  }
  assert.ok(presetRaised('standard').button.includes('87s'), 'suited connectors on the button');
});

test('ranges: facing a raise at your first decision, only hands in that range reach you', () => {
  const all = presetRanges('loose');
  for (const g of Object.keys(all)) all[g] = expandRange('22+ A2s+ K2s+ Q2s+ J2s+ T2s+ 92s+ 82s+ 72s+ 62s+ 52s+ 42s+ 32s A2o+ K2o+ Q2o+ J2o+ T2o+ 92o+ 82o+ 72o+ 62o+ 52o+ 42o+ 32o');
  const premium = expandRange('TT+ AKs AKo');
  const tight = Object.fromEntries(Object.keys(all).map((g) => [g, premium]));
  const sess = new Session({ seed: 21, samples: 20, heroRanges: all, heroRangesRaised: tight });
  let raised = 0;
  let unraised = 0;
  // Until a few raised spots have come up (TT+/AK facing a raise is rare: about 1 deal in 60).
  for (let i = 0; i < 600 && (raised < 3 || i < 150); i++) {
    sess.startPlayable();
    while (sess.status() === 'bot') sess.stepBot();
    if (sess.status() !== 'hero') continue;
    const s = sess.hand.state;
    if (s.street === 0 && s.raises > 0) {
      raised++;
      assert.ok(premium.includes(classNames[classOf(s.hole[0][0], s.hole[0][1])]));
    } else unraised++;
    sess.foldOut();
  }
  assert.ok(raised >= 1, `${raised} raised spots`);
  assert.ok(unraised > 20, `${unraised} first-in spots`);
  assert.equal(sess.decisions.length, 0);
});

test('ranges: behind limpers weak offsuit hands are folded first in, and big or early raises use the next tighter row', () => {
  const sess = new Session({ seed: 77, samples: 10, heroRanges: presetRanges('standard'), heroRangesRaised: presetRaised('standard') });
  const keep = { default: expandRange(LIMPER_OFFSUIT.default), button: expandRange(LIMPER_OFFSUIT.button) };
  const raisedRows = presetRaised('standard');
  let limped = 0;
  let bigOrEarly = 0;
  for (let i = 0; i < 400; i++) {
    sess.startPlayable();
    if (sess.status() !== 'hero') {
      sess.foldOut();
      continue;
    }
    const s = sess.hand.state;
    const ctx = buildContext(s);
    const group = groupOf(positionName(s, 0));
    const name = classNames[classOf(s.hole[0][0], s.hole[0][1])];
    if (ctx.raises === 0 && ctx.limpers > 0 && group !== 'sb' && group !== 'bb') {
      limped++;
      if (name.endsWith('o')) assert.ok(keep[group === 'button' ? 'button' : 'default'].includes(name), `${name} behind limpers from ${group}`);
    }
    if (ctx.raises === 1) {
      const raiser = s.lastRaiser;
      let lb = 0;
      for (const e of s.history) {
        if (e.type === 'raise') break;
        if (e.type === 'call') lb++;
      }
      if (ctx.raiseBB > 5.5 + lb || groupOf(positionName(s, raiser)) === 'early') {
        bigOrEarly++;
        assert.ok(raisedRows[TIGHTER_ROW[group]].includes(name), `${name} from ${group} facing a big or early raise`);
      }
    }
    sess.foldOut();
  }
  assert.ok(limped >= 5, `${limped} limped pots, ${bigOrEarly} big or early raises`);
});
