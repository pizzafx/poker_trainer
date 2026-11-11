// No-limit hold'em hand state machine: blinds, optional straddle, betting rounds,
// all-ins, side pots, rake. All amounts are whole dollars.
//
// State is a plain object so it can be cloned cheaply for simulation.

import { fullDeck, drawRandom, removeCard } from './cards.js';
import { evaluate } from './evaluator.js';

export const STREET = { PRE: 0, FLOP: 1, TURN: 2, RIVER: 3, DONE: 4 };
export const STREET_NAMES = ['preflop', 'flop', 'turn', 'river', 'done'];

export const DEFAULT_RAKE = { pct: 0.1, cap: 5, promo: 0, noFlopNoDrop: true };

// cfg: { stacks, button, sb, bb, straddle?, rake?, rng, hole? }
// `hole` may give fixed hole cards per seat (array of [c1, c2] or null).
export function newHand(cfg) {
  const n = cfg.stacks.length;
  if (n < 2) throw new Error('need at least 2 players');
  const s = {
    n,
    button: cfg.button,
    sbAmt: cfg.sb,
    bbAmt: cfg.bb,
    straddleAmt: cfg.straddle || 0,
    rake: cfg.rake || DEFAULT_RAKE,
    stacks: cfg.stacks.slice(),
    startStacks: cfg.stacks.slice(),
    folded: new Array(n).fill(false),
    allIn: new Array(n).fill(false),
    acted: new Array(n).fill(false),
    bet: new Array(n).fill(0), // chips put in on the current street
    total: new Array(n).fill(0), // chips put in over the whole hand
    hole: new Array(n).fill(null),
    board: [],
    remaining: fullDeck(),
    street: STREET.PRE,
    toAct: -1,
    currentBet: 0,
    minRaise: cfg.bb,
    lastRaiser: -1,
    raises: 0, // bets and raises made on the current street
    sawFlop: false,
    history: [],
    done: false,
    result: null,
    sbSeat: -1,
    bbSeat: -1,
    straddleSeat: -1,
  };

  if (cfg.hole) {
    for (let i = 0; i < n; i++) {
      if (cfg.hole[i]) {
        s.hole[i] = cfg.hole[i].slice();
        for (const c of s.hole[i]) {
          if (!removeCard(s.remaining, c)) throw new Error('duplicate hole card');
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (!s.hole[i]) {
      s.hole[i] = [drawRandom(s.remaining, cfg.rng), drawRandom(s.remaining, cfg.rng)];
    }
  }

  if (n === 2) {
    s.sbSeat = s.button;
    s.bbSeat = (s.button + 1) % n;
  } else {
    s.sbSeat = (s.button + 1) % n;
    s.bbSeat = (s.button + 2) % n;
  }
  post(s, s.sbSeat, s.sbAmt, 'sb');
  post(s, s.bbSeat, s.bbAmt, 'bb');
  let last = s.bbSeat;
  s.currentBet = s.bbAmt;
  if (s.straddleAmt > 0 && n >= 4) {
    s.straddleSeat = (s.bbSeat + 1) % n;
    post(s, s.straddleSeat, s.straddleAmt, 'straddle');
    s.currentBet = s.straddleAmt;
    s.minRaise = s.straddleAmt;
    last = s.straddleSeat;
  }
  s.toAct = nextToAct(s, last);
  if (s.toAct < 0) endStreet(s, cfg.rng);
  return s;
}

function post(s, seat, amt, type) {
  const put = Math.min(amt, s.stacks[seat]);
  s.stacks[seat] -= put;
  s.bet[seat] += put;
  s.total[seat] += put;
  if (s.stacks[seat] === 0) s.allIn[seat] = true;
  s.history.push({ seat, street: s.street, type, amount: put, to: s.bet[seat] });
}

function canActCount(s) {
  let k = 0;
  for (let i = 0; i < s.n; i++) if (!s.folded[i] && !s.allIn[i]) k++;
  return k;
}

function liveCount(s) {
  let k = 0;
  for (let i = 0; i < s.n; i++) if (!s.folded[i]) k++;
  return k;
}

// Next seat after `from` that still owes a decision, or -1 if the round is closed.
function nextToAct(s, from) {
  const others = canActCount(s);
  for (let k = 1; k <= s.n; k++) {
    const i = (from + k) % s.n;
    if (s.folded[i] || s.allIn[i]) continue;
    if (s.bet[i] < s.currentBet) return i;
    // Bet is matched: only needs to act if not yet acted and someone else could respond.
    if (!s.acted[i] && others > 1) return i;
  }
  return -1;
}

// What the player to act may do.
export function legal(s) {
  const seat = s.toAct;
  const stack = s.stacks[seat];
  const owed = s.currentBet - s.bet[seat];
  const callAmt = Math.min(owed, stack);
  const maxTo = s.bet[seat] + stack;
  // A player who already acted and now faces only a short all-in raise may not re-raise.
  const canRaise = stack > owed && !s.acted[seat] && canActCount(s) > 1;
  const minTo = Math.min(s.currentBet + s.minRaise, maxTo);
  return {
    seat,
    canFold: owed > 0,
    canCheck: owed === 0,
    canCall: owed > 0,
    callAmt,
    canRaise,
    minTo: canRaise ? minTo : 0,
    maxTo: canRaise ? maxTo : 0,
    pot: potSize(s),
  };
}

export function potSize(s) {
  let p = 0;
  for (let i = 0; i < s.n; i++) p += s.total[i];
  return p;
}

// action: { type: 'fold' | 'check' | 'call' | 'raise', to? }
// 'raise' covers both opening bets and raises; `to` is the total bet for this street.
export function applyAction(s, action, rng) {
  if (s.done) throw new Error('hand is over');
  const seat = s.toAct;
  const L = legal(s);
  let type = action.type;
  if (type === 'bet') type = 'raise';
  if (type === 'check' && !L.canCheck) throw new Error('cannot check facing a bet');
  if (type === 'fold' && !L.canFold) type = 'check'; // never fold for free
  if (type === 'call' && !L.canCall) type = 'check';
  if (type === 'raise' && !L.canRaise) type = L.canCall ? 'call' : 'check';

  if (type === 'fold') {
    s.folded[seat] = true;
    s.history.push({ seat, street: s.street, type: 'fold', amount: 0, to: s.bet[seat] });
  } else if (type === 'check') {
    s.history.push({ seat, street: s.street, type: 'check', amount: 0, to: s.bet[seat] });
  } else if (type === 'call') {
    const put = L.callAmt;
    s.stacks[seat] -= put;
    s.bet[seat] += put;
    s.total[seat] += put;
    if (s.stacks[seat] === 0) s.allIn[seat] = true;
    s.history.push({ seat, street: s.street, type: 'call', amount: put, to: s.bet[seat] });
  } else if (type === 'raise') {
    let to = Math.round(action.to);
    if (!(to >= L.minTo)) to = L.minTo;
    if (to > L.maxTo) to = L.maxTo;
    const put = to - s.bet[seat];
    const raiseBy = to - s.currentBet;
    const isBet = s.currentBet === 0;
    s.stacks[seat] -= put;
    s.bet[seat] = to;
    s.total[seat] += put;
    if (s.stacks[seat] === 0) s.allIn[seat] = true;
    if (raiseBy >= s.minRaise) {
      // Full raise: reopens the action for everyone else.
      s.minRaise = raiseBy;
      for (let i = 0; i < s.n; i++) if (i !== seat) s.acted[i] = false;
    }
    s.currentBet = to;
    s.lastRaiser = seat;
    s.raises++;
    s.history.push({
      seat,
      street: s.street,
      type: isBet ? 'bet' : 'raise',
      amount: put,
      to,
      allIn: s.allIn[seat],
    });
  } else {
    throw new Error(`unknown action ${action.type}`);
  }
  s.acted[seat] = true;

  if (liveCount(s) === 1) {
    refundUncalled(s);
    finish(s, false);
    return s;
  }
  s.toAct = nextToAct(s, seat);
  if (s.toAct < 0) endStreet(s, rng);
  return s;
}

// Return the unmatched part of the largest bet on this street to its owner.
function refundUncalled(s) {
  let top = -1;
  let max = 0;
  let second = 0;
  for (let i = 0; i < s.n; i++) {
    const b = s.bet[i];
    if (b > max) {
      second = max;
      max = b;
      top = i;
    } else if (b > second) {
      second = b;
    }
  }
  if (top >= 0 && max > second && !s.folded[top]) {
    const back = max - second;
    s.bet[top] -= back;
    s.total[top] -= back;
    s.stacks[top] += back;
    if (s.stacks[top] > 0) s.allIn[top] = false;
    s.currentBet = second;
  }
}

function endStreet(s, rng) {
  refundUncalled(s);
  for (;;) {
    for (let i = 0; i < s.n; i++) {
      s.bet[i] = 0;
      s.acted[i] = false;
    }
    s.currentBet = 0;
    s.minRaise = s.bbAmt;
    s.raises = 0;
    s.lastRaiser = -1;
    s.street++;
    if (s.street > STREET.RIVER) {
      finish(s, true);
      return;
    }
    const deal = s.street === STREET.FLOP ? 3 : 1;
    // `plan` (used by simulations) fixes the cards to come so options can be compared on the same run-out.
    for (let k = 0; k < deal; k++) s.board.push(s.plan ? s.plan[s.board.length] : drawRandom(s.remaining, rng));
    if (s.street === STREET.FLOP) s.sawFlop = true;
    if (canActCount(s) >= 2) {
      s.toAct = nextToAct(s, s.button);
      if (s.toAct >= 0) return;
    }
    // Zero or one player can still bet: run the board out.
  }
}

// Split the money into main and side pots from each player's total contribution.
export function buildPots(s) {
  const contrib = s.total.slice();
  const pots = [];
  for (;;) {
    let min = Infinity;
    for (let i = 0; i < s.n; i++) {
      if (!s.folded[i] && contrib[i] > 0 && contrib[i] < min) min = contrib[i];
    }
    if (min === Infinity) break;
    let amount = 0;
    const eligible = [];
    for (let i = 0; i < s.n; i++) {
      if (!s.folded[i] && contrib[i] >= min) eligible.push(i);
      const take = Math.min(contrib[i], min);
      contrib[i] -= take;
      amount += take;
    }
    pots.push({ amount, eligible });
  }
  // Dead money left over from folded players goes to the last pot.
  let left = 0;
  for (let i = 0; i < s.n; i++) left += contrib[i];
  if (left > 0) {
    if (pots.length) pots[pots.length - 1].amount += left;
    else pots.push({ amount: left, eligible: [] });
  }
  return pots;
}

export function rakeFor(s, pot) {
  const r = s.rake;
  if (!r) return 0;
  if (r.noFlopNoDrop && !s.sawFlop) return 0;
  // `fixed` is a flat per-hand drop (California style); otherwise a capped percentage.
  const base = r.fixed != null ? r.fixed : Math.min(r.cap, Math.floor(pot * r.pct));
  const fee = base + (r.promo || 0);
  return Math.min(fee, pot);
}

function finish(s, showdown) {
  s.done = true;
  s.toAct = -1;
  s.street = STREET.DONE;
  const pots = buildPots(s);
  const pot = pots.reduce((a, p) => a + p.amount, 0);
  let rake = rakeFor(s, pot);
  const rakeTaken = rake;
  for (const p of pots) {
    const t = Math.min(rake, p.amount);
    p.amount -= t;
    rake -= t;
  }

  const won = new Array(s.n).fill(0);
  const scores = new Array(s.n).fill(-1);
  const contested = showdown && liveCount(s) > 1;
  if (contested) {
    for (let i = 0; i < s.n; i++) {
      if (!s.folded[i]) scores[i] = evaluate([...s.hole[i], ...s.board]);
    }
  }
  for (const p of pots) {
    let winners;
    if (!contested || p.eligible.length === 1) {
      winners = p.eligible.length ? [p.eligible[0]] : [];
      if (!contested) {
        for (let i = 0; i < s.n; i++) if (!s.folded[i]) winners = [i];
      }
    } else {
      let best = -1;
      winners = [];
      for (const i of p.eligible) {
        if (scores[i] > best) {
          best = scores[i];
          winners = [i];
        } else if (scores[i] === best) {
          winners.push(i);
        }
      }
    }
    p.winners = winners;
    if (!winners.length) continue;
    const share = Math.floor(p.amount / winners.length);
    let odd = p.amount - share * winners.length;
    for (const i of winners) won[i] += share;
    // Odd chips go to the first winner left of the button.
    for (let k = 1; k <= s.n && odd > 0; k++) {
      const i = (s.button + k) % s.n;
      if (winners.includes(i)) {
        won[i]++;
        odd--;
      }
    }
  }
  for (let i = 0; i < s.n; i++) s.stacks[i] += won[i];
  s.result = {
    showdown: contested,
    pots,
    pot,
    rake: rakeTaken,
    won,
    scores,
    net: s.stacks.map((v, i) => v - s.startStacks[i]),
  };
}

export function cloneState(s) {
  return {
    ...s,
    stacks: s.stacks.slice(),
    folded: s.folded.slice(),
    allIn: s.allIn.slice(),
    acted: s.acted.slice(),
    bet: s.bet.slice(),
    total: s.total.slice(),
    hole: s.hole.map((h) => (h ? h.slice() : h)),
    board: s.board.slice(),
    remaining: s.remaining.slice(),
    history: s.history.slice(),
    result: null,
  };
}

// Seat order labels for a full-ring table, counted from the button.
export function positionName(s, seat) {
  const n = s.n;
  const off = (seat - s.button + n) % n; // 0 = button
  if (n === 2) return off === 0 ? 'BTN/SB' : 'BB';
  if (off === 0) return 'BTN';
  if (off === 1) return 'SB';
  if (off === 2) return 'BB';
  const fromEnd = n - off; // 1 = cutoff
  if (fromEnd === 1) return 'CO';
  if (fromEnd === 2) return 'HJ';
  if (fromEnd === 3) return 'LJ';
  const early = off - 2; // 1 = under the gun
  return early === 1 ? 'UTG' : `UTG+${early - 1}`;
}
