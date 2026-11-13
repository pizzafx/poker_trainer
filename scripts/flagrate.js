// How often does the coach flag a sensible player? Seats the project's own solid stand-in
// as the trainee, judges every decision the way the app does (guardrails included), and
// prints the share flagged and what the flags were. A competent player should see few flags,
// and the ones they see should be defensible.
// Run: node scripts/flagrate.js [hands] [seed] [show] [--limper]
// --limper: the same player, except that first in it limps every hand it would raise, apart from
// the top 5% (a habitual open-limper), to see how often the limp tip fires.

import { classOf } from '../src/engine/hands.js';
import { STREET } from '../src/engine/game.js';
import { handFeatures } from '../src/engine/features.js';
import { makeRng, cardStr } from '../src/engine/cards.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction } from '../src/bots/policy.js';
import { HERO_PROFILE } from '../src/bots/profiles.js';
import { CATEGORIES } from '../src/trainer/explain.js';
import { Session } from '../src/trainer/session.js';
import { SESSION, GAME_LINE } from './config.js';

const at = process.argv.indexOf('--limper');
const LIMPER = at >= 0;
if (LIMPER) process.argv.splice(at, 1);

const HANDS = +(process.argv[2] || 140);
const seed = +(process.argv[3] || 7);
const show = +(process.argv[4] || 0);
const sess = new Session({ ...SESSION, seed, skipBelow: 0.15, samples: 600 });
console.log(GAME_LINE);

const rng = makeRng(seed + 5);
for (let h = 0; h < HANDS; h++) {
  sess.freshStack();
  sess.startPlayable();
  let guard = 0;
  while (sess.status() !== 'over' && guard++ < 400) {
    if (sess.status() === 'bot') {
      sess.stepBot();
      continue;
    }
    const s = sess.hand.state;
    const ctx = buildContext(s);
    const pol =
      s.street === STREET.PRE
        ? preflopPolicy(ctx, HERO_PROFILE, classOf(s.hole[0][0], s.hole[0][1]))
        : postflopPolicy(ctx, HERO_PROFILE, handFeatures(s.hole[0], s.board));
    let a = sampleAction(pol, rng);
    if (LIMPER && s.street === STREET.PRE && ctx.raises === 0 && ctx.limpers === 0 && ctx.pos <= 2 && a.type === 'raise' && HERO_PROFILE.raisePct[classOf(s.hole[0][0], s.hole[0][1])] < 0.95) a = { type: 'call' };
    sess.heroAct(a);
  }
}
const ds = sess.decisions;
const flagged = ds.filter((d) => d.verdict.grade !== 'good');
const red = flagged.filter((d) => d.verdict.grade === 'blunder').length;
const notes = {};
for (const d of ds) if (d.verdict.note) notes[d.verdict.note] = (notes[d.verdict.note] || 0) + 1;
const cats = {};
for (const d of flagged) cats[d.category] = (cats[d.category] || 0) + 1;
console.log(`seed ${seed}: ${ds.length} decisions, ${flagged.length} flagged (${((100 * flagged.length) / ds.length).toFixed(1)}%), ${red} red`);
console.log('  by leak:', Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none');
const openLimps = ds.filter((d) => d.street === STREET.PRE && d.ctx.raises === 0 && d.ctx.limpers === 0 && d.ctx.pos <= 2 && d.verdict.options[d.verdict.mine].type === 'call');
const tipKinds = {};
for (const d of ds) if (d.tipKind) tipKinds[d.tipKind] = (tipKinds[d.tipKind] || 0) + 1;
console.log(`  tips: ${Object.entries(tipKinds).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}; limp tip on ${openLimps.filter((d) => d.tipKind === 'limp').length} of ${openLimps.length} first-in limps from a non-blind seat${LIMPER ? ' [habitual limper]' : ''}`);
for (const d of ds.filter((x) => x.tipKind && x.tipKind !== 'limp').slice(0, show)) console.log(`  ~ hand ${d.hand} ${d.position} [${d.hole.map(cardStr).join(' ')}]: Tip: ${d.tip}`);
console.log('  guardrails that passed a play:', Object.entries(notes).map(([k, v]) => `${k} ${v}`).join(', ') || 'none');
for (const d of flagged.slice(0, show)) {
  console.log(`  - hand ${d.hand} ${d.streetName} ${d.position} [${d.hole.map(cardStr).join(' ')}] board [${d.board.map(cardStr).join(' ')}] pot ${d.pot}: ${d.headline}  (${(CATEGORIES[d.category] || d.category).split(':')[0]})`);
}
