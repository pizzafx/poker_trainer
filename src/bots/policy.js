// Opponent decision model. A policy maps (public situation, player profile, hand) to
// probabilities over fold / check / call / raise plus a distribution over raise sizes.
// The same function drives the bots, the range tracker (as a likelihood) and the judge.

import { legal, potSize, STREET } from '../engine/game.js';
import { TIER, isRealDraw } from '../engine/features.js';
import { binOf } from './rangetrack.js';

import { EQ_HEADS_UP } from '../data/preflop.js';
import { classInfo, classIndex, CLASS_COUNT } from '../engine/hands.js';
// POOL's opponent package (owner-approved, Nov 2026), fix 1: a separate 'facing aggression' order for calling
// and stacking off against re-raises.
// Premium tiers by live consensus (AK level with QQ-JJ, suited broadways above small pairs), then heads-up equity.
const TIERS = [['AA', 'KK'], ['QQ', 'AKs'], ['JJ', 'AKo'], ['TT', 'AQs'], ['AQo', '99', 'AJs', 'KQs'], ['88', 'ATs', 'KJs', 'AJo', 'KQo', 'QJs'], ['77', 'KTs', 'QTs', 'JTs', 'ATo', 'A5s', 'A4s']];
export const STACK_PCT = (() => {
  const score = new Float64Array(CLASS_COUNT);
  for (let k = 0; k < CLASS_COUNT; k++) score[k] = EQ_HEADS_UP[k];
  TIERS.forEach((t, i) => { for (const n of t) score[classIndex(n)] = 10 - i; });
  const idx = [...Array(CLASS_COUNT).keys()].sort((a, b) => score[a] - score[b]);
  const pct = new Float64Array(CLASS_COUNT); let below = 0;
  for (const k of idx) { const c = classInfo(k); const n = c.pair ? 6 : c.suited ? 4 : 12; pct[k] = (below + n / 2) / 1326; below += n; }
  return pct;
})();
export const BET_FRACS = [0.33, 0.5, 0.75, 1.0, 1.5];
export const POS = { EP: 0, MP: 1, LP: 2, SB: 3, BB: 4 };

const soft = (x, thr, w = 0.015) => 1 / (1 + Math.exp(-(x - thr) / w));
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
// "Is this hand inside the top `width` of hands?" with an edge that is sharp for narrow ranges.
const inTop = (pctile, width) => soft(pctile, 1 - width, clamp(width * 0.2, 0.0012, 0.015));

function roundChips(x) {
  if (x <= 20) return Math.round(x);
  return Math.round(x / 5) * 5;
}

// ---------------------------------------------------------------------------------------
// Situation: everything public that a decision depends on. Built once per decision.

export function buildContext(s, seat = s.toAct) {
  const L = legal(s);
  const n = s.n;
  // The part of a bet this player cannot cover is never theirs to win, so leave it out of the pot.
  const pot = potSize(s) - Math.max(0, s.currentBet - s.bet[seat] - L.callAmt);
  if (s.rt && s.street !== STREET.PRE && s.rt.sync) s.rt.sync(s);
  const ctx = {
    seat,
    rtState: s.rt && s.rt.betRead ? s : null, // the public range summary, read through RangeTrack.betRead (MATH range-bots spike)
    street: s.street,
    pot,
    toCall: L.callAmt,
    canRaise: L.canRaise,
    canCheck: L.canCheck,
    minTo: L.minTo,
    maxTo: L.maxTo,
    currentBet: s.currentBet,
    myBet: s.bet[seat],
    stack: s.stacks[seat],
    bb: s.bbAmt,
    raises: s.raises,
    odds: L.callAmt > 0 ? L.callAmt / (pot + L.callAmt) : 0,
    nOpp: 0,
    aggressor: s.lastRaiser,
    villain: null, // optional: believed profile of the main opponent, for exploit-aware play
  };
  for (let i = 0; i < n; i++) if (i !== seat && !s.folded[i]) ctx.nOpp++;

  if (s.street === STREET.PRE) {
    const off = (seat - s.button + n) % n;
    const toButton = n - off;
    if (n > 2 && off === 1) ctx.pos = POS.SB;
    else if (seat === s.bbSeat || seat === s.straddleSeat) ctx.pos = POS.BB;
    else if (off === 0 || toButton === 1) ctx.pos = POS.LP;
    else if (toButton <= 3) ctx.pos = POS.MP;
    else ctx.pos = POS.EP;
    ctx.btn = n > 2 && off === 0; // POOL batch 6, F5
    ctx.base = s.straddleAmt > 0 && s.straddleSeat >= 0 ? s.straddleAmt : s.bbAmt;
    let limpers = 0;
    let callers = 0;
    let iRaised = false;
    let iLimped = false;
    let raisesSeen = 0;
    let raiserPos = -1;
    let limpReraise = false; // A1: was the latest re-raise made by a player who limped first?
    const limped = new Set();
    for (const h of s.history) {
      if (h.type === 'raise') {
        limpReraise = raisesSeen >= 1 && limped.has(h.seat);
        raisesSeen++;
        callers = 0;
        if (h.seat === seat) iRaised = true;
        raiserPos = h.seat;
      } else if (h.type === 'call') {
        if (raisesSeen === 0) {
          limped.add(h.seat);
          if (!s.folded[h.seat]) limpers++;
        } else if (!s.folded[h.seat]) callers++;
        if (h.seat === seat) iLimped = true;
      }
    }
    ctx.limpers = limpers;
    { let nr = 0, fl = false; for (const h of s.history) { if (h.street !== STREET.PRE) continue; if (h.type === 'raise') nr++; else if (h.type === 'call' && nr >= 1 && h.seat === seat) fl = true; } ctx.iFlatted = fl; }
    ctx.callers = callers;
    ctx.limpReraise = limpReraise && s.raises >= 2;
    ctx.iRaised = iRaised;
    ctx.iLimped = iLimped && !iRaised;
    ctx.raiseBB = s.currentBet / ctx.base;
    // 3-bet continue (POOL, owner-approved 13 Nov 2026): players who called the first raise before a
    // re-raise (a squeeze)
    {
      let nr = 0;
      let sq = 0;
      for (const h of s.history) {
        if (h.street !== STREET.PRE) continue;
        if (h.type === 'raise') nr++;
        else if (h.type === 'call' && nr === 1 && h.seat !== seat) sq++;
      }
      ctx.squeezeCallers = nr >= 2 ? sq : 0;
    }
    // Acts after the raiser postflop?
    ctx.ipVsRaiser =
      raiserPos >= 0 && (seat - s.button - 1 + 2 * n) % n > (raiserPos - s.button - 1 + 2 * n) % n;
    { const oR = raiserPos >= 0 ? (raiserPos - s.button + n) % n : -1; ctx.stealSpot = (n > 2 && oR >= 0 && raisesSeen === 1 && callers === 0 && limpers === 0 && (ctx.pos === POS.SB || ctx.pos === POS.BB) ? (oR === 0 ? 1 : n - oR === 1 ? 0.5 : 0) : 0); } // POOL batch 6: a steal, folded to the blinds: 1 from the BTN, 0.5 from the CO
    ctx.effBB = Math.min(s.stacks[seat] + s.bet[seat], maxOtherStack(s, seat)) / s.bbAmt;
    ctx.effAggBB = s.lastRaiser >= 0 && s.lastRaiser !== seat ? Math.min(s.stacks[seat] + s.bet[seat], s.stacks[s.lastRaiser] + s.bet[s.lastRaiser]) / s.bbAmt : ctx.effBB;
    ctx.aggAllIn = s.lastRaiser >= 0 && s.lastRaiser !== seat && !!s.allIn[s.lastRaiser];
    return ctx;
  }

  // Postflop.
  let lastAggSeat = -1;
  let lastAggStreet = -1;
  let prevStreetBet = false;
  let myBarrels = 0;
  const betStreets = [false, false, false, false];
  for (const h of s.history) {
    if (h.type === 'bet' || h.type === 'raise') {
      if (h.street < s.street) {
        lastAggSeat = h.seat;
        lastAggStreet = h.street;
        if (h.street === s.street - 1) prevStreetBet = true;
      }
      if (h.seat === seat && h.street > STREET.PRE && !betStreets[h.street]) {
        betStreets[h.street] = true;
        myBarrels++;
      }
    }
  }
  ctx.initiative = lastAggSeat === seat && lastAggStreet === s.street - 1;
  ctx.prevChecked = s.street > STREET.FLOP && !prevStreetBet;
  ctx.myBarrels = myBarrels;
  ctx.priorAggressor = lastAggSeat;
  // Order of action this street starts left of the button.
  const myOrder = (seat - s.button - 1 + n) % n;
  let behind = 0;
  let aggBehind = false;
  for (let i = 0; i < n; i++) {
    if (i === seat || s.folded[i] || s.allIn[i]) continue;
    if ((i - s.button - 1 + n) % n > myOrder) {
      behind++;
      if (i === lastAggSeat && lastAggStreet === s.street - 1) aggBehind = true;
    }
  }
  ctx.inPosition = behind === 0;
  ctx.aggressorBehind = aggBehind;
  ctx.spr = pot > 0 ? s.stacks[seat] / pot : 99;
  // Multiway (POOL, Nov 2026): callers already in on this bet, players still to act behind me on it,
  // whether I bet this street, whether anyone raised before the flop, and whether the board is wet
  // (two of a suit or more, and three ranks inside one five-rank window).
  let afterBet = false;
  let callersIn = 0;
  for (const h of s.history) {
    if (h.street !== s.street) continue;
    if (h.type === 'bet' || h.type === 'raise') {
      afterBet = true;
      callersIn = 0;
    } else if (afterBet && h.type === 'call') callersIn++;
  }
  let toActBehind = 0;
  for (let i = 0; i < n; i++) if (i !== seat && i !== s.lastRaiser && !s.folded[i] && !s.allIn[i] && !s.acted[i]) toActBehind++;
  ctx.callersIn = callersIn;
  // POOL batch 19a (PRO, rule 2's text): callers in on this bet who called it in full (an all-in call for less doesn't count)
  {
    let lastTo = 0, full = 0;
    for (const h of s.history) {
      if (h.street !== s.street) continue;
      if (h.type === 'bet' || h.type === 'raise') { lastTo = h.to; full = 0; }
      else if (h.type === 'call' && lastTo > 0 && h.to >= lastTo) full++;
    }
    ctx.fullCallersIn = full;
  }
  ctx.iBetThisStreet = s.history.some((h) => h.street === s.street && h.seat === seat && (h.type === 'bet' || h.type === 'raise'));
  // Passivity, Revision D (POOL, owner-approved 13 Nov 2026): has anyone already acted (checked) on
  // this postflop street before me?
  ctx.checkedTo = s.history.some((h) => h.street === s.street && h.street > STREET.PRE);
  ctx.iChecked = s.history.some((h) => h.street === s.street && h.street > STREET.PRE && h.seat === seat && h.type === 'check'); // POOL batch 6
  ctx.iCheckedPrev = s.street > STREET.FLOP && s.history.some((h) => h.street === s.street - 1 && h.seat === seat && h.type === 'check'); // POOL batch 16
  ctx.preflopRaised = s.history.some((h) => h.street === STREET.PRE && h.type === 'raise');
  {
    const suits = [0, 0, 0, 0];
    let mask = 0;
    for (const c of s.board) {
      suits[c & 3]++;
      mask |= 1 << (c >> 2);
    }
    const ranks = ((mask << 1) | ((mask >> 12) & 1)) & 0x3fff; // aces count low too
    let connected = 0;
    for (let lo = 0; lo <= 9; lo++) {
      let k = 0;
      for (let i = 0; i < 5; i++) if (ranks & (1 << (lo + i))) k++;
      if (k > connected) connected = k;
    }
    ctx.wet = Math.max(...suits) >= 2 && connected >= 3;
    ctx.drawy = Math.max(...suits) >= 2 || connected >= 3; // POOL batch 15: two-tone or connected (a draw is possible)
  }
  // POOL batch 18 (the owner's hand 461): has the betting capped the others since the scary card came? For the
  // flush and the straight parts of the board markdown, the street the current level arrived on, and then the
  // number of whole streets checked through since (-1 once anyone bet or raised on it or after it, this street too).
  {
    const lvl = (k) => {
      const b = s.board.slice(0, k), su = [0, 0, 0, 0];
      let mask = 0;
      for (const c of b) { su[c & 3]++; mask |= 1 << (c >> 2); }
      const r = ((mask << 1) | ((mask >> 12) & 1)) & 0x3fff;
      let con = 0;
      for (let lo = 0; lo <= 9; lo++) { let q = 0; for (let i = 0; i < 5; i++) if (r & (1 << (lo + i))) q++; if (q > con) con = q; }
      return { fl: Math.max(...su) >= 4 ? 2 : Math.max(...su) === 3 ? 1 : 0, st: con >= 4 ? 2 : con === 3 && k >= 4 ? 1 : 0 };
    };
    const L = [3, 4, 5].filter((k) => k <= s.board.length).map(lvl);
    const aggOn = (st) => s.history.some((h) => h.street === st && (h.type === 'bet' || h.type === 'raise'));
    const quiet = (key) => {
      const now = L[L.length - 1]?.[key] || 0;
      if (!now) return -1;
      const a = STREET.FLOP + L.findIndex((x) => x[key] === now);
      for (let st = a; st <= s.street; st++) if (aggOn(st)) return -1;
      return s.street - a;
    };
    ctx.quietFlush = quiet('fl');
    ctx.quietStraight = quiet('st');
    // POOL batch 19a (PRO, rule 1): did the river card complete a flush or a straight (raise either board level)?
    ctx.riverDrawCompleted = L.length === 3 && (L[2].fl > L[1].fl || L[2].st > L[1].st);
    { const rk = s.board.map((c) => c >> 2); ctx.boardPaired = rk.some((r, i) => rk.indexOf(r) !== i); } // POOL batch 19b
  }
  ctx.toActBehind = ctx.toCall > 0 ? toActBehind : 0;
  return ctx;
}

