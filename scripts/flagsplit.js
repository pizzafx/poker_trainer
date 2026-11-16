// The grade split over the verdict checker's configurations: best play, fine, yellow, red and not
// graded, as shares of the graded decisions (not graded as a share of all), plus the invariant count.
//   node scripts/flagsplit.js [--hands 60] [--seed 11]
import { runConfig, CONFIGS } from './verdictcheck.js';
import { verdictWord } from '../src/trainer/best.js';

const arg = (k, dflt) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? +process.argv[i + 1] : dflt;
};
const words = {};
const rules = {};
let n = 0;
let bad = 0;
for (const cfg of CONFIGS(arg('--hands', 60), arg('--seed', 11))) {
  const r = runConfig({
    ...cfg,
    onRecord: (d) => {
      const v = d.verdict;
      if (!v || v.mine < 0) return;
      n++;
      const w = verdictWord(v, d);
      words[w] = (words[w] || 0) + 1;
      if (v.rule && v.grade !== 'good') rules[v.rule] = (rules[v.rule] || 0) + 1;
    },
  });
  bad += r.violations.length;
}
const graded = n - (words['not graded'] || 0);
const pct = (c, of) => `${((100 * c) / Math.max(1, of)).toFixed(1)}%`;
console.log(`${n} decisions, ${graded} graded, ${bad} invariant violations`);
for (const w of ['best play', 'fine', 'mistake', 'blunder', 'not graded']) {
  const c = words[w] || 0;
  console.log(`  ${(w === 'mistake' ? 'yellow' : w === 'blunder' ? 'red' : w).padEnd(11)} ${String(c).padStart(5)}  ${pct(c, w === 'not graded' ? n : graded)}`);
}
console.log(`  flags by rule: ${JSON.stringify(rules)}`);
