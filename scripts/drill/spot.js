// Drill bank: a spot record, and its exact replay. A record holds the deal (every seat's cards, the stacks,
// the button, the blinds and rake), the board and every action, and each opponent's true type. Replaying it
// rebuilds the table at the hero's decision and the judge's read: every opponent pinned at 100% on that type,
// with the range rebuilt by feeding the same actions through the belief update (MATH's pinned read). So a
// spot can be re-judged at any time (the re-gate) without shipping the belief tables.

import { newHand, applyAction, STREET } from '../../src/engine/game.js';
import { buildContext } from '../../src/bots/policy.js';
import { TYPE_IDS } from '../../src/bots/profiles.js';
import { HandBelief, newRead } from '../../src/trainer/belief.js';

const HERO = 0;
const BLINDS = new Set(['sb', 'bb', 'straddle']);

// the pinned reads: each opponent 100% the type it really is
export const pinnedReads = (types) => types.map((t, i) => (i === HERO ? null : newRead(TYPE_IDS.map((id) => (id === t ? 1 : 0)))));

// The record of the table as it stands now (the hero to act). `types[i]` is seat i's true type (null for the hero).
export function captureSpot(s, { types, nicks, game, stacksBb }) {
  return {
    n: s.n,
    button: s.button,
    sb: s.sbAmt,
    bb: s.bbAmt,
    straddle: s.straddleAmt || 0,
    rake: s.rake,
    stacks: s.startStacks.slice(),
    hole: s.hole.map((h) => h.slice()),
    board: s.board.slice(),
    actions: s.history.filter((h) => !BLINDS.has(h.type)).map((h) => ({ seat: h.seat, type: h.type === 'bet' ? 'raise' : h.type, ...(h.type === 'bet' || h.type === 'raise' ? { to: h.to } : {}) })),
    types: types.slice(),
    nicks: nicks ? nicks.slice() : null,
    game: game || null,
    stacksBb: stacksBb ?? null,
  };
}

// The table and the pinned belief at the recorded decision.
export function replaySpot(rec) {
  let dealt = 0;
  let s = null;
  const fixed = () => {
    const want = rec.board[dealt++];
    const idx = s.remaining.indexOf(want);
    if (idx < 0) throw new Error('replay: board card not in the deck');
    return (idx + 0.5) / s.remaining.length;
  };
  s = newHand({ stacks: rec.stacks, button: rec.button, sb: rec.sb, bb: rec.bb, straddle: rec.straddle, rake: rec.rake, hole: rec.hole, rng: fixed });
  const belief = new HandBelief(pinnedReads(rec.types), s.hole[HERO]);
  let seen = 0;
  for (const a of rec.actions) {
    if (s.toAct !== a.seat) throw new Error(`replay: seat ${s.toAct} to act, record has ${a.seat}`);
    const action = a.type === 'raise' ? { type: 'raise', to: a.to } : { type: a.type };
    if (a.seat !== HERO) belief.observe(a.seat, buildContext(s), action);
    applyAction(s, action, fixed);
    if (s.board.length > seen) {
      seen = s.board.length;
      belief.setBoard(s.board);
    }
  }
  if (s.toAct !== HERO || s.done) throw new Error('replay: the hero is not to act at the end');
  if (s.board.length !== rec.board.length) throw new Error('replay: board length differs');
  return { s, belief, pre: s.street === STREET.PRE };
}
