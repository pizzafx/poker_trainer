// Drill: what the player has learned, per skill, and what Practice serves next (the curriculum's rules).
// Levels: Frontier, Learning, Solid (opens the next tier), Mastered, Rusty. Review is per skill, not per spot:
// five boxes (same session, next session, 3, 7 and 21 days); a miss sends the skill to box 1 and brings a twin
// (same skill, opponent type and difficulty, new cards) 3 to 5 spots later; the exact spot never comes back
// within 30 days. Every answer, from Practice or a scored run, comes through answer().

export const LEARN_KEY = 'trainer-drill-learn';
const DAY = 86400000;
const BOX_DAYS = { 3: 3, 4: 7, 5: 21 };
// confusable pairs (a miss on one schedules a spot of the other, once both are open)
export const PAIRS = { P1: 'P2', P2: 'P1', D1: 'D3', D3: 'D1', D2: 'D1', V1: 'B1', B1: 'V1', V5: 'V1', O1: 'V3', V3: 'O1', P2b: 'P3', P3: 'P2b', M1: 'M2', M2: 'M1' };

// credit for the level rules: best is right; fine is right at difficulty 1-2 and half at 3
// opponent types Mastered needs: 3, but V1 has only two calling types (station and whale; CEO, 17 Nov)
// B1 has two (station, whale) as V1; V5 two (nit and tag) and D2 one (maniac): their predicates allow no more (CEO, 19 Nov)
export const MASTER_TYPES = { V1: 2, B1: 2, V5: 2, D2: 1 };
// Tier 1's partner lessons (CEO, 19 Nov: V1/B1, D1/D2, P1/P2): each pair has opposite answers in look-alike spots, so one habit
// ("always fold", "always bet") cannot pass both. The one table the scheduler, the run builder and the levels read:
// - interleave: while both are open, never more than 2 spots in a row from either, and a run with one has the other;
//   practising one alone mixes in the other at about 1 spot in 3
// - partner gate: a lesson reaches Solid or Mastered only while its partner has 5 of its last 8 answers right
// V1's partner is B1, "Don't bluff people who don't fold" (CEO, 19 Nov: V5 cannot fill a bank on true tables; it
// stays in skills.js as a later second partner and is not paired yet)
// D1's partner is D3, "Call big bets with real hands" (CEO, 19 Nov); D2 stays in skills.js, unpaired, for later
export const PARTNERS = { P1: 'P2', P2: 'P1', V1: 'B1', B1: 'V1', D1: 'D3', D3: 'D1' };
export const INTERLEAVE = PARTNERS;
export const INTERLEAVE_MAX = 2;
export const PARTNER_RIGHT = 5;
export const PARTNER_OF = 8;
// A shipped bank's lessons and their partners ship together or not at all (CEO's hold, CURR): the lessons with
// spots whose partner has none. Empty means the bank may ship.
export function partnerGaps(bank) {
  const has = new Set(bank.spots.map((s) => s.skill));
  return [...has].filter((c) => PARTNERS[c] && !has.has(PARTNERS[c])).map((c) => `${c} has spots, ${PARTNERS[c]} has none`);
}
// the partner's last 8 answers hold 5 right (credit: a fine at difficulty 3 is half)
export function partnerOk(st, code) {
  const p = PARTNERS[code];
  if (!p) return true;
  const ans = (st.skills[p] && st.skills[p].answers) || [];
  return ans.slice(-PARTNER_OF).reduce((a, x) => a + x.c, 0) >= PARTNER_RIGHT;
}
export const credit = (family, d) => (family === 'best' ? 1 : family === 'fine' ? (d >= 3 ? 0.5 : 1) : 0);

// the opponent type a spot is about: the last opponent to bet or raise, else the first live opponent
export function againstType(spot) {
  const last = [...spot.spot.actions].reverse().find((a) => (a.type === 'raise' || a.type === 'bet') && a.seat !== 0);
  if (last) return spot.spot.types[last.seat];
  const seats = Object.keys(spot.reads || {});
  return seats.length ? spot.reads[seats[0]].type : null;
}

export const freshLearn = () => ({ v: 1, skills: {}, seen: {}, session: 1, counter: 0, pending: [], recent: [] });
export function loadLearn(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(LEARN_KEY);
    const st = raw ? JSON.parse(raw) : null;
    return st && st.v === 1 ? { ...freshLearn(), ...st } : freshLearn();
  } catch {
    return freshLearn();
  }
}
export function saveLearn(st, storage = globalThis.localStorage) {
  try {
    if (storage) storage.setItem(LEARN_KEY, JSON.stringify(st));
  } catch {
    // play on
  }
}
const skillOf = (st, code) => (st.skills[code] ||= { box: 1, dueSession: null, dueAt: null, answers: [], lastMiss: null });
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

// A new Practice session (a fresh visit): reviews "next session" come due.
export function newSession(st) {
  st.session++;
  st.pending = [];
  return st;
}