function maxOtherStack(s, seat) {
  let m = 0;
  for (let i = 0; i < s.n; i++) {
    if (i !== seat && !s.folded[i]) m = Math.max(m, s.stacks[i] + s.bet[i]);
  }
  return m;
}

// ---------------------------------------------------------------------------------------
// Exploit-aware adjustments (used only by profiles with `exploit` set, i.e. the stand-in
// for the trainee during simulations).

function respectFor(P, ctx, st) {
  const v = ctx.villain;
  if (!P.exploit || !v) return 0;
  // Passive opponents' bets and raises mean more than aggressive opponents'.
  const base = (0.5 - v.aggro) * 0.28;
  return ctx.raises >= 2 ? base * 1.5 : base * (st === 2 ? 1.1 : 0.8);
}

function bluffMultFor(P, ctx) {
  const v = ctx.villain;
  if (!P.exploit || !v) return 1;
  return clamp(0.15 + 1.9 * v.foldy, 0.1, 1.8);
}

function valueShiftFor(P, ctx) {
  const v = ctx.villain;
  if (!P.exploit || !v) return 0;
  return (v.foldy - 0.5) * 0.14; // bet thinner against players who call too much
}

// ---------------------------------------------------------------------------------------
// Preflop.

function preflopSizes(ctx, P, premium) {
  let normal;
  let big;
  if (ctx.raises === 0) {
    const bbs = P.openSize + P.perLimper * ctx.limpers + (ctx.pos >= POS.SB ? 1 : 0);
    normal = roundChips(bbs * ctx.base);
    big = roundChips(bbs * ctx.base * 1.5);
  } else if (ctx.raises === 1) {
    const mult = ctx.ipVsRaiser ? 3 : 3.6;
    normal = roundChips(ctx.currentBet * (mult + 0.8 * ctx.callers));
    big = roundChips(normal * 1.35);
  } else {
    normal = roundChips(ctx.currentBet * 2.4);
    big = ctx.maxTo;
  }
  if (P.jam4All && ctx.raises === 2) return [{ to: ctx.maxTo, p: 1 }]; // POOL batch 13: a maniac's 4-bet is a shove
  // Only value raises (or short stacks) turn into shoves at 40% of the stack; others at 65%.
  // non-premium 4-bets keep their normal size when deep (POOL G2)
  const commit = (!premium && ctx.effBB > 40 ? (ctx.raises >= 2 ? 0.45 : 0.65) : 0.4) * ctx.maxTo; // POOL batch 3, G4: a 4-bet past 45% of the stack is a shove
  if (normal >= commit) normal = ctx.maxTo;
  if (big >= commit) big = ctx.maxTo;
  normal = clamp(normal, ctx.minTo, ctx.maxTo);
  big = clamp(big, ctx.minTo, ctx.maxTo);
  if (big === normal) return [{ to: normal, p: 1 }];
  const pBig = premium ? 0.12 + 0.7 * P.sizeTell : 0.04 + 0.1 * (1 - P.sizeTell);
  return [
    { to: normal, p: 1 - pBig },
    { to: big, p: pBig },
  ];
}


// POOL batch 13: the maniac's 4-bet groups [QQ+/AK, JJ-TT, 99-66, suited ace, suited Broadway, AQo/AJo/KQo, the rest]
function jamGroup(ci) {
  const nm = ci.name;
  return (ci.pair && ci.hi >= 10) || (ci.hi === 12 && ci.lo === 11) ? 0 : ci.pair && ci.hi >= 8 ? 1 : ci.pair && ci.hi >= 4 ? 2 : ci.pair ? 6 : ci.suited && ci.hi === 12 ? 3 : ci.suited && ci.lo >= 8 ? 4 : nm === 'AQo' || nm === 'AJo' || nm === 'KQo' ? 5 : 6;
}

