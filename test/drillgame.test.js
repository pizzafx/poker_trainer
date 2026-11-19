// Drill game layer: points, bands, streaks, the run builder, Daily seed, records and badges (GAME's rules)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { points, band, streakAfter, buildRun, runTotals, honestLine, dailyLine, dailySeed, recordRun, loadGame, saveGame, pruneDaily, runBadges, MAX_SCORE, hasWrong } from '../src/drill/game.js';

test('drill points: best 100 / 125 / 150 by difficulty, fine 50, wrong 0; ten tricky bests make the maximum', () => {
  assert.deepEqual([1, 2, 3].map((d) => points('best', d)), [100, 125, 150]);
  assert.deepEqual([1, 2, 3].map((d) => points('fine', d)), [50, 50, 50]);
  assert.deepEqual([1, 2, 3].map((d) => points('wrong', d)), [0, 0, 0]);
  // a full run: 3 easy, 4 standard, 3 tricky, all best
  assert.equal(3 * 100 + 4 * 125 + 3 * 150, MAX_SCORE);
});

test('drill bands: Sharp 1,100+, Solid 900+, Getting there 650+, else Worth another look', () => {
  assert.deepEqual([1250, 1100, 1099, 900, 899, 650, 649, 0].map(band), ['Sharp', 'Sharp', 'Solid', 'Solid', 'Getting there', 'Getting there', 'Worth another look', 'Worth another look']);
});

test('drill streak: best extends, fine neither extends nor breaks, wrong breaks', () => {
  assert.equal(streakAfter(3, 'best'), 4);
  assert.equal(streakAfter(3, 'fine'), 3);
  assert.equal(streakAfter(3, 'wrong'), 0);
});

// a made-up bank: n spots per skill and difficulty, some with no wrong family
function bank() {
  const out = [];
  for (const skill of ['D1', 'V1', 'P2', 'P1']) {
    for (const d of [1, 2, 3]) {
      for (let k = 0; k < 6; k++) {
        const noWrong = skill === 'V1' && k < 4;
        out.push({ id: `${skill}-${d}-${k}`, skill, tier: 1, difficulty: d, hand: `${skill}${d}${k}`, spot: { board: [] }, families: noWrong ? { raise: 'best', check: 'fine' } : { fold: 'best', call: 'wrong' } });
      }
    }
  }
  return out;
}

test('drill run builder: ten spots, 3/4/3, easy first, ends on a standard then a tricky, the same for the same seed', () => {
  const b = bank();
  const byId = Object.fromEntries(b.map((s) => [s.id, s]));
  for (const seed of ['a', 'b', 'c', dailySeed('2026-11-17', 'v1')]) {
    const ids = buildRun(seed, b, ['D1', 'V1', 'P2', 'P1']);
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, 10);
    const d = ids.map((id) => byId[id].difficulty);
    assert.deepEqual([d.filter((x) => x === 1).length, d.filter((x) => x === 2).length, d.filter((x) => x === 3).length], [3, 4, 3]);
    assert.deepEqual(d.slice(0, 3), [1, 1, 1]);
    assert.deepEqual(d.slice(-2), [2, 3]);
    assert.ok(ids.filter((id) => !hasWrong(byId[id])).length <= 2, 'at most 2 spots with no wrong answer');
    assert.deepEqual(buildRun(seed, b, ['D1', 'V1', 'P2', 'P1']), ids);
  }
  assert.notDeepEqual(buildRun('a', b, ['D1', 'V1', 'P2', 'P1']), buildRun('b', b, ['D1', 'V1', 'P2', 'P1']));
});

