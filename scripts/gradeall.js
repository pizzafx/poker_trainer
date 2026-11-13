// Grading every option at a decision as if the trainee had chosen it: one judgement of all the
// options, then the judge's verdict for each choice and the real guardrails (temper). Used by the
// set-piece checks (scripts/spots.js, scripts/mwbench.js).
import { parseCards, makeRng } from '../src/engine/cards.js';
import { newHand, applyAction, legal, STREET } from '../src/engine/game.js';
import { buildContext } from '../src/bots/policy.js';
import { TYPE_IDS, PROFILES } from '../src/bots/profiles.js';
import { HandBelief, newRead, posterior } from '../src/trainer/belief.js';
import { RAKES } from '../src/trainer/session.js';
import { pairedGap } from '../src/trainer/judge.js';
import { temper } from '../src/trainer/grade.js';

// The judge's verdict for choice `c`, from a judgement of every option.
export function verdictFor(v0, c, s) {
  const v = { ...v0, options: v0.options.map((o) => ({ ...o })), mine: c };
  Object.defineProperty(v, 'runs', { value: v0.runs, enumerable: false });
  const pot = v0.pot;
  const bb = s.bbAmt;
  v.loss = 0;
  v.se = 0;
  v.grade = 'good';
  v.sameKind = v.options[c].type === v.options[v.best].type;
  if (c !== v.best) {
    const g = pairedGap(v, v.best, c);
    v.loss = g.mean;
    v.se = g.se;
    if (g.mean > 2.2 * g.se) {
      const k = v.sameKind ? 1.6 : 1;
      if (g.mean >= Math.max(8 * bb, 0.2 * pot) * k) v.grade = 'blunder';
      else if (g.mean >= Math.max(3 * bb, 0.1 * pot) * k) v.grade = 'mistake';
    }
  }
  return v;
}

// What grading needs: the read tracker, each player's read (from `reads`) and a name.
export function envFor(belief, reads) {
  return {
    belief,
    readOf: (i) => {
      const post = posterior(reads[i]);
      return { ranked: TYPE_IDS.map((id, t) => ({ id, name: PROFILES[id].name, p: post[t] })).sort((a, b) => b.p - a.p) };
    },
    name: (i) => `seat ${i}`,
  };
}

// Every option graded: [{ o, v, best }] where `best` means shown as the best play.
export function gradeAll(s, v0, opts, env) {
  const ctx = buildContext(s);
  return v0.options.map((o, c) => {
    const v = verdictFor(v0, c, s);
    temper(v, s, ctx, { type: o.type, to: o.to }, opts, env);
    return { o, v, best: v.grade === 'good' && v.best === c };
  });
}

// Option tokens: 'check', 'call', 'fold', 'bet' / 'raise', and sizes: 'bet:0.3-0.8' (fraction of
// the pot), 'raise:2.5-5.5' (multiple of the bet faced).
export function matches(tok, o, s, pot) {
  const [kind, range] = tok.split(':');
  let k = o.type;
  let size = 0;
  if (o.type === 'raise') {
    if (s.currentBet === 0) {
      k = 'bet';
      size = o.to / pot;
    } else size = o.to / s.currentBet;
  }
  if (k !== kind) return false;
  if (!range) return true;
  const [lo, hi] = range.split('-').map(Number);
  return size >= lo - 1e-9 && size <= (hi ?? lo) + 1e-9;
}

const sharesPrior = () => {
  const sh = TYPE_IDS.map((id) => PROFILES[id].share);
  const t = sh.reduce((a, b) => a + b, 0);
  return sh.map((x) => x / t);
};

// A spot in the scripts/mwbench_spots.js format, replayed to hero's decision: { s, belief, env }.
export function build(spot, n = 8) {
  const bd = parseCards(spot.board);
  const stacks = new Array(n).fill(300);
  for (const [k, v] of Object.entries(spot.stacks || {})) stacks[+k] = v;
  const rng = makeRng(42);
  const s = newHand({ stacks, button: spot.button, sb: 1, bb: 3, rake: RAKES[spot.rake || 'pct'], rng, hole: [parseCards(spot.hole), ...new Array(n - 1).fill(null)] });
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < 2; j++) {
      if (bd.includes(s.hole[i][j])) {
        const r = s.remaining.find((c) => !bd.includes(c) && !s.hole.some((h) => h && h.includes(c)));
        s.remaining.splice(s.remaining.indexOf(r), 1, s.hole[i][j]);
        s.hole[i][j] = r;
      }
    }
  }
  let dealt = 0;
  const fixed = () => {
    const idx = s.remaining.indexOf(bd[dealt++]);
    if (idx < 0) throw new Error(`${spot.id}: board card not in deck`);
    return (idx + 0.5) / s.remaining.length;
  };
  const prior = sharesPrior();
  const reads = [null];
  for (let i = 1; i < n; i++) {
    const t = spot.seats[i];
    if (!t || t === 'pool') reads.push(newRead(prior));
    else {
      const c = (spot.conf && spot.conf[i]) || 0.85;
      reads.push(newRead(TYPE_IDS.map((id) => (id === t ? c : (1 - c) / (TYPE_IDS.length - 1)))));
    }
  }
  const belief = new HandBelief(reads, s.hole[0]);
  let seen = 0;
  const step = (a) => {
    const ctx = buildContext(s);
    if (s.toAct !== 0) belief.observe(s.toAct, ctx, a);
    applyAction(s, a, fixed);
    if (s.board.length > seen) {
      seen = s.board.length;
      belief.setBoard(s.board);
    }
  };
  for (const tk of spot.line.split(/[\s|]+/).filter(Boolean)) {
    const seat = +tk[0];
    while (s.street === STREET.PRE && s.toAct !== seat && s.toAct !== 0 && !(s.toAct in spot.seats)) step({ type: 'fold' });
    if (s.toAct !== seat) throw new Error(`${spot.id}: token ${tk} but seat ${s.toAct} is to act`);
    const c = tk[1];
    const a = c === 'f' ? { type: 'fold' } : c === 'c' ? { type: 'call' } : c === 'x' ? { type: 'check' } : { type: 'raise', to: +tk.slice(2) };
    if (a.type === 'check' && !legal(s).canCheck) throw new Error(`${spot.id}: ${tk} cannot check`);
    step(a);
  }
  while (s.street === STREET.PRE && s.toAct !== 0 && !(s.toAct in spot.seats)) step({ type: 'fold' });
  if (s.toAct !== 0) throw new Error(`${spot.id}: hero not to act at the end (seat ${s.toAct})`);
  return { s, belief, env: envFor(belief, reads) };
}