// POOL batch 19: PRO's preflop call-off groups. AJ/KQ/ATs; 'other' = not a pair and not AQ+, AJ, KQ or ATs
function pfCallOffGroup(cls) {
  const ci = classInfo(cls), nm = ci.name;
  if (ci.pair || nm.startsWith('AK') || nm.startsWith('AQ')) return null;
  if (['AJs', 'AJo', 'KQs', 'KQo', 'ATs'].includes(nm)) return 'ajkq';
  return 'other';
}
export function preflopPolicy(ctx, P, cls) {
  const rp0 = ctx.raises === 0 ? (P.openPct || P.raisePct)[cls] : P.raisePct[cls]; // the opening order (profiles.js) is for first-in opens and isolation only (POOL batch 8)
  const sp = STACK_PCT[cls]; // facing-aggression order
  const rp = rp0;
  const pp = P.playPct[cls];
  let raise = 0;
  let call = 0;
  const depth = clamp(100 / Math.max(10, ctx.effBB), 0.7, 3); // short stacks get it in lighter

  if (ctx.raises === 0) {
    const width = P.pfr[ctx.pos] * (ctx.limpers ? P.isoFactor : 1) * (ctx.btn ? P.btnMult ?? 1 : 1);
    raise = inTop(rp, width);
    if (rp > 0.99) raise *= 1 - P.limpTrap;
    const playWidth = P.vpip[ctx.pos] * (1 + 0.06 * ctx.limpers);
    // A7 (POOL, Nov 2026): gamblers and beginners sometimes play any two cards; those hands limp.
    const enter = Math.max(raise, inTop(pp, playWidth), rp > 0.99 ? 1 : 0, P.anyTwo);
    const limpShare = ctx.limpers ? P.overLimp : P.openLimp;
    // The small blind completes cheaply; the big blind checks for free.
    const cheap = ctx.pos === POS.SB ? Math.max(limpShare, 0.6) : limpShare;
    call = (enter - raise) * (rp > 0.99 ? 1 : cheap);
  } else if (ctx.raises === 1) {
    const st3 = P.steal3Bet ?? P.stealDefend;
    const tbW = P.threeBet * (ctx.stealSpot && st3 ? 1 + (st3 - 1) * ctx.stealSpot : 1);
    const value = inTop(sp, tbW * depth);
    const inBand = sp < 1 - tbW && sp > 1 - tbW - 0.09;
    const bluff = inBand ? P.threeBetBluff : 0;
    raise = value + (1 - value) * bluff;
    const elastic = clamp(1 - (P.callElastic * (ctx.raiseBB - 5)) / 5, 0.2, 1.4);
    let width = P.callRaise * elastic * (1 + P.callCrowd * ctx.callers);
    if (ctx.pos === POS.LP || ctx.pos === POS.BB) width *= 1.2;
    if (ctx.stealSpot && P.stealDefend) width *= 1 + (P.stealDefend - 1) * ctx.stealSpot; // POOL batch 6: blinds defend wider against a late-position steal
    if (ctx.iLimped) width *= P.limpCall;
    if (ctx.toCall >= 0.35 * (ctx.stack + ctx.myBet)) width = Math.min(width, P.stackOff * depth * 2);
    call = (1 - raise) * inTop(Math.max(pp, rp, sp), width);
    call = Math.max(call, 0.5 * P.anyTwo * (1 - raise)); // A7: and call one raise half as often
    // set-mining (POOL HX1, Nov 2026). Facing one cheap raise (at most 7% of the effective stack), small and middle pairs call.
    if (P.setMine && classInfo(cls).pair) {
      const f = ctx.toCall / Math.min(ctx.stack + ctx.myBet, ctx.effAggBB * ctx.bb);
      const end = P.setMineEnd ?? 0.1;
      const wS = clamp((end - f) / (end - 0.07), 0, 1); // tapers from 7% to setMineEnd of the stack, no cliff (POOL batch 5)
      if (wS > 0) call = Math.max(call, wS * P.setMine * (1 - raise));
    }
  } else {
    // Facing a 3-bet or more.
    const mix = 0.5 * (rp + pp);
    const cold = !ctx.iRaised && !ctx.iLimped && ctx.myBet <= ctx.base;
    // measured against the effective stack versus the aggressor; any all-in is a stack-off decision (POOL G1)
    const effChips = Math.min(ctx.stack + ctx.myBet, ctx.effAggBB * ctx.bb);
    const bigDecision = ctx.toCall >= 0.3 * effChips || ctx.raises >= 3 || ctx.aggAllIn;
    if (bigDecision) {
      // depth against the aggressor, and the price: a short shove gets called much wider
      const dA = clamp(100 / Math.max(10, ctx.effAggBB), 0.7, 2);
      const oddsMult = clamp(1 + (0.45 - ctx.odds) * 8, 1, 3);
      const w = P.stackOff * dA * oddsMult * (cold ? 0.7 : 1);
      const go = inTop(sp, w);
      // passive types call their stack-offs; facing an all-in, a non-premium re-raise is only an isolation play (POOL batch 5, G5)
      let share = 0.6 * (P.stackOffRaise ?? 1);
      // POOL batch 16b (PRO, rule 4 / ceiling 10): a station or nit facing a stack-off decision re-raises only with
      // QQ+/AK; below that it calls or folds (the nit keeps a little JJ: stackOffRaiseJJ)
      if (P.stackOffRaiseNP != null && sp < 0.975) share = 0.6 * (sp > 0.97 && P.stackOffRaiseJJ != null ? P.stackOffRaiseJJ : P.stackOffRaiseNP);
      if (ctx.aggAllIn && sp <= 0.94) share *= P.isoRaise ?? 0.3; // JJ-99, AQ, AJs, KQs and better still isolate
      raise = go * share;
      call = go * (1 - share);
      // POOL batch 4 (with PRO): deep, facing a big 3-bet (not all-in), solid regulars rarely jam a non-premium hand; the rest folds
      if (P.deepJamCap != null && ctx.raises === 2 && !ctx.aggAllIn && ctx.effBB > 40 && sp <= 0.972) raise = Math.min(raise, P.deepJamCap);
      // POOL batch 14 (QA-OPP M1): a maniac facing a big 3-bet (a call of 30%+ of the stack) keeps batch 13's floors,
      // tapered by price, so its fold rate rises smoothly with the 3-bet's size instead of jumping at 30%
      if (P.tbFloor && ctx.iRaised && ctx.raises === 2 && !ctx.aggAllIn) {
        const f = ctx.toCall / effChips;
        const t = clamp(1 - (f - 0.3) / (P.bigFloorSpan ?? 0.4), P.bigFloorMin ?? 0, 1);
        const ci = classInfo(cls);
        let mix = 0;
        if (P.jam4Mix) {
          const g = jamGroup(ci);
          const deep = P.jam4DeepMult != null && g >= 3 ? 1 + (P.jam4DeepMult - 1) * clamp((ctx.effAggBB - 100) / 50, 0, 1) : 1;
          mix = P.jam4Mix[g] * deep * (g >= 3 ? t : 1);
        }
        const rA = Math.max(raise, mix);
        const cA = Math.max(call, (P.bigFloorBase ?? P.tbFloor) * t * (1 - rA));
        // the stack-off branch's own extra jams phase in from 30% to 40% of the stack (PRO); hands not yet jamming call
        const w = clamp((f - 0.3) / 0.1, 0, 1);
        raise = Math.min(rA, mix + w * (rA - mix));
        call = Math.min(1 - raise, cA + (rA - raise));
      }
      // facing an all-in, the price comes first: under 15% needed is a call with anything, tapering out by 25% (POOL G1)
      if (ctx.aggAllIn) {
        const wP = clamp((0.25 - ctx.odds) / 0.1, 0, 1);
        if (wP > 0) call = Math.max(call, wP * (1 - raise));
      }
    } else {
      const rw = P.fourBet * depth * (cold ? 0.7 : 1);
      const value = inTop(sp, rw);
      const inBand = sp < 1 - rw && sp > 1 - rw - 0.05;
      // POOL batch 3, G4: deep, a bluff 4-bet that would be more than 45% of the stack is dropped (call or fold instead)
      const bluffOK = ctx.effBB <= 40 || roundChips(ctx.currentBet * 2.4) < 0.45 * ctx.maxTo;
      raise = value + (1 - value) * (inBand && bluffOK ? P.fourBetBluff : 0);
      if (ctx.iRaised && ctx.raises === 2 && P.tbCont) {
        // 3-bet continue (POOL): the opener continues a share of its OWN opening range, by its
        // position, the 3-bet's size, being out of position, and callers squeezed.
        const openW = P.pfr[ctx.pos] * (ctx.limpers ? P.isoFactor : 1) * (ctx.btn ? P.btnMult ?? 1 : 1);
        const mult = ctx.currentBet / Math.max(1, ctx.myBet);
        let c = P.tbCont[ctx.pos <= POS.MP ? 0 : 1];
        c -= P.tbSize * Math.max(0, Math.min(mult, 6) - 3); // the size penalty stops at 6x (POOL G2)
        if (!ctx.ipVsRaiser) c -= P.tbOOP;
        c -= P.tbSqueeze * (ctx.squeezeCallers || 0);
        c = clamp(c, 0.05, 1);
        const ci = classInfo(cls);
        // POOL batch 7 (with PRO): AK 4-bets a share of the time against a 3-bet
        if (P.tbAK4 && ci.hi === 12 && ci.lo === 11) raise = Math.max(raise, P.tbAK4 * (ci.suited ? 1.5 : 1));
        // POOL batch 8 (with PRO): solver-minded and loose regulars 4-bet-bluff suited wheel aces (A5s, A4s; A3s/A2s at half)
        if (P.tbWheel4 && ci.suited && ci.hi === 12 && ci.lo <= 3) raise = Math.max(raise, P.tbWheel4 * (ci.lo >= 2 ? 1 : 0.5));
        // POOL batch 13 (with PRO): a maniac ships a wide 4-bet: premiums, pairs, suited aces, Broadway, some junk.
        // jam4Mix: [QQ+/AK, JJ-TT, 99-66, suited ace, suited Broadway, AQo/AJo/KQo, the rest]
        if (P.jam4Mix) {
          const J = P.jam4Mix, g = jamGroup(ci);
          // deeper than 100bb the non-pair groups taper toward jam4DeepMult at 150bb (with PRO): they flat instead
          const deep = P.jam4DeepMult != null && g >= 3 ? 1 + (P.jam4DeepMult - 1) * clamp((ctx.effAggBB - 100) / 50, 0, 1) : 1;
          raise = Math.max(raise, J[g] * deep);
        }
        // POOL batch 8 (with PRO): offsuit 4-bet bluffs below AQo (AJo, KQo) are the worst ones: cut them
        if (P.tbOffBluff4 != null && !ci.suited && !ci.pair && !(ci.hi === 12 && ci.lo >= 10)) raise *= P.tbOffBluff4;
        call = Math.max(0, inTop(sp, openW * c) - raise);
        if (P.tbFloor) call = Math.max(call, P.tbFloor * (1 - raise)); // POOL batch 13: a maniac rarely folds to one 3-bet
        // POOL batch 7 (with PRO): offsuit hands below AQo are the ones regulars lose money with against
        // value-heavy live 3-bets: AJo and KQo continue less, the rest much less
        if (P.tbOffHi != null && !ci.suited && !ci.pair && !(ci.hi === 12 && ci.lo >= 10)) call *= ci.hi === 12 && ci.lo === 9 || ci.hi === 11 && ci.lo === 10 ? P.tbOffHi : P.tbOffLo;
        // POOL batch 7 (with PRO): deep, pairs and suited connectors (and suited aces) flat a small 3-bet for
        // implied odds. Full at a call of tbPlayStart of the effective stack or less, gone by tbPlayEnd.
        if (P.tbPlay) {
          const kind = ci.pair ? (ci.lo >= 4 ? 1 : P.tbSmallPair) : ci.suited && ci.gap === 1 && ci.lo >= 3 ? (ci.lo >= 6 ? P.tbSC : P.tbSCLow) : ci.suited && ci.hi === 12 ? P.tbSuitedAce : ci.suited && ci.lo >= 8 ? P.tbSuitedBw ?? 0 : 0;
          if (kind) {
            const f = ctx.toCall / effChips;
            const wS = clamp((P.tbPlayEnd - f) / (P.tbPlayEnd - P.tbPlayStart), 0, 1);
            if (wS > 0) call = Math.max(call, Math.min(1, kind * (ctx.ipVsRaiser ? 1.25 : 1)) * wS * P.tbPlay * (1 - raise));
          }
        }
      } else {
        const cw = P.callThreeBet * (cold ? 0.5 : 1) * (1 + 0.5 * P.callCrowd * ctx.callers);
        call = (1 - raise) * inTop(Math.max(mix, sp), cw);
        // squeezes (fix 4): a player who flatted continues a share of its own calling range
        if (ctx.iFlatted && !ctx.iRaised && P.sqCont) call = Math.max(call, (1 - raise) * inTop(Math.max(mix, sp), P.callRaise * P.sqCont));
      }
    }
    // POOL batch 7: facing one 3-bet (not all-in), JJ+ and AK do not fold, whatever the size
    if (P.premNoFold && ctx.raises === 2 && !ctx.aggAllIn && sp >= 1 - P.premNoFold) call = Math.max(call, 1 - raise);
    // A1 (POOL, Nov 2026): a limp-reraise is about the strongest thing anyone does at these tables
    // (kings or aces, queens, ace-king): everything but the very top of a range gets out.
    if (ctx.limpReraise && sp < 0.985 && !(ctx.aggAllIn && ctx.odds < 0.25)) { // POOL batch 3, G1r: not against a cheap limp-shove
      call *= 0.4;
      raise *= 0.3;
    }
    if (P.exploit && ctx.villain) {
      // Tight players' re-raises are the top of their range: continue tighter.
      const k = clamp(0.4 + 1.2 * ctx.villain.aggro, 0.35, 1.3);
      call *= k;
      if (sp < 0.985) raise *= k;
    }
    // POOL batch 3, G1r: the all-in price floor comes after the limp-reraise and read discounts
    if (ctx.aggAllIn) {
      const wP = clamp((0.25 - ctx.odds) / 0.1, 0, 1);
      if (wP > 0) call = Math.max(call, wP * (1 - raise));
    }
  }

  if (!ctx.canRaise) {
    call += raise;
    raise = 0;
  }
  // POOL batch 19 (PRO ceiling (d)): calling off (25bb+ or all-in) in a 3-bet+ pot with AJ/KQ/ATs or a non-premium
  // hand is capped per type at pfCallOffCap { ajkq, other } (%, aimed at 0.85 of PRO's ceiling; raise and call together)
  if (P.pfCallOffCap && ctx.raises >= 2 && (ctx.toCall >= 25 * ctx.bb || ctx.toCall >= ctx.stack)) {
    const g = pfCallOffGroup(cls);
    const cap = g && P.pfCallOffCap[g] != null ? (FOLD_CAP_AIM * P.pfCallOffCap[g]) / 100 : null;
    if (cap != null && call + raise > cap) { const k = cap / (call + raise); call *= k; raise *= k; }
  }
  const out = { fold: 0, check: 0, call: 0, raise, sizes: null };
  if (ctx.canCheck) {
    out.check = 1 - raise;
  } else {
    out.call = Math.min(call, 1 - raise);
    out.fold = Math.max(0, 1 - raise - out.call);
    // aces and kings never fold before the flop (the smooth policy leaves a ~0.05% fold tail; QA-OPP gate 18-38)
    if (sp > 0.99 && out.fold > 0) {
      out.call += out.fold;
      out.fold = 0;
    }
  }
  if (raise > 0) out.sizes = preflopSizes(ctx, P, sp > 0.972);
  // POOL batch 19a (PRO, rule 4 A's and abc's B ceilings): facing a 3-bet or more (a real re-raise, or an all-in of
  // 20bb+; a smaller all-in counts as one raise), the jam share is capped per group at jam3Cap (fractions; null groups
  // uncapped), with jam3MinBB the effective depth it starts at. The excess goes to calling.
  if (P.jam3Cap && raise > 0 && out.sizes && ctx.raises >= 2 && !(ctx.aggAllIn && ctx.currentBet < 20 * ctx.bb) && ctx.effBB >= (P.jam3MinBB ?? 0)) {
    const cap = P.jam3Cap[jamGroup3(cls)];
    const pj = out.sizes.reduce((a, z) => a + (z.to >= ctx.maxTo ? z.p : 0), 0);
    if (cap != null && raise * pj > cap) {
      const excess = raise * pj - cap;
      const keepJ = cap / raise; // the new all-in weight inside the raise
      const rest = 1 - pj;
      if (rest > 1e-9) {
        // keep the non-jam raise weight, scale the jam down, and send the excess to calling
        out.raise = raise - excess;
        out.sizes = out.sizes.map((z) => ({ ...z, p: (z.to >= ctx.maxTo ? keepJ : z.p) * raise / out.raise }));
      } else {
        out.raise = cap;
        out.sizes = out.sizes.map((z) => ({ ...z, p: z.to >= ctx.maxTo ? 1 : 0 }));
      }
      out.call += raise - out.raise;
      if (out.fold > 0 && out.call + out.raise + out.fold > 1) out.fold = Math.max(0, 1 - out.call - out.raise);
    }
  }
  return out;
}
// POOL batch 19a: PRO's jam groups facing a 3-bet or more
function jamGroup3(cls) {
  const ci = classInfo(cls), nm = ci.name;
  if ((ci.pair && ci.hi >= 10) || nm.startsWith('AK')) return 'prem';
  if (ci.pair && ci.hi === 9) return 'jj';
  if (nm.startsWith('AQ')) return 'aq';
  if (ci.pair && ci.hi >= 7) return 'tt';
  if (['AJs', 'AJo', 'KQs', 'KQo'].includes(nm)) return 'ajkq';
  return 'other';
}