test('drill run builder: tier 4 never appears, closed skills never appear, a thin bank gives no run', () => {
  const b = [...bank(), ...[1, 2, 3].flatMap((d) => [0, 1, 2, 3].map((k) => ({ id: `B2-${d}-${k}`, skill: 'B2', tier: 4, difficulty: d, hand: `B2${d}${k}`, spot: { board: [] }, families: { raise: 'best', check: 'wrong' } })))];
  for (const seed of ['x', 'y', 'z']) assert.ok(buildRun(seed, b, ['D1', 'P2', 'B2']).every((id) => /^(D1|P2)/.test(id)));
  // no tricky spots: the logged safety net fills them from standard ones (CURR); too few spots at all: no run
  const thin = buildRun('x', bank().filter((s) => s.difficulty !== 3), ['D1', 'V1', 'P2', 'P1']);
  assert.equal(thin.length, 10);
  assert.equal(thin.fallback, 3);
  assert.equal(buildRun('x', bank().filter((s) => s.skill === 'D1' && s.difficulty === 1), ['D1']), null);
});

// P1 and P2 interleaved (CEO, 19 Nov; CURR's spec): a run with one has the other, never 3 in a row from either
const longestRun = (skills) => skills.reduce((m, c, i) => { let k = 0; while (i - k >= 0 && skills[i - k] === c && (c === 'P1' || c === 'P2')) k++; return Math.max(m, k); }, 0);
test('drill run builder: with P1 and P2 open, every run has both or neither, and never three of one in a row', () => {
  const b = bank();
  const byId = Object.fromEntries(b.map((s) => [s.id, s]));
  const banks = [
    ['four skills', b, ['D1', 'V1', 'P2', 'P1']],
    ['P1 and P2 only', b.filter((s) => s.skill === 'P1' || s.skill === 'P2'), ['P2', 'P1']],
    ['P1 heavy', [...b.filter((s) => s.skill !== 'P1'), ...b.filter((s) => s.skill === 'P1').flatMap((s) => [s, { ...s, id: s.id + 'x', hand: s.hand + 'x' }, { ...s, id: s.id + 'y', hand: s.hand + 'y' }])], ['D1', 'V1', 'P2', 'P1']],
  ];
  for (const [name, bk, open] of banks) {
    const idx = Object.fromEntries(bk.map((s) => [s.id, s]));
    for (let k = 0; k < 200; k++) {
      const ids = buildRun(`il-${k}`, bk, open);
      const sk = ids.map((id) => idx[id].skill);
      const has = (c) => sk.includes(c);
      assert.ok(has('P1') === has('P2'), `${name} ${k}: ${sk.join(' ')}`);
      assert.ok(longestRun(sk) <= 2, `${name} ${k}: ${sk.join(' ')}`);
      assert.equal(ids.length, 10);
      assert.deepEqual(ids.slots.slice(0, 3), [1, 1, 1], 'easy spots still lead');
      assert.deepEqual(ids.slots.slice(-2), [2, 3], 'still ends on a standard then a tricky');
    }
  }
  // P1 open without P2: no constraint, and P2 never appears
  for (let k = 0; k < 20; k++) assert.ok(buildRun(`solo-${k}`, b, ['D1', 'P1']).every((id) => !byId[id].skill.startsWith('P2')));
});

test('drill totals, the honest line and the Daily line', () => {
  const ans = [
    ...Array(8).fill({ family: 'best', difficulty: 1 }),
    { family: 'fine', difficulty: 2, costBb: 1.2 },
    { family: 'fine', difficulty: 3, costBb: 0.5 },
  ];
  const t = runTotals(ans);
  assert.equal(t.score, 900);
  assert.equal(honestLine(t), '8 best, 2 fine, 0 wrong · gave up 1.7bb · best streak 8');
  assert.equal(dailyLine('2026-11-15', { ...t, score: 1075 }), 'Game Theory Optional · Daily 10 · 2026-11-15 · 1,075 · ●●●●●●●●◐◐');
});

