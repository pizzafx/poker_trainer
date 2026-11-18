// Range tracker (MATH spike, notes/MATH_RANGE_BOTS.md): a public summary of what each player can still hold,
// as a histogram over strength bins, moved by table lookups on every action and every new card. It uses only
// the board and the action, so every player, the judge and the coach see the same one.
//
// Bins: the ten hand tiers, with "nothing" and "ace or king high" each split by whether the hand has a draw
// (a draw improves far more often, and bets and calls far more often, than the rest of its tier).
import { STREET, legal, potSize } from '../engine/game.js';
import { TIER } from '../engine/features.js';

export const B = 12;
export const binOf = (f) => (f.tier <= TIER.HIGH_CARD ? f.tier * 2 + (f.drawEquity >= 0.14 ? 1 : 0) : f.tier + 2);
// the order used for "ahead of": a draw ranks with its made tier
export const RANK = Int8Array.from({ length: B }, (_, b) => (b < 4 ? b >> 1 : b - 2));

export const ROLES = 5; // 0 unraised pot, 1 the raiser, 2 called a raise, 3 the last re-raiser, 4 called a re-raise
export const FCLASS = 3; // 0 paired flop, 1 three of a suit, 2 other
export const EVENTS = 6; // 0 blank, 1 pairs the board, 2 third of a suit, 3 fourth of a suit, 4 straight card, 5 overcard
export const NSIT = 60;

export function flopClass(board) {
  const r0 = board[0] >> 2;
  const r1 = board[1] >> 2;
  const r2 = board[2] >> 2;
  if (r0 === r1 || r0 === r2 || r1 === r2) return 0;
  if ((board[0] & 3) === (board[1] & 3) && (board[0] & 3) === (board[2] & 3)) return 1;
  return 2;
}

function connected(board, len) {
  let mask = 0;
  for (let i = 0; i < len; i++) mask |= 1 << (board[i] >> 2);
  const ranks = ((mask << 1) | ((mask >> 12) & 1)) & 0x3fff;
  let best = 0;
  for (let lo = 0; lo <= 9; lo++) {
    let k = 0;
    for (let i = 0; i < 5; i++) if (ranks & (1 << (lo + i))) k++;
    if (k > best) best = k;
  }
  return best;
}

// What the card at board[len - 1] did to the board before it.
export function eventOf(board, len) {
  const c = board[len - 1];
  let suit = 0;
  let top = -1;
  for (let i = 0; i < len - 1; i++) {
    if (board[i] >> 2 === c >> 2) return 1;
    if ((board[i] & 3) === (c & 3)) suit++;
    if (board[i] >> 2 > top) top = board[i] >> 2;
  }
  if (suit === 2) return 2;
  if (suit >= 3) return 3;
  if (connected(board, len) > connected(board, len - 1) && connected(board, len) >= 3) return 4;
  if (c >> 2 > top) return 5;
  return 0;
}

export function roleOf(s, seat) {
  let nr = 0;
  let last = -1;
  for (const h of s.history) {
    if (h.street !== STREET.PRE) break;
    if (h.type === 'raise') {
      nr++;
      last = h.seat;
    }
  }
  if (nr === 0) return 0;
  if (nr === 1) return seat === last ? 1 : 2;
  return seat === last ? 3 : 4;
}

export class RangeTrack {
  // tables: { prior, trans, lik } as built by scripts/rangetables.js, or null to track the bookkeeping only
  constructor(tables = null) {
    this.t = tables;
    this.h = new Float64Array(10 * B);
    this.tmp = new Float64Array(B);
    this.reset();
  }

  reset() {
    this.len = 0; // board cards seen
    this.prevAgg = -1; // the last bettor or raiser of the street before
    this.curAgg = -1;
    this.checks = 0;
  }

  copyFrom(o) {
    this.h.set(o.h);
    this.len = o.len;
    this.prevAgg = o.prevAgg;
    this.curAgg = o.curAgg;
    this.checks = o.checks;
  }

  // Bring the tracker up to the state's board. Call before reading or observing at a decision.
  sync(s) {
    while (this.len < s.board.length) {
      if (this.len === 0) {
        this.len = 3;
        this.prevAgg = -1;
        for (const h of s.history) {
          if (h.street !== STREET.PRE) break;
          if (h.type === 'raise') this.prevAgg = h.seat;
        }
        this.curAgg = -1;
        this.checks = 0;
        if (this.t) {
          const fc = flopClass(s.board);
          for (let p = 0; p < s.n; p++) {
            if (s.folded[p]) continue;
            const src = this.t.prior[roleOf(s, p)][fc];
            for (let i = 0; i < B; i++) this.h[p * B + i] = src[i];
          }
        }
      } else {
        this.len++;
        this.prevAgg = this.curAgg;
        this.curAgg = -1;
        this.checks = 0;
        if (this.t) {
          const M = this.t.trans[this.len - 4][eventOf(s.board, this.len)];
          const h = this.h;
          const t = this.tmp;
          for (let p = 0; p < s.n; p++) {
            if (s.folded[p]) continue;
            const o = p * B;
            t.fill(0);
            for (let i = 0; i < B; i++) {
              const w = h[o + i];
              if (w === 0) continue;
              const row = M[i];
              for (let j = 0; j < B; j++) t[j] += w * row[j];
            }
            for (let j = 0; j < B; j++) h[o + j] = t[j];
          }
        }
      }
    }
  }

