// Drill: the game layer (scored runs, Daily 10, points, streaks, personal bests, badges). Pure functions plus
// a small store; it never changes a verdict. Scoring and run shape follow the approved Drill spec: best 100,
// +25 on a standard spot and +50 on a tricky one, fine 50, wrong 0; ten spots, 3 easy / 4 standard / 3 tricky.

import { INTERLEAVE, INTERLEAVE_MAX } from './learn.js';

export const MAX_SCORE = 1250;
export const RUN_LEN = 10;
export const MIX = { 1: 3, 2: 4, 3: 3 };
export const NO_WRONG_CAP = 2; // spots with no wrong answer, at most, in a run (guessing must not pay)

export function points(family, difficulty) {
  if (family === 'best') return 100 + (difficulty === 3 ? 50 : difficulty === 2 ? 25 : 0);
  return family === 'fine' ? 50 : 0;
}
export function band(score) {
  return score >= 1100 ? 'Sharp' : score >= 900 ? 'Solid' : score >= 650 ? 'Getting there' : 'Worth another look';
}
// consecutive best answers; a fine answer neither extends nor breaks it
export const streakAfter = (streak, family) => (family === 'best' ? streak + 1 : family === 'fine' ? streak : 0);
export const DOT = { best: '●', fine: '◐', wrong: '○' };

