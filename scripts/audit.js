// Prints the full story behind the judge's most expensive verdicts in an automated session,
// so a human can check whether the advice makes poker sense.
// Run: node scripts/audit.js [seed] [hands] [category]

import { makeRng, cardStr } from '../src/engine/cards.js';
import { Session } from '../src/trainer/session.js';
import { SESSION, GAME_LINE } from './config.js';

const seed = +(process.argv[2] || 11);
const HANDS = +(process.argv[3] || 120);
const only = process.argv[4] || null;
const sess = new Session({ ...SESSION, seed, samples: 600 });
console.log(GAME_LINE);

const rng = makeRng(seed + 1);
const found = [];
for (let h = 0; h < HANDS; h++) {
  sess.startHand();
  let guard = 0;
  while (sess.status() !== 'over' && guard++ < 400) {
    if (sess.status() === 'bot') {
      sess.stepBot();
      continue;
    }
    const L = sess.heroOptions();
    const r = rng();
    let a;
    if (L.canRaise && r < 0.2) a = { type: 'raise', to: Math.min(L.maxTo, Math.max(L.minTo, Math.round(L.pot * 0.7))) };
    else if (L.canCheck) a = { type: 'check' };
    else a = r < 0.65 ? { type: 'call' } : { type: 'fold' };
    const logSoFar = sess.hand.log.map((l) => l.text);
    const s = sess.hand.state;
    const who = [];
    for (let i = 1; i < s.n; i++) {
      if (s.folded[i]) continue;
      const rd = sess.readOf(i);
      who.push(`${sess.seats[i].nick}: truly ${sess.seats[i].type}${sess.seats[i].tilt ? ' (tilted)' : ''}, read ${rd.ranked[0].id} ${(100 * rd.ranked[0].p).toFixed(0)}%, holds ${s.hole[i].map(cardStr).join(' ')}, stack ${s.stacks[i]}`);
    }
    const d = sess.heroAct(a);
    if (d.verdict.grade !== 'good' && (!only || d.category === only)) found.push({ d, logSoFar, who });
  }
}
found.sort((x, y) => y.d.verdict.loss - x.d.verdict.loss);
for (const { d, logSoFar, who } of found.slice(0, +(process.argv[5] || 6))) {
  console.log('='.repeat(100));
  console.log(logSoFar.join('\n'));
  console.log(`--> HERO ${d.position} holds ${d.hole.map(cardStr).join(' ')}, board ${d.board.map(cardStr).join(' ') || '-'}, pot ${d.pot}, to call ${d.toCall}`);
  console.log('    ' + who.join('\n    '));
  console.log('    options: ' + d.verdict.options.map((o, i) => `${i === d.verdict.mine ? '*' : ''}${o.label} ${o.ev.toFixed(1)}`).join(' | '));
  console.log(`    [${d.category}] ${d.headline}`);
  for (const r of d.reasons) console.log('    ' + r);
}
const rev = sess.review();
console.log(`\n${rev.hands} hands, flagged ${rev.flagged}/${rev.judged}, cost $${rev.lost.toFixed(0)}`);
