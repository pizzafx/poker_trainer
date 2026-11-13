// Grading one decision: the judge's verdict, the guardrails that keep it from teaching bot-only
// habits, and the soft tips. Pure: it needs only the hand's state, the read tracker and each
// player's read and name, so it runs the same in Node, on the page, and in the page's judge worker.

import { STREET, positionName } from '../engine/game.js';
import { handFeatures, TIER } from '../engine/features.js';
import { classOf, classNames } from '../engine/hands.js';
import { buildContext, POS } from '../bots/policy.js';
import { HERO_PROFILE } from '../bots/profiles.js';
import { judgeDecision, pairedGap, refreshClose, tiltedEvs } from './judge.js';
import { groupOf, presetRanges, presetRaised, expandRange } from './ranges.js';

const HERO = 0;

const TIGHT_FIRST = presetRanges('tight'); // first-in folds are only flagged for these hands
const STANDARD_FIRST = presetRanges('standard');
const STANDARD_RAISED = presetRaised('standard');
// Light re-raises that survive at tougher tables: no junk-3-bet note for these.
const NOT_JUNK_3BET = expandRange('99+ A2s+ KTs+ QTs+ JTs');

// A soft tip, not a flag, on every open-limp: you limped first in (nobody limped or raised before
// you) from any seat but the blinds. Rule-based, not a dollar test: the judge only vetoes it when it
// clearly favours the limp (the limp beats the best raise by more than 2.2 standard errors).
// The size quoted is the standard open (the smallest raise the judge tried). Returns
// { to, text } or null. Never changes the grade.
export function limpTipFor(v, ctx) {
  if (v.grade !== 'good' || v.mine < 0 || ctx.street !== STREET.PRE) return null;
  const mine = v.options[v.mine];
  if (mine.type !== 'call' || ctx.raises !== 0 || ctx.limpers !== 0) return null;
  if (ctx.pos !== POS.EP && ctx.pos !== POS.MP && ctx.pos !== POS.LP) return null;
  const raises = v.options.map((o, i) => [o, i]).filter(([o]) => o.type === 'raise');
  if (!raises.length) return null;
  let br = raises[0][1];
  for (const [o, i] of raises) if (o.ev > v.options[br].ev) br = i;
  const g = pairedGap(v, v.mine, br);
  if (g.mean > 2.2 * g.se) return null; // the judge clearly prefers the limp
  const to = raises[0][0].to;
  return { kind: 'limp', to, text: `raising first in, to about $${to}, usually does better than limping. Fewer players see the flop, and you keep the lead.` };
}

const SEAT_WORDS = { early: 'early position', middle: 'middle position', cutoff: 'the cutoff', button: 'the button', sb: 'the small blind', bb: 'the big blind' };

// A soft note on an open (first in, nobody limped) with a hand outside the Standard range for the
// seat; rule-based, vetoed only when the judge clearly says the open beat folding. The dollar
// figure is given only when folding was clearly better.
export function openTipFor(v, ctx, name, group) {
  if (v.grade !== 'good' || v.mine < 0 || ctx.street !== STREET.PRE || group === 'bb') return null;
  const mine = v.options[v.mine];
  if (mine.type !== 'raise' || ctx.raises !== 0 || ctx.limpers !== 0) return null;
  if (STANDARD_FIRST[group].includes(name)) return null;
  const fold = v.options.findIndex((o) => o.type === 'fold');
  if (fold < 0) return null;
  const g = pairedGap(v, v.mine, fold);
  if (g.mean > 2.2 * g.se) return null; // the judge clearly likes this open
  const where = SEAT_WORDS[group];
  const usual = group === 'button' || group === 'sb' ? 'most players fold it here' : 'most players open it only from later seats';
  const cost = -g.mean > 2.2 * g.se ? Math.round(v.options[fold].ev) - Math.round(mine.ev) : 0;
  return { kind: 'wideOpen', where, text: `${name} is outside the Standard range from ${where}; ${usual}.${cost > 0 ? ` Here folding was about $${cost} better.` : ''}` };
}

// QA L1: a limp first in with a hand outside the Standard range for the seat, when the limp tip was
// vetoed (the judge clearly preferred the limp to a raise): say what the open tip says, that most
// players fold it here. The dollar figure only when folding was clearly better.
export function limpOutsideTipFor(v, ctx, name, group) {
  if (v.grade !== 'good' || v.mine < 0 || ctx.street !== STREET.PRE) return null;
  const mine = v.options[v.mine];
  if (mine.type !== 'call' || ctx.raises !== 0 || ctx.limpers !== 0) return null;
  if (ctx.pos !== POS.EP && ctx.pos !== POS.MP && ctx.pos !== POS.LP) return null;
  if (!STANDARD_FIRST[group] || STANDARD_FIRST[group].includes(name)) return null;
  const fold = v.options.findIndex((o) => o.type === 'fold');
  const where = SEAT_WORDS[group];
  let cost = 0;
  if (fold >= 0) {
    const g = pairedGap(v, fold, v.mine);
    if (g.mean > 2.2 * g.se) cost = Math.round(v.options[fold].ev) - Math.round(mine.ev);
  }
  return { kind: 'wideOpen', where, text: `${name} is outside the Standard range from ${where}; most players fold it here.${cost > 0 ? ` Here folding was about $${cost} better.` : ''}` };
}