// ---------------------------------------------------------------------------------------
// Postflop.

function betSizes(ctx, weights) {
  // The dollar amount for each bet fraction depends only on the situation, so work it out
  // once per decision (this runs for every possible hand when ranges are updated).
  let tos = ctx.betTos;
  if (!tos) {
    tos = ctx.betTos = BET_FRACS.map((f) => {
      let to = roundChips(f * ctx.pot);
      if (to >= 0.7 * ctx.maxTo) to = ctx.maxTo;
      return clamp(to, ctx.minTo, ctx.maxTo);
    });
  }
  const out = [];
  let total = 0;
  for (let i = 0; i < tos.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    total += w;
    let hit = false;
    for (let k = 0; k < out.length; k++) {
      if (out[k].to === tos[i]) {
        out[k].p += w;
        hit = true;
        break;
      }
    }
    if (!hit) out.push({ to: tos[i], p: w });
  }
  for (let k = 0; k < out.length; k++) out[k].p /= total;
  return out;
}

function raiseSizes(ctx, P) {
  let big = roundChips(ctx.currentBet + 0.85 * (ctx.pot + ctx.toCall));
  let small = roundChips(ctx.currentBet * 2.2);
  if (big >= 0.6 * ctx.maxTo) big = ctx.maxTo;
  if (small >= 0.6 * ctx.maxTo) small = ctx.maxTo;
  big = clamp(big, ctx.minTo, ctx.maxTo);
  small = clamp(small, ctx.minTo, ctx.maxTo);
  if (big === small || P.minRaise <= 0) return [{ to: big, p: 1 }];
  return [
    { to: big, p: 1 - P.minRaise },
    { to: small, p: P.minRaise },
  ];
}

