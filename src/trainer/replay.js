// Rebuilds a recorded hand (Session.handRecord) action by action, for the replayer: the table at
// every step, and each opponent's range as the coach read it then. Ranges are not stored; they are
// replayed from the reads at the start of the hand with the same observations the table made, so
// they come out as they were at the time (as long as the opponent model has not changed since).

import { newHand, applyAction, cloneState, STREET } from '../engine/game.js';
import { handFeatures } from '../engine/features.js';
import { buildContext } from '../bots/policy.js';
import { TYPE_IDS } from '../bots/profiles.js';
import { HandBelief } from './belief.js';

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
  const steps = [{ index: s.history.length - 1, action: null, state: cloneState(s), ranges: { ...grids }, board: s.board.length }];
  let seen = s.board.length;
  for (let k = 0; k < rec.history.length; k++) {
    const e = rec.history[k];
    if (POSTED.has(e.type)) continue; // posted by the deal itself
    const seat = e.seat;
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
    steps.push({ index: k, action: e, state: cloneState(s), ranges: { ...grids }, board: s.board.length });
  }
  return { steps, final: s };
}

export { STREET };