test('drill records: first Daily counts, replays are practice; PBs by score then bb; older-bank bests kept; storage failures play on', () => {
  const g = loadGame(null);
  const run = (fam) => Array(10).fill(0).map((_, i) => ({ family: i < 5 ? 'best' : fam, difficulty: 2, costBb: 2 }));
  const r1 = recordRun(g, { kind: 'daily', date: '2026-11-17', bankVersion: 'v1', answers: run('wrong'), earned: ['firstRun'] });
  assert.equal(r1.practice, false);
  assert.deepEqual(r1.badges, ['firstRun']);
  const r2 = recordRun(g, { kind: 'daily', date: '2026-11-17', bankVersion: 'v1', answers: run('best'), earned: ['firstRun', 'cleanRun'] });
  assert.equal(r2.practice, true);
  assert.equal(g.daily['2026-11-17'].score, 625);
  // a board: first run sets it quietly, a better one announces the old figure, a worse one changes nothing
  assert.equal(recordRun(g, { kind: 'run', board: 't1', date: '2026-11-17', bankVersion: 'v1', answers: run('wrong'), earned: [] }).pb, null);
  assert.deepEqual(recordRun(g, { kind: 'run', board: 't1', date: '2026-11-17', bankVersion: 'v1', answers: run('fine'), earned: [] }).pb, { was: 625, wasBb: 10 });
  assert.equal(recordRun(g, { kind: 'run', board: 't1', date: '2026-11-18', bankVersion: 'v1', answers: run('wrong'), earned: [] }).pb, null);
  assert.equal(g.boards.t1.best, 875);
  // a new bank: the old best is kept, marked, and the board starts again
  recordRun(g, { kind: 'run', board: 't1', date: '2026-11-19', bankVersion: 'v2', answers: run('wrong'), earned: [] });
  assert.equal(g.boards['t1@v1'].olderBank, true);
  assert.equal(g.boards.t1.best, 625);
  assert.equal(g.badges.firstRun, '2026-11-17', 'a badge keeps the date it was first earned');
  // storage that throws: load gives a fresh game and save does not throw
  const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(loadGame(bad).v, 1);
  saveGame(g, bad);
  // Daily results older than 60 days are dropped
  assert.deepEqual(Object.keys(pruneDaily({ '2026-09-01': {}, '2026-09-20': {}, '2026-11-17': {} }, '2026-11-17')), ['2026-09-20', '2026-11-17']);
});

test('drill badges: clean run, no big leaks, solid and sharp, hard ones right, tier cleared, mastered', () => {
  const ans = [...Array(3).fill({ family: 'best', difficulty: 1 }), ...Array(4).fill({ family: 'best', difficulty: 2 }), ...Array(3).fill({ family: 'best', difficulty: 3 })];
  const b = runBadges(ans, runTotals(ans), { skillStates: { D1: 'Mastered', V1: 'Solid', P2: 'Solid', P1: 'Solid' }, tiers: { D1: 1, V1: 1, P2: 1, P1: 1 } });
  for (const id of ['firstRun', 'cleanRun', 'noBigLeaks', 'sharpRun', 'solidRun', 'hardOnes', 'tier1', 'mastered:D1']) assert.ok(b.includes(id), id);
  const miss = [...ans.slice(0, 9), { family: 'wrong', difficulty: 3, bucket: 'large' }];
  const b2 = runBadges(miss, runTotals(miss));
  assert.ok(!b2.includes('cleanRun') && !b2.includes('noBigLeaks') && !b2.includes('hardOnes'));
  // three small wrongs: no big leak, but more than 2 wrong (GAME)
  const three = [...ans.slice(0, 7), ...Array(3).fill({ family: 'wrong', difficulty: 2, bucket: 'medium' })];
  assert.ok(!runBadges(three, runTotals(three)).includes('noBigLeaks'));
  const two = [...ans.slice(0, 8), ...Array(2).fill({ family: 'wrong', difficulty: 2, bucket: 'medium' })];
  assert.ok(runBadges(two, runTotals(two)).includes('noBigLeaks'));
});

test('drill run builder, every pair: with all six Tier 1 lessons open, each pair is both-or-neither and never three in a row', () => {
  const six = ['D1', 'D2', 'V1', 'V5', 'P1', 'P2'];
  const bk = [];
  for (const skill of six) for (const d of [1, 2, 3]) for (let k = 0; k < 6; k++) bk.push({ id: `${skill}-${d}-${k}`, skill, tier: 1, difficulty: d, hand: `${skill}${d}${k}`, spot: { board: [] }, families: { fold: 'best', call: 'wrong' } });
  const idx = Object.fromEntries(bk.map((s) => [s.id, s]));
  const pairs = [['P1', 'P2'], ['V1', 'V5'], ['D1', 'D2']];
  for (let k = 0; k < 300; k++) {
    const sk = buildRun(`six-${k}`, bk, six).map((id) => idx[id].skill);
    for (const [a, b] of pairs) assert.ok(sk.includes(a) === sk.includes(b), `${k}: ${sk.join(' ')}`);
    for (let i = 2; i < sk.length; i++) assert.ok(!(sk[i] === sk[i - 1] && sk[i] === sk[i - 2]), `${k}: ${sk.join(' ')}`);
  }
});

