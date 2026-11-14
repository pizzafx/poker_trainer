// Verdict checker: plays thousands of decisions in the real Session, in several styles (sensible,
// passive, aggressive, limper), heads-up and full ring, at every stake and in a home game, and
// checks every verdict the coach gives against plain invariants: what it says must agree with its
// own numbers, the hand and the grade. Any violation fails the run and the hand is saved.
//
//   node scripts/verdictcheck.js                 the full run (all styles, stakes, table sizes)
//   node scripts/verdictcheck.js --hands 40      hands per configuration (default 60)
//   node scripts/verdictcheck.js --out dir       where violating hands are saved (default ./verdictcheck-out)
//
// A fast subset runs in npm test (test/verdictcheck.test.js). Invariants are pure predicates on one
// decision record (session.decisions); add new ones to INVARIANTS.
import fs from 'node:fs';
import path from 'node:path';
import { Session } from '../src/trainer/session.js';
import { STREET } from '../src/engine/game.js';
import { cardStr } from '../src/engine/cards.js';
import { classOf, classNames } from '../src/engine/hands.js';
import { handFeatures, TIER } from '../src/engine/features.js';
import { HERO_PROFILE } from '../src/bots/profiles.js';
import { verdictWord, isBestPlay, bestHeadline } from '../src/trainer/best.js';
import { shownCost } from '../src/trainer/explain.js';
import { disputeReport, disputeText } from '../src/trainer/dispute.js';
import { presetRanges, groupOf } from '../src/trainer/ranges.js';
import { pairedGap } from '../src/trainer/judge.js';

const STANDARD = presetRanges('standard');
const LOOSE = ['maniac', 'whale', 'lag'];
const R = Math.round;
const topRead = (d, nick) => {
  const s = ((d.snapshot && d.snapshot.seats) || []).find((x) => x.name === nick);
  return s && s.read ? s.read[0] : null;
};
const realDraw = (d) => {
  if (d.street === STREET.PRE) return false;
  const f = handFeatures(d.hole, d.board);
  return !!(f.flushDraw || f.straightDraw) && f.drawEquity >= 0.14;
};
const text = (d) => [d.headline, d.anchor, d.anchorExtra, ...(d.reasons || []), d.theory, d.tip].filter(Boolean).join(' ');
const labelGap = (v, m, label) => {
  const o = v.options.find((x) => x.label.replace(/\s*\([^)]*\)\s*$/, '') === label);
  return o ? R(o.ev) - R(m.ev) : null;
};
const isTop = (v, i) => v.options.every((o) => o.ev <= v.options[i].ev + 1e-9);
const VALUE_VS_LOOSE = new Set(['TT', 'JJ', 'QQ', 'KK', 'AA', 'AJo', 'AQo', 'AKo', 'ATs', 'AJs', 'AQs', 'AKs', 'KQo', 'KJs', 'KQs']);
const habitNotes = new Set(['mwHabit', 'preBluff', 'bluffRaise', 'anchorHabit', 'riverBluff', 'passedBluff', 'overbet']);