// A soft note on a re-raise of a single raise with a hand outside the Standard facing-a-raise range
// (suited aces, suited broadways and nines or better exempt); vetoed only when the judge clearly
// says the re-raise beat calling or folding.
export function junk3betTipFor(v, ctx, name, group) {
  if (v.grade !== 'good' || v.mine < 0 || ctx.street !== STREET.PRE) return null;
  const mine = v.options[v.mine];
  if (mine.type !== 'raise' || ctx.raises !== 1) return null;
  if (STANDARD_RAISED[group].includes(name) || NOT_JUNK_3BET.includes(name)) return null;
  let alt = -1;
  v.options.forEach((o, i) => {
    if (o.type !== 'raise' && (alt < 0 || o.ev > v.options[alt].ev)) alt = i;
  });
  if (alt < 0) return null;
  const g = pairedGap(v, v.mine, alt);
  if (g.mean > 2.2 * g.se) return null;
  const cost = -g.mean > 2.2 * g.se ? Math.round(v.options[alt].ev) - Math.round(mine.ev) : 0;
  return { kind: 'junk3bet', text: `re-raising with ${name} is mostly a bluff, and these players seldom fold to a re-raise; calling or folding is the usual play.${cost > 0 ? ` Here ${v.options[alt].label.toLowerCase()} was about $${cost} better.` : ''}` };
}

// env: { belief, readOf(seat) -> { ranked }, name(seat) -> nick }
export function gradeDecision(s, belief, action, judgeOpts, env) {
  const ctx = buildContext(s);
  const verdict = judgeDecision(s, HERO, belief, action, judgeOpts);
  temper(verdict, s, ctx, action, judgeOpts, env);
  let tip = limpTipFor(verdict, ctx);
  if (!tip && s.street === STREET.PRE) {
    const name = classNames[classOf(s.hole[HERO][0], s.hole[HERO][1])];
    const group = groupOf(positionName(s, HERO));
    tip = openTipFor(verdict, ctx, name, group) || junk3betTipFor(verdict, ctx, name, group) || limpOutsideTipFor(verdict, ctx, name, group);
  }
  if (tip) verdict.tip = tip;
  return verdict;
}

// Guardrails on a verdict, so the trainer does not teach habits that only work on bots
// and does not flag plays a competent player would defend. Multiway rules: MULTIWAY_COACH_SPEC.md
// (FINAL, Nov 2026), R1-R11; the scenario test at the end is MATH_MULTIWAY 2b.
export function temper(v, s, ctx, action, judgeOpts, env) {
  guardrails(v, s, ctx, action, judgeOpts, env);
  if (v.mine >= 0 && v.anchors && s.street !== STREET.PRE) applyAnchors(v, s, ctx);
}

