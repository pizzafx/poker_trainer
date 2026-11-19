// Drill learning: levels, review boxes, twins after a miss, the Practice stream (the curriculum's rules)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshLearn, answer, level, openTiers, nextPractice, newSession, isDue, flagFromTable, credit, loadLearn } from '../src/drill/learn.js';

const SKILLS = { D1: { tier: 1, leak: 'paidOff' }, V1: { tier: 1, leak: 'missedValue' }, P2: { tier: 1, leak: 'preLoose' }, P1: { tier: 1, leak: 'prePassive' }, O1: { tier: 2, leak: 'paidOff2' } };
const TYPES = ['nit', 'abc', 'station', 'beginner'];
// a made-up bank: per skill, 4 types x 3 difficulties x 2 spots; the bettor is seat 1
function bank() {
  const out = [];
  for (const skill of Object.keys(SKILLS)) {
    TYPES.forEach((type) => {
      for (const d of [1, 2, 3]) {
        for (let k = 0; k < 2; k++) out.push({ id: `${skill}-${type}-${d}-${k}`, skill, tier: SKILLS[skill].tier, difficulty: d, reads: { 1: { type } }, spot: { actions: [{ seat: 1, type: 'raise', to: 10 }], types: [null, type] }, families: { fold: 'best', call: 'wrong' } });
      }
    });
  }
  return out;
}
const B = bank();
const find = (skill, type, d, k = 0) => B.find((s) => s.id === `${skill}-${type}-${d}-${k}`);
const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 17, 12);
// the partner gate (CEO, 19 Nov): give the partner lessons 8 right answers, so a test of one lesson's own level rules
// is not held back by its partner
const partnerRight = (st, ...codes) => {
  for (const c of codes) st.skills[c] = { answers: Array.from({ length: 8 }, () => ({ c: 1, d: 1, type: 'nit' })) };
};

test('drill learn: fine counts as right at difficulty 1-2 and as half at 3', () => {
  assert.deepEqual([credit('best', 3), credit('fine', 1), credit('fine', 2), credit('fine', 3), credit('wrong', 1)], [1, 1, 1, 0.5, 0]);
});

test('drill learn: Frontier under 6 answers, then Learning, Solid (6 of 8, a standard spot, two types), Mastered (9 of 10, three tricky, three types, two days)', () => {
  const st = freshLearn();
  partnerRight(st, 'D2');
  for (let i = 0; i < 5; i++) answer(st, find('D1', 'nit', 1, i % 2), 'best', T0);
  assert.equal(level(st, 'D1', true, T0), 'Frontier');
  answer(st, find('D1', 'nit', 1), 'best', T0);
  assert.equal(level(st, 'D1', true, T0), 'Learning', 'one type only, no standard spot');
  answer(st, find('D1', 'abc', 2), 'best', T0);
  assert.equal(level(st, 'D1', true, T0), 'Solid');
  for (const t of ['station', 'beginner', 'abc']) answer(st, find('D1', t, 3), 'best', T0);
  assert.equal(level(st, 'D1', true, T0), 'Solid', 'all right answers on one day: not Mastered');
  answer(st, find('D1', 'nit', 2), 'best', T0 + DAY);
  assert.equal(level(st, 'D1', true, T0 + DAY), 'Mastered');
  assert.equal(level(st, 'D1', false, T0), 'Locked');
});

test('drill learn: a miss sends the skill to box 1 and brings a twin of the same type and difficulty 3 to 5 spots later', () => {
  const st = freshLearn();
  const out = answer(st, find('D1', 'station', 2), 'wrong', T0, { open: ['D1', 'V1', 'P2', 'P1'] });
  assert.equal(st.skills.D1.box, 1);
  assert.ok(out.twin.at - st.counter >= 3 && out.twin.at - st.counter <= 5);
  // other answers until the twin comes due
  let served = null;
  for (let i = 0; i < 6 && !served; i++) {
    const n = nextPractice(st, B, SKILLS, { now: T0, rnd: () => 0.5 });
    if (n.why === 'twin') served = n.spot;
    else answer(st, n.spot, 'best', T0);
  }
  assert.ok(served, 'the twin was served');
  assert.equal(served.skill, 'D1');
  assert.equal(served.difficulty, 2);
  assert.equal(served.reads[1].type, 'station');
  assert.notEqual(served.id, 'D1-station-2-0');
});