// Each invariant: (d, v, m, b) => true when violated. d = the decision record, v its verdict, m your
// option, b the named best or reference option.
export const INVARIANTS = {
  // ---- from QA-VERDICT's first audit ----
  'V1 "nothing here is graded" only under "not graded"': (d, v) => /[Nn]othing here is graded/.test(d.anchor || '') && verdictWord(v, d) !== 'not graded',
  'V2 semiBluff "betting is standard" never over a failing bluff estimate': (d, v) => v.note === 'semiBluff' && /Do not bluff/.test(d.anchor || ''),
  "V3 limp tip only for hands in the seat's Standard range": (d) => d.tipKind === 'limp' && !STANDARD[groupOf(d.position)].includes(classNames[classOf(d.hole[0], d.hole[1])]),
  'V3b limp tip "raising does better" never when every raise scores below the limp': (d, v, m) => d.tipKind === 'limp' && v.options.filter((o) => o.type === 'raise').every((o) => o.ev < m.ev - 0.5),
  'V4 postflop call-vs-fold flag: the cost shown is at most the call': (d, v, m, b) => d.street !== STREET.PRE && v.grade !== 'good' && m.type === 'call' && b.type === 'fold' && shownCost(v) > d.toCall + 1,
  'V5 "bets are nearly always real" only against a bettor read as nit, abc, station or beginner': (d) => /nearly always real/.test(d.anchor || '') && !(d.villain && (() => { const t = topRead(d, d.villain.nick); return t && ['nit', 'abc', 'station', 'beginner'].includes(t.type); })()),
  'V5b "bets are nearly always real" never when the range shows 15% or more nothing plus draws': (d) => {
    if (!/nearly always real/.test(d.anchor || '')) return false;
    const why = (d.reasons || []).join(' ');
    return +(why.match(/(\d+)% nothing/) || [0, 0])[1] + +(why.match(/(\d+)% draws/) || [0, 0])[1] >= 15;
  },
  'V6 the headline says "best play" only when the ring shows': (d, v) => /best play\./.test(d.headline || '') && !isBestPlay(v, d),
  'V7 the "several players check" theory needs two or more opponents': (d) => /When several players check/.test(d.theory || '') && d.opponents < 2,
  'V8 "it gives up less" only when the play scores below the reference': (d, v, m, b) => /gives up less/.test(d.headline || '') && m.ev >= b.ev,
  'V9 the theory about checking only under a check': (d, v, m) => /checking to protect/.test(d.theory || '') && m.type !== 'check',
  'V10 one price per card (the range line and the estimate within 3 points)': (d) => {
    const a = (d.anchor || '').match(/need (\d+)% at this price/);
    const w = (d.reasons || []).join(' ').match(/(?:price needs|a call needs) (\d+)%/);
    return !!(a && w && Math.abs(+a[1] - +w[1]) > 3);
  },
  'V11 the estimate never says "Fold." / "Call." against a fine or not-graded play': (d, v, m) => v.grade === 'good' && ((m.type === 'call' && /Fold\.$/.test(d.anchor || '')) || (m.type === 'fold' && /Call\.( |$)/.test(d.anchor || ''))),
  'V12 draw wording never with a pair and no real draw': (d, v) => d.tier >= TIER.WEAK_PAIR && (/Your draw comes in/.test(d.anchor || '') || /draw/i.test(v.habit || '')) && !realDraw(d),
  'V13 soft words ("about the same", "a little higher") never over a gap above the bar': (d, v, m) => {
    for (const mm of (d.headline || '').matchAll(/([A-Z][a-z]+(?: to)? \$\d+)[^.;(]*? (rates about the same|rates a little higher|scores about the same)/g)) {
      const g = labelGap(v, m, mm[1]);
      if (g !== null && Math.abs(g) > v.small) return true;
    }
    return false;
  },
  'V14 a flag never names a reference that scores no better': (d, v, m, b) => v.grade !== 'good' && b.ev <= m.ev,
  'V15 no light-re-raise wording or junk tip for a value re-raise (TT+ AJo+ ATs+ KQo KJs+) of a loose opener': (d, v, m) => d.street === STREET.PRE && (/bluff|light re-raise/.test(d.headline || '') || d.tipKind === 'junk3bet') && m.type === 'raise' && VALUE_VS_LOOSE.has(classNames[classOf(d.hole[0], d.hole[1])]) && d.villain && (() => { const t = topRead(d, d.villain.nick); return t && t.p >= 0.5 && ['maniac', 'lag', 'whale', 'beginner'].includes(t.type); })(),
  // ---- the CEO's list ----
  'C1 "scores higher" only when that play is the judge\'s best and clear of the reference': (d, v) => {
    const h = d.headline || '';
    const clear = (i) => {
      if (!isTop(v, i) || i === v.best) return false;
      const g = pairedGap(v, i, v.best);
      return g.mean > 2 * g.se || g.mean > v.small;
    };
    if (/It scores higher against these/.test(h)) return !clear(v.mine);
    if (/A light re-raise scores higher/.test(h)) {
      const tr = v.options.reduce((b, o, i) => (o.type === 'raise' && (b < 0 || o.ev > v.options[b].ev) ? i : b), -1);
      return !(tr >= 0 && clear(tr));
    }
    return false;
  },
  'C2 "not a habit to build" only under a habit rule': (d, v) => /not a habit to build/.test(text(d)) && !habitNotes.has(v.note),
  'C3 "BEST PLAY" never next to "fine" (strip word, headline, report)': (d, v) => {
    if (!isBestPlay(v, d)) return false;
    if (verdictWord(v, d) !== 'best play' || /: fine\./.test(bestHeadline(v, d) || d.headline || '')) return true;
    return /Verdict: fine/.test(disputeText(disputeReport(d), true));
  },
  'C4 a stated dollar gap equals the bars as rounded': (d, v, m) => {
    const h = d.headline || '';
    const cost = h.match(/costs about \$(\d+)/);
    if (cost && v.grade !== 'good' && +cost[1] !== shownCost(v)) return true;
    for (const mm of h.matchAll(/\(([A-Z][a-z]+(?: to)? \$\d+) scores about \$(\d+) more/g)) {
      const g = labelGap(v, m, mm[1]);
      if (g !== null && g !== +mm[2]) return true;
    }
    return false;
  },
  'C5 a flag names the top option or a tagged reference': (d, v) => v.grade !== 'good' && !isTop(v, v.best) && !v.ref,
  'C6 notes never contradict the hand': (d, v) => {
    if (d.street === STREET.PRE) return false;
    if (['mwCheck', 'checkOOP'].includes(v.note) && !(d.tier >= TIER.WEAK_PAIR && d.tier <= TIER.OVERPAIR_TPTK)) return true;
    if (v.note === 'semiBluff' && !realDraw(d)) return true;
    if (['drawStation', 'drawOverbet'].includes(v.habit) && d.tier >= TIER.WEAK_PAIR) return true;
    return false;
  },
  'C7 no tip on a flagged play': (d, v) => v.grade !== 'good' && !!d.tip,
  // ---- STRAT's fix spec ----
  'S1 R5b only on a lead or bet, never a raise of your own bet': (d, v) => v.rule === 'R5b' && d.ctx && (d.ctx.iBetThisStreet || d.ctx.raises > 1),
  'S2 no draw habit note or draw line unless there is a flush or straight draw': (d, v) => (/draw/i.test(v.habit || '') || /Your draw comes in/.test(d.anchor || '')) && !realDraw(d),
  'S3 "Do not bluff" never with a real draw of 25% or more': (d) => /Do not bluff/.test(d.anchor || '') && realDraw(d) && handFeatures(d.hole, d.board).drawEquity >= 0.25,
  // ---- QA-VERDICT pass 2 ----
  'N1 no ≈ on an option that beats the reference by more than the bar': (d, v) => v.options.some((o, i) => i !== v.best && o.close && o.ev - v.options[v.best].ev > v.small),
  'N1b "light re-raise is close to the best" never over a re-raise above the bar': (d, v) => /light re-raise is close to the best/.test(d.headline || '') && (() => {
    const top = v.options.reduce((a, o) => (o.ev > a.ev ? o : a), v.options[0]);
    const other = Math.max(...v.options.filter((o) => o.type !== 'raise').map((o) => o.ev));
    return top.type === 'raise' && top.ev - other > v.small;
  })(),
  'N2 no range-based preflop tip with 3 or fewer players dealt in': (d) => ['limp', 'wideOpen', 'junk3bet', 'size3bet'].includes(d.tipKind) && d.snapshot && d.snapshot.seats.length <= 3,
  'N3 a missed-bluff flag names a reference bet of at least 25% of the pot': (d, v, m, b) => v.grade !== 'good' && m.type === 'check' && b.type === 'raise' && d.toCall === 0 && b.to / Math.max(1, v.pot) < 0.25,
  'N4 no "sound value size" pass with two pair or better': (d, v) => v.note === 'sizeOk' && d.tier >= TIER.TWO_PAIR,
  'N4b sizing never red with two pair or better multiway': (d, v, m, b) => d.tier >= TIER.TWO_PAIR && d.opponents >= 2 && m.type === 'raise' && b.type === 'raise' && v.grade === 'blunder',
  'N4c a 62-70% bet is "two-thirds", not "three-quarters"': (d, v, m) => /three-quarters of the pot is a sound/.test(d.headline || '') && m.type === 'raise' && m.to / Math.max(1, v.pot) < 0.705,
  'N5 no fold or bluff estimate with two pair or better': (d) => d.tier >= TIER.TWO_PAIR && /breaks even on folds|Do not bluff|needs everyone to fold|needs more folds than you get/.test(d.anchor || ''),
  'N5b no "needs everyone to fold almost never"': (d) => /fold almost never/.test(d.anchor || ''),
};

// Checks on the opponent model rather than the coach: counted and printed, not failing the run
// until the model work lands (POOL).
export const MODEL_CHECKS = {
  'N3b bets under 10% of the pot fold everyone at most 15%': (d, v) => d.street !== STREET.PRE && d.toCall === 0 && v.options.some((o) => o.type === 'raise' && o.F !== undefined && o.to / Math.max(1, v.pot) < 0.1 && o.F > 0.15),
};
export function checkModel(d) {
  const v = d.verdict;
  if (!v || v.mine < 0) return [];
  return Object.entries(MODEL_CHECKS).filter(([, f]) => { try { return f(d, v); } catch { return false; } }).map(([k]) => k);
}

export function checkRecord(d) {
  const v = d.verdict;
  if (!v || v.mine < 0) return [];
  const m = v.options[v.mine];
  const b = v.options[v.best];
  const out = [];
  for (const [k, f] of Object.entries(INVARIANTS)) {
    let hit = false;
    try {
      hit = f(d, v, m, b);
    } catch (e) {
      hit = true;
      d.checkError = String(e);
    }
    if (hit) out.push(k);
  }
  return out;
}

// The trainee's play in each style: a rough player of that kind, with some randomness.
function choose(style, L, s, rnd) {
  const hole = s.hole[0];
  const pre = s.street === STREET.PRE;
  const raiseTo = (frac) => {
    const to = pre ? Math.round(frac) : Math.round(s.currentBet + frac * (L.pot + (L.callAmt || 0)));
    return { type: 'raise', to: Math.max(L.minTo, Math.min(L.maxTo, to)) };
  };
  const passive = L.canCheck ? { type: 'check' } : { type: 'call' };
  if (pre) {
    const cls = classOf(hole[0], hole[1]);
    const rp = HERO_PROFILE.raisePct[cls];
    const pp = HERO_PROFILE.playPct[cls];
    const bb = s.bbAmt;
    const raisedPot = s.currentBet > bb;
    const lim = style === 'limper' ? 0.35 : style === 'passive' ? 0.5 : style === 'aggressive' ? 0.45 : 0.6;
    if (style === 'aggressive' && rp > 0.7 && L.canRaise) return raiseTo(raisedPot ? s.currentBet * 3 : bb * (4 + Math.floor(rnd() * 3)));
    if (rp > 0.9 && L.canRaise && style !== 'limper') return raiseTo(raisedPot ? s.currentBet * 3 : bb * 5);
    if (pp > lim) {
      if (L.canRaise && style === 'sensible' && rp > 0.8 && !raisedPot) return raiseTo(bb * 5);
      if (raisedPot && s.currentBet > 8 * bb && pp < 0.85 && style !== 'passive') return L.canFold ? { type: 'fold' } : passive;
      return passive;
    }
    return L.canCheck ? { type: 'check' } : { type: 'fold' };
  }
  const f = handFeatures(hole, s.board);
  const t = f.tier;
  const de = f.drawEquity;
  const facing = L.callAmt > 0;
  const price = facing ? L.callAmt / (L.pot + L.callAmt) : 0;
  const x = rnd();
  const sizes = [0.33, 0.5, 0.66, 0.75, 1, 1.5];
  const sz = () => sizes[Math.floor(rnd() * sizes.length)];
  if (style === 'passive') {
    if (!facing) return t >= TIER.TWO_PAIR && x < 0.5 && L.canRaise ? raiseTo(0.5) : { type: 'check' };
    if (t >= TIER.STRONG && x < 0.3 && L.canRaise) return raiseTo(1);
    if (t >= TIER.WEAK_PAIR || de >= 0.15 || x < 0.15) return { type: 'call' };
    return { type: 'fold' };
  }
  if (style === 'aggressive') {
    if (!facing) return L.canRaise && (t >= TIER.MIDDLE_PAIR || de >= 0.12 || x < 0.55) ? raiseTo(sz()) : { type: 'check' };
    if (L.canRaise && (t >= TIER.TOP_PAIR_GOOD || de >= 0.2 || x < 0.2)) return raiseTo(0.8 + rnd());
    if (t >= TIER.WEAK_PAIR || de >= 0.12 || x < 0.3) return { type: 'call' };
    return { type: 'fold' };
  }
  if (!facing) {
    if (!L.canRaise) return { type: 'check' };
    if (t >= TIER.TWO_PAIR) return x < 0.85 ? raiseTo(sz()) : { type: 'check' };
    if (t >= TIER.TOP_PAIR_GOOD) return x < 0.75 ? raiseTo(sizes[1 + Math.floor(rnd() * 3)]) : { type: 'check' };
    if (t >= TIER.MIDDLE_PAIR) return x < 0.4 ? raiseTo(0.5) : { type: 'check' };
    if (de >= 0.15) return x < 0.5 ? raiseTo(0.66) : { type: 'check' };
    return x < 0.2 ? raiseTo(0.5) : { type: 'check' };
  }
  if (t >= TIER.STRONG && L.canRaise && x < 0.6) return raiseTo(1);
  if (t >= TIER.TWO_PAIR && L.canRaise && x < 0.35) return raiseTo(1);
  if (t >= TIER.TOP_PAIR_WEAK) return x < 0.1 && price > 0.3 ? { type: 'fold' } : { type: 'call' };
  if (t >= TIER.WEAK_PAIR) return price < 0.3 || x < 0.4 ? { type: 'call' } : { type: 'fold' };
  if (de >= 0.15) return de > price || x < 0.3 ? { type: 'call' } : { type: 'fold' };
  return x < 0.06 ? { type: 'call' } : { type: 'fold' };
}

// One configuration: { style, game | home, seats, hands, seed, samples }. Returns the decisions and
// the violations, each { invariant, record }.
export function runConfig(cfg) {
  let r = cfg.seed || 1;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const samples = cfg.samples || 600;
  const sess = new Session(
    cfg.home
      ? { custom: { sb: 1, bb: 2, minBuy: 100, maxBuy: 200 }, heroBuy: 200, lineup: cfg.lineup || ['station', 'station', 'whale', 'abc', 'abc', 'maniac', 'beginner'], samples, seed: cfg.seed }
      : { game: cfg.game || '1/2', table: cfg.table || 'typical', samples, seed: cfg.seed, seats: cfg.seats || 9 },
  );
  const violations = [];
  const modelHits = [];
  let decisions = 0;
  for (let h = 0; h < (cfg.hands || 60); h++) {
    sess.freshStack();
    sess.startHand();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const rec = sess.heroAct(choose(cfg.style || 'sensible', sess.heroOptions(), sess.hand.state, rnd));
      decisions++;
      for (const k of checkRecord(rec)) violations.push({ invariant: k, record: rec });
      for (const k of checkModel(rec)) modelHits.push(k);
    }
  }
  return { decisions, violations, modelHits };
}

export const CONFIGS = (hands, seed = 11) => {
  const out = [];
  let k = 0;
  for (const style of ['sensible', 'passive', 'aggressive', 'limper']) {
    for (const game of ['1/2', '2/3', '2/5']) out.push({ style, game, seats: 9, hands, seed: seed + k++ });
    out.push({ style, game: '1/2', seats: 2, hands, seed: seed + k++ });
    out.push({ style, home: true, hands, seed: seed + k++ });
  }
  // short-handed and tough tables, where QA-VERDICT's second pass found new classes
  out.push({ style: 'aggressive', game: '1/2', table: 'tough', seats: 9, hands, seed: seed + k++ });
  out.push({ style: 'sensible', game: '2/5', table: 'tough', seats: 9, hands, seed: seed + k++ });
  out.push({ style: 'limper', game: '2/3', seats: 6, hands, seed: seed + k++ });
  out.push({ style: 'passive', game: '1/2', seats: 3, hands, seed: seed + k++ });
  out.push({ style: 'sensible', game: '2/5', table: 'loose', seats: 9, hands, seed: seed + k++ });
  return out;
};

const plain = (d) => ({
  hand: d.hand, id: d.id, street: d.streetName, position: d.position, hole: d.hole.map(cardStr).join(' '), board: d.board.map(cardStr).join(' '),
  handText: d.handText, headline: d.headline, anchor: d.anchor, reasons: d.reasons, theory: d.theory, tip: d.tip,
  verdict: { grade: d.verdict.grade, note: d.verdict.note, habit: d.verdict.habit, ref: d.verdict.ref, mine: d.verdict.mine, best: d.verdict.best, small: d.verdict.small,
    options: d.verdict.options.map((o) => ({ label: o.label, ev: +o.ev.toFixed(1), close: o.close })) },
  snapshot: d.snapshot,
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, dflt) => {
    const i = process.argv.indexOf(k);
    return i >= 0 ? process.argv[i + 1] : dflt;
  };
  const hands = +arg('--hands', 60);
  const dir = arg('--out', 'verdictcheck-out');
  const counts = Object.fromEntries(Object.keys(INVARIANTS).map((k) => [k, 0]));
  let total = 0;
  const model = {};
  const saved = new Set();
  for (const cfg of CONFIGS(hands)) {
    const t0 = Date.now();
    const { decisions, violations, modelHits } = runConfig(cfg);
    total += decisions;
    for (const k of modelHits) model[k] = (model[k] || 0) + 1;
    for (const { invariant, record } of violations) {
      counts[invariant]++;
      if (!saved.has(invariant)) {
        saved.add(invariant);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${invariant.split(' ')[0]}.json`), JSON.stringify({ invariant, cfg, record: plain(record) }, null, 1));
      }
    }
    console.log(`${(cfg.style + ' ' + (cfg.home ? 'home' : `${cfg.game} ${cfg.seats}-handed${cfg.table ? ' ' + cfg.table : ''}`)).padEnd(34)} ${String(decisions).padStart(5)} decisions, ${violations.length} violations (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const bad = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n${total} decisions checked, ${bad} violations`);
  for (const [k, n] of Object.entries(counts)) if (n) console.log(`${String(n).padStart(5)}  ${k}`);
  for (const [k, n] of Object.entries(model)) console.log(`model check (not failing): ${n}  ${k}`);
  if (bad) {
    console.log(`\nThe first hand for each is saved in ${dir}/.`);
    process.exit(1);
  }
}