// a small seeded generator from a string
export function rngFor(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const dailySeed = (isoDate, bankVersion) => `daily|${isoDate}|${bankVersion}`;
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hasWrong = (spot) => Object.values(spot.families).includes('wrong');

export const RUN_TRIES = 50;
// the partner of a lesson when both are open and the pool has spots of both (PARTNERS; CEO, 19 Nov)
const pairedIn = (pool, openSkills) => {
  const has = new Set(pool.map((s) => s.skill));
  return (code) => !!INTERLEAVE[code] && openSkills.includes(code) && openSkills.includes(INTERLEAVE[code]) && has.has(code) && has.has(INTERLEAVE[code]);
};

// Whether a built run may ship (DRILL_GAME_SPEC 3.2, a release requirement): every open pair both-or-neither,
// never more than INTERLEAVE_MAX in a row from one lesson of a pair, at most NO_WRONG_CAP spots with no wrong
// answer, and the 3/4/3 slots with the easy lead and the standard-then-tricky end. Returns null or the reason.
export function runProblem(ids, spots, openSkills) {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const pool = spots.filter((s) => openSkills.includes(s.skill) && s.tier < 4);
  const paired = pairedIn(pool, openSkills);
  const run = ids.map((id) => byId.get(id));
  if (run.length !== RUN_LEN || run.some((s) => !s)) return 'not ten bank spots';
  const sk = run.map((s) => s.skill);
  for (const c of new Set(sk)) if (paired(c) && !sk.includes(INTERLEAVE[c])) return `${c} without its partner ${INTERLEAVE[c]}`;
  for (let i = INTERLEAVE_MAX; i < sk.length; i++) if (paired(sk[i]) && sk.slice(i - INTERLEAVE_MAX, i).every((c) => c === sk[i])) return `more than ${INTERLEAVE_MAX} ${sk[i]} in a row`;
  if (run.filter((s) => !hasWrong(s)).length > NO_WRONG_CAP) return `more than ${NO_WRONG_CAP} spots with no wrong answer`;
  const slots = ids.slots || run.map((s) => s.difficulty);
  for (const d of [1, 2, 3]) if (slots.filter((x) => x === d).length !== MIX[d]) return 'not 3/4/3';
  if (slots.slice(0, MIX[1]).some((x) => x !== 1) || slots[RUN_LEN - 2] !== 2 || slots[RUN_LEN - 1] !== 3) return 'out of order';
  return null;
}

// Ten bank spots for a run, deterministically from the seed, over the open skills (tier 4 never). Easy spots
// lead and the run ends on a standard spot then a tricky one. A run that breaks the pair rules or the cap never
// ships: it is rebuilt from seed+1, seed+2, ... (RUN_TRIES at most, so the Daily stays the same for everyone);
// returns null when the skills are too thin or no try is valid (logged).
export function buildRun(seed, spots, openSkills) {
  for (let k = 0; k < RUN_TRIES; k++) {
    const s = k === 0 ? seed : `${seed}+${k}`;
    const ids = buildOnce(s, spots, openSkills);
    if (!ids) return null; // too thin: another seed would not help
    if (!runProblem(ids, spots, openSkills)) {
      ids.tries = k + 1;
      ids.seedUsed = s;
      return ids;
    }
  }
  console.warn(`Drill: no valid run from seed ${seed} in ${RUN_TRIES} tries (the bank is short of a partner lesson or of spots with a wrong answer)`);
  return null;
}

function buildOnce(seed, spots, openSkills) {
  const rnd = rngFor(seed);
  const pool = spots.filter((s) => openSkills.includes(s.skill) && s.tier < 4).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const picked = [];
  let noWrong = 0;
  let fallback = 0;
  const hands = new Set();
  const used = new Set();
  const draw = (cands) => {
    while (cands.length) {
      const s = cands.splice(Math.floor(rnd() * cands.length), 1)[0];
      if (used.has(s.id)) continue;
      if (!hasWrong(s) && noWrong >= NO_WRONG_CAP) continue;
      if (hands.has(s.hand + s.spot.board.join(''))) continue;
      return s;
    }
    return null;
  };
  for (const d of [1, 2, 3]) {
    const cands = pool.filter((s) => s.difficulty === d);
    for (let k = 0; k < MIX[d]; k++) {
      let got = draw(cands);
      // a logged safety net only (CURR, 18 Nov): a missing easy or tricky spot is filled with a standard one
      if (!got && d !== 2) {
        got = draw(pool.filter((s) => s.difficulty === 2));
        if (got) {
          fallback++;
          got = { ...got, difficulty: d === 1 ? 1 : 3, fellBack: true };
        }
      }
      if (!got) return null;
      if (!hasWrong(got)) noWrong++;
      hands.add(got.hand + got.spot.board.join(''));
      used.add(got.id);
      picked.push(got);
    }
  }
  if (fallback) console.warn(`Drill: run ${seed} filled ${fallback} spot(s) from standard ones (the bank is short of easy or tricky spots)`);
  // partner lessons together (PARTNERS; CEO, 19 Nov): while both are open, a run with a spot of one has a spot of the other
  const paired = pairedIn(pool, openSkills);
  // a swap keeps the no-wrong count exact (GAME): out goes `old`, in comes `got`
  const swapIn = (old, got) => {
    hands.delete(old.hand + old.spot.board.join(''));
    used.delete(old.id);
    if (!hasWrong(old)) noWrong--;
    hands.add(got.hand + got.spot.board.join(''));
    used.add(got.id);
    if (!hasWrong(got)) noWrong++;
  };
  // the cap for a swap: `old` leaves first, so a no-wrong spot may replace a no-wrong spot
  const drawFor = (old, cands) => {
    if (!hasWrong(old)) noWrong--;
    const got = draw(cands);
    if (!hasWrong(old)) noWrong++;
    return got;
  };
  // bring the missing partner in for a spot of a lesson that appears twice or more (so no other lesson drops out),
  // in that spot's slot; repeat until every open pair is both-or-neither
  for (let pass = 0; pass < 6; pass++) {
    const count = (c) => picked.filter((s) => s.skill === c).length;
    const missing = Object.keys(INTERLEAVE).find((c) => paired(c) && count(c) > 0 && count(INTERLEAVE[c]) === 0);
    if (!missing) break;
    const other = INTERLEAVE[missing];
    let done = false;
    for (const i of [...picked.keys()].reverse()) {
      const old = picked[i];
      if (old.fellBack || count(old.skill) < 2) continue;
      const got = drawFor(old, pool.filter((s) => s.skill === other && s.difficulty === old.difficulty));
      if (!got) continue;
      swapIn(old, got);
      picked[i] = got;
      done = true;
      break;
    }
    if (!done) break;
  }
  const ones = picked.filter((s) => s.difficulty === 1);
  const twos = picked.filter((s) => s.difficulty === 2);
  const threes = picked.filter((s) => s.difficulty === 3);
  const lastTwo = twos.pop();
  const lastThree = threes.pop();
  const middle = [...twos, ...threes];
  const shuffle = (xs) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
  };
  shuffle(middle);
  // never more than INTERLEAVE_MAX in a row from one lesson of a pair while both are open: reshuffle the easy lead and
  // the middle (the last two slots stay put), deterministically from the seed
  const tooLong = (xs) => xs.some((s, i) => i >= INTERLEAVE_MAX && paired(s.skill) && xs.slice(i - INTERLEAVE_MAX, i).every((x) => x.skill === s.skill));
  let order = [...ones, ...middle, lastTwo, lastThree];
  for (let k = 0; k < 200 && tooLong(order); k++) {
    shuffle(ones);
    shuffle(middle);
    order = [...ones, ...middle, lastTwo, lastThree];
  }
  // still too long (say three easy P1 spots): swap the third for a spot of its partner lesson, else of another
  // open skill, at the same difficulty
  for (let k = 0; k < 10 && tooLong(order); k++) {
    const i = order.findIndex((s, j) => j >= INTERLEAVE_MAX && paired(s.skill) && order.slice(j - INTERLEAVE_MAX, j).every((x) => x.skill === s.skill));
    const old = order[i];
    const d = old.fellBack ? 2 : old.difficulty;
    const got = drawFor(old, pool.filter((s) => s.skill === INTERLEAVE[old.skill] && s.difficulty === d)) || drawFor(old, pool.filter((s) => s.skill !== old.skill && s.difficulty === d));
    if (!got) break;
    swapIn(old, got);
    order[i] = old.fellBack ? { ...got, difficulty: old.difficulty, fellBack: true } : got;
  }
  const ids = order.map((s) => s.id);
  ids.fallback = fallback;
  ids.slots = order.map((s) => s.difficulty); // the slot each spot fills (a fill-in scores its slot's bonus)
  return ids;
}