// Is the skill's review due?
export function isDue(sk, st, now) {
  if (sk.box === 1) return false; // box 1 is reviewed by the twins inside the session
  if (sk.dueSession != null) return st.session >= sk.dueSession;
  return sk.dueAt != null && now >= sk.dueAt;
}

// One answer. `spot` is the bank entry, `family` best / fine / wrong. Returns what it scheduled.
export function answer(st, spot, family, now = Date.now(), { open = [] } = {}) {
  const code = spot.skill;
  const sk = skillOf(st, code);
  const d = spot.difficulty;
  const right = credit(family, d);
  const wasDue = isDue(sk, st, now);
  st.counter++;
  sk.answers = [...sk.answers, { c: right, d, type: againstType(spot), day: dayOf(now), at: st.counter, family }].slice(-20);
  st.seen[spot.id] = now;
  st.recent = [...st.recent, code].slice(-6);
  const out = { twin: null, pair: null };
  if (family === 'wrong') {
    sk.box = 1;
    sk.dueSession = null;
    sk.dueAt = null;
    sk.lastMiss = st.counter;
    // the twin, 3 to 5 spots later; a miss on a twin first brings an easy spot of the same skill
    const twinMiss = st.pending.some((p) => p.done === spot.id);
    const at = st.counter + 3 + (st.counter % 3);
    out.twin = { skill: code, type: againstType(spot), d: twinMiss ? 1 : d, at, of: spot.id };
    st.pending.push(out.twin);
    if (twinMiss) st.pending.push({ skill: code, type: againstType(spot), d, at: at + 2, of: spot.id });
    const pair = PAIRS[code];
    if (pair && open.includes(pair)) {
      out.pair = { skill: pair, type: null, d: null, at: st.counter + 2, of: spot.id };
      st.pending.push(out.pair);
    }
  } else if (right >= 1 && (wasDue || sk.box === 1)) {
    // a right answer at a due review (or out of box 1) moves the skill up a box
    sk.box = Math.min(5, sk.box + 1);
    if (sk.box === 2) {
      sk.dueSession = st.session + 1;
      sk.dueAt = null;
    } else {
      sk.dueSession = null;
      sk.dueAt = now + BOX_DAYS[sk.box] * DAY;
    }
  }
  return out;
}

// The skill's level. `tierOpen`: whether its tier is open.
export function level(st, code, tierOpen = true, now = Date.now()) {
  if (!tierOpen) return 'Locked';
  const sk = st.skills[code];
  if (!sk) return 'Frontier';
  const gate = (lv) => (['Solid', 'Mastered'].includes(lv) && !partnerOk(st, code) ? 'Learning' : lv);
  if (sk.answers.length < 6) return gate(sk.placed || 'Frontier'); // placement sets the start until six answers are in
  const last = (k) => sk.answers.slice(-k);
  const sum = (xs) => xs.reduce((a, x) => a + x.c, 0);
  const types = (xs) => new Set(xs.filter((x) => x.c >= 1).map((x) => x.type)).size;
  const l10 = last(10);
  const rights = sk.answers.filter((x) => x.c >= 1);
  const mastered = l10.length >= 10 && sum(l10) >= 9 && sk.answers.filter((x) => x.d === 3 && x.c >= 1).length >= 3 && types(l10) >= (MASTER_TYPES[code] || 3) && rights.length >= 2 && rights[rights.length - 1].day !== rights[rights.length - 2].day;
  const l8 = last(8);
  const solid = sum(l8) >= 6 && l8.some((x) => x.d >= 2 && x.c >= 1) && types(l8) >= 2;
  const recentMiss = sk.lastMiss != null && st.counter - sk.lastMiss <= 3;
  let lv = gate(mastered ? 'Mastered' : solid && !recentMiss ? 'Solid' : sum(l8) / l8.length >= 0.6 && !recentMiss ? 'Learning' : 'Frontier');
  // overdue by more than its interval: rusty
  if ((lv === 'Mastered' || lv === 'Solid') && sk.dueAt != null && now - sk.dueAt > (BOX_DAYS[sk.box] || 1) * DAY) lv = 'Rusty';
  return lv;
}

// Which tiers are open: tier 1 always; tier 2 when two tier-1 skills are Solid or better; tier 3 when three
// tier-2 skills are. Tier 4 opens with tier 3 (practice only).
export function openTiers(st, skills, now = Date.now()) {
  const good = (tier) => Object.entries(skills).filter(([c, s]) => s.tier === tier && ['Solid', 'Mastered', 'Rusty'].includes(level(st, c, true, now))).length;
  const open = new Set([1]);
  if (good(1) >= 2) open.add(2);
  if (open.has(2) && good(2) >= 3) {
    open.add(3);
    open.add(4);
  }
  return open;
}

