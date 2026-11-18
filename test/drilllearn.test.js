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

test('drill learn: fine counts as right at difficulty 1-2 and as half at 3', () => {
  assert.deepEqual([credit('best', 3), credit('fine', 1), credit('fine', 2), credit('fine', 3), credit('wrong', 1)], [1, 1, 1, 0.5, 0]);
});

test('drill learn: Frontier under 6 answers, then Learning, Solid (6 of 8, a standard spot, two types), Mastered (9 of 10, three tricky, three types, two days)', () => {
  const st = freshLearn();
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
  // pinned to one skill
  for (let i = 0; i < 5; i++) assert.equal(nextPractice(st2, B, SKILLS, { now: T0, rnd, pin: 'P2' }).spot.skill, 'P2');
});

test('drill learn: storage that throws gives a fresh start', () => {
  assert.equal(loadLearn({ getItem: () => { throw new Error('x'); } }).v, 1);
});

test('drill learn: V1 is Mastered on its two calling types (CEO, 17 Nov); others need three', () => {
  const st = freshLearn();
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