test('drill learn: a miss on P1 schedules a P2 spot (confusable pair)', () => {
  const st = freshLearn();
  const out = answer(st, find('P1', 'abc', 1), 'wrong', T0, { open: ['D1', 'V1', 'P2', 'P1'] });
  assert.equal(out.pair.skill, 'P2');
});

test('drill learn: boxes 2 to 5 at the next session, then 3, 7 and 21 days; a table flag makes the skill due now', () => {
  const st = freshLearn();
  answer(st, find('V1', 'abc', 1), 'best', T0);
  assert.equal(st.skills.V1.box, 2);
  assert.equal(isDue(st.skills.V1, st, T0), false);
  newSession(st);
  assert.equal(isDue(st.skills.V1, st, T0), true);
  answer(st, find('V1', 'abc', 2), 'best', T0);
  assert.equal(st.skills.V1.box, 3);
  assert.equal(st.skills.V1.dueAt, T0 + 3 * DAY);
  answer(st, find('V1', 'nit', 2), 'best', T0 + 3 * DAY);
  assert.equal(st.skills.V1.box, 4);
  assert.equal(st.skills.V1.dueAt, T0 + 10 * DAY);
  assert.equal(isDue(st.skills.V1, st, T0 + 4 * DAY), false);
  flagFromTable(st, SKILLS, 'missedValue');
  assert.equal(isDue(st.skills.V1, st, T0 + 4 * DAY), true);
});

test('drill learn: tier 2 opens when two tier-1 skills are Solid; Practice serves only open skills, never the same spot within 30 days', () => {
  const st = freshLearn();
  partnerRight(st, 'D2', 'B1');
  assert.deepEqual([...openTiers(st, SKILLS, T0)], [1]);
  for (const sk of ['D1', 'V1']) for (const [t, d] of [['nit', 1], ['abc', 1], ['nit', 1], ['abc', 2], ['nit', 1], ['abc', 1]]) answer(st, find(sk, t, d), 'best', T0);
  assert.deepEqual([...openTiers(st, SKILLS, T0)].sort(), [1, 2]);
  const st2 = freshLearn();
  const seen = new Set();
  let r = 1;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const closed = !openTiers(st2, SKILLS, T0).has(2);
    const n = nextPractice(st2, B, SKILLS, { now: T0, rnd });
    if (closed) assert.notEqual(n.spot.skill, 'O1', 'tier 2 is closed');
    assert.ok(!seen.has(n.spot.id) || seen.size >= B.filter((s) => s.tier === 1).length, 'no repeat while fresh spots remain');
    seen.add(n.spot.id);
    answer(st2, n.spot, 'best', T0);
  }
  // pinned to one skill (P1 and P2 bring each other in: the interleave tests below)
  for (let i = 0; i < 5; i++) assert.equal(nextPractice(st2, B, SKILLS, { now: T0, rnd, pin: 'D1' }).spot.skill, 'D1');
});

// P1 and P2 interleaved (CEO, 19 Nov; CURR's spec): never more than 2 in a row from either while both are open
const runOf = (st, n, opts) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = nextPractice(st, B, SKILLS, { now: T0, ...opts });
    out.push(x.spot.skill);
    answer(st, x.spot, i % 4 === 3 ? 'wrong' : 'best', T0);
  }
  return out;
};
const longest = (xs, code) => xs.reduce((m, c, i) => { let k = 0; while (i - k >= 0 && xs[i - k] === code) k++; return Math.max(m, k); }, 0);

