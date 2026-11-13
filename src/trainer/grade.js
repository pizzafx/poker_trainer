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
  if (v.mine < 0) return;
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
  const regrade = (allow, note, ref) => {
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
    if (h) {
      // graded good, never flagged, never labelled best; the headline carries the note
      v.grade = 'good';
      v.note = 'mwHabit';
      v.habit = h;
      v.loss = 0;
      v.se = 0;
      const b = bestOther();
      if (b >= 0) {
        v.best = b;
        v.sameKind = v.options[b].type === mine.type;
        refreshClose(v);
      }
      return;
    }
    // ...and never the reference when the trainee chose something else
    if (habitOf(best())) {
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
    if (ctx.raises >= 1 && isRaise(best()) && premium < 0.94 && regrade((o) => !isRaise(o), 'preBluff')) return;
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
    if (isRaise(mine) && isRaise(best())) return pass('preSize');
    // The flag must survive opponents being a little looser and a little tighter than assumed.
    for (const shift of [-0.05, 0.05]) {
      const v2 = judgeDecision(s, HERO, env.belief, action, { ...judgeOpts, samples: Math.round(judgeOpts.samples / 2), shift });
      if (v2.options[v.best].ev - v2.options[v.mine].ev < small * 0.5) return pass('fragile');
    }
    return;
  }

  // ---------------- after the flop ----------------
  // STRAT's interim river rule: the check is fine (and a big bet carries the note, above).
  if (foldsBetter && mine.type === 'check') return pass('foldsBetter');
  // 1. Declining to bluff-raise is never a mistake: compare with the best non-raise.
  if (ctx.toCall > 0 && isRaise(best()) && !isRaise(mine) && weak && regrade((o) => !isRaise(o), 'bluffRaise')) return;
  // R5. Declining to raise with one pair facing a bet is never flagged.
  if (ctx.toCall > 0 && onePair && mine.type === 'call' && isRaise(best())) return pass(null);
  // R5b. Facing a passive player's lead with a caller in, a call with one pair is never flagged;
  //     nor is a fold (the spec accepts both: one pair is rarely best when a passive player leads
  //     into a crowd).
  if (passiveLead && onePair && mine.type === 'call') return pass(null);
  if (passiveLead && onePair && mine.type === 'fold') return pass('passiveFold');
  // R6. Folding one pair to a raise of your bet, when another player has also put money in.
  if (ctx.toCall > 0 && mine.type === 'fold' && onePair && ctx.raises >= 2 && ctx.iBetThisStreet) {
    const others = s.history.some((h) => h.street === s.street && h.seat !== HERO && h.seat !== s.lastRaiser && ['call', 'bet', 'raise'].includes(h.type));
    if (others) return pass(null);
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
  // 3. Checking a pair no better than top pair with a weak kicker before the river is never
  //    flagged: it gets a note naming the bet (at most 75% of the pot) that rates higher
  //    (PRO_SPOT_A6s).
  if (!river && ctx.toCall === 0 && mine.type === 'check' && tier >= TIER.WEAK_PAIR && tier <= TIER.TOP_PAIR_WEAK) {
    pass('thinValue');
    v.thin = thinValue(v, s, env, small);
    return;
  }
  // R1 exceptions: three-way with top pair good kicker or better, in position, as the preflop
  // raiser; four-way or more with that hand on a two-tone or connected board, in position or as the
  // preflop raiser (protection matters most there). Otherwise a multiway one-pair check is a note.
  const behind = behindHero(s);
  const pfr = heroRaisedPreflop(s);
  const shape = boardShape(s.board);
  const protect = goodTP && (shape.twoTone || shape.connected) && (ctx.inPosition || pfr);
  const r1Exception = (opp === 2 && goodTP && ctx.inPosition && pfr && !behind.preflopRaiser) || (opp >= 3 && protect);
  // 4. Checking one pair before the river out of position to three or more players, or with
  //    the preflop raiser still to act behind, is never flagged (PRO review, item 4).
  if (!river && ctx.toCall === 0 && mine.type === 'check' && onePair && !r1Exception) {
    if (behind.count >= 3 || behind.preflopRaiser) return pass('checkOOP');
  }
  // R1. One-pair checks multiway are notes, except as above; on the river, yellow at most instead.
  if (mw && onePair && mine.type === 'check' && isRaise(best())) {
    if (river) capYellow();
    else if (!r1Exception) {
      pass('mwCheck');
      v.mw = { to: best().to, gain: Math.round(best().ev) - Math.round(mine.ev), players: opp + 1 };
      return;
    }
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
      if (bigger && betFrac(mine) >= (mw ? 0.45 : 0.6)) return pass('sizeOk');
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
  // "fragile" test after the flop): the same named alternative beats your play by the bar in every
  // scenario: opponents calling a little wider and tighter, a "thin value" stand-in for you in the
  // play-outs, and every range read twice as strong or half as strong (re-weighting, no new runs).
  // When the best kind of play changes between scenarios, the decision is not graded.
  const half = Math.round(judgeOpts.samples / 2);
  const runs = [-0.05, 0.05].map((shift) => judgeDecision(s, HERO, env.belief, action, { ...judgeOpts, samples: half, shift }));
  runs.push(judgeDecision(s, HERO, env.belief, action, { ...judgeOpts, samples: half, heroProfile: THIN_HERO }));
  const scen = runs.filter((r) => r.options.length === v.options.length).map((r) => r.options.map((o) => o.ev));
  if (v.runs && v.runs.sample) scen.push(tiltedEvs(v, 2), tiltedEvs(v, 0.5));
  const kind = (o) => (o.type === 'raise' ? 'raise' : o.type);
  const kinds = new Set([kind(best())]);
  for (const e of scen) {
    let b = -1;
    v.options.forEach((o, i) => {
      if (!habitOf(o) && (b < 0 || e[i] > e[b])) b = i;
    });
    kinds.add(kind(v.options[b]));
  }
  if (kinds.size > 1) return pass('unclear');
  const bar = small * (v.sameKind ? 1.6 : 1);
  for (const e of scen) if (e[v.best] - e[v.mine] < bar) return pass('fragile');
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
