// Rebuilds a recorded hand (Session.handRecord) action by action, for the replayer: the table at
// every step, and each opponent's range as the coach read it then. Ranges are not stored; they are
// replayed from the reads at the start of the hand with the same observations the table made, so
// they come out as they were at the time (as long as the opponent model has not changed since).

import { newHand, applyAction, cloneState, STREET } from '../engine/game.js';
import { handFeatures } from '../engine/features.js';
import { buildContext } from '../bots/policy.js';
import { TYPE_IDS } from '../bots/profiles.js';
import { HandBelief, posterior } from './belief.js';

const HERO = 0;
const POSTED = new Set(['sb', 'bb', 'straddle']);

// The hand's starting position, with every card fixed and the board dealt in the recorded order.
function deal(rec) {
  let next = 0;
  const holder = {};
  const rng = () => {
    // only the board is drawn after the deal: return the position of the next recorded board card
    const s = holder.s;
    if (!s) return 0;
    const idx = s.remaining.indexOf(rec.board[next++]);
    return (Math.max(0, idx) + 0.5) / s.remaining.length;
  };
  const s = newHand({ stacks: rec.startStacks.slice(), button: rec.button, sb: rec.sb, bb: rec.bb, straddle: rec.straddle, rake: rec.rake, rng, hole: rec.hole.map((c) => c.slice()) });
  holder.s = s;
  return { s, rng };
}

// Every step of the hand: { index (into the recorded history), action, state (after it), ranges }.
// `ranges[seat]` is the coach's range grid for that opponent as of this step: it moves at the end
// of each street and right after each of that player's bets and raises (the replayer's rule).
export function replayHand(rec) {
  const { s, rng } = deal(rec);
  const reads = rec.seats.map((p) => (p.read ? { logP: Float64Array.from(p.read), handStart: new Float64Array(TYPE_IDS.length) } : null));
  const belief = new HandBelief(reads, rec.hole[HERO]);
  const heroScore = () => (belief.board.length >= 3 ? handFeatures(rec.hole[HERO], belief.board).score : null);
  const grids = {};
  const snap = (seat) => {
    grids[seat] = belief.grid(seat, heroScore());
  };
  const snapAll = () => {
    for (let i = 0; i < s.n; i++) if (i !== HERO && reads[i]) snap(i);
  };
  snapAll();
  const readsNow = () => reads.map((r) => (r ? Array.from(posterior(r)) : null));
  const steps = [{ index: s.history.length - 1, action: null, state: cloneState(s), before: null, ranges: { ...grids }, reads: readsNow(), board: s.board.length }];
  let seen = s.board.length;
  for (let k = 0; k < rec.history.length; k++) {
    const e = rec.history[k];
    if (POSTED.has(e.type)) continue; // posted by the deal itself
    const seat = e.seat;
    const before = cloneState(s);
    const ctx = buildContext(s);
    const action = e.type === 'bet' || e.type === 'raise' ? { type: 'raise', to: e.to } : { type: e.type };
    if (seat !== HERO) {
      if (rec.heatAt && rec.heatAt[k]) ctx.heat = rec.heatAt[k];
      belief.observe(seat, ctx, action);
    }
    applyAction(s, action, rng);
    if (seat !== HERO && action.type === 'raise') snap(seat);
    if (s.board.length > seen) {
      // the street's betting ended: everyone's range as it stood, then the new cards
      snapAll();
      seen = s.board.length;
      belief.setBoard(s.board);
    }
    steps.push({ index: k, action: e, state: cloneState(s), before, ranges: { ...grids }, reads: readsNow(), board: s.board.length });
  }
  return { steps, final: s };
}

const NAMES = ['Preflop', 'Flop', 'Turn', 'River'];
const streetOf = (boardLen) => (boardLen >= 5 ? 3 : boardLen === 4 ? 2 : boardLen === 3 ? 1 : 0);

// The table right after an action that closes a street, before the next cards come: the state
// before the action with that one action's chips added (the engine deals at once).
function closing(before, e) {
  const s = cloneState(before);
  const i = e.seat;
  if (e.type === 'fold') s.folded[i] = true;
  else if (e.type === 'call' || e.type === 'bet' || e.type === 'raise') {
    const add = e.type === 'call' ? e.amount : e.to - s.bet[i];
    s.stacks[i] -= add;
    s.bet[i] += add;
    s.total[i] += add;
    if (s.stacks[i] === 0) s.allIn[i] = true;
  }
  s.history.push({ ...e });
  s.toAct = -1;
  return s;
}

// The replayer's steps (handoff section 2): the blinds as one step; folds before anyone has put
// money in voluntarily as one step; every other action its own step; each new street a step;
// the end (showdown or the last player left) the last step. Each frame:
//   { kind: 'blinds' | 'folds' | 'action' | 'street' | 'end', street, seat, action, count,
//     decision (index into rec.decisions, for your own actions), state, ranges, reads }
export function framesOf(rec) {
  const { steps, final } = replayHand(rec);
  const frames = [];
  const first = steps[0];
  frames.push({ kind: 'blinds', street: 0, state: first.state, ranges: first.ranges, reads: first.reads });
  let voluntary = false;
  let decision = 0;
  for (let k = 1; k < steps.length; k++) {
    const st = steps[k];
    const e = st.action;
    const prevBoard = steps[k - 1].board;
    const dealt = st.board > prevBoard;
    const street = streetOf(prevBoard);
    if (e.type === 'fold' && !voluntary && e.seat !== HERO) {
      const last = frames[frames.length - 1];
      const state = dealt ? closing(st.before, e) : st.state;
      if (last.kind === 'folds') Object.assign(last, { count: last.count + 1, state, ranges: st.ranges, reads: st.reads, seat: e.seat });
      else frames.push({ kind: 'folds', count: 1, street, seat: e.seat, state, ranges: st.ranges, reads: st.reads });
    } else {
      if (e.type !== 'fold' && e.type !== 'check') voluntary = true;
      frames.push({ kind: 'action', street, seat: e.seat, action: e, decision: e.seat === HERO ? decision++ : -1, state: dealt ? closing(st.before, e) : st.state, before: st.before, ranges: st.ranges, reads: st.reads });
    }
    if (dealt) {
      // one step per street dealt (an all-in can run several out at once)
      for (const len of [3, 4, 5]) {
        if (len <= prevBoard || len > st.board) continue;
        const state = cloneState(st.state);
        state.board = state.board.slice(0, len);
        if (len < st.board) state.toAct = -1;
        frames.push({ kind: 'street', street: streetOf(len), state, ranges: st.ranges, reads: st.reads });
      }
    }
  }
  const lastStep = steps[steps.length - 1];
  frames.push({ kind: 'end', street: final.result && final.result.showdown ? 4 : streetOf(final.board.length), state: final, ranges: lastStep.ranges, reads: lastStep.reads });
  return frames;
}

export const STREET_NAMES = NAMES;
export { STREET };