test('drill interleave: Practice never serves a third P1 or P2 spot in a row while the other is open, twins and pairs included', () => {
  for (const seed of [1, 7, 42, 99]) {
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const seq = runOf(freshLearn(), 120, { rnd });
    assert.ok(longest(seq, 'P1') <= 2 && longest(seq, 'P2') <= 2, `seed ${seed}: ${seq.join(' ')}`);
  }
  // only P1 and P2 shipped: they alternate at most two at a time
  const PP = B.filter((s) => s.skill === 'P1' || s.skill === 'P2');
  const PPS = { P1: SKILLS.P1, P2: SKILLS.P2 };
  const st = freshLearn();
  const seq = [];
  for (let i = 0; i < 60; i++) {
    const x = nextPractice(st, PP, PPS, { now: T0, rnd: () => 0.01 });
    seq.push(x.spot.skill);
    answer(st, x.spot, 'best', T0);
  }
  assert.ok(longest(seq, 'P1') <= 2 && longest(seq, 'P2') <= 2, seq.join(' '));
  assert.ok(seq.includes('P1') && seq.includes('P2'));
});

test('drill interleave: practising P1 alone mixes in P2 at 1 spot in 3, and the other way round; with no partner spots it stays pinned', () => {
  for (const pin of ['P1', 'P2']) {
    const other = pin === 'P1' ? 'P2' : 'P1';
    const seq = runOf(freshLearn(), 30, { rnd: () => 0.3, pin });
    assert.ok(seq.every((c) => c === pin || c === other), seq.join(' '));
    assert.ok(longest(seq, pin) <= 2 && longest(seq, other) <= 1, seq.join(' '));
    const share = seq.filter((c) => c === other).length / seq.length;
    assert.ok(share >= 0.25 && share <= 0.4, `${pin}: partner share ${share}`);
  }
  const noP2 = B.filter((s) => s.skill !== 'P2');
  const st = freshLearn();
  for (let i = 0; i < 6; i++) {
    const x = nextPractice(st, noP2, SKILLS, { now: T0, rnd: () => 0.3, pin: 'P1' });
    assert.equal(x.spot.skill, 'P1');
    answer(st, x.spot, 'best', T0);
  }
  // other pinned skills are unchanged
  assert.ok(runOf(freshLearn(), 9, { rnd: () => 0.3, pin: 'V1' }).every((c) => c === 'V1'));
});

test('drill learn: storage that throws gives a fresh start', () => {
  assert.equal(loadLearn({ getItem: () => { throw new Error('x'); } }).v, 1);
});

test('drill learn: V1 is Mastered on its two calling types (CEO, 17 Nov); others need three', () => {
  const st = freshLearn();
  partnerRight(st, 'D2', 'B1');
  const one = (sk, t, d, day) => answer(st, find(sk, t, d), 'best', T0 + day * DAY);
  for (const sk of ['V1', 'D1']) {
    for (let i = 0; i < 4; i++) one(sk, i % 2 ? 'station' : 'beginner', 1, 0);
    for (const d of [2, 3, 3, 3]) one(sk, 'station', d, 0);
    one(sk, 'beginner', 2, 0);
    one(sk, 'station', 2, 1);
  }
  assert.equal(level(st, 'V1', true, T0 + DAY), 'Mastered');
  assert.equal(level(st, 'D1', true, T0 + DAY), 'Solid');
});

// Tier 1's partner lessons (CEO, 19 Nov): V1/B1, D1/D2, P1/P2, one table for the gate and the interleave
import { PARTNERS, partnerOk } from '../src/drill/learn.js';
const T1 = { P1: { tier: 1 }, P2: { tier: 1 }, V1: { tier: 1 }, B1: { tier: 1 }, D1: { tier: 1 }, D2: { tier: 1 } };
function bank6() {
  const out = [];
  for (const skill of Object.keys(T1)) {
    TYPES.forEach((type) => {
      for (const d of [1, 2, 3]) for (let k = 0; k < 3; k++) out.push({ id: `${skill}-${type}-${d}-${k}`, skill, tier: 1, difficulty: d, reads: { 1: { type } }, spot: { actions: [{ seat: 1, type: 'raise', to: 10 }], types: [null, type] }, families: { fold: 'best', call: 'wrong' } });
    });
  }
  return out;
}
const B6 = bank6();