function mixWeights(a, wa, b, wb) {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * wa + b[i] * wb;
  return out;
}

// POOL batch 18 (the owner's hand 461, PRO's value floors and ceilings): when nobody has bet yet this street, the
// scary-board markdown is too big for one pair, and it ignores the action.
//  1. One pair betting for value: the three-flush markdown x0.85 becomes x valueMd (per type, 0.86-0.92) and the
//     four-straight x0.72 moves with it (0.92 -> 0.82). Regulars keep more of the markdown than recreational players.
//  2. Then each part keeps only a share k of itself: k = MD_KEEP_FULL^q after q whole streets checked through since
//     the card, never under MD_KEEP_MIN; MD_KEEP_NOW checked to me last on the card's street; 1 once anyone bet or
//     raised since the card. A four-flush or four-straight uses the square root of k (one-card hands check more).
//     Holding a card of the flush suit (a blocker) keeps MD_SUIT of the flush k.
// Facing a bet the full markdown stays: the bettor's range is not capped. The paired-board markdown is not touched.
export const ODDS_FLOOR_AT = 0.1, ODDS_FLOOR = 0.995; // POOL batch 19 (review 2 A 14-03: the 2% residual fold was the A; PRO: near zero, never zero)
export const MD_KEEP_FULL = 0.7, MD_KEEP_NOW = 0.7, MD_SUIT = 0.75, MD_KEEP_MIN = 0.5;
function mdKeep(q, ctx) {
  if (q < 0) return 1;
  if (q === 0) return ctx.checkedTo && ctx.inPosition ? MD_KEEP_NOW : 1;
  return Math.max(MD_KEEP_MIN, MD_KEEP_FULL ** q);
}
export const RANGE_TOP = 0.105;
export const RANGE_SCALE = 0.5; // strength per unit of 'ahead when called': 7 points of ahead move the bet rate as 0.035 of strength does
function boardAwareStrength(ctx, f, P = {}) {
  let mf = f.mdFlush ?? 1, ms = f.mdStraight ?? 1;
  if (ctx.toCall > 0 || (mf === 1 && ms === 1)) return f.strength;
  const S0 = f.strength / (mf * ms);
  const four = mf < 0.7, fourS = ms < 0.9; // four to a flush (x0.55/0.62); four to a straight (x0.72/0.82)
  if (f.tier <= TIER.OVERPAIR_TPTK) { // one pair only (PRO: two pair and sets on four-liners have no floor)
    const vm = P.valueMd ?? 0.85; // per type: the one-pair three-flush multiplier when betting (0.85 = the static markdown)
    if (mf === 0.85) mf = vm;
    if (ms === 0.72) ms = 0.72 + ((vm - 0.85) / 0.07) * 0.1; // 0.85 → 0.72, 0.92 → 0.82
  }
  const kf = mdKeep(ctx.quietFlush ?? -1, ctx) * (f.holdsSuit ? MD_SUIT : 1), ks = mdKeep(ctx.quietStraight ?? -1, ctx);
  const nf = 1 - (1 - mf) * (four ? Math.sqrt(kf) : kf), ns = 1 - (1 - ms) * (fourS ? Math.sqrt(ks) : ks);
  return S0 * nf * ns;
}
// POOL batch 19: fold-cap helpers. The class of a hand for PRO's B ceilings v1.2, and a cap read off the four price
// bands (2.5-3 / 3-4 / 4-6 / 6-10:1, midpoints 2.75 / 3.5 / 5 / 8), linear between them; none below 2.5:1.
export const FOLD_CAP_AIM = 0.85;
const CAP_MIDS = [2.75, 3.5, 5, 8], CAP_EDGES = [3, 4, 6]; // flat outside the midpoints
function foldClassOf(f, st) {
  if (f.tier === TIER.MIDDLE_PAIR) return 'mid';
  if (f.tier === TIER.WEAK_PAIR) return 'weak';
  if (f.tier === TIER.TOP_PAIR_WEAK) return 'tpwk';
  if (f.tier === TIER.TOP_PAIR_GOOD || f.tier === TIER.OVERPAIR_TPTK) return 'tpgk';
  if (st < 2 && f.tier <= TIER.HIGH_CARD && f.straightDraw === 2 && !f.flushDraw && isRealDraw(f)) return 'oesd';
  return null;
}
function capAt(row, r) {
  if (!(r >= 2.5)) return null;
  if (r <= CAP_MIDS[0]) return row[0];
  for (let i = 1; i < 4; i++) {
    if (r <= CAP_MIDS[i]) {
      const a = row[i - 1], b = row[i];
      if (a == null || b == null) return r < CAP_EDGES[i - 1] ? a : b; // a band PRO left open steps in at its edge (MATH)
      return a + ((b - a) * (r - CAP_MIDS[i - 1])) / (CAP_MIDS[i] - CAP_MIDS[i - 1]);
    }
  }
  return row[3];
}
export function postflopPolicy(ctx, P, f) {
  const st = ctx.street - 1; // 0 flop, 1 turn, 2 river
  const extra = Math.max(0, ctx.nOpp - 1);
  // POOL batch 18: shrink the flush and straight markdowns once the betting caps the others' ranges
  // POOL batch 18 (PRO's TPWK floors): recreational players bet "top pair" by its label more than by its kicker, so
  // with nobody betting yet on the turn or river a weak-kicker top pair moves toward top pair good kicker by tpLabel
  const S = boardAwareStrength(ctx, f, P) * (P.tpLabel && f.tier === TIER.TOP_PAIR_WEAK && ctx.toCall === 0 && st > 0 ? 1 + P.tpLabel * 0.167 : 1);
  const out = { fold: 0, check: 0, call: 0, raise: 0, sizes: null };

  if (ctx.toCall === 0) {
    // M7a: a passive player's bet into two or more on the turn or river, and any lead into the previous
    // street's aggressor, needs a real hand.
    // Revision D: checked to me (not a lead into the last aggressor), the others have shown weakness, so
    // M7a and mwTighten are scaled by m7CheckedTo / mwTightenCheckedTo and a per-street shift applies; a
    // flop lead into the preflop raiser uses leadIntoRaiserFlop (turn and river leads keep M7).
    // POOL batch 15 (owner's hand 421): first to act after a street that was checked through (a probe), the table
    // has shown the same weakness as a check to me, so types with probeCT get the checked-to relaxation too
    // ... and on a limped pot's flop (no aggressor at all), first to act is the same spot (QA-OPP)
    const ct = (ctx.checkedTo || (P.probeCT && ((st > 0 && ctx.prevChecked) || (st === 0 && !ctx.preflopRaised)))) && !ctx.aggressorBehind;
    const lead = ctx.aggressorBehind ? (st === 0 && P.leadIntoRaiserFlop != null ? P.leadIntoRaiserFlop : P.leadIntoRaiser) : 0;
    const m7 = (st > 0 ? P.mwPassiveValue * extra * (ct ? P.m7CheckedTo : 1) : 0) + lead;
    // POOL batch 10 (with PRO): out of position with players still to act, a regular gets only part of the checked-to relaxation
    const ctBehind = ct && !ctx.inPosition && P.ctBehindTighten != null;
    const mwT = ct ? (ctBehind ? P.ctBehindTighten : P.mwTightenCheckedTo != null ? P.mwTightenCheckedTo : P.mwTighten) : P.mwTighten;
    const ctShift = ct ? (P.checkedToShift?.[st] ?? 0) * (ctBehind ? P.ctBehindShiftMult ?? 1 : 1) : 0;
    const valueThr = P.valueBet[st] + mwT * extra + valueShiftFor(P, ctx) + m7 + ctShift;
    // MATH range-bots stage 2: a type with rangeRead[0] > 0 moves the strength it bets on toward a range-aware one,
    // "ahead of the hands that continue against my usual thin bet" against the type's bar (rangeBar[street]), put on
    // the strength scale around valueThr. At 0 (or with no range summary) it is today's number exactly. Only how
    // often it bets moves: the sizes below still go by S.
    let Sv = S;
    let rr = P.rangeRead ? P.rangeRead[0] : 0;
    // PRO's twin rule v1.2 (CEO, 19 Nov): for a regular (rangeScaryMw set) the read is damped multiway on a board
    // with a flush or straight the hand does not hold, since passive players check their draws and multiway someone
    // has it more often; on a four-flush or one-card-straight board there is no read at all. Heads-up keeps the read.
    if (rr > 0 && P.rangeScaryMw != null) {
      const mf = f.mdFlush ?? 1, ms = f.mdStraight ?? 1;
      if (mf < 0.7 || ms < 0.9) rr = 0;
      else if ((mf < 1 || ms < 1) && ctx.nOpp >= 2) rr *= P.rangeScaryMw;
    }
    // not when leading into the last street's aggressor: checking to the raiser is a live custom, not range logic (POOL)
    if (rr > 0 && ctx.rtState && ctx.canRaise && !ctx.aggressorBehind) {
      const rd = ctx.rtState.rt.betRead(ctx.rtState, ctx.seat, binOf(f), P.rangeBetFrac);
      // the range-aware number tops out at RANGE_TOP above the threshold (a 95% bet by itself), so a read never
      // removes the last few checks a type keeps; rangeUpOnly types (recreational: they bet the label of the hand)
      // use the read only to bet more often, never less
      // (a hand that is already above that today keeps its own height as the top). The type's habits stay on top of
      // the read: the passive player's multiway value bar and the lead into the raiser (m7) still raise the bar.
      const Sr = valueThr + Math.min(Math.max(P.rangeTop ?? RANGE_TOP, S - valueThr), (rd.ahead - P.rangeBar[st]) * (P.rangeScale ? P.rangeScale[st] : RANGE_SCALE) - m7);
      Sv = S + rr * (Sr - S);
      if (P.rangeUpOnly && Sv < S) Sv = S;
      out.fit = [S - valueThr, rd.ahead]; // for scripts/rangefit.js
    }
    let pValue = soft(Sv, valueThr, 0.035);
    // POOL batch 15 (QA-OPP P2): once the table has checked to me or checked a street through, strong hands slowplay
    // less: slowplay x ctSlowMult (0.5; the nit 0.6), the river already uses 0.25
    // POOL batch 16 (PRO's shape b): also after my own bet or raise on the previous street (or as the preflop raiser
    // on the flop): the table has called, so strong hands keep betting
    const slowCut = (ct || (P.initSlow && ctx.initiative)) && P.ctSlowMult != null;
    // POOL batch 16 (PRO's trap-once): a trips+ hand I already checked last street, with the street checked through,
    // has had its trap; now it bets (slowplay x trapOnce)
    const trappedOnce = P.trapOnce != null && st > 0 && ctx.prevChecked && ctx.iCheckedPrev && f.prevTier >= TIER.STRONG;
    const slowMult = trappedOnce ? P.trapOnce : st < 2 ? (slowCut ? P.ctSlowMult : 1) : 0.25;
    if (f.tier >= TIER.STRONG) pValue *= 1 - P.slowplay * slowMult;
    // M5: strong hands trap out of position multiway, by where the preflop raiser sits; half as
    // often on a wet board. Trapping only ever adds checks.
    if (P.mwTrap3 && !ctx.inPosition && extra >= 1 && f.tier >= TIER.STRONG && st < 2) {
      let rate = ctx.aggressorBehind ? P.mwTrap3[0] : ctx.initiative ? P.mwTrap3[1] : P.mwTrap3[2];
      if (trappedOnce) rate *= P.trapOnce; else if (slowCut) rate *= P.ctSlowMult; // POOL batch 15 (P2), batch 16 (initiative, trap-once)
      if (ctx.wet) rate *= 0.5;
      pValue *= ctx.aggressorBehind ? Math.min(st === 0 && ctx.drawy && P.donkWet != null ? P.donkWet : P.donk, 1 - rate) : 1 - rate;
    } else if (ctx.aggressorBehind) pValue *= st === 0 && ctx.drawy && P.donkWet != null ? P.donkWet : P.donk; // POOL batch 15 (PRO): lead strong hands more on a drawy flop

    let bluff;
    if (ctx.initiative) bluff = st === 0 ? P.cbet[Math.min(extra, 2)] : P.barrel[st - 1];
    else if (ctx.aggressorBehind) bluff = P.stab[st] * 0.25 * P.leadBluffMult; // M7d: passive players rarely bluff-lead into the raiser
    else if (ctx.prevChecked || ctx.inPosition) bluff = P.stab[st];
    else bluff = P.stab[st] * 0.5;
    if (st > 0 || !ctx.initiative) bluff *= Math.pow(1 - P.mwBluffCut, extra);
    // M3: semi-bluffs fall off multiway too, and gutshots (under a quarter of equity) at half the rate.
    if (st < 2 && f.drawEquity >= 0.14) bluff = Math.max(bluff, P.semiBluff * (ctx.aggressorBehind ? 0.4 : 1) * Math.pow(1 - 0.5 * P.mwBluffCut, extra) * (f.drawEquity < 0.25 ? 0.5 : 1));
    // Hands with showdown value mostly check.
    // POOL batch 9 (with PRO): checked to on the river, passive players bluff some of their missed draws (the one live passive bluff)
    if (P.missBluff && st === 2 && ct && f.missedDraw) bluff = Math.max(bluff, P.missBluff * Math.pow(1 - P.mwBluffCut, extra));
    // POOL batch 9: passive players rarely turn pure air into a turn bet
    if (P.turnAirMult != null && st === 1 && f.tier < TIER.WEAK_PAIR && f.drawEquity < 0.14) bluff *= P.turnAirMult;
    if (f.tier >= TIER.TOP_PAIR_WEAK) bluff *= 0.12;
    else if (f.tier >= TIER.WEAK_PAIR) bluff *= 0.3;
    bluff = clamp(bluff * bluffMultFor(P, ctx), 0, 0.97);

    // POOL batch 19a (PRO, rule 1 A's): a strong hand (two pair or better) that bet the flop and the turn, or checked a
    // street that was then checked through, bets the river at least strongRiverFloor [two pair to a straight, full house+]
    // for the types rule 1 counts (abc, station, whale, beginner, nit); not when the river completed a flush or straight,
    // or on a four-liner the hand doesn't beat. Never zero: 1-3% checks remain.
    // On a river that completed a flush or straight the lower floor strongRiverFloorDraw applies (PRO's V5 river floors).
    if (P.strongRiverFloor && st === 2 && ctx.canRaise && (f.tier === TIER.TWO_PAIR || f.tier >= TIER.STRONG) &&
      ((ctx.myBarrels >= 2 && (ctx.initiative || ctx.checkedTo)) || (ctx.prevChecked && ctx.iCheckedPrev)) &&
      !(((f.mdFlush ?? 1) < 0.7 && f.cat < 5) || ((f.mdStraight ?? 1) < 0.9 && f.cat < 4))) {
      const fl = ctx.riverDrawCompleted ? P.strongRiverFloorDraw : P.strongRiverFloor;
      if (fl) pValue = Math.max(pValue, fl[f.cat >= 6 ? 1 : 0]);
    }
    const pBluff = (1 - pValue) * bluff;
    // river block bets (fix 2): medium hands out of position lead small
    const pBlock = P.blockBet && st === 2 && !ctx.inPosition && f.tier >= TIER.WEAK_PAIR && f.tier <= TIER.TOP_PAIR_GOOD ? P.blockBet * Math.max(0, 1 - pValue - pBluff) : 0;
    // checked to on the flop or turn, passive players bet a weak or middle pair "to see where they are" (POOL pass 3)
    const pairStab = st === 1 && P.pairStabTurn != null ? P.pairStabTurn : P.pairStab; // POOL batch 9: fewer weak-pair stabs on the turn
    const pPair = pairStab && ctx.checkedTo && !ctx.aggressorBehind && st < 2 && f.tier >= TIER.WEAK_PAIR && f.tier <= TIER.MIDDLE_PAIR ? pairStab * Math.max(0, 1 - pValue - pBluff - pBlock) : 0;
    let bet = pValue + pBluff + pBlock + pPair;
    if (!ctx.canRaise) bet = 0;
    out.raise = bet;
    out.check = 1 - bet;
    if (bet > 0) {
      const valueW = S >= 0.8 ? P.sizeValue : P.sizeThin;
      out.sizes = betSizes(ctx, mixWeights(mixWeights(mixWeights(valueW, pValue / bet, P.sizeBluff, pBluff / bet), 1, [1, 0, 0, 0, 0], pBlock / bet), 1, P.sizeThin, pPair / bet));
    }
    return out;
  }

  // Facing a bet or raise.
  const facingRaise = ctx.raises >= 2;
  // M1: someone behind or already in may have it: a penalty per player, tapered for careful types.
  const k = (ctx.toActBehind || 0) + (ctx.callersIn || 0);
  let mw = 0;
  if (P.mwSteps) {
    for (let i = 0; i < k; i++) mw += P.mwSteps[Math.min(i, P.mwSteps.length - 1)];
    mw = Math.min(mw, P.mwCap);
  } else mw = P.mwBehind * (ctx.toActBehind || 0) + P.mwCaller * (ctx.callersIn || 0);
  // M7c: river overcalls behind a bet and a call need a real hand; M7b: raised after leading this street.
  if (st === 2 && ctx.callersIn > 0) mw += P.mwRiverCaller * ctx.callersIn;
  // Overcall (POOL, 13 Nov 2026): per caller already in, by street, outside both caps and lifting the
  // never-fold floor. ocSize scales it with the bet against the pot before the bet and the calls.
  let oc = 0;
  if (ctx.callersIn > 0 && P.mwOvercall && (P.mwOvercall?.[st] ?? 0)) {
    const ocBf = ctx.toCall / Math.max(1, ctx.pot - ctx.toCall * (1 + ctx.callersIn));
    oc = (P.mwOvercall?.[st] ?? 0) * ctx.callersIn * (P.ocSize ? Math.pow(Math.max(0.25, ocBf) / 0.5, P.ocSize) : 1);
    if (P.ocStrongMult != null && f.tier >= TIER.OVERPAIR_TPTK && ocBf <= 0.6) oc *= P.ocStrongMult; // POOL batch 16 (14-13): against a bet of about half pot or less, an overpair or TPTK+ is not a marginal overcall
  }
  if (facingRaise && ctx.iBetThisStreet) mw += P.ledRaiseRespect;
  const respect = respectFor(P, ctx, st);
  // Pot-committed: when the call is small next to the pot, the dollar amount stops mattering.
  const committed = ctx.odds < 0.25;
  // Opponents loosen up against someone who has been pushing the table around (ctx.heat),
  // and ctx.shift lets the judge test "what if they are a bit looser or tighter than assumed".
  let callThr =
    P.callThr[st] +
    Math.min(P.sizeCap, P.sizeSens * (ctx.odds - 0.25)) +
    // The more real money a call costs, the more hand people want, whatever the pot odds.
    // Safeguard 1: the money term and the multiway terms are summed and capped, so they cannot stack into a cliff.
    Math.min(
      P.penaltyCap,
      (committed ? 0 : P.absSens * Math.max(0, Math.log2(ctx.toCall / (P.absFrom * ctx.bb)))) + P.mwTighten * extra * P.mwCallTighten + mw,
    ) +
    oc +
    (facingRaise ? P.raiseRespect[st] * (committed ? 0.5 : 1) : 0) +
    (ctx.raises >= 3 ? 0.08 : 0) +
    respect +
    (ctx.shift || 0) -
    (ctx.heat || 0) * (facingRaise ? 0.2 : 0.1);
  // Size and raises scare off weak hands, but each type has a hand it will not fold:
  // "I have top pair, I call" against a bet, a notch stronger against a raise.
  // That floor holds for bets up to about the size of the pot; beyond that it rises with
  // every doubling, a lot for careful players and a little for callers.
  const betFrac = ctx.toCall / Math.max(1, ctx.pot - ctx.toCall);
  callThr = Math.min(
    callThr,
    P.neverFold + respect + (facingRaise ? 0.1 : 0) + (ctx.raises >= 3 ? 0.08 : 0) + (ctx.shift || 0) + Math.min(P.floorCap, P.overFold * Math.max(0, Math.log2(betFrac)) + 0.5 * mw) + oc,
  );
  const raiseThr = P.raiseValue[st] + (facingRaise ? 0.07 : 0) + Math.max(0, respect) * 0.5;

  let pRaiseV = soft(S, raiseThr, 0.03);
  // POOL batch 6, H1: regulars check-raise some top pairs on wet boards (protection and value)
  if (P.tpCheckRaise && st < 2 && ctx.wet && ctx.iChecked && ctx.raises === 1 && f.tier >= TIER.TOP_PAIR_WEAK && f.tier < TIER.TWO_PAIR) pRaiseV = Math.max(pRaiseV, P.tpCheckRaise * (f.tier >= TIER.TOP_PAIR_GOOD ? 1 : 0.5));
  if (st < 2) pRaiseV *= 1 - (P.slowplayFacing != null ? P.slowplayFacing : P.slowplay); // passive types (POOL HX2) flat their monsters more facing a bet
  // Many players call on "I have a pair" without discounting for a scary board.
  const Sc = S + P.textureBlind * (f.raw - S);
  let pCont = soft(Sc, callThr, 0.035);
  if (st < 2 && f.drawEquity > 0) {
    // Draws continue when the price is right; loose players chase without the price.
    const need = ctx.odds * P.chase;
    // POOL batch 16 (rule 3 A's): once the call is 30%+ of the stack, only real draw outs count (overcards don't),
    // so ace-high doesn't call off a stack as a "draw"
    const bigCall = P.realDrawOnStack && ctx.toCall >= 0.3 * (ctx.stack + ctx.myBet);
    // POOL batch 17 (PRO, the missedBluff check): a real draw keeps its full equity (overcards included); a gutshot gets
    // half credit for its overcards; overcards alone count nothing
    const own = f.ownDrawEquity ?? f.drawEquity;
    const eqBig = isRealDraw(f) ? f.drawEquity : f.straightDraw === 1 ? own + 0.5 * (f.overEquity || 0) : own;
    pCont = Math.max(pCont, soft(bigCall ? eqBig : f.drawEquity, need, 0.03));
  }
  // M4 floats; POOL batch 16: not for a call of 30%+ of the stack
  if (st === 0 && ctx.inPosition && !facingRaise && ctx.odds <= 0.3 && !(P.realDrawOnStack && ctx.toCall >= 0.3 * (ctx.stack + ctx.myBet))) pCont = Math.max(pCont, P.float * Math.pow(1 - P.mwBluffCut, extra));
  let pBluffRaise = 0;
  if (S < callThr) {
    pBluffRaise = P.raiseBluff[st];
    // POOL batch 6, H1: regulars' bluff raises lean on draws (flop 25%+ equity, turn 16%+), less on air
    const drawLine = P.airRaiseMult != null ? (st === 0 ? 0.25 : 0.16) : 0.3;
    if (st < 2 && f.drawEquity >= drawLine) pBluffRaise = Math.max(pBluffRaise, P.raiseBluff[st] * 3 + P.semiBluff * 0.15) * (P.drawRaiseMult ?? 1);
    else if (P.airRaiseMult != null && f.drawEquity < 0.14) pBluffRaise *= P.airRaiseMult;
    // passive players' bluff and semi-bluff raises are rarer: a raise from them is mostly a real hand; strong draws keep a bit more (POOL pass 3)
    if (P.passiveRaiseMult != null) pBluffRaise *= st < 2 && f.drawEquity >= 0.3 ? (P.passiveDrawRaiseMult ?? P.passiveRaiseMult) : P.passiveRaiseMult;
    if (facingRaise) pBluffRaise *= 0.4;
    pBluffRaise *= Math.pow(1 - (P.mwRaiseCut ?? P.mwBluffCut), extra); // M2
    // R1 (POOL, Nov 2026): big raises are value at these tables, so a bluff-raise that would put in
    // 40% of the stack or more (or all of it) is rare, except from a maniac.
    if (ctx.canRaise) {
      const main = raiseSizes(ctx, P)[0].to;
      if (main >= ctx.maxTo || main - ctx.myBet >= 0.4 * ctx.stack) pBluffRaise *= P.jamBluffMult;
    }
    pBluffRaise = clamp(pBluffRaise * bluffMultFor(P, ctx), 0, 0.9);
  }
  let raise = pRaiseV + (1 - pRaiseV) * pBluffRaise;
  if (!ctx.canRaise) raise = 0;
  // Once most of the stack is in, strong hands stop folding.
  if (ctx.toCall >= ctx.stack && S >= raiseThr) pCont = 1;
  // POOL batch 9 (with PRO): recreational players are curious and call one turn raise with top pair more often
  if (P.tpRaiseCont && st === 1 && facingRaise && ctx.raises === 2 && ctx.iBetThisStreet && f.tier >= TIER.TOP_PAIR_WEAK && f.tier <= TIER.TOP_PAIR_GOOD) pCont = Math.max(pCont, P.tpRaiseCont);
  // POOL batch 9: a passive player who bet the turn with an overpair or top pair top kicker rarely folds it to one raise
  if (P.opRaiseCont && st === 1 && facingRaise && ctx.raises === 2 && ctx.iBetThisStreet && f.tier === TIER.OVERPAIR_TPTK) pCont = Math.max(pCont, P.opRaiseCont);
  // POOL batch 11 (with PRO): the same on the river, where a recreational who bet top pair pays off one raise more often than not
  if (st === 2 && facingRaise && ctx.raises === 2 && ctx.iBetThisStreet) {
    if (P.tpRaiseContR && f.tier >= TIER.TOP_PAIR_WEAK && f.tier <= TIER.TOP_PAIR_GOOD) pCont = Math.max(pCont, P.tpRaiseContR);
    if (P.opRaiseContR && f.tier === TIER.OVERPAIR_TPTK) pCont = Math.max(pCont, P.opRaiseContR);
  }
  out.raise = raise;
  // Tiny bets (fix 5 v2, QA-VERDICT N3): almost nobody folds at 10 to 1 or better. Facing a single bet as
  // the first to respond (no caller in), the continue share is at least w x (1 - tinyFold x pot odds),
  // where w fades from 1 at a bet of 15% of the pot to 0 at 25%: it binds only on small bets, and never
  // on overcalls (POOL's revision).
  if (!facingRaise && !(ctx.callersIn > 0) && P.tinyFold) {
    const bf = ctx.toCall / Math.max(1, ctx.pot - ctx.toCall);
    const w = clamp((0.25 - bf) / 0.1, 0, 1);
    if (w > 0) pCont = Math.max(pCont, w * (1 - P.tinyFold * ctx.odds));
  }
  // POOL batch 16 (PRO's ceilings): facing one small bet (1/3 pot or less, 4:1 or better), a pair continues at least
  // smallCont [top pair+, middle pair, weak pair], fading out by a half-pot bet. Overcalls included; raises not.
  if (!facingRaise && P.smallCont && !(P.smallContFirstOnly && ctx.callersIn > 0)) { // the solver-style type folds overcalls as equilibrium does
    const bf = ctx.toCall / Math.max(1, ctx.pot - ctx.toCall * (1 + (ctx.callersIn || 0))); // against the pot before the bet and any calls, so an overcall is never treated as cheaper
    const w = clamp((0.5 - bf) / 0.16, 0, 1);
    const g = f.tier >= TIER.TOP_PAIR_WEAK && f.tier <= TIER.OVERPAIR_TPTK ? 0 : f.tier === TIER.MIDDLE_PAIR ? 1 : f.tier === TIER.WEAK_PAIR ? 2 : -1;
    if (g >= 0 && w > 0) pCont = Math.max(pCont, w * (bf <= 0.12 ? Math.max(P.smallCont[g], 0.95) : P.smallCont[g])); // at 8:1 or better any pair calls 95%+, overcalls too (POOL)
  }
  // POOL batch 18 (PRO's A on 05-28, CEO): at 10:1 or better on the effective call (the call is 10% of the final pot
  // or less, e.g. the last chips against a bigger all-in), any pair or real draw continues; raises and overcalls too.
  // PRO: the pair must use a hole card (a board pair alone is tier HIGH_CARD or AIR, so it is out); no draws on the river
  if (ctx.odds <= ODDS_FLOOR_AT && (f.tier >= TIER.WEAK_PAIR || (st < 2 && isRealDraw(f)))) pCont = Math.max(pCont, ODDS_FLOOR);
  // POOL batch 19 (PRO review 2, B ceilings v1.2): per-type fold caps facing a single bet (not a raise, first caller only), by price band.
  // Passive live players over-call rather than over-fold, so for the cells over PRO's ceilings the continue share is at
  // least 1 - 0.85 x cap(price). foldCap: { mid, weak, oesd, tpgk, tpwk: [flop, turn, river] }, each street null or
  // [caps in % at 2.5-3 / 3-4 / 4-6 / 6-10:1]. A pair must use a hole card (tier WEAK_PAIR or better), so a counterfeited
  // pair or a hand that plays the board is never forced in (STRAT's guard A). The top-pair caps (the nit) skip a
  // four-flush the bot has no card of and a one-card straight it doesn't hold (rule 2's v3.2 exemptions).
  if (P.foldCap && !facingRaise && ctx.toCall > 0) {
    let fc = foldClassOf(f, st);
    // no full call ahead (MATH; PRO: rule 2's text, an all-in call for less doesn't count): overcalls keep mwOvercall, and a
    // caller ahead makes the price look better than the ranges are (test/overcall.test.js)
    if ((ctx.fullCallersIn ?? ctx.callersIn) > 0) fc = null; // a hand-built ctx without fullCallersIn falls back to callersIn
    const row = fc && P.foldCap[fc] ? P.foldCap[fc][st] : null;
    const exempt = (fc === 'tpgk' || fc === 'tpwk') && (((f.mdFlush ?? 1) < 0.7 && !f.holdsSuit) || (f.mdStraight ?? 1) < 0.9);
    const cap = row && !exempt ? capAt(row, (1 - ctx.odds) / Math.max(1e-9, ctx.odds)) : null;
    if (cap != null) pCont = Math.max(pCont, 1 - FOLD_CAP_AIM * cap / 100);
  }
  // POOL batch 19a (PRO, rule 2 A's): facing a flop or turn raise with TPGK+/overpair at 4:1 or better, the fold is
  // capped at raiseFoldCap.tpgk [flop, turn] % (aimed at 0.85); the river raise is parked with the rubric items
  if (P.raiseFoldCap && facingRaise && ctx.raises === 2 && st < 2 && foldClassOf(f, st) === 'tpgk' && (1 - ctx.odds) / Math.max(1e-9, ctx.odds) >= 4 &&
    !(((f.mdFlush ?? 1) < 0.7 && !f.holdsSuit) || (f.mdStraight ?? 1) < 0.9)) {
    const cap = P.raiseFoldCap.tpgk?.[st];
    if (cap != null) pCont = Math.max(pCont, 1 - (FOLD_CAP_AIM * cap) / 100);
  }
  // POOL batch 19b (PRO's stab-fold ceilings, PRO_RUBRIC.md): a regular heads-up facing one stab after a street that was
  // checked through folds at most stabFoldCap (aimed at 0.85), for bets up to 75% pot (a bigger probe is weighted to value).
  //  river: wm [<=40%, 40-75%] for weak/middle pair; tpgk/tpwk/tptk { dry, paired, comp (the river completed a flush or
  //  straight), flush (three-flush or four-straight already there) }; a four-flush the bot has no card of has no cap.
  //  turn: wm [null, 40-75%]; tp (top pair or better) one cap.
  if (P.stabFoldCap && ctx.nOpp === 1 && ctx.raises === 1 && ctx.prevChecked && st > 0 && ctx.toCall > 0) {
    const bf = ctx.toCall / Math.max(1, ctx.pot - ctx.toCall);
    const C = st === 2 ? P.stabFoldCap.river : P.stabFoldCap.turn;
    let cap = null;
    if (C && bf <= 0.75) {
      const sz = bf <= 0.4 ? 0 : 1;
      if (f.tier === TIER.WEAK_PAIR || f.tier === TIER.MIDDLE_PAIR) cap = C.wm?.[sz] ?? null;
      else if (st === 1 && f.tier >= TIER.TOP_PAIR_WEAK) cap = C.tp ?? null;
      else if (st === 2 && f.tier >= TIER.TOP_PAIR_WEAK && f.tier <= TIER.OVERPAIR_TPTK && !((f.mdFlush ?? 1) < 0.7 && !f.holdsSuit)) {
        const k = f.tier === TIER.TOP_PAIR_WEAK ? 'tpwk' : f.tier === TIER.TOP_PAIR_GOOD ? 'tpgk' : 'tptk';
        const bc = ctx.riverDrawCompleted ? 'comp' : (f.mdFlush ?? 1) < 1 || (f.mdStraight ?? 1) < 0.9 ? 'flush' : ctx.boardPaired ? 'paired' : 'dry';
        cap = C[k]?.[bc] ?? null;
      }
    }
    if (cap != null) pCont = Math.max(pCont, 1 - (FOLD_CAP_AIM * cap) / 100);
  }
  // POOL batch 19 (PRO ceiling (c)): continuing for 10-30bb with no pair and no real draw is capped per type at
  // airContCap [heads-up, multiway] (%, aimed at 0.85 of PRO's ceiling); 30bb+ stays with airCallOff
  if (P.airContCap && f.tier <= TIER.HIGH_CARD && !isRealDraw(f) && ctx.toCall >= 10 * ctx.bb && ctx.toCall < 30 * ctx.bb && !(ctx.toCall >= ctx.stack && ctx.toCall >= 20 * ctx.bb)) {
    const cap = (FOLD_CAP_AIM * P.airContCap[ctx.nOpp >= 2 ? 1 : 0]) / 100;
    raise = Math.min(raise, cap);
    out.raise = raise;
    pCont = Math.min(pCont, raise < 1 ? (cap - raise) / (1 - raise) : 0);
  }
  // POOL batch 17 (PRO ceiling 6, B clarification 17 Nov 2026): calling off a stack or 30bb+ with no pair and no real
  // draw is capped per type at airCallOff [ace/king-high, worse], halved against two or more opponents
  // (PRO: only with 20bb+ at stake, as rule 3; the cap holds for raise and call together)
  if (P.airCallOff && f.tier <= TIER.HIGH_CARD && !isRealDraw(f) && (ctx.toCall >= 30 * ctx.bb || (ctx.toCall >= ctx.stack && ctx.toCall >= 20 * ctx.bb))) {
    const cap = P.airCallOff[f.tier === TIER.HIGH_CARD ? 0 : 1] * (ctx.nOpp >= 2 ? 0.5 : 1);
    raise = Math.min(raise, cap);
    out.raise = raise;
    pCont = Math.min(pCont, raise < 1 ? (cap - raise) / (1 - raise) : 0);
  }
  out.call = (1 - raise) * pCont;
  out.fold = Math.max(0, 1 - out.raise - out.call);
  if (raise > 0) out.sizes = raiseSizes(ctx, P);
  return out;
}