function guardrails(v, s, ctx, action, judgeOpts, env) {
  if (v.mine < 0) return;
  v.small = Math.max(3 * s.bbAmt, 0.1 * v.pot); // the yellow bar, for the notes' copy
  const pre = s.street === STREET.PRE;
  const hf = pre ? null : handFeatures(s.hole[HERO], s.board);
  const weak = hf && hf.tier <= TIER.MIDDLE_PAIR;
  const bb = s.bbAmt;
  const small = Math.max(3 * bb, 0.1 * v.pot);
  const big = Math.max(8 * bb, 0.2 * v.pot);
  const mine = v.options[v.mine];
  const isRaise = (o) => o.type === 'raise';
  const best = () => v.options[v.best];
  const gradeFor = (loss, sameKind) => {
    const k = sameKind ? 1.6 : 1;
    return loss < small * k ? 'good' : loss >= big * k ? 'blunder' : 'mistake';
  };
  // Re-grade against the best option among those `allow` accepts (your own play always counts).
  // The new gap has to clear its own margin of error, as the judge's first verdict did, and the
  // "too close to call" marks are redone against the new reference (R10).
  let allowed = () => true; // the options a guardrail allows as the comparison (kept for the scenario test)
  const regrade = (allow, note, ref) => {
    allowed = allow;
    let alt = -1;
    v.options.forEach((o, i) => {
      if ((i === v.mine || allow(o)) && (alt < 0 || o.ev > v.options[alt].ev)) alt = i;
    });
    if (ref && alt !== v.best) v.ref = ref; // the headline names "the best bet up to ..." (QA K5)
    v.best = alt;
    v.sameKind = v.options[alt].type === mine.type;
    if (alt === v.mine) {
      v.loss = 0;
      v.se = 0;
      v.grade = 'good';
    } else {
      const g = pairedGap(v, alt, v.mine);
      v.loss = g.mean;
      v.se = g.se;
      v.grade = g.mean > 2.2 * g.se ? gradeFor(g.mean, v.sameKind) : 'good';
    }
    refreshClose(v);
    if (v.grade === 'good') v.note = note;
    return v.grade === 'good';
  };
  const pass = (note) => {
    v.grade = 'good';
    v.note = note;
  };
  const capYellow = () => {
    if (v.grade === 'blunder') v.grade = 'mistake';
  };
  const top = (seat) => (seat >= 0 && seat !== HERO ? env.readOf(seat).ranked[0] : null);
  const readAs = (seat, ids) => {
    const r = top(seat);
    return !!r && r.p >= 0.5 && ids.includes(r.id);
  };
  const live = [];
  for (let i = 0; i < s.n; i++) if (i !== HERO && !s.folded[i]) live.push(i);
  // Is a live opponent read as someone who does not fold?
  const stickyRead = () => live.some((i) => readAs(i, ['station', 'whale', 'maniac', 'beginner']));

  // ---- multiway facts (after the flop) ----
  const tier = hf ? hf.tier : null;
  const opp = live.length;
  const mw = !pre && opp >= 2;
  const river = s.street === STREET.RIVER;
  const onePair = !pre && tier >= TIER.WEAK_PAIR && tier <= TIER.OVERPAIR_TPTK;
  const goodTP = !pre && (tier === TIER.TOP_PAIR_GOOD || tier === TIER.OVERPAIR_TPTK);
  const draw = !pre && hf.drawEquity >= 0.14 && tier <= TIER.MIDDLE_PAIR;
  const betFrac = (o) => (o.to - s.currentBet) / Math.max(1, v.pot);
  // R5b: a bet led by a player read as passive, already called by someone else
  const passiveLead = !pre && ctx.toCall > 0 && ctx.callersIn >= 1 && readAs(ctx.aggressor, ['station', 'abc', 'nit', 'beginner']);
  // STRAT's interim river rule (K9 vs a nit, Nov 2026): one pair below top pair top kicker, checked to
  // on the river, against players read as nits or solid regulars. A bet there wins mostly by folding
  // better hands, which is not a value bet. (MATH's anchor A1 replaces this when it ships.)
  const foldsBetter = river && ctx.toCall === 0 && onePair && tier < TIER.OVERPAIR_TPTK && opp >= 1 && live.every((i) => readAs(i, ['nit', 'tag']));
  // R7: plays the coach does not teach, whatever the simulation says ("not a habit to build").
  const habitOf = (o) => {
    if (pre || !isRaise(o)) return null;
    if (foldsBetter && betFrac(o) >= 0.75) return 'foldsBetter';
    if (!mw) return null;
    if (ctx.toCall > 0 && onePair) return passiveLead ? 'passiveLead' : 'raiseCaller';
    if (ctx.toCall > 0 && draw) return 'drawRaise';
    if (draw && live.some((i) => readAs(i, ['station']))) return 'drawStation';
    if (draw && betFrac(o) > 1.05) return 'drawOverbet';
    return null;
  };
  if (!pre) {
    const bestOther = () => {
      let b = -1;
      v.options.forEach((o, i) => {
        if (!habitOf(o) && (b < 0 || o.ev > v.options[b].ev)) b = i;
      });
      return b;
    };
    const h = habitOf(mine);
    const ref = h ? bestOther() : -1;
    // Graded good, never flagged, never labelled best, with the note, only when the play scores at
    // least as well as the best other option less the yellow bar (CEO, Nov 2026: the ruling covers
    // plays the judge rates near the top, never real losses). Otherwise it is graded as usual against
    // the best option that is not one of these plays.
    if (h && ref >= 0) {
      const sameK = v.options[ref].type === mine.type;
      const bar = small * (sameK ? 1.6 : 1);
      if (mine.ev >= v.options[ref].ev - bar) {
        v.grade = 'good';
        v.note = 'mwHabit';
        v.habit = h;
        v.habitHigher = v.options.every((o) => o.ev <= mine.ev); // "scores higher" only when it is the judge's best (STRAT)
        v.loss = 0;
        v.se = 0;
        v.best = ref;
        v.sameKind = sameK;
        refreshClose(v);
        return;
      }
      if (regrade((o) => !habitOf(o))) return;
    }
    // ...and never the reference when the trainee chose something else
    if (!h && habitOf(best())) {
      if (v.grade === 'good') {
        v.best = bestOther();
        v.sameKind = v.options[v.best].type === mine.type;
        refreshClose(v);
      } else if (regrade((o) => !habitOf(o))) return;
    }
  }
  if (v.grade === 'good') return;

  if (pre) {
    const cls = classOf(s.hole[HERO][0], s.hole[HERO][1]);
    const name = classNames[cls];
    const playable = HERO_PROFILE.playPct[cls]; // 1 = best hand to play
    const premium = HERO_PROFILE.raisePct[cls]; // 1 = best hand to raise
    const aggNit = readAs(ctx.aggressor, ['nit']);
    // Aces: a raise is never flagged, at any size, against anyone (PRO review, item 1).
    if (isRaise(mine) && name === 'AA') return pass('premium');
    // Kings: never flagged, except into a read nit's re-raise, and then yellow at most.
    if (isRaise(mine) && name === 'KK') {
      if (!(ctx.raises >= 2 && aggNit)) return pass('premium');
      capYellow();
    }
    // Queens or better and ace-king: re-raising when a call scores best is fine.
    if (isRaise(mine) && ctx.raises >= 1 && premium >= 0.96 && best().type === 'call') return pass('callAlso');
    // A re-raise with a hand outside the top few percent is a bluff: compare with the best
    // option that is not a raise.
    if (ctx.raises >= 1 && isRaise(best()) && premium < 0.94 && regrade((o) => !isRaise(o), 'preBluff', 'noRaise')) return;
    // The opener calling one re-raise: jacks or better, ace-king and ace-queen suited are never
    // red; queens or better and ace-king are fine unless the re-raiser is read as a nit.
    if (mine.type === 'call' && ctx.iRaised && ctx.raises === 2 && ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'].includes(name)) {
      if (['AA', 'KK', 'QQ', 'AKs', 'AKo'].includes(name) && !aggNit) return pass('callOne3bet');
      capYellow();
    }
    // Flatting one raise with jacks or better, ace-king or ace-queen suited instead of re-raising
    // is a style choice: never flagged (PRO review, item 9; the squeeze size made it come up).
    if (mine.type === 'call' && ctx.raises === 1 && isRaise(best()) && ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'].includes(name)) return pass('flatOk');
    // Folds: first in, only flagged with a hand in the Tight preset for the seat (so the presets
    // and the coach agree); facing a raise, only with a hand in the top 35%. Never red.
    if (mine.type === 'fold') {
      if (ctx.raises === 0 ? !TIGHT_FIRST[groupOf(positionName(s, HERO))].includes(name) : playable < 0.65) return pass('preFold');
      capYellow();
    }
    // Re-raising queens or better or ace-king is never a blunder, except into a nit.
    if (isRaise(mine) && premium >= 0.96 && !aggNit) capYellow();
    // Raise sizes before the flop are never flagged: one size for all hands is the right habit,
    // and the judge's preferred size moves with the hand (a size tell if copied).
    //    Only within the same-kind yellow bar; beyond it the size is graded as usual (STRAT, QA M2a).
    if (isRaise(mine) && isRaise(best()) && v.loss < small * 1.6) return pass('preSize');
    // The flag must survive opponents being a little looser and a little tighter than assumed.
    for (const shift of [-0.05, 0.05]) {
      const v2 = judgeDecision(s, HERO, env.belief, action, { ...judgeOpts, ...(judgeOpts.budgetMs ? { budgetMs: judgeOpts.budgetMs / 4 } : {}), samples: Math.round(judgeOpts.samples / 2), shift });
      if (v2.options[v.best].ev - v2.options[v.mine].ev < small * 0.5) return pass('fragile');
    }
    return;
  }

  // ---------------- after the flop ----------------
  // STRAT's interim river rule: the check is fine (and a big bet carries the note, above).
  if (foldsBetter && mine.type === 'check') return pass('foldsBetter');
  // 1. Declining to bluff-raise is never a mistake: compare with the best non-raise.
  if (ctx.toCall > 0 && isRaise(best()) && !isRaise(mine) && weak && regrade((o) => !isRaise(o), 'bluffRaise', 'noRaise')) return;
  // R5. Declining to raise with one pair facing a bet is never flagged.
  if (ctx.toCall > 0 && onePair && mine.type === 'call' && isRaise(best())) {
    v.rule = 'R5';
    return pass(null);
  }
  // R5b. Facing a passive player's lead with a caller in, a call with one pair is never flagged;
  //     nor is a fold (the spec accepts both: one pair is rarely best when a passive player leads
  //     into a crowd).
  if (passiveLead && onePair && mine.type === 'call') {
    v.rule = 'R5b';
    return pass(null);
  }
  //     Only against a lead of a quarter of the pot or more: getting 4 to 1 or better, a one-pair fold
  //     is graded as usual (STRAT, Nov 2026).
  const potBefore = v.pot - s.bet.reduce((a, x) => a + x, 0);
  if (passiveLead && onePair && mine.type === 'fold' && s.currentBet >= 0.25 * potBefore) return pass('passiveFold');
  // R6. Folding one pair to a raise of your bet, when another player has also put money in.
  if (ctx.toCall > 0 && mine.type === 'fold' && onePair && ctx.raises >= 2 && ctx.iBetThisStreet) {
    const others = s.history.some((h) => h.street === s.street && h.seat !== HERO && h.seat !== s.lastRaiser && ['call', 'bet', 'raise'].includes(h.type));
    if (others) {
      v.rule = 'R6';
      return pass(null);
    }
  }
  // 2. Nobody is held to an overbet: compare with the best option up to a pot-sized bet.
  const over = (o) => isRaise(o) && o.to - s.currentBet > v.pot * 1.05;
  if (over(best()) && regrade((o) => !over(o), 'overbet', 'upToPot')) return;
  // R3. Multiway with one pair, the reference is the best bet up to 75% of the pot.
  const upTo75 = (o) => !isRaise(o) || o.to - s.currentBet <= 0.75 * v.pot + 0.5;
  if (mw && onePair && ctx.toCall === 0 && isRaise(best()) && !upTo75(best()) && regrade(upTo75, 'sizeCheck', 'upTo75')) return;
  // R8. Tiny pots: no "missed value" flag with one pair or weaker.
  if (v.pot < 6 * bb && tier <= TIER.OVERPAIR_TPTK && (mine.type === 'check' || mine.type === 'call') && isRaise(best())) return pass('tinyPot');
  // R4. Draws multiway are never flagged for checking or calling.
  if (mw && draw && (mine.type === 'check' || mine.type === 'call') && isRaise(best())) return pass('mwDraw');
  // R1 exceptions: three-way with top pair good kicker or better, in position, as the preflop
  // raiser; four-way or more with that hand on a two-tone or connected board, in position or as the
  // preflop raiser (protection matters most there). Otherwise a multiway one-pair check is a note.
  const behind = behindHero(s);
  const pfr = heroRaisedPreflop(s);
  const shape = boardShape(s.board);
  const protect = goodTP && (shape.twoTone || shape.connected) && (ctx.inPosition || pfr);
  const fourWayException = opp >= 3 && protect;
  const r1Exception = (opp === 2 && goodTP && ctx.inPosition && pfr && !behind.preflopRaiser) || fourWayException;
  // ...and the four-way case is yellow at most, on every street (STRAT, Nov 2026)
  if (fourWayException && mine.type === 'check' && isRaise(best())) capYellow();
  // R1. One-pair checks multiway are notes, except as above; on the river, yellow at most instead.
  //     In multiway pots this comes before the older thin-value and out-of-position passes below
  //     (QA M3), which then only apply heads-up.
  if (mw && onePair && mine.type === 'check' && isRaise(best())) {
    if (river) capYellow();
    else if (!r1Exception) {
      pass('mwCheck');
      v.mw = { to: best().to, gain: Math.round(best().ev) - Math.round(mine.ev), players: opp + 1 };
      v.thin = thinValue(v, s, env, small); // who the bet would get called by, as the A6s note says
      return;
    }
  }
  // 3. Checking a pair no better than top pair with a weak kicker before the river is never
  //    flagged: it gets a note naming the bet (at most 75% of the pot) that rates higher
  //    (PRO_SPOT_A6s).
  if (!river && ctx.toCall === 0 && mine.type === 'check' && tier >= TIER.WEAK_PAIR && tier <= TIER.TOP_PAIR_WEAK && !(mw && isRaise(best()))) {
    pass('thinValue');
    v.thin = thinValue(v, s, env, small);
    return;
  }
  // 4. Checking one pair before the river out of position to three or more players, or with
  //    the preflop raiser still to act behind, is never flagged (PRO review, item 4).
  if (!river && ctx.toCall === 0 && mine.type === 'check' && onePair && !r1Exception) {
    if (behind.count >= 3 || behind.preflopRaiser) return pass('checkOOP');
  }
  // 5. Checks with top pair, good kicker or better before the river are measured against bets
  //    of at most 75% of the pot (and are never red, below). Multiway with two pair or better the
  //    reference is the best bet up to the pot (R3), as the overbet rule above already set it.
  if (!river && ctx.toCall === 0 && mine.type === 'check' && tier >= TIER.TOP_PAIR_GOOD && !(mw && tier >= TIER.TWO_PAIR) && isRaise(best())) {
    if (regrade(upTo75, 'sizeCheck', 'upTo75')) return;
  }
  // A semi-bluff with a real draw (a quarter or more of equity to come) is only flagged against
  // a player read as unable to fold, and then yellow at most (STRAT item 7).
  if (isRaise(mine) && !isRaise(best()) && hf.drawEquity >= 0.25 && !river) {
    if (!stickyRead()) return pass('semiBluff');
    capYellow();
  }
  // Sizing: a bet of 60% of the pot or more (45% multiway, R2) is never "too small"; multiway, a
  // smaller bet is a note with less than top pair good kicker; facing a bet multiway, a raise to
  // 2.5 times it or more is never too small. Sizing is never red.
  if (isRaise(mine) && isRaise(best())) {
    const bigger = best().to > mine.to;
    if (ctx.toCall > 0) {
      if (mw && bigger && mine.to >= 2.5 * s.currentBet - 0.5) return pass('sizeOk');
    } else {
      // multiway on the river with one pair the floor is 30% of the pot (STRAT, Nov 2026: R01's $40)
      if (bigger && betFrac(mine) >= (mw ? (river && onePair ? 0.3 : 0.45) : 0.6)) return pass('sizeOk');
      if (mw && bigger && tier < TIER.TOP_PAIR_GOOD) return pass('mwSize');
    }
    capYellow();
  }
  // 6. Passing up a bluff: not flagged against players read as unable to fold, and it
  //    needs a wide margin (wider on the river) against everyone else. Never red.
  if (ctx.toCall === 0 && isRaise(best()) && mine.type === 'check' && weak) {
    const margin = (river ? 3 : 2) * small;
    if (v.loss < margin || stickyRead()) return pass('passedBluff');
    v.grade = 'mistake';
  }
  // 7. A call against a fold is graded on what it can lose here: at most its price. Money
  //    lost later is graded at those later decisions (PRO review, item 3).
  if (mine.type === 'call' && best().type === 'fold' && v.loss > ctx.toCall) {
    v.grade = gradeFor(ctx.toCall, false);
    if (v.grade === 'good') return pass('callPrice');
  }
  // 8. Flop and turn calls with top pair or better, up to half the pot and 15 big blinds, are
  //    yellow at most; with top pair or better and a draw, at any size (STRAT, Nov 2026).
  if (!river && mine.type === 'call' && tier >= TIER.TOP_PAIR_WEAK && ctx.toCall <= 0.5 * (v.pot - ctx.toCall) + 0.5 && ctx.toCall <= 15 * bb) capYellow();
  if (!river && mine.type === 'call' && tier >= TIER.TOP_PAIR_WEAK && hf.drawEquity >= 0.14) capYellow();
  // Calling instead of raising with two pair or better, multiway, facing a bet and a caller, is
  // yellow at most (owner's ruling on F15).
  if (mw && ctx.toCall > 0 && ctx.callersIn >= 1 && mine.type === 'call' && tier >= TIER.TWO_PAIR && isRaise(best())) capYellow();
  // 9. A check before the river is never red.
  if (!river && mine.type === 'check') capYellow();

  // The flag must hold whichever plausible opponent is real (MATH_MULTIWAY 2b, replacing the
  // "fragile" test after the flop). Scenarios: the base run, opponents calling a little wider and
  // tighter, a "thin value" stand-in for you in the play-outs, and every range read twice as strong or
  // half as strong (re-weighting, no new runs). The stand-in is skipped at six players or more and when
  // the gap is over three bars (MATH: it changes no flag there; it is the slowest scenario).
  const baseBar = small * (v.sameKind ? 1.6 : 1);
  // a quarter of the samples each at six players or more (speed; the base run is one of the scenarios)
  const half = Math.round(judgeOpts.samples / (opp + 1 >= 6 ? 4 : 2));
  const reOpts = judgeOpts.budgetMs ? { budgetMs: judgeOpts.budgetMs / 5 } : {}; // each re-run gets a fifth of the budget
  const runs = [-0.05, 0.05].map((shift) => judgeDecision(s, HERO, env.belief, action, { ...judgeOpts, ...reOpts, samples: half, shift }));
  if (opp + 1 < 6 && v.loss <= 3 * baseBar) runs.push(judgeDecision(s, HERO, env.belief, action, { ...judgeOpts, ...reOpts, samples: half, heroProfile: THIN_HERO }));
  const scen = [v.options.map((o) => o.ev), ...runs.filter((r) => r.options.length === v.options.length).map((r) => r.options.map((o) => o.ev))];
  if (v.runs && v.runs.sample) scen.push(tiltedEvs(v, 2), tiltedEvs(v, 0.5));
  const usable = v.options.map((o, i) => i !== v.mine && !habitOf(o) && allowed(o));
  const gaps = v.options.map((o, a) => (usable[a] ? pairedGap(v, a, v.mine) : null));
  const r = robustVerdict(scen, v.mine, {
    usable,
    bar: (a) => small * (v.options[a].type === mine.type ? 1.6 : 1),
    significant: (a) => gaps[a].mean > 2.2 * gaps[a].se,
    kind: (a) => (v.options[a].type === 'raise' ? 'raise' : v.options[a].type),
    small,
    notHabit: v.options.map((o) => !habitOf(o)),
  });
  if (r.pick >= 0) {
    const pick = r.pick;
    const pickGap = gaps[pick];
    if (pick !== v.best) {
      const RANK = { good: 0, mistake: 1, blunder: 2 };
      const sameK = v.options[pick].type === mine.type;
      const g2 = gradeFor(pickGap.mean, sameK);
      v.best = pick;
      v.sameKind = sameK;
      v.loss = pickGap.mean;
      v.se = pickGap.se;
      if (RANK[g2] < RANK[v.grade]) v.grade = g2; // never worse than the guardrails above left it
      if (v.grade === 'good') return pass('fragile');
      refreshClose(v);
    }
    return;
  }
  if (r.dominated) {
    v.grade = 'mistake';
    v.dominated = r.dominated;
    v.ref = null;
    return;
  }
  return pass(r.unclear ? 'unclear' : 'fragile');
}

// The scenario test's decision, on a table of option values per scenario (`scen[k][i]`): pure, so it
// can be tested on made-up tables.
//  - pick: the alternative that beats `mine` by its bar in every scenario with the most to spare
//    (and passes the base significance test), or -1;
//  - else dominated: when `mine` trails each scenario's best usable option by 1.5 bars (`small`) or
//    more, the smallest such shortfall, rounded (a yellow flag naming no option; MATH, Nov 2026);
//  - else unclear: whether the best kind of play (not counting "not a habit" plays) changes between
//    scenarios.
export function robustVerdict(scen, mine, { usable, bar, significant, kind, small, notHabit }) {
  let pick = -1;
  let pickMargin = -Infinity;
  for (let a = 0; a < usable.length; a++) {
    if (!usable[a] || !significant(a)) continue;
    let m = Infinity;
    for (const e of scen) m = Math.min(m, e[a] - e[mine] - bar(a));
    if (m >= 0 && m > pickMargin) {
      pick = a;
      pickMargin = m;
    }
  }
  if (pick >= 0) return { pick };
  let dom = Infinity;
  for (const e of scen) {
    let mx = -Infinity;
    for (let i = 0; i < usable.length; i++) if (usable[i]) mx = Math.max(mx, e[i]);
    dom = Math.min(dom, mx - e[mine]);
  }
  if (dom >= 1.5 * small) return { pick: -1, dominated: Math.round(dom) };
  const kinds = new Set();
  for (const e of scen) {
    let b = -1;
    for (let i = 0; i < e.length; i++) if (notHabit[i] && (b < 0 || e[i] > e[b])) b = i;
    kinds.add(kind(b));
  }
  return { pick: -1, unclear: kinds.size > 1 };
}

// "Thin value" stand-in for the trainee in the play-outs (MATH_MULTIWAY 2b): bets thinner, never slowplays.
const THIN_HERO = { ...HERO_PROFILE, valueBet: HERO_PROFILE.valueBet.map((x) => x - 0.08), slowplay: 0 };

// Did the trainee make the last raise before the flop?
function heroRaisedPreflop(s) {
  let raiser = -1;
  for (const h of s.history) if (h.street === STREET.PRE && h.type === 'raise') raiser = h.seat;
  return raiser === HERO;
}

// Two of a suit or more, and three ranks inside one five-rank window (aces count low too).
function boardShape(board) {
  const suits = [0, 0, 0, 0];
  let mask = 0;
  for (const c of board) {
    suits[c & 3]++;
    mask |= 1 << (c >> 2);
  }
  const ranks = ((mask << 1) | ((mask >> 12) & 1)) & 0x3fff;
  let conn = 0;
  for (let lo = 0; lo <= 9; lo++) {
    let k = 0;
    for (let i = 0; i < 5; i++) if (ranks & (1 << (lo + i))) k++;
    conn = Math.max(conn, k);
  }
  return { twoTone: Math.max(...suits) >= 2, connected: conn >= 3 };
}

// Opponents still to act after the trainee on this street, and whether the preflop raiser is
// one of them.
function behindHero(s) {
  const n = s.n;
  const order = (i) => (i - s.button - 1 + n) % n;
  let raiser = -1;
  for (const h of s.history) if (h.street === STREET.PRE && h.type === 'raise') raiser = h.seat;
  let count = 0;
  let preflopRaiser = false;
  for (let i = 0; i < n; i++) {
    if (i === HERO || s.folded[i] || s.allIn[i]) continue;
    if (order(i) > order(HERO)) {
      count++;
      if (i === raiser) preflopRaiser = true;
    }
  }
  return { count, preflopRaiser };
}

// For a check with a thin-value hand: the best bet of at most 75% of the pot, if it rates
// higher, and who it would get called by when one opponent is the obvious source.
function thinValue(v, s, env, bar) {
  const mine = v.options[v.mine];
  let bet = -1;
  v.options.forEach((o, i) => {
    if (o.type === 'raise' && o.to - s.currentBet <= 0.75 * v.pot + 0.5 && (bet < 0 || o.ev > v.options[bet].ev)) bet = i;
  });
  if (bet < 0 || v.options[bet].ev <= mine.ev) return null;
  const frac = (v.options[bet].to - s.currentBet) / Math.max(1, v.pot);
  const size = frac < 0.42 ? 'a third of the pot' : frac < 0.62 ? 'half the pot' : 'three-quarters of the pot';
  const live = [];
  for (let i = 0; i < s.n; i++) if (i !== HERO && !s.folded[i]) live.push(i);
  const callers = live.filter((i) => {
    const r = env.readOf(i).ranked[0];
    return r.p >= 0.5 && ['station', 'whale', 'maniac', 'beginner', 'abc'].includes(r.id);
  });
  const from = live.length === 1 ? live[0] : callers.length === 1 ? callers[0] : -1;
  // the gap as the numbers table rounds it, and whether it reaches the yellow bar (QA K2)
  const gain = Math.round(v.options[bet].ev) - Math.round(mine.ev);
  return { size, to: v.options[bet].to, nick: from >= 0 ? env.name(from) : null, gain, small: gain < bar };
}

// ---------------- MATH's anchors (MATH_BASELINE_SPEC, phase 2a) ----------------
// Each play is "works", "even" (about break-even) or "fails" on the numbers the judge recorded: how
// often everyone folds (F, against what a bet with no equity needs, alpha), how often the hand is
// ahead right now when called (W, against need = 1/(callers+1)), and, facing a bet, how often it is
// ahead of everyone who put money in (Q, against the price). A share counts as above or below its
// threshold only when it clears it by two standard errors; otherwise "even". The tolerances (0.05,
// 0.10, 0.20) are MATH's, tunables.
export function anchorStatus(o, v, hf, opp) {
  const A = v.anchors;
  if (!A || !hf) return null;
  const draw = hf.drawEquity >= 0.14 && hf.tier <= TIER.MIDDLE_PAIR;
  const se = (x, k) => Math.sqrt(Math.max(0, x * (1 - x)) / Math.max(1, k));
  if (o.type === 'raise') {
    if (o.F === undefined) return null;
    if (draw) return o.F >= o.alpha - 0.05 || hf.drawEquity >= (o.need ?? 1 / (opp + 1)) ? 'works' : 'fails';
    if (hf.tier >= TIER.WEAK_PAIR) {
      if (!o.called) return 'even';
      const e = se(o.W, o.called);
      if (o.W - (o.need + 0.1) >= 2 * e) return 'works';
      if (o.need - o.W >= 2 * e) return 'fails';
      return 'even';
    }
    const e = se(o.F, A.n);
    if (o.F >= o.alpha + Math.max(0.02, 2 * e)) return 'works';
    if (o.alpha - 0.05 - o.F >= 2 * e) return 'fails';
    return 'even';
  }
  if (o.type === 'call') {
    if (A.Q === undefined) return null;
    if (hf.drawEquity >= 0.14) return hf.drawEquity >= A.price ? 'works' : 'fails';
    const e = se(A.Q, A.n);
    if (A.Q - (A.price + 0.1) >= 2 * e) return 'works';
    if (A.price - 0.1 - A.Q >= 2 * e) return 'fails';
    return 'even';
  }
  return 'works'; // checking and folding are always available
}

// A1-A5, after every other rule: the anchors can veto a flag or veto praise; they never create a
// flag (A5). Rule-based notes (R5, R5b, R6, R7, the passive-lead fold) overrule them.
function applyAnchors(v, s, ctx) {
  const hf = handFeatures(s.hole[HERO], s.board);
  let opp = 0;
  for (let i = 0; i < s.n; i++) if (i !== HERO && !s.folded[i]) opp++;
  const st = (o) => anchorStatus(o, v, hf, opp);
  for (const o of v.options) o.st = st(o); // the line in explain.js reads these, so both agree (QA E1)
  const mine = v.options[v.mine];
  // a raise of your bet with another player in (the R6 spot): the neutral line under every option
  const onePair = hf.tier >= TIER.WEAK_PAIR && hf.tier <= TIER.OVERPAIR_TPTK;
  if (ctx.toCall > 0 && onePair && ctx.raises >= 2 && ctx.iBetThisStreet && s.history.some((h) => h.street === s.street && h.seat !== HERO && h.seat !== s.lastRaiser && ['call', 'bet', 'raise'].includes(h.type))) {
    v.line = '8b';
    return;
  }
  if (v.note === 'mwHabit' || v.note === 'passiveFold' || v.rule === 'R5' || v.rule === 'R5b') return;
  const RAW = v.options.reduce((b, o, i) => (o.ev > v.options[b].ev ? i : b), 0);
  // A4: the judge's best is a fold while a call works by 20 points or more, or the reverse:
  // nothing on this decision is graded, and the line names no play.
  const A = v.anchors;
  if (A.Q !== undefined) {
    const raw = v.options[RAW].type;
    if ((raw === 'fold' && A.Q >= A.price + 0.2) || (raw === 'call' && A.Q <= A.price - 0.2)) {
      v.grade = 'good';
      v.note = 'closeCall';
      v.line = '8a';
      return;
    }
  }
  const regrade = (allow) => {
    let alt = -1;
    v.options.forEach((o, i) => {
      if ((i === v.mine || allow(o)) && (alt < 0 || o.ev > v.options[alt].ev)) alt = i;
    });
    if (alt === v.best) return;
    v.best = alt;
    v.sameKind = v.options[alt].type === mine.type;
    if (alt === v.mine) {
      v.loss = 0;
      v.se = 0;
      v.grade = 'good';
    } else {
      const g = pairedGap(v, alt, v.mine);
      const k = v.sameKind ? 1.6 : 1;
      const small = v.small;
      const big = Math.max(8 * s.bbAmt, 0.2 * v.pot);
      // only ever smaller than before
      const RANK = { good: 0, mistake: 1, blunder: 2 };
      const g2 = !(g.mean > 2.2 * g.se) || g.mean < small * k ? 'good' : g.mean >= big * k ? 'blunder' : 'mistake';
      if (RANK[g2] < RANK[v.grade]) v.grade = g2;
      v.loss = g.mean;
      v.se = g.se;
    }
    v.ref = 'anchor';
    refreshClose(v);
  };
  const supported = (o) => o.type !== 'raise' || st(o) === 'works';
  if (v.grade === 'good') {
    // A2, praise: a bet or raise the anchors do not support is never labelled best. One that fails
    // gets the "not a habit" note (line 5); one about break-even just its line (4b or 2).
    if (mine.type === 'raise' && st(mine) && st(mine) !== 'works') {
      if (v.best === v.mine && st(mine) === 'fails') v.note = 'anchorHabit';
      else if (!v.note) v.note = st(mine) === 'fails' ? 'anchorFails' : 'anchorEven';
      let b = -1;
      v.options.forEach((o, i) => {
        if (i !== v.mine && supported(o) && (b < 0 || o.ev > v.options[b].ev)) b = i;
      });
      if (b >= 0) {
        v.best = b;
        v.sameKind = v.options[b].type === mine.type;
        v.ref = 'anchor'; // the green row is the best play that works, not the longest bar (QA E3)
        refreshClose(v);
      }
      v.line = v.note === 'anchorHabit' ? '5' : 'auto';
      return;
    }
    // ...nor named as the play that "rates about the same" (A3: with nothing or a draw, the
    // reference is the best supported size, or a check)
    if (v.best !== v.mine && !supported(v.options[v.best])) {
      let b = v.mine;
      v.options.forEach((o, i) => {
        if (supported(o) && o.ev > v.options[b].ev) b = i;
      });
      if (b !== v.best) v.ref = 'anchor';
      v.best = b;
      v.sameKind = v.options[b].type === mine.type;
      refreshClose(v);
    }
    if (v.note) v.line = 'auto';
    return;
  }
  // A2, reference: an unsupported bet or raise is never the play a flag is measured against
  if (v.options[v.best].type === 'raise' && !supported(v.options[v.best])) {
    regrade(supported);
    if (v.grade === 'good') {
      v.note = 'anchor';
      v.line = 'auto';
      return;
    }
  }
  // A3: sizes are not graded when the largest size is the best and the hand is less than two pair
  if (mine.type === 'raise' && v.options[v.best].type === 'raise' && A.topSizeBest && hf.tier < TIER.TWO_PAIR) {
    v.grade = 'good';
    v.note = 'sizePeak';
    v.line = '9';
    return;
  }
  // A1: a flag stands only if the play fails: a bet or raise that is the trainee's own ("bluffing
  // players who do not fold", overplaying) or a call measured against a fold ("paying off") on its own
  // numbers; otherwise ("missed value", "folded too much") when the play it is measured against works.
  const ref = v.options[v.best];
  // (a size flag, bet against bigger bet, is missed value: the reference must work)
  const own = (mine.type === 'raise' && ref.type !== 'raise') || (mine.type === 'call' && ref.type === 'fold');
  const verdictOk = own ? st(mine) === 'fails' || st(mine) === null : st(ref) === 'works' || st(ref) === null;
  if (!verdictOk) {
    v.grade = 'good';
    v.note = 'anchor';
  }
  v.line = 'auto';
}
