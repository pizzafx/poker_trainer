// Opponent decision model. A policy maps (public situation, player profile, hand) to
// probabilities over fold / check / call / raise plus a distribution over raise sizes.
// The same function drives the bots, the range tracker (as a likelihood) and the judge.

import { legal, potSize, STREET } from '../engine/game.js';
import { TIER } from '../engine/features.js';

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
  const pot = potSize(s);
  const ctx = {
    seat,
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
    ctx.base = s.straddleAmt > 0 && s.straddleSeat >= 0 ? s.straddleAmt : s.bbAmt;
    let limpers = 0;
    let callers = 0;
    let iRaised = false;
    let iLimped = false;
    let raisesSeen = 0;
    let raiserPos = -1;
    for (const h of s.history) {
      if (h.type === 'raise') {
        raisesSeen++;
        callers = 0;
        if (h.seat === seat) iRaised = true;
        raiserPos = h.seat;
      } else if (h.type === 'call') {
        if (raisesSeen === 0) {
          if (!s.folded[h.seat]) limpers++;
        } else if (!s.folded[h.seat]) callers++;
        if (h.seat === seat) iLimped = true;
      }
    }
    ctx.limpers = limpers;
    ctx.callers = callers;
    ctx.iRaised = iRaised;
    ctx.iLimped = iLimped && !iRaised;
    ctx.raiseBB = s.currentBet / ctx.base;
    // Acts after the raiser postflop?
    ctx.ipVsRaiser =
      raiserPos >= 0 && (seat - s.button - 1 + 2 * n) % n > (raiserPos - s.button - 1 + 2 * n) % n;
    ctx.effBB = Math.min(s.stacks[seat] + s.bet[seat], maxOtherStack(s, seat)) / s.bbAmt;
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
  const commit = 0.4 * ctx.maxTo;
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

export function preflopPolicy(ctx, P, cls) {
  const rp = P.raisePct[cls];
  const pp = P.playPct[cls];
  let raise = 0;
  let call = 0;
  const depth = clamp(100 / Math.max(10, ctx.effBB), 0.7, 3); // short stacks get it in lighter

  if (ctx.raises === 0) {
    const width = P.pfr[ctx.pos] * (ctx.limpers ? P.isoFactor : 1);
    raise = inTop(rp, width);
    if (rp > 0.99) raise *= 1 - P.limpTrap;
    const playWidth = P.vpip[ctx.pos] * (1 + 0.06 * ctx.limpers);
    const enter = Math.max(raise, inTop(pp, playWidth), rp > 0.99 ? 1 : 0);
    const limpShare = ctx.limpers ? P.overLimp : P.openLimp;
    // The small blind completes cheaply; the big blind checks for free.
    const cheap = ctx.pos === POS.SB ? Math.max(limpShare, 0.6) : limpShare;
    call = (enter - raise) * (rp > 0.99 ? 1 : cheap);
  } else if (ctx.raises === 1) {
    const value = inTop(rp, P.threeBet * depth);
    const inBand = rp < 1 - P.threeBet && rp > 1 - P.threeBet - 0.09;
    const bluff = inBand ? P.threeBetBluff : 0;
    raise = value + (1 - value) * bluff;
    const elastic = clamp(1 - (P.callElastic * (ctx.raiseBB - 5)) / 5, 0.2, 1.4);
    let width = P.callRaise * elastic * (1 + P.callCrowd * ctx.callers);
    if (ctx.pos === POS.LP || ctx.pos === POS.BB) width *= 1.2;
    if (ctx.iLimped) width *= P.limpCall;
    if (ctx.toCall >= 0.35 * (ctx.stack + ctx.myBet)) width = Math.min(width, P.stackOff * depth * 2);
    call = (1 - raise) * inTop(Math.max(pp, rp), width);
  } else {
    // Facing a 3-bet or more.
    const mix = 0.5 * (rp + pp);
    const cold = !ctx.iRaised && !ctx.iLimped && ctx.myBet <= ctx.base;
    const bigDecision = ctx.toCall >= 0.3 * (ctx.stack + ctx.myBet) || ctx.raises >= 3;
    if (bigDecision) {
      const w = P.stackOff * depth * (cold ? 0.7 : 1);
      const go = inTop(rp, w);
      raise = go * 0.6;
      call = go * 0.4;
    } else {
      const rw = P.fourBet * depth * (cold ? 0.7 : 1);
      const value = inTop(rp, rw);
      const inBand = rp < 1 - rw && rp > 1 - rw - 0.05;
      raise = value + (1 - value) * (inBand ? P.fourBetBluff : 0);
      const cw = P.callThreeBet * (cold ? 0.5 : 1) * (1 + 0.5 * P.callCrowd * ctx.callers);
      call = (1 - raise) * inTop(mix, cw);
    }
    if (P.exploit && ctx.villain) {
      // Tight players' re-raises are the top of their range: continue tighter.
      const k = clamp(0.4 + 1.2 * ctx.villain.aggro, 0.35, 1.3);
      call *= k;
      if (rp < 0.985) raise *= k;
    }
  }

  if (!ctx.canRaise) {
    call += raise;
    raise = 0;
  }
  const out = { fold: 0, check: 0, call: 0, raise, sizes: null };
  if (ctx.canCheck) {
    out.check = 1 - raise;
  } else {
    out.call = Math.min(call, 1 - raise);
    out.fold = Math.max(0, 1 - raise - out.call);
  }
  if (raise > 0) out.sizes = preflopSizes(ctx, P, rp > 0.972);
  return out;
}

// ---------------------------------------------------------------------------------------
// Postflop.

function betSizes(ctx, weights) {
  const acc = new Map();
  let total = 0;
  for (let i = 0; i < BET_FRACS.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    let to = roundChips(BET_FRACS[i] * ctx.pot);
    if (to >= 0.7 * ctx.maxTo) to = ctx.maxTo;
    to = clamp(to, ctx.minTo, ctx.maxTo);
    acc.set(to, (acc.get(to) || 0) + w);
    total += w;
  }
  const out = [];
  for (const [to, w] of acc) out.push({ to, p: w / total });
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

export function postflopPolicy(ctx, P, f) {
  const st = ctx.street - 1; // 0 flop, 1 turn, 2 river
  const extra = Math.max(0, ctx.nOpp - 1);
  const S = f.strength;
  const out = { fold: 0, check: 0, call: 0, raise: 0, sizes: null };

  if (ctx.toCall === 0) {
    const valueThr = P.valueBet[st] + P.mwTighten * extra + valueShiftFor(P, ctx);
    let pValue = soft(S, valueThr, 0.035);
    if (f.tier >= TIER.STRONG) pValue *= 1 - P.slowplay * (st < 2 ? 1 : 0.25);
    if (ctx.aggressorBehind) pValue *= P.donk;

    let bluff;
    if (ctx.initiative) bluff = st === 0 ? P.cbet[Math.min(extra, 2)] : P.barrel[st - 1];
    else if (ctx.aggressorBehind) bluff = P.stab[st] * 0.25;
    else if (ctx.prevChecked || ctx.inPosition) bluff = P.stab[st];
    else bluff = P.stab[st] * 0.5;
    if (st > 0 || !ctx.initiative) bluff *= Math.pow(1 - P.mwBluffCut, extra);
    if (st < 2 && f.drawEquity >= 0.14) bluff = Math.max(bluff, P.semiBluff * (ctx.aggressorBehind ? 0.4 : 1));
    // Hands with showdown value mostly check.
    if (f.tier >= TIER.TOP_PAIR_WEAK) bluff *= 0.12;
    else if (f.tier >= TIER.WEAK_PAIR) bluff *= 0.3;
    bluff = clamp(bluff * bluffMultFor(P, ctx), 0, 0.97);

    const pBluff = (1 - pValue) * bluff;
    let bet = pValue + pBluff;
    if (!ctx.canRaise) bet = 0;
    out.raise = bet;
    out.check = 1 - bet;
    if (bet > 0) {
      const valueW = S >= 0.8 ? P.sizeValue : P.sizeThin;
      out.sizes = betSizes(ctx, mixWeights(valueW, pValue / bet, P.sizeBluff, pBluff / bet));
    }
    return out;
  }

  // Facing a bet or raise.
  const facingRaise = ctx.raises >= 2;
  const respect = respectFor(P, ctx, st);
  // Pot-committed: when the call is small next to the pot, the dollar amount stops mattering.
  const committed = ctx.odds < 0.25;
  // Opponents loosen up against someone who has been pushing the table around (ctx.heat),
  // and ctx.shift lets the judge test "what if they are a bit looser or tighter than assumed".
  let callThr =
    P.callThr[st] +
    Math.min(P.sizeCap, P.sizeSens * (ctx.odds - 0.25)) +
    // The more real money a call costs, the more hand people want, whatever the pot odds.
    (committed ? 0 : P.absSens * Math.max(0, Math.log2(ctx.toCall / (P.absFrom * ctx.bb)))) +
    P.mwTighten * extra * 0.5 +
    (facingRaise ? P.raiseRespect[st] * (committed ? 0.5 : 1) : 0) +
    (ctx.raises >= 3 ? 0.08 : 0) +
    respect +
    (ctx.shift || 0) -
    (ctx.heat || 0) * (facingRaise ? 0.2 : 0.1);
  // Size and raises scare off weak hands, but each type has a hand it will not fold:
  // "I have top pair, I call" against a bet, a notch stronger against a raise.
  callThr = Math.min(callThr, P.neverFold + respect + (facingRaise ? 0.1 : 0) + (ctx.raises >= 3 ? 0.08 : 0));
  const raiseThr = P.raiseValue[st] + (facingRaise ? 0.07 : 0) + Math.max(0, respect) * 0.5;

  let pRaiseV = soft(S, raiseThr, 0.03);
  if (st < 2) pRaiseV *= 1 - P.slowplay;
  // Many players call on "I have a pair" without discounting for a scary board.
  const Sc = S + P.textureBlind * (f.raw - S);
  let pCont = soft(Sc, callThr, 0.035);
  if (st < 2 && f.drawEquity > 0) {
    // Draws continue when the price is right; loose players chase without the price.
    const need = ctx.odds * P.chase;
    pCont = Math.max(pCont, soft(f.drawEquity, need, 0.03));
  }
  if (st === 0 && ctx.inPosition && !facingRaise && ctx.odds <= 0.3) pCont = Math.max(pCont, P.float);
  let pBluffRaise = 0;
  if (S < callThr) {
    pBluffRaise = P.raiseBluff[st];
    if (st < 2 && f.drawEquity >= 0.3) pBluffRaise = Math.max(pBluffRaise, P.raiseBluff[st] * 3 + P.semiBluff * 0.15);
    if (facingRaise) pBluffRaise *= 0.4;
    pBluffRaise = clamp(pBluffRaise * bluffMultFor(P, ctx), 0, 0.9);
  }
  let raise = pRaiseV + (1 - pRaiseV) * pBluffRaise;
  if (!ctx.canRaise) raise = 0;
  // Once most of the stack is in, strong hands stop folding.
  if (ctx.toCall >= ctx.stack && S >= raiseThr) pCont = 1;
  out.raise = raise;
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