// ---------------------------------------------------------------------------------------
// Sampling and likelihoods.

export function sampleAction(pol, rng) {
  let r = rng();
  if ((r -= pol.raise) < 0 && pol.sizes) {
    let q = rng();
    for (const sz of pol.sizes) {
      if ((q -= sz.p) < 0) return { type: 'raise', to: sz.to };
    }
    return { type: 'raise', to: pol.sizes[pol.sizes.length - 1].to };
  }
  if ((r -= pol.call) < 0) return { type: 'call' };
  if ((r -= pol.check) < 0) return { type: 'check' };
  if (pol.fold > 0) return { type: 'fold' };
  return pol.check > 0 ? { type: 'check' } : { type: 'call' };
}

const FLOOR = 1e-5;

// Probability that this policy produces the observed action (raise sizes matched to the
// nearest size the policy considers).
export function actionLikelihood(pol, action) {
  const t = action.type === 'bet' ? 'raise' : action.type;
  if (t === 'raise') {
    if (!pol.sizes || pol.raise <= 0) return FLOOR;
    let best = pol.sizes[0];
    let bd = Infinity;
    for (const sz of pol.sizes) {
      const d = Math.abs(Math.log(sz.to / action.to));
      if (d < bd) {
        bd = d;
        best = sz;
      }
    }
    return Math.max(FLOOR, pol.raise * best.p);
  }
  return Math.max(FLOOR, pol[t] || 0);
}