test('drill partner gate: a player who always gives one answer stays at Learning or below on both lessons of every pair', () => {
  assert.deepEqual(Object.keys(PARTNERS).sort(), ['B1', 'D1', 'D2', 'P1', 'P2', 'V1']);
  for (const [a, b] of [['P1', 'P2'], ['V1', 'B1'], ['D1', 'D2']]) {
    // the habit is right on one lesson and wrong on its partner, every time (opposite answers in look-alike spots)
    const st = freshLearn();
    const spotsA = B6.filter((s) => s.skill === a);
    const spotsB = B6.filter((s) => s.skill === b);
    for (let i = 0; i < 24; i++) {
      answer(st, spotsA[i % spotsA.length], 'best', T0 + Math.floor(i / 8) * DAY);
      answer(st, spotsB[i % spotsB.length], 'wrong', T0 + Math.floor(i / 8) * DAY);
    }
    assert.equal(level(st, a, true, T0 + 3 * DAY), 'Learning', `${a} is held by ${b}`);
    assert.ok(['Frontier', 'Learning'].includes(level(st, b, true, T0 + 3 * DAY)), b);
    assert.equal(partnerOk(st, a), false);
    // once the partner has 5 of its last 8 right, the lesson's own rules decide again
    for (let i = 0; i < 5; i++) answer(st, spotsB[i], 'best', T0 + 3 * DAY);
    assert.equal(partnerOk(st, a), true);
    assert.ok(['Solid', 'Mastered'].includes(level(st, a, true, T0 + 3 * DAY)), `${a} after ${b} recovers`);
  }
  // a placed start is held too: placement's Solid shows as Learning until the partner is right 5 of 8
  const st = freshLearn();
  st.skills.V1 = { answers: [{ c: 1, d: 1, type: 'nit' }], placed: 'Solid', box: 3 };
  assert.equal(level(st, 'V1', true, T0), 'Learning');
  // a lesson with no partner is unchanged
  assert.equal(partnerOk(st, 'O1'), true);
});

test('drill interleave, every pair: Practice never serves a third spot in a row from one lesson of a pair while both are open', () => {
  const lon = (xs, code) => xs.reduce((m, c, i) => { let k = 0; while (i - k >= 0 && xs[i - k] === code) k++; return Math.max(m, k); }, 0);
  for (const seed of [3, 11, 57]) {
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const st = freshLearn();
    const seq = [];
    for (let i = 0; i < 150; i++) {
      const x = nextPractice(st, B6, T1, { now: T0, rnd });
      seq.push(x.spot.skill);
      answer(st, x.spot, i % 5 === 4 ? 'wrong' : 'best', T0);
    }
    for (const c of Object.keys(T1)) assert.ok(lon(seq, c) <= 2, `seed ${seed} ${c}: ${seq.join(' ')}`);
  }
  // pinned practice of each lesson brings its partner in at 1 spot in 3
  for (const pin of Object.keys(PARTNERS)) {
    const st = freshLearn();
    const seq = [];
    for (let i = 0; i < 30; i++) {
      const x = nextPractice(st, B6, T1, { now: T0, rnd: () => 0.3, pin });
      seq.push(x.spot.skill);
      answer(st, x.spot, 'best', T0);
    }
    assert.ok(seq.every((c) => c === pin || c === PARTNERS[pin]), seq.join(' '));
    assert.equal(seq.filter((c) => c === PARTNERS[pin]).length, 10, `${pin}: ${seq.join(' ')}`);
  }
});

// a shipped bank holds a lesson and its partner together or neither (CEO's hold, CURR)
import { partnerGaps } from '../src/drill/learn.js';
test('drill partner gaps: a lesson with spots and a partner without is named; complete pairs and unpaired lessons pass', () => {
  const sp = (skill) => ({ skill });
  assert.deepEqual(partnerGaps({ spots: [sp('V1'), sp('B1'), sp('P1'), sp('P2')] }), []);
  assert.deepEqual(partnerGaps({ spots: [sp('V1'), sp('P1'), sp('P2'), sp('O1')] }), ['V1 has spots, B1 has none']);
  assert.deepEqual(partnerGaps({ spots: [sp('D2')] }), ['D2 has spots, D1 has none']);
});