// A finished run's totals from its answers [{ family, difficulty, costBb, bucket }]
export function runTotals(answers) {
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let bb = 0;
  const n = { best: 0, fine: 0, wrong: 0 };
  for (const a of answers) {
    score += points(a.family, a.difficulty);
    streak = streakAfter(streak, a.family);
    bestStreak = Math.max(bestStreak, streak);
    bb += a.family === 'best' ? 0 : a.costBb || 0;
    n[a.family]++;
  }
  return { score, band: band(score), bestStreak, bb: +bb.toFixed(1), ...n, dots: answers.map((a) => DOT[a.family]).join('') };
}
export const honestLine = (t) => `${t.best} best, ${t.fine} fine, ${t.wrong} wrong · gave up ${t.bb}bb · best streak ${t.bestStreak}`;
export const dailyLine = (iso, t) => `Game Theory Optional · Daily 10 · ${iso} · ${t.score.toLocaleString('en-US')} · ${t.dots}`;

// The badges a finished run earns (GAME's rules). `skillStates` are the learning levels by skill, `tiers` the
// skill -> tier map; `proven` the skills proven at the table.
export function runBadges(answers, t, { skillStates = {}, tiers = {}, proven = [] } = {}) {
  const out = ['firstRun'];
  if (answers.length === RUN_LEN && answers.every((a) => a.family === 'best')) out.push('cleanRun');
  // no wrong answer in the large bucket, and at most 2 wrong in all (GAME, 18 Nov)
  if (!answers.some((a) => a.family === 'wrong' && a.bucket === 'large') && answers.filter((a) => a.family === 'wrong').length <= 2) out.push('noBigLeaks');
  if (t.score >= 1100) out.push('sharpRun');
  if (t.score >= 900) out.push('solidRun');
  const tricky = answers.filter((a) => (a.trueD ?? a.difficulty) === 3); // true tricky spots only (GAME)
  if (tricky.length === 3 && tricky.every((a) => a.family === 'best')) out.push('hardOnes');
  const byTier = {};
  for (const [sk, tr] of Object.entries(tiers)) (byTier[tr] ||= []).push(sk);
  for (const [tr, sks] of Object.entries(byTier)) if (sks.every((sk) => ['Solid', 'Mastered'].includes(skillStates[sk]))) out.push(`tier${tr}`);
  for (const [sk, st] of Object.entries(skillStates)) if (st === 'Mastered') out.push(`mastered:${sk}`);
  for (const sk of proven) out.push(`proven:${sk}`);
  return out;
}