// A flag at the table with this leak key makes its skill due now.
export function flagFromTable(st, skills, leak) {
  for (const [code, s] of Object.entries(skills)) {
    if (s.leak !== leak) continue;
    const sk = skillOf(st, code);
    if (sk.box > 1) {
      sk.dueSession = st.session;
      sk.dueAt = null;
    }
  }
}

// The next Practice spot. `spots` the bank's spots, `skills` its skill table, `rnd` a random source; `pin` a
// skill code to practise only that skill. Returns { spot, why } or null.
export function nextPractice(st, spots, skills, { now = Date.now(), rnd = Math.random, pin = null } = {}) {
  const tiers = openTiers(st, skills, now);
  const hasSpots = (c) => spots.some((s) => s.skill === c);
  let open = Object.keys(skills).filter((c) => tiers.has(skills[c].tier) && (!pin || c === pin));
  if (!open.length) return null;
  // single-lesson practice of a paired lesson brings its partner in (PARTNERS)
  const partner = pin && INTERLEAVE[pin];
  if (partner && skills[partner] && tiers.has(skills[partner].tier) && hasSpots(partner)) open = [...open, partner];
  // a pair: a third spot in a row from one lesson is not served while its partner is open
  const capped = (code) => {
    const other = INTERLEAVE[code];
    return !!other && open.includes(other) && hasSpots(other) && st.recent.length >= INTERLEAVE_MAX && st.recent.slice(-INTERLEAVE_MAX).every((c) => c === code);
  };
  if (partner && open.includes(partner) && capped(pin)) open = open.filter((c) => c !== pin);
  else if (partner) open = open.filter((c) => c !== partner);
  const fresh = (s) => !(st.seen[s.id] && now - st.seen[s.id] < 30 * DAY);
  const pickFrom = (cands) => {
    const ok = cands.filter(fresh);
    const pool = ok.length ? ok : cands;
    return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
  };
  const ofSkill = (code, want = {}) => {
    // narrow by each wish in turn while something is left: opponent type, then difficulty
    let c = spots.filter((s) => s.skill === code && s.id !== want.not);
    for (const f of [want.type && ((s) => againstType(s) === want.type), want.d && ((s) => s.difficulty === want.d)]) {
      if (!f) continue;
      const n = c.filter(f);
      if (n.length) c = n;
    }
    return c;
  };
  // a twin or pair spot whose time has come
  const p = st.pending.findIndex((x) => st.counter >= x.at && open.includes(x.skill) && !capped(x.skill));
  if (p >= 0) {
    const x = st.pending.splice(p, 1)[0];
    const spot = pickFrom(ofSkill(x.skill, { type: x.type, d: x.d, not: x.of }));
    if (spot) {
      if (x.type) st.pending.push({ done: spot.id, at: Infinity, skill: '-' }); // marks a twin, for a second miss
      return { spot, why: x.type ? 'twin' : 'pair' };
    }
  }
  // no more than three of one skill in a row once it is past Frontier
  const tooMany = (code) => capped(code) || (st.recent.length >= 3 && st.recent.slice(-3).every((c) => c === code) && level(st, code, true, now) !== 'Frontier');
  const due = open.filter((c) => st.skills[c] && isDue(st.skills[c], st, now) && !tooMany(c));
  const learning = open.filter((c) => ['Frontier', 'Learning'].includes(level(st, c, true, now)) && !tooMany(c));
  const upkeep = open.filter((c) => ['Solid', 'Mastered', 'Rusty'].includes(level(st, c, true, now)) && !tooMany(c));
  const r = rnd();
  let group = r < 0.25 ? due : r < 0.85 ? learning : upkeep;
  if (!group.length) group = [due, learning, upkeep].find((g) => g.length) || open.filter((c) => !capped(c));
  if (!group.length) group = open;
  const code = group[Math.floor(rnd() * group.length)];
  // new skills serve easy spots first, then mix in harder ones as the answers come right
  const lv = level(st, code, true, now);
  const d = lv === 'Frontier' ? ((st.skills[code]?.answers || []).filter((x) => x.c >= 1).length >= 3 ? 2 : 1) : null;
  const spot = pickFrom(ofSkill(code, { d }));
  return spot ? { spot, why: due.includes(code) ? 'review' : lv === 'Frontier' || lv === 'Learning' ? 'learning' : 'upkeep' } : null;
}

// Placement (12 spots, 3 per Tier 1 skill): 3 of 3 starts the skill Solid in box 3, 2 of 3 Learning in box 2,
// fewer Frontier in box 1. `right` is the count of right answers per skill.
export function place(st, right, now = Date.now()) {
  for (const [code, n] of Object.entries(right)) {
    const sk = skillOf(st, code);
    sk.placed = n >= 3 ? 'Solid' : n === 2 ? 'Learning' : 'Frontier';
    sk.box = n >= 3 ? 3 : n === 2 ? 2 : 1;
    sk.dueSession = sk.box === 2 ? st.session + 1 : null;
    sk.dueAt = sk.box === 3 ? now + 3 * DAY : null;
  }
  st.placedAt = now;
  return st;
}
