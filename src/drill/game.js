// Drill: the game layer (scored runs, Daily 10, points, streaks, personal bests, badges). Pure functions plus
// a small store; it never changes a verdict. Scoring and run shape follow the approved Drill spec: best 100,
// +25 on a standard spot and +50 on a tricky one, fine 50, wrong 0; ten spots, 3 easy / 4 standard / 3 tricky.

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

// Ten bank spots for a run, deterministically from the seed, over the open skills (tier 4 never). Easy spots
// lead and the run ends on a standard spot then a tricky one. Returns null when the skills are too thin.
export function buildRun(seed, spots, openSkills) {
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
  const ones = picked.filter((s) => s.difficulty === 1);
  const twos = picked.filter((s) => s.difficulty === 2);
  const threes = picked.filter((s) => s.difficulty === 3);
  const lastTwo = twos.pop();
  const lastThree = threes.pop();
  const middle = [...twos, ...threes];
  for (let i = middle.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [middle[i], middle[j]] = [middle[j], middle[i]];
  }
  const order = [...ones, ...middle, lastTwo, lastThree];
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
