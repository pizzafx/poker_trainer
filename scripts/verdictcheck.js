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
import { handFeatures, TIER, isRealDraw } from '../src/engine/features.js';
import { HERO_PROFILE } from '../src/bots/profiles.js';
import { verdictWord, isBestPlay, bestHeadline } from '../src/trainer/best.js';
import { shownCost, dryBoard, blockerHand, t1Board } from '../src/trainer/explain.js';
import { pairedGap, redBar } from '../src/trainer/judge.js';
import { PREMIUM_RERAISE, ISO_RERAISE, giveUpOption, anchorStatus, drawTest, ISO_LIMP, ISO_LIMP_FEW, ISO_LIMP_PAIRS, isoFoldHand, ISO_FOLD_VETO, outsideBehindLimpers, raiseClears, suitedLimpHand } from '../src/trainer/grade.js';
// the bet an estimate line is about: "A bet of $X:" names it; otherwise hero's bet or raise, else the reference (QA-VERDICT)
function namedBet(d, v) {
  const m = (d.anchor || '').match(/^A bet of \$(\d+):/);
  if (m) return v.options.find((o) => o.type === 'raise' && o.to - (d.currentBet || 0) === +m[1]) || null;
  const mine = v.options[v.mine];
  return mine && mine.type === 'raise' ? mine : v.options[v.best] && v.options[v.best].type === 'raise' ? v.options[v.best] : null;
}
import { disputeReport, disputeText } from '../src/trainer/dispute.js';
import { gradeDecision } from '../src/trainer/grade.js';
import { HandBelief } from '../src/trainer/belief.js';
import { presetRanges, groupOf } from '../src/trainer/ranges.js';
import { STRONG_LIMP, callQ } from '../src/trainer/grade.js';
const callQOf = (d, v) => (d.street === STREET.PRE ? v.anchors.Q : callQ(v, handFeatures(d.hole, d.board)));

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
  'V14 a flag never names a reference that scores no better': (d, v, m, b) => v.grade !== 'good' && v.rule !== 'strongLimp' && b.ev <= m.ev,
  'V15 no light-re-raise wording or junk tip for a value re-raise (TT+ AJo+ ATs+ KQo KJs+) of a loose opener': (d, v, m) => d.street === STREET.PRE && v.note !== 'iso3bet' && (/bluff|light re-raise/.test(d.headline || '') || d.tipKind === 'junk3bet') && m.type === 'raise' && VALUE_VS_LOOSE.has(classNames[classOf(d.hole[0], d.hole[1])]) && d.villain && (() => { const t = topRead(d, d.villain.nick); return t && t.p >= 0.5 && ['maniac', 'lag', 'whale', 'beginner'].includes(t.type); })(),
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
  'C2 "not a habit to build" only under a habit rule': (d, v) => /not a habit to build/.test(text(d)) && !habitNotes.has(v.note) && !v.habitOut,
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
  // a dominated flag's headline names no option ("scores at least $X below the best play ... under every read"): exempt (QA-VERDICT P4-3)
  // ...the owner's strong-limp flag stands whatever the gap (L-S1): exempt
  'C5 a flag names the top option or a tagged reference': (d, v) => v.grade !== 'good' && !v.dominated && v.rule !== 'strongLimp' && !isTop(v, v.best) && !v.ref,
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
  // a real draw below top pair is never called a bluff, at any size (STRAT D2); 25%+ draws with a pair as well (S3)
  'S3 "Do not bluff" never with a real draw of 25% or more': (d) => /Do not bluff/.test(d.anchor || '') && realDraw(d) && handFeatures(d.hole, d.board).drawEquity >= 0.25,
  'S3b "Do not bluff" never over a real draw below top pair (STRAT D2)': (d) => /Do not bluff/.test(d.anchor || '') && d.street !== STREET.PRE && d.tier <= TIER.MIDDLE_PAIR && isRealDraw(handFeatures(d.hole, d.board)),
  // ---- QA-VERDICT pass 2 ----
  'N1 no ≈ on an option that beats the reference by more than the bar': (d, v) => v.options.some((o, i) => i !== v.best && o.close && o.ev - v.options[v.best].ev > v.small),
  'N1b "light re-raise is close to the best" never over a re-raise above the bar': (d, v) => /light re-raise is close to the best/.test(d.headline || '') && (() => {
    const top = v.options.reduce((a, o) => (o.ev > a.ev ? o : a), v.options[0]);
    const other = Math.max(...v.options.filter((o) => o.type !== 'raise').map((o) => o.ev));
    return top.type === 'raise' && top.ev - other > v.small;
  })(),
  'N2 no range-based preflop tip with 3 or fewer players dealt in': (d) => ['limp', 'wideOpen', 'junk3bet', 'size3bet', 'isoLimp', 'wideLimp', 'isoFold', 'isoFoldPair'].includes(d.tipKind) && d.snapshot && d.snapshot.seats.length <= 3,
  'N3 a missed-bluff flag names a reference bet of at least 25% of the pot': (d, v, m, b) => v.grade !== 'good' && d.category === 'missedBluff' && m.type === 'check' && b.type === 'raise' && d.toCall === 0 && b.to / Math.max(1, v.pot) < 0.25,
  'N4 no "sound value size" pass with two pair or better': (d, v) => v.note === 'sizeOk' && d.tier >= TIER.TWO_PAIR,
  'N4b sizing never red with two pair or better multiway': (d, v, m, b) => d.tier >= TIER.TWO_PAIR && d.opponents >= 2 && m.type === 'raise' && b.type === 'raise' && v.grade === 'blunder',
  'N4c a 62-70% bet is "two-thirds", not "three-quarters"': (d, v, m) => /three-quarters of the pot is a sound/.test(d.headline || '') && m.type === 'raise' && m.to / Math.max(1, v.pot) < 0.705,
  'N5 no fold or bluff estimate with two pair or better': (d) => d.tier >= TIER.TWO_PAIR && /breaks even on folds|Do not bluff|needs everyone to fold|needs more folds than you get/.test(d.anchor || ''),
  'N5b no "needs everyone to fold almost never"': (d) => /fold almost never/.test(d.anchor || ''),
  // ---- pass 3 (QA-VERDICT on 340d91a; STRAT's rulings) ----
  'N4h no "sound value size" with two pair or better when a bigger bet beats it by the bar': (d, v, m) => {
    if (d.street === STREET.PRE || d.toCall !== 0 || m.type !== 'raise' || d.tier < TIER.TWO_PAIR || v.note !== 'sizeOk') return false;
    return v.options.some((o, i) => o.type === 'raise' && o.to > m.to && (() => { const g = pairedGap(v, i, v.mine); return g.mean >= v.small && g.mean > 2.2 * g.se; })());
  },
  'P4-2 "Your draw comes in" only below top pair, at the draw\'s own equity': (d) => {
    const m = (d.anchor || '').match(/[Yy]our draw (?:still )?comes in (?:about (\d+)% of the time|almost never|almost always)/);
    if (!m) return false;
    if (d.tier >= TIER.TOP_PAIR_WEAK) return true;
    const e = handFeatures(d.hole, d.board).ownDrawEquity;
    return m[1] !== undefined && e >= 0.05 && e <= 0.95 && +m[1] !== Math.round(e * 20) * 5;
  },
  'P4-2b a real draw has 14% or more from its own outs': (d) => d.street !== STREET.PRE && d.realDraw && handFeatures(d.hole, d.board).ownDrawEquity < 0.14,
  'P4-1 every postflop flag went through the scenario test': (d, v) => d.street !== STREET.PRE && v.grade !== 'good' && v.rule !== 'moneyIn' && !(v.scenarios >= 1),
  'P3-1a a flag never shows a cost under the yellow bar': (d, v) => v.grade !== 'good' && v.rule !== 'strongLimp' && v.rule !== 'moneyIn' && v.mine >= 0 && shownCost(v) < R(v.small),
  // ---- the owner's strong-limp rule, the owner's "not graded" report, pass 5 ----
  'L-S1 limping a strong hand (4+ dealt, not a free check, nobody raised) is a yellow strongLimp flag': (d, v, m) =>
    d.street === STREET.PRE && m.type === 'call' && d.raises === 0 && d.toCall > 0 && d.snapshot && d.snapshot.seats.length > 3 && v.options.some((o) => o.type === 'raise') &&
    STRONG_LIMP.has(classNames[classOf(d.hole[0], d.hole[1])]) && !(v.grade === 'mistake' && v.rule === 'strongLimp'),
  'U1 "not graded" with a base gap at or above the bar names the reference and says "better by"': (d, v, m, b) => {
    if (v.note !== 'unclear' || b === m) return false;
    const gap = R(b.ev) - R(m.ev);
    return gap >= v.small * (b.type === m.type ? 1.6 : 1) && !/better by about \$\d+/.test(d.headline || '');
  },
  'J1 no "seldom fold" in a junk 3-bet tip against an opener read as a regular': (d) => d.tipKind === 'junk3bet' && /seldom fold/.test(d.tip || '') && !!d.villain && (() => { const r = topRead(d, d.villain.nick); return !!r && r.p >= 0.5 && ['tag', 'lag', 'gto'].includes(r.type); })(),
  'J1b a junk 3-bet tip against an opener read as a regular says neither "solid" nor "bluff"': (d) => d.tipKind === 'junk3bet' && /solid|bluff/.test(d.tip || '') && !!d.villain && (() => { const r = topRead(d, d.villain.nick); return !!r && r.p >= 0.5 && ['tag', 'lag', 'gto'].includes(r.type); })(),
  // ---- pass 7 (QA-VERDICT; STRAT's rulings) ----
  'P7-4 flatting one raise with a top hand (raisePct >= 0.94) or a paying flat is never red': (d, v, m, b) =>
    d.street === STREET.PRE && m.type === 'call' && d.raises === 1 && b.type === 'raise' && v.grade === 'blunder' &&
    (HERO_PROFILE.raisePct[classOf(d.hole[0], d.hole[1])] >= 0.94 || m.ev >= 0),
  // ---- "Why theory disagrees" says only what is true (STRAT_THEORY_COPY section 3) ----
  'T1 "block" only with top two or top set, heads-up, on a dry board; "most" only with top set': (d) => {
    if (!/block/.test(d.theory || '')) return false;
    const bl = blockerHand(d.hole, d.board);
    return !bl || d.tier < TIER.TWO_PAIR || d.opponents !== 1 || !dryBoard(d.board, d.street === STREET.RIVER) || (/block most/.test(d.theory) && bl !== 'set');
  },
  'T1b "free card" never on the river': (d) => d.street === STREET.RIVER && /free card/.test(d.theory || ''),
  'T2 "control the pot" only with one pair (top pair good kicker to an overpair)': (d) => /control the pot/.test(d.theory || '') && d.tier > TIER.OVERPAIR_TPTK,
  'T3 "they call with ... draws / weaker pairs" only when the picture holds 10% of them': (d) => {
    const m = /they call with ([^.]*)\./.exec(d.theory || '');
    if (!m) return false;
    const b = (d.villain && d.villain.picture && d.villain.picture.buckets) || {};
    return (/draws/.test(m[1]) && !(b.draw >= 0.1)) || (/weaker pairs/.test(m[1]) && !(b.weakPair >= 0.1));
  },
  'T4 "3-bet and 4-bet" or "keeps your range balanced" only facing a raise or completing the small blind': (d) =>
    /3-bet and 4-bet|keeps your range balanced/.test(d.theory || '') && !(d.raises >= 1 || (d.raises === 0 && ['SB', 'BTN/SB'].includes(d.position))),
  'T5 "full table", "raked" and "out of position" only when true (preflop)': (d) => {
    if (d.street !== STREET.PRE || !d.table) return false;
    const t = text(d);
    const claim = /\. ([^.]*), this hand does not earn its way in/.exec(d.theory || ''); // the table's own clauses
    return (/full table/.test(t) && !(d.table.n >= 7)) || (!!claim && /raked/i.test(claim[1]) && !d.table.raked) || (!!claim && /multiway/.test(claim[1]) && !(d.table.voluntary >= 2)) || (/raked pot/.test(t) && !d.table.raked) || (/out of position/.test(t) && !d.table.oop);
  },
  'T5b heads-up, out of position after the flop exactly when you are the big blind': (d) => d.street === STREET.PRE && !!d.table && d.table.n === 2 && d.table.oop !== (d.position === 'BB'),
  'T6 "whole range on many boards" only on the flop': (d) => /whole range on many boards/.test(d.theory || '') && d.street !== STREET.FLOP,
  // ---- the yellow band (owner's Option 1; STRAT_YELLOW_BAND section 7) and the red bar x1.5 (section 12) ----
  'R1 red only at or above the red bar, max(12bb, 30% pot), x1.6 for the same kind': (d, v, m, b) =>
    v.grade === 'blunder' && v.loss < redBar(v.bb, v.pot) * (b.type === m.type ? 1.6 : 1) - 1e-6,
  'YB-A "calling also works" only for AA, KK, QQ, AKs and AKo': (d, v) => v.note === 'callAlso' && !PREMIUM_RERAISE.has(classNames[classOf(d.hole[0], d.hole[1])]),
  'YB-B a TT-type re-raise of one raise when calling scores more is never red': (d, v, m) =>
    d.street === STREET.PRE && m.type === 'raise' && d.raises === 1 && ISO_RERAISE.has(classNames[classOf(d.hole[0], d.hole[1])]) &&
    v.options[v.options.reduce((a, o, i) => (o.ev > v.options[a].ev ? i : a), 0)].type === 'call' && v.grade === 'blunder',
  'YB-B2 a "fine" TT-type re-raise when calling scores more uses PRO\'s words': (d, v) => v.note === 'iso3bet' && !/Re-raising to isolate is also standard/.test(d.headline || ''),
  'YB-C a play that loses money by itself (against fold/check: >= 5bb, >= half the money in, > 3 SE) is never a plain or anchor-vetoed "fine"': (d, v, m) => {
    if (v.grade !== 'good' || ![undefined, null, 'anchor', 'anchorFails', 'anchorEven'].includes(v.note) || !(v.putIn > 0)) return false;
    const give = giveUpOption(v);
    if (give < 0 || give === v.mine) return false;
    const g = pairedGap(v, give, v.mine);
    let loss = g.mean;
    if (m.type === 'call') {
      loss = Math.min(loss, v.putIn); // a call loses at most its price by itself (STRAT section 17, C2)
      if (d.street !== STREET.PRE && v.anchors) {
        const hf = handFeatures(d.hole, d.board);
        const st = m.st ?? anchorStatus(m, v, hf, d.opponents);
        const draw = (hf.ownDrawEquity ?? hf.drawEquity ?? 0) > 0 && hf.tier <= TIER.MIDDLE_PAIR && d.realDraw;
        if (st === 'works' || (st === 'even' && draw)) return false; // C1b'' (section 18)
      }
    } else if (!(m.ev < 0)) return false; // bets and raises lose money on their own mean (section 18)
    return loss >= 5 * v.bb && loss >= 0.5 * v.putIn && loss > 3 * g.se;
  },
  'YB-C5 a money-in call loses at most its price': (d, v, m) => v.rule === 'moneyIn' && m.type === 'call' && v.loss > v.putIn + 1e-6,
  'YB-C6 a money-in flag with you ahead of the price says the later bets take it back': (d, v) => v.rule === 'moneyIn' && (() => {
    const r = /ahead of (\d+)% of that right now and the price needs (\d+)%/.exec(text(d));
    return !!r && +r[1] >= +r[2] && !/bets still to come cost more/.test(text(d));
  })(),
  'YB-C1b2 no money-in flag on a call rated works, or on a real draw rated even; the flagged call reads as failing': (d, v, m) =>
    v.rule === 'moneyIn' && m.type === 'call' && d.street !== STREET.PRE && !!v.anchors && (m.st !== 'fails' || /^Close\./.test(d.anchor || '')),
  'YB-C8 a money-in bet or raise loses money on its own mean': (d, v, m) => v.rule === 'moneyIn' && m.type !== 'call' && !(m.ev < 0),
  'YB-C3 with two or more opponents the range line never sets one player\'s equity next to the price': (d) => d.opponents >= 2 && (d.reasons || []).some((r) => /^When .*(the price needs|a call needs)/.test(r)),
  // ---- STRAT YB-6: the anchor veto's words match the estimate line ----
  'YB-V1 "this is close" only under an estimate line that is close or about even': (d, v) => /estimate below this is close/.test(d.headline || '') && !(v.anchorWhy === 'even' && d.anchor),
  'YB-V2 "close" in an anchor veto only for an even veto': (d, v) => v.note === 'anchor' && /is close/.test(d.headline || '') && v.anchorWhy !== 'even',
  'YB-V3 "estimate below" always has an estimate line under it': (d) => /estimate below/.test(d.headline || '') && !d.anchor,
  'YB-V4 a "works" veto sits under a works line, a "does not work" veto under a failing one': (d, v) => v.note === 'anchor' && !!d.anchor && (
    (v.anchorWhy === 'works' && /does not work|Do not bluff|mostly call with better|Not at this price|needs more folds than you get\.$/.test(d.anchor) && !/bet for value|A bigger/.test(d.anchor)) ||
    (v.anchorWhy === 'fails' && /bet for value/.test(d.anchor))),
  'F1b "bluffs this often" only against a range shown with 25% or more nothing plus draws (STRAT, POOL batch 12)': (d) => /bluffs this often/.test(d.anchor || '') && !!(d.villain && d.villain.picture && d.villain.picture.buckets) && Math.round(100 * (d.villain.picture.buckets.air + d.villain.picture.buckets.draw)) < 25,
  // STRAT (YB-V4b): "the coach's estimate below" only when the line below describes the option it refers to;
  // an A2 headline naming a raise never cites a line about calling or holding
  'YB-V4c an A2 headline cites the estimate below only when that line is about the option it names': (d) => /estimate below it does not work/.test(d.headline || '') && d.verdict && d.verdict.anchorWhy === 'A2' && /^You are ahead about/.test(d.anchor || ''),
  // ---- STRAT YB-T1, YB-T2 (QA-VERDICT runs32) ----
  'YB-T1 no check dollar figure under a two-pair+ bet or raise when every opponent still in is read as passive': (d, v) => {
    const mine = v.options[v.mine];
    if (!mine || mine.type !== 'raise' || !(d.tier >= TIER.TWO_PAIR) || !Array.isArray(d.liveTypes) || !d.liveTypes.length) return false;
    if (!d.liveTypes.every((t) => ['abc', 'station', 'nit', 'beginner', 'whale'].includes(t))) return false;
    // STRAT (YB-T1 vs U1): a gap above the bar is always stated, and a devaluing board takes the hand out of T1
    const top = v.options.reduce((a, o) => (o.ev > a.ev ? o : a), v.options[0]);
    if (Math.max(0, Math.round(top.ev) - Math.round(mine.ev)) > (v.small || 0) || !t1Board(d.hole, d.board)) return false;
    return /Check scores about \$\d+ more|a check is better by/i.test(d.headline || '');
  },
  'YB-T1c the "strong hand for value" copy only with the check within the bar, on a board that does not devalue the hand': (d, v) => {
    if (!/Betting a strong hand for value is the standard play/.test(d.headline || '')) return false;
    const mine = v.options[v.mine];
    const top = v.options.reduce((a, o) => (o.ev > a.ev ? o : a), v.options[0]);
    return Math.max(0, Math.round(top.ev) - Math.round(mine.ev)) > (v.small || 0) || !t1Board(d.hole, d.board);
  },
  'YB-T2 an anchor-veto "X scores about $Y more" names the top option, with Y = top - mine': (d, v) => {
    if (v.note !== 'anchor') return false;
    const m = (d.headline || '').match(/\(([^()]+?) scores about \$(\d+) more/);
    if (!m) return false;
    const top = v.options.reduce((a, o) => (o.ev > a.ev ? o : a), v.options[0]);
    const y = Math.max(0, Math.round(top.ev) - Math.round(v.options[v.mine].ev));
    const name = m[1].trim();
    const bareTop = top.label.replace(/\s*\([^)]*\)\s*$/, '');
    const generic = /^A (bigger|smaller) (bet|raise), /.test(name) && top.type === 'raise';
    return +m[2] !== y || !(name === bareTop || generic);
  },
  'YB-T2b no "on the bars" in a headline': (d) => /on the bars/.test(d.headline || ''),
  // LD1 option F (debug): a verdict that ran the scenario test carries one labelled gap per scenario, base first,
  // and every verdict says how many samples it wanted
  'F1 the scenario test leaves its labelled gaps, base first; samplesWanted is set': (d, v) =>
    !(v.samplesWanted > 0) || (v.scenarios > 0 && !(Array.isArray(v.scenGaps) && v.scenGaps.length === v.scenarios && v.scenGaps[0].label === 'base' && v.scenGaps.every((g) => g.label && Number.isFinite(g.gap)))),
  // STRAT (the open tip): "only from later seats" only when a later seat's Standard range has the hand
  'OT1 an open tip says "only from later seats" only when a later seat opens the hand': (d) => {
    if (d.tipKind !== 'wideOpen' || !/only from later seats/.test(d.tip || '')) return false;
    const name = classNames[classOf(d.hole[0], d.hole[1])];
    const group = groupOf(d.position);
    const later = { early: ['middle', 'cutoff', 'button'], middle: ['cutoff', 'button'], cutoff: ['button'] }[group] || [];
    const std = presetRanges('standard');
    return !later.some((g) => std[g] && std[g].includes(name));
  },
  // STRAT (YB-1 / section 17 C2, QA YB-C3; D2 on the habit path, QA YB-D2c)
  'YB-C3b no "up to its price" in any headline': (d) => /up to its price/.test(d.headline || ''),
  'YB-C3c a money-in call flag reads "costs about $X", X = min(loss, money put in) within $1': (d, v) => {
    if (v.rule !== 'moneyIn' || v.grade === 'good' || !v.moneyIn || v.options[v.mine].type !== 'call') return false;
    const m = (d.headline || '').match(/costs about \$(\d+)/);
    return !m || Math.abs(+m[1] - Math.min(v.moneyIn.loss, v.moneyIn.put)) > 1;
  },
  'YB-D2c a draw bet over 1.05x pot never quotes "your draw comes in" on the habit line': (d, v) => {
    const mine = v.options[v.mine];
    if (!mine || mine.type !== 'raise' || mine.alpha === undefined || !(mine.alpha / (1 - mine.alpha) > 1.05)) return false;
    if (v.habit !== 'drawOverbet' && v.habitOut !== 'drawOverbet') return false;
    if (d.street === STREET.RIVER || !(handFeatures(d.hole, d.board).ownDrawEquity >= 0.14)) return false;
    return /your draw comes in/.test(d.anchor || '') || !/With a draw, (bet smaller or check|calling is cheaper)/.test(d.anchor || '');
  },
  'YB-V4b "does not work" in the headline never sits over a break-even line': (d) => /estimate below it does not work/.test(d.headline || '') && /about breaks even|That is thin|: close\.$/.test(d.anchor || ''),
  // ---- STRAT 19 / MATH 19a (QA-C8a) ----
  'C8b the "Together" verdict matches the combined test on the bet the line names (MATH 19b)': (d, v) => {
    const m = (d.anchor || '').match(/Together that is (enough|about even|not enough)\./);
    if (!m) return false;
    const o = namedBet(d, v);
    const t = o && drawTest(o, { ownDrawEquity: handFeatures(d.hole, d.board).ownDrawEquity }, d.opponents || 1);
    return !t || t.e === 0 || { enough: 'works', 'about even': 'even', 'not enough': 'fails' }[m[1]] !== t.st;
  },
  'P4-3 before the river, a bet or raise line for a draw with 25% or more own outs (up to 1.05x pot) says "your draw" (QA-VERDICT C8a-W1)': (d, v) => {
    if (d.street === STREET.RIVER || !d.anchor || /needs more folds than you get/.test(d.anchor)) return false;
    if (!/\b(bet|raise|Betting|Raising)\b/.test(d.anchor) || /^When /.test(d.anchor)) return false;
    const hf = handFeatures(d.hole, d.board);
    if (!(hf.ownDrawEquity >= 0.25) || hf.tier > TIER.MIDDLE_PAIR) return false;
    const o = namedBet(d, v);
    if (!o || o.alpha === undefined || o.alpha / (1 - o.alpha) > 1.05) return false;
    return !/your draw/.test(d.anchor);
  },
  'D1 the draw test charges an all-in no raise share (QA-VERDICT)': (d, v) => v.options.some((o) => /^All-in/.test(o.label) && o.F !== undefined && drawTest(o, { ownDrawEquity: 0.3 }, 2) && drawTest(o, { ownDrawEquity: 0.3 }, 2).R !== 0),
  'D2b "too big to lean on your draw" only over a real draw, and never where the folds cover the need (STRAT D2)': (d, v) => /too big to lean on your draw/.test(d.anchor || '') && (!isRealDraw(handFeatures(d.hole, d.board)) || (() => { const o = namedBet(d, v); return !!o && o.F >= o.alpha; })()),
  // ---- STRAT L2, L3: the behind-limpers tips ----
  'L2 isoLimp only for the L2 hands, with the best raise ahead of the limp by more than 2.2 SE': (d, v) => {
    if (d.tipKind !== 'isoLimp') return false;
    const name = classNames[classOf(d.hole[0], d.hole[1])];
    let br = -1;
    v.options.forEach((o, i) => { if (o.type === 'raise' && (br < 0 || o.ev > v.options[br].ev)) br = i; });
    const g = br >= 0 ? pairedGap(v, br, v.mine) : { mean: 0, se: 1 };
    return !ISO_LIMP.has(name) || !(g.mean > 2.2 * g.se);
  },
  'L2b no isoLimp for 77 or 88 behind 3 or more limpers (PRO, 19 Nov)': (d) => d.tipKind === 'isoLimp' && !!(d.ctx && d.ctx.limpers >= 3) && ISO_LIMP_PAIRS.has(classNames[classOf(d.hole[0], d.hole[1])]),
  'L3a no wideLimp when the best raise beats fold and the limp by 2.2 SE and $1 (STRAT)': (d, v) => d.tipKind === 'wideLimp' && raiseClears(v, v.options.findIndex((o) => o.type === 'fold')),
  'L3b no wideLimp for suited aces, 54s+ connectors or 64s+ one-gappers from middle position, the cutoff or the button (STRAT)': (d) => d.tipKind === 'wideLimp' && groupOf(d.position) !== 'early' && suitedLimpHand(classNames[classOf(d.hole[0], d.hole[1])]),
  'L3c the behind-limpers fold tip never says "most players fold it here" (STRAT)': (d) => d.tipKind === 'wideLimp' && /most players fold it here/.test(d.tip || d.tipText || ''),
  'L3 wideLimp only for a hand outside the behind-limpers Standard range': (d) => d.tipKind === 'wideLimp' && !outsideBehindLimpers(classNames[classOf(d.hole[0], d.hole[1])], groupOf(d.position)),
  // ---- STRAT L4: folding a raising hand behind limpers (a tip, never a flag) ----
  'L4 isoFold only for an ISO_FOLD hand, on a fold, and never when the judge clearly prefers the fold to the best raise': (d, v, m) => {
    if (d.tipKind !== 'isoFold') return false;
    if (!m || m.type !== 'fold') return true;
    if (!isoFoldHand(classNames[classOf(d.hole[0], d.hole[1])], groupOf(d.position), d.ctx ? d.ctx.limpers : 0)) return true;
    let br = -1;
    v.options.forEach((o, i) => { if (o.type === 'raise' && (br < 0 || o.ev > v.options[br].ev)) br = i; });
    if (br < 0) return true;
    const g = pairedGap(v, v.mine, br);
    return g.mean > ISO_FOLD_VETO * g.se;
  },
  'L4d the raise-or-limp pair copy only for 77 and 88 behind 3 or more limpers, on a fold (PRO)': (d, v, m) => d.tipKind === 'isoFoldPair' && (!(d.ctx && d.ctx.limpers >= 3) || !ISO_LIMP_PAIRS.has(classNames[classOf(d.hole[0], d.hole[1])]) || !m || m.type !== 'fold'),
  'L4e no single-raise isoFold copy for 77 or 88 behind 3 or more limpers (PRO)': (d) => d.tipKind === 'isoFold' && !!(d.ctx && d.ctx.limpers >= 3) && ISO_LIMP_PAIRS.has(classNames[classOf(d.hole[0], d.hole[1])]),
  'L4b isoFold says "raising was about $" only when raising clears the fold by 2.2 SE and $1 (STRAT)': (d, v) => d.tipKind === 'isoFold' && /raising was about \$/.test(d.tip || '') && !raiseClears(v, v.mine),
  'L4c isoFold never on a flagged decision (the grade is unchanged)': (d, v) => d.tipKind === 'isoFold' && v.grade !== 'good',
  'L23 a behind-limpers tip only with one or more limpers and no raise': (d) => ['isoLimp', 'wideLimp', 'isoFold', 'isoFoldPair'].includes(d.tipKind) && !(d.ctx && d.ctx.limpers >= 1 && d.ctx.raises === 0),
  'C8c no money-in flag over a works status or a works line': (d, v) => v.rule === 'moneyIn' && (v.options[v.mine].st === 'works' || (v.options[v.mine].type === 'raise' && v.options[v.mine].st === 'even' && d.tier <= TIER.MIDDLE_PAIR && /your draw comes in/.test(d.anchor || '')) || /Together that is enough|bet for value|A bigger (bet|raise) needs more folds|Call\.$/.test(d.anchor || '')),
  'YB-C7 no "up to its price" headline on a money-in flag': (d, v) => v.rule === 'moneyIn' && /up to its price/.test(d.headline || ''),
  'YB-B4 a TT-type re-raise when calling scores more gets no junk or size re-raise tip': (d, v) => v.iso3bet && ['junk3bet', 'size3bet'].includes(d.tipKind),
  'YB-C2 the money-in flag is yellow, names fold or check ("giving up the pot") and says the play loses money by itself': (d, v) =>
    v.rule === 'moneyIn' && (v.grade !== 'mistake' || v.best !== giveUpOption(v) || !/giving up the pot/.test(d.headline || '') || !(d.reasons || []).some((r) => /loses money by itself/.test(r))),
  'P7-1 no "bets still to come" on the river': (d) => d.street === STREET.RIVER && /bets still to come/.test(d.anchor || ''),
  'P7-1b line 8a ("bets still to come") only when the judge prefers the fold': (d, v) => /bets still to come/.test(d.anchor || '') && !(v.a4 && v.a4.raw === 'fold'),
  'P7-2 no "Close." line when you are almost never ahead': (d, v) => /^Close\./.test(d.anchor || '') && v.anchors && v.anchors.Q !== undefined && callQOf(d, v) < 0.05,
  'P7-2b never "both reasonable" when you are almost never ahead': (d, v) => v.anchors && v.anchors.Q !== undefined && callQOf(d, v) < 0.05 && /both reasonable/.test(d.anchor || ''),
  'P5-1 no "out of position" or "multiway pot" wording with an all-in in play preflop': (d, v) => d.street === STREET.PRE && v.preShove && /out of position|multiway pot/.test(text(d)),
  'P5-1b the all-in line: "you have" at least "need" exactly when the call scores at least zero': (d, v) => {
    const why = (d.reasons || []).join(' ');
    const need = why.match(/You need (?:about )?(\d+)%/);
    const have = why.match(/you have (?:about )?(\d+)%/);
    const call = v.options.find((o) => o.type === 'call');
    if (!need || !have || !call) return false;
    const E = v.preAllIn && v.preAllIn.E;
    const price = v.preAllIn && v.preAllIn.price;
    if (E === undefined) return true; // the line without its numbers
    if (Math.abs(call.ev) <= 0.5) return false; // QA's $0.50 slack
    return (E >= price) !== (call.ev >= 0);
  },

  'P3-1b a flagged R5b call has the estimate and went through the scenario test': (d, v) => v.rule === 'R5b' && v.grade !== 'good' && (!d.anchor || !v.scenarios),
  'P3-2 flop call of one bet with an overpair/TPTK or better is never red': (d, v, m) => d.street === STREET.FLOP && m.type === 'call' && d.raises === 1 && d.tier >= TIER.OVERPAIR_TPTK && v.grade === 'blunder',
  'P3-3 flop/turn raise with a set or better vs a call or check is never red (not vs a nit)': (d, v, m, b) => (d.street === STREET.FLOP || d.street === STREET.TURN) && m.type === 'raise' && ['call', 'check'].includes(b.type) && d.tier >= TIER.STRONG && v.grade === 'blunder' && !(d.villain && (() => { const t = topRead(d, d.villain.nick); return t && t.p >= 0.5 && t.type === 'nit'; })()),
  'V13b "X rates about the same" (the good line) only within the bar': (d, v, m) => {
    const mm = (d.headline || '').match(/: good\. \((.+?) rates about the same\.\)/);
    if (!mm) return false;
    const o = v.options.find((x) => x.label.replace(/\s*\([^)]*\)\s*$/, '') === mm[1] || x.label === mm[1]);
    return !!o && Math.abs(R(o.ev) - R(m.ev)) > v.small * (o.type === m.type ? 1.6 : 1);
  },
  // the opponent model (POOL's tiny-bet fix, Nov 2026): nobody folds much to a tiny bet
  'N3b tiny bets: everyone folds at most 3 x the pot odds (POOL\'s approved model), and 15% under 5% of the pot': (d, v) => d.street !== STREET.PRE && d.toCall === 0 && v.options.some((o) => {
    if (o.type !== 'raise' || o.F === undefined) return false;
    const frac = o.to / Math.max(1, v.pot);
    const odds = o.to / (v.pot + o.to);
    return frac < 0.1 && o.F > Math.max(0.15, 3 * odds) + 0.03;
  }),
};

