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
import { handFeatures, TIER } from '../src/engine/features.js';
import { STREET } from '../src/engine/game.js';
import { classOf, classNames } from '../src/engine/hands.js';

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
  // P1 (CURR, STRAT, 19 Nov): every P1 spot is kept only when the bank's limp family is wrong under G4 (the L2 tip
  // counts as a flag there) and the fold is wrong too; a spot with a fine limp cannot teach "don't limp behind" (live,
  // L2 rightly stays silent when regulars act behind, STRAT's AJo record)
  if (code === 'P1' && pre && r.families && (r.families.call !== 'wrong' || r.families.fold !== 'wrong')) {
    const hand = classNames[classOf(s.hole[0][0], s.hole[0][1])];
    return { reject: `P1: ${hand} with the limp ${r.families.call || 'missing'} and the fold ${r.families.fold || 'missing'} (not both wrong)`, drawSt };
  }
  // D3 (PRO): an overpair or top pair top kicker against an abc's or a beginner's bet (the line's "close against
  // others") is kept only where fold is wrong by the easy spot's 3 bars in every scenario; stations and nits take
  // the normal gate
  if (code === 'D3' && f && f.tier === TIER.OVERPAIR_TPTK && ['abc', 'beginner'].includes(types[ctx.aggressor]) && !((r.minGapBars && r.minGapBars.fold) >= 3)) {
    return { reject: `D3: overpair/TPTK vs ${types[ctx.aggressor]}, fold wrong by ${r.minGapBars ? r.minGapBars.fold : '?'} bars (under 3)`, drawSt };
  }
  const tricky = skill.tricky(s, ctx, f, types, drawSt);
  const difficulty = difficultyOf(skill, tricky, pre, r);
  const estimate = estimateLines(s, pinned, reads, r.graded, nicks);
  return { reject: null, drawSt, tricky, difficulty, estimate };
}
