// Drill bank: everything a bank entry derives from its gate result, in one place, so the generator and the re-gate
// label a spot the same way (CURR, spec 2.3: the shipped label comes from the shipped bots).
// - the D1 draw rule: the call's combined-test status; 'works' or 'even' takes the spot out of D1, 'fails' makes it tricky
// - the tricky flag (the skill's own predicate) and the difficulty (the margin rules, difficultyOf)
// - the coach's estimate line for each family, as the table would show it for that play (pinned reads)
// Not in the bank version hash (scripts/drill/version.js): it only re-derives labels from the gate's result.

import { SKILLS, live, difficultyOf, d1DrawStatus, d1DrawRejects } from './drill/skills.js';
import { envFor } from './gradeall.js';
import { Session } from '../src/trainer/session.js';
import { buildContext } from '../src/bots/policy.js';
import { handFeatures } from '../src/engine/features.js';
import { STREET } from '../src/engine/game.js';

// The coach's estimate lines without a live session: decisionRecord needs only the hand, a belief, the reads, the
// judge options and the seat names, all of which the replayed spot carries.
function estimateLines(s, pinned, reads, graded, nicks) {
  const env = envFor(pinned, reads);
  const nick = (i) => (nicks && nicks[i]) || `Seat ${i}`;
  // the record's "Disagree?" snapshot also reads notes, nicks, rake and heat: a banked read is pinned, with no notes
  const fake = {
    hand: { state: s, belief: pinned },
    handNo: 0,
    heat: 0,
    rake: null,
    judgeOpts: () => ({ samples: 600, heat: 0 }),
    readOf: (i) => ({ ...env.readOf(i), notes: { hands: 0, vpip: 0, pfr: 0, showdowns: [] } }),
    name: nick,
    seats: Array.from({ length: s.n }, (_, i) => ({ steaming: false, nick: nick(i), hero: i === 0 })),
    decisions: [],
  };
  const estimate = {};
  for (const [k, v] of Object.entries(graded || {})) {
    try {
      const rec = Session.prototype.decisionRecord.call(fake, v, { belief: pinned, readOf: env.readOf });
      if (rec.anchor || rec.tip) estimate[k] = rec.anchor || rec.tip; // before the flop the coach's tip is the line
    } catch {
      // no line for this family
    }
  }
  return estimate;
}

// derive(skillCode, s, pinned, reads, types, gateResult, nicks) ->
//   { reject: reason | null, drawSt, tricky, difficulty, estimate }
export function derive(code, s, pinned, reads, types, r, nicks) {
  const skill = SKILLS[code];
  const ctx = buildContext(s);
  const pre = s.street === STREET.PRE;
  const f = pre ? null : handFeatures(s.hole[0], s.board);
  const drawSt = code === 'D1' ? d1DrawStatus(f, r.graded.call, live(s).length) : null;
  if (d1DrawRejects(drawSt)) return { reject: drawSt === 'even' ? 'D1: the draw is about even' : 'D1: the draw covers the price', drawSt };
  const tricky = skill.tricky(s, ctx, f, types, drawSt);
  const difficulty = difficultyOf(skill, tricky, pre, r);
  const estimate = estimateLines(s, pinned, reads, r.graded, nicks);
  return { reject: null, drawSt, tricky, difficulty, estimate };
}