// Checks on the opponent model rather than the coach that are not yet expected to hold: counted and
// printed, not failing the run. (Empty: N3b became a failing check with POOL's tiny-bet fix.)
// Not failing: reported for QA to review (STRAT P4-2, MATH: list the calls whose status flips under the
// own-draw rule, against the old one that counted pair outs and overcards as draw equity).
const oldCallStatus = (d, v) => {
  const A = v.anchors;
  if (!A || A.Q === undefined || d.street === STREET.PRE) return null;
  const f = handFeatures(d.hole, d.board);
  if ((f.flushDraw || f.straightDraw) && f.drawEquity >= 0.14) return f.drawEquity >= A.price ? 'works' : 'fails';
  const tol = d.street === STREET.RIVER ? 0 : Math.min(0.1, A.price / 2);
  const e = Math.sqrt(Math.max(0, A.Q * (1 - A.Q)) / Math.max(1, A.n));
  return A.Q - (A.price + tol) >= 2 * e ? 'works' : A.price - tol - A.Q >= 2 * e ? 'fails' : 'even';
};
export const MODEL_CHECKS = {
  'P7-1 log: a river 8a line with nobody behind (should not happen)': (d, v) => v.line === '8a' && d.street === STREET.RIVER && v.a4 && v.a4.raw === 'fold' && !(v.a4.behind > 0),
  'P4-2 flip: a call\'s status changed under the own-draw rule': (d, v) => {
    const c = v.options.find((o) => o.type === 'call');
    if (!c || c.st === undefined) return false;
    const old = oldCallStatus(d, v);
    return old !== null && old !== c.st;
  },
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
  const flips = [];
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
      const act = choose(cfg.style || 'sensible', sess.heroOptions(), sess.hand.state, rnd);
      const job = structuredClone(sess.gradeJob(act)); // the grading input, for LD1 below
      const rec = sess.heroAct(act);
      // LD1 (QA-VERDICT): a grade never depends on the time budget. Every flag and every play a veto check
      // passed is graded again with no budget; when the base run reached the same samples both times
      // (identical base values), the grade must match.
      if (rec.verdict && (rec.verdict.grade !== 'good' || ['fragile', 'unclear', 'passedBluff'].includes(rec.verdict.note))) {
        const belief = HandBelief.fromPlain(job.belief);
        const v0 = gradeDecision(job.state, belief, job.action, { ...job.opts, budgetMs: 0 }, { belief, readOf: (i) => job.reads[i], name: (i) => job.names[i] });
        const same = v0.samples === rec.verdict.samples && v0.options.length === rec.verdict.options.length && v0.options.every((o, i) => o.ev === rec.verdict.options[i].ev);
        if (same && v0.grade !== rec.verdict.grade) violations.push({ invariant: 'LD1 a grade does not depend on the time budget (same base run, same grade)', record: rec });
      }
      if (cfg.onRecord) cfg.onRecord(rec); // e.g. the flag split (scripts/flagsplit.js)
      decisions++;
      for (const k of checkRecord(rec)) violations.push({ invariant: k, record: rec });
      for (const k of checkModel(rec)) {
        modelHits.push(k);
        if (k.startsWith('P4-2 flip')) {
          const c = rec.verdict.options.find((o) => o.type === 'call');
          flips.push(`${cfg.style} ${cfg.home ? 'home' : cfg.game} seed ${cfg.seed} hand ${rec.hand} ${rec.streetName}: ${rec.hole.map(cardStr).join(' ')} on ${rec.board.map(cardStr).join(' ')}, call ${oldCallStatus(rec, rec.verdict)} -> ${c.st} (Q ${Math.round(100 * rec.verdict.anchors.Q)}%, own draw ${Math.round(100 * (rec.ownDrawEquity || 0))}%, price ${Math.round(100 * rec.verdict.anchors.price)}%; ${rec.verdict.grade})`);
        }
      }
    }
  }
  return { decisions, violations, modelHits, flips };
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
  const allFlips = [];
  for (const cfg of CONFIGS(hands)) {
    const t0 = Date.now();
    const { decisions, violations, modelHits, flips } = runConfig(cfg);
    allFlips.push(...flips);
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
  if (allFlips.length) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'P4-2_flips.txt'), allFlips.join('\n') + '\n');
    console.log(`The calls whose status flipped are listed in ${dir}/P4-2_flips.txt.`);
  }
  if (bad) {
    console.log(`\nThe first hand for each is saved in ${dir}/.`);
    process.exit(1);
  }
}