  // The situation the player to act is in (postflop), as a table key, with what the action buckets need.
  sit(s, seat = s.toAct) {
    const L = legal(s);
    const pot = potSize(s);
    let live = 0;
    for (let i = 0; i < s.n; i++) if (i !== seat && !s.folded[i]) live++;
    const st = s.street - 1;
    const mw = live >= 2 ? 1 : 0;
    if (L.callAmt > 0) {
      const bf = L.callAmt / Math.max(1, pot - L.callAmt);
      const size = bf < 0.4 ? 0 : bf < 0.8 ? 1 : 2;
      return { key: 24 + ((st * 2 + mw) * 3 + size) * 2 + (s.raises >= 2 ? 1 : 0), facing: true, pot };
    }
    return { key: ((st * 2 + mw) * 2 + (this.prevAgg === seat ? 1 : 0)) * 2 + (this.checks > 0 ? 1 : 0), facing: false, pot };
  }

  // The action bucket of a history entry made in situation `sit`: 0 check or fold, 1 small bet or call, 2 big bet or raise.
  static bucket(sit, e) {
    if (sit.facing) return e.type === 'fold' ? 0 : e.type === 'call' ? 1 : e.type === 'check' ? 1 : 2;
    if (e.type === 'check') return 0;
    return e.amount < 0.5 * sit.pot ? 1 : 2;
  }

  // Record an action (the entry just pushed to the history) taken in situation `sit`.
  act(seat, sit, e) {
    const a = RangeTrack.bucket(sit, e);
    if (e.type === 'check') this.checks++;
    if (e.type === 'bet' || e.type === 'raise') this.curAgg = seat;
    if (!this.t || e.type === 'fold') return;
    const l = this.t.lik[sit.key][a];
    const o = seat * B;
    for (let i = 0; i < B; i++) this.h[o + i] *= l[i];
  }

  // The chance a hand in bin `bin` is ahead of player `p`'s range right now (half credit for the same rank).
  ahead(p, bin) {
    const r = RANK[bin];
    const o = p * B;
    let tot = 0;
    let below = 0;
    for (let i = 0; i < B; i++) {
      const w = this.h[o + i];
      tot += w;
      if (RANK[i] < r) below += w;
      else if (RANK[i] === r) below += 0.5 * w;
    }
    return tot > 0 ? below / tot : 0.5;
  }

  // What a bet of `betFrac` of the pot by `seat` (holding bin `bin`) meets: `called`, the chance at least one
  // opponent who can still act calls or raises; `ahead`, the chance the hand beats everyone who does, given
  // that someone does; `aheadNow`, the chance it beats every live range as it stands.
  betRead(s, seat, bin, betFrac) {
    const r = RANK[bin];
    const size = betFrac < 0.4 ? 0 : betFrac < 0.8 ? 1 : 2;
    const st = s.street - 1;
    let live = 0;
    for (let i = 0; i < s.n; i++) if (!s.folded[i]) live++;
    const key = 24 + ((st * 2 + (live >= 3 ? 1 : 0)) * 3 + size) * 2;
    const call = this.t.lik[key][1];
    const raise = this.t.lik[key][2];
    let noneCalls = 1;
    let noneBeats = 1;
    let aheadNow = 1;
    for (let p = 0; p < s.n; p++) {
      if (p === seat || s.folded[p]) continue;
      const o = p * B;
      let tot = 0;
      let below = 0;
      let ctot = 0;
      let cbelow = 0;
      for (let i = 0; i < B; i++) {
        const w = this.h[o + i];
        const c = w * Math.min(1, call[i] + raise[i]);
        tot += w;
        ctot += c;
        if (RANK[i] < r) {
          below += w;
          cbelow += c;
        } else if (RANK[i] === r) {
          below += 0.5 * w;
          cbelow += 0.5 * c;
        }
      }
      if (!(tot > 0)) continue;
      aheadNow *= below / tot;
      if (s.allIn[p]) continue; // cannot call; already in for the showdown
      const pc = ctot / tot;
      noneCalls *= 1 - pc;
      noneBeats *= 1 - (ctot - cbelow) / tot; // no opponent both continues and beats the hand
    }
    const called = 1 - noneCalls;
    return { called, ahead: called > 1e-9 ? (noneBeats - noneCalls) / called : 0.5, aheadNow };
  }
}