// GAME, CEO (release requirement): the run builder validates its own result, retries from seed+1.., and swaps keep
// the no-wrong count exact
import { runProblem, checkBankRuns, RUN_TRIES } from '../src/drill/game.js';
import fs from 'node:fs';
test('drill run builder: swaps keep the no-wrong cap; a partner lesson whose spots all have no wrong answer adds at most 2', () => {
  const bk = [];
  for (const skill of ['P1', 'P2', 'D1']) for (const d of [1, 2, 3]) for (let k = 0; k < 6; k++) {
    // P2's spots all have no wrong answer: every pair-in swap would bring one in
    const noWrong = skill === 'P2';
    bk.push({ id: `${skill}-${d}-${k}`, skill, tier: 1, difficulty: d, hand: `${skill}${d}${k}`, spot: { board: [] }, families: noWrong ? { fold: 'best', call: 'fine' } : { fold: 'best', call: 'wrong' } });
  }
  const idx = Object.fromEntries(bk.map((s) => [s.id, s]));
  let runs = 0;
  for (let k = 0; k < 300; k++) {
    const ids = buildRun(`cap-${k}`, bk, ['P1', 'P2', 'D1']);
    if (!ids) continue;
    runs++;
    assert.ok(ids.filter((id) => !hasWrong(idx[id])).length <= 2, ids.join(' '));
    assert.equal(runProblem(ids, bk, ['P1', 'P2', 'D1']), null);
  }
  assert.ok(runs > 250, `${runs} valid runs`);
});

test('drill run builder: a run that cannot meet the pair rules is never returned (no run, logged)', () => {
  // P1 has spots only at difficulty 1-2 and P2 none at all at difficulty 1: often fixable by a retry, sometimes not
  const bk = [];
  for (const d of [1, 2, 3]) for (let k = 0; k < 10; k++) bk.push({ id: `P1-${d}-${k}`, skill: 'P1', tier: 1, difficulty: d, hand: `P1${d}${k}`, spot: { board: [] }, families: { fold: 'wrong', raise: 'best' } });
  bk.push({ id: 'P2-2-0', skill: 'P2', tier: 1, difficulty: 2, hand: 'P220', spot: { board: [] }, families: { fold: 'best', call: 'wrong' } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    // ten P1 spots and one P2 spot cannot avoid three P1 in a row: never a run
    for (let k = 0; k < 20; k++) assert.equal(buildRun(`thin-${k}`, bk, ['P1', 'P2']), null);
  } finally {
    console.warn = warn;
  }
  assert.equal(RUN_TRIES, 50);
  // a problem the checker names
  assert.match(runProblem(['P1-1-0', 'P1-1-1', 'P1-1-2', 'P1-2-0', 'P1-2-1', 'P1-2-2', 'P1-2-3', 'P1-3-0', 'P1-2-4', 'P1-3-1'], bk, ['P1', 'P2']), /without its partner|in a row/);
});

// the shipped bank, when there is one: 10,000 run seeds and every Daily seed for the next 366 days
test('drill run builder on the shipped bank: 10,000 runs and a year of Dailies, all valid', { skip: !fs.existsSync(new URL('../src/drill/bank.json', import.meta.url)) && 'no shipped bank yet' }, () => {
  const bank = JSON.parse(fs.readFileSync(new URL('../src/drill/bank.json', import.meta.url)));
  const r = checkBankRuns(bank);
  assert.equal(r.checked, 10366);
  assert.deepEqual(r.failed.slice(0, 5), []);
});