// ---- storage (this device only; the game plays on without it) ----
export const STORE_KEY = 'trainer-drill-game';
const fresh = () => ({ v: 1, boards: {}, daily: {}, runs: 0, recent: [], badges: {}, current: null });
export function loadGame(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(STORE_KEY);
    const g = raw ? JSON.parse(raw) : null;
    return g && g.v === 1 ? { ...fresh(), ...g } : fresh();
  } catch {
    return fresh();
  }
}
export function saveGame(g, storage = globalThis.localStorage) {
  try {
    if (storage) storage.setItem(STORE_KEY, JSON.stringify(g));
  } catch {
    // storage full or blocked: play on
  }
}
// keep the Daily results of the last 60 days only
export function pruneDaily(daily, today) {
  const cut = new Date(`${today}T00:00:00`);
  cut.setDate(cut.getDate() - 60);
  const keep = isoDay(cut);
  return Object.fromEntries(Object.entries(daily).filter(([d]) => d > keep));
}

// Records a finished run. kind 'run' (board id) or 'daily'; a Daily replay is practice and records nothing.
// Returns { pb: { was } | null, badges: [new badge ids], practice }.
export function recordRun(g, { kind, board, date, bankVersion, answers, earned }) {
  const t = runTotals(answers);
  const res = { pb: null, badges: [], practice: false, totals: t };
  if (kind === 'daily') {
    if (g.daily[date]) {
      res.practice = true;
      return res;
    }
    g.daily = pruneDaily({ ...g.daily, [date]: { score: t.score, dots: t.dots, bankVersion } }, date);
  }
  g.runs++;
  g.recent = [...g.recent, ...answers.map((a) => a.family)].slice(-50);
  const id = kind === 'daily' ? 'daily' : board;
  let was = g.boards[id];
  // a best set on an older bank is kept, marked, and this bank's board starts fresh
  if (was && was.bankVersion !== bankVersion) {
    g.boards[`${id}@${was.bankVersion}`] = { ...was, olderBank: true };
    was = null;
  }
  const entry = { best: t.score, bestBb: t.bb, bestStreak: t.bestStreak, date, bankVersion };
  if (!was) g.boards[id] = entry;
  else if (t.score > was.best || (t.score === was.best && t.bb < was.bestBb)) {
    // a better score, or the same score with fewer bb given up: announced once, on the summary
    g.boards[id] = entry;
    res.pb = { was: was.best, wasBb: was.bestBb };
  }
  for (const b of earned) {
    if (!g.badges[b]) {
      g.badges[b] = date;
      res.badges.push(b);
    }
  }
  g.current = null;
  return res;
}

// The whole-bank run check (GAME, CEO release requirement): `runs` run seeds and every Daily seed for `days` days
// from `from`, over the bank's Tier 1 lessons, each built and validated. drillcheck runs it on every bank change
// and the tests on the shipped bank. Returns { checked, failed: [{ seed, why }] }.
export function checkBankRuns(bank, { runs = 10000, days = 366, from = new Date() } = {}) {
  const tier1 = Object.keys(bank.skills).filter((c) => bank.skills[c].tier === 1);
  const failed = [];
  let checked = 0;
  const one = (seed) => {
    checked++;
    const ids = buildRun(seed, bank.spots, tier1);
    const why = ids ? runProblem(ids, bank.spots, tier1) : 'no run';
    if (why) failed.push({ seed, why });
  };
  for (let k = 0; k < runs; k++) one(`run-${k}`);
  const d0 = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  for (let k = 0; k < days; k++) one(dailySeed(isoDay(new Date(d0 + k * 86400000 + 12 * 3600000)), bank.version));
  return { checked, failed };
}
