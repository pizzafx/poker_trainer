// How repeatable are the judge's numbers? Judges the same decisions several times with
// different random seeds and prints the spread of each option's estimate.
// Run: node scripts/noise.js [samples]

import { Session } from '../src/trainer/session.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { SESSION, GAME_LINE } from './config.js';

const samples = +(process.argv[2] || 600);
const sess = new Session({ ...SESSION, seed: 21, skipBelow: 0.15 });
console.log(GAME_LINE);

sess.warmUp(30);
let shown = 0;
const want = [0, 0, 1, 2, 3]; // streets to sample
let t = 0;
let n = 0;
for (let h = 0; h < 200 && shown < want.length; h++) {
  sess.freshStack();
  sess.startHand();
  while (sess.status() !== 'over') {
    if (sess.status() === 'bot') {
      sess.stepBot();
      continue;
    }
    const s = sess.hand.state;
    if (s.street === want[shown]) {
      const runs = [];
      for (let seed = 1; seed <= 8; seed++) {
        const t0 = Date.now();
        runs.push(judgeDecision(s, 0, sess.hand.belief, null, { samples, seed }));
        t += Date.now() - t0;
        n++;
      }
      console.log(`\n${['Preflop', 'Flop', 'Turn', 'River'][s.street]} decision, pot $${runs[0].pot}:`);
      runs[0].options.forEach((o, i) => {
        const evs = runs.map((r) => r.options[i].ev);
        const mean = evs.reduce((a, b) => a + b, 0) / evs.length;
        const sd = Math.sqrt(evs.reduce((a, b) => a + (b - mean) ** 2, 0) / (evs.length - 1));
        console.log(`  ${o.label.padEnd(16)} mean ${mean.toFixed(1).padStart(7)}   spread between runs +/- ${sd.toFixed(1)}   [${evs.map((e) => e.toFixed(0)).join(' ')}]`);
      });
      console.log(`  best pick per run: ${runs.map((r) => r.options[r.best].label).join(' | ')}`);
      shown++;
      if (shown >= want.length) break;
    }
    sess.autoHero();
  }
}
console.log(`\n${Math.round(t / n)} ms per judgement at ${samples} samples`);
