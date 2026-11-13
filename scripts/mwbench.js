// The multiway benchmark as a check (MULTIWAY_COACH_SPEC.md, "Expectations"): every spot in
// scripts/mwbench_spots.js is replayed, every option the coach compares is graded as if the trainee
// had chosen it (the real judge and guardrails, at the app's sample counts), and the result is held
// to the spot's EXPECT line. Also two opponent-model regressions POOL asked to keep (R02, F12).
//   node scripts/mwbench.js [spotIds,comma] [--verbose]
// Exit code 1 if anything fails.
import { STREET } from '../src/engine/game.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { samplesFor } from '../src/trainer/session.js';
import { gradeAll, matches, build } from './gradeall.js';
import { SPOTS, EXPECT } from './mwbench_spots.js';

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const want = args.find((a) => !a.startsWith('--'));
const ids = want ? want.split(',') : null;
const BASE_SAMPLES = 600; // the app's setting (app.js)

const RANK = { good: 0, mistake: 1, blunder: 2 };
const short = (o) => o.label.replace(/ \(.*\)/, '');
let fails = 0;
const t0 = Date.now();
for (const spot of SPOTS.filter((x) => !ids || ids.includes(x.id))) {
  const ex = EXPECT[spot.id] || {};
  const { s, belief, env } = build(spot);
  const samples = samplesFor(BASE_SAMPLES, s); // as the app's judge
  const opts = { samples, seed: 5 };
  const v0 = judgeDecision(s, 0, belief, null, opts);
  const pot = v0.pot;
  const rows = gradeAll(s, v0, opts, env);
  const problems = [];
  const each = (list, fn) => {
    for (const tok of list || []) {
      const hit = rows.filter((r) => matches(tok, r.o, s, pot));
      for (const r of hit) {
        const why = fn(r, tok);
        if (why) problems.push(`${short(r.o)}: ${why}`);
      }
    }
  };
  each(ex.accept, (r, tok) => (r.v.grade !== 'good' ? `accept ${tok}, got ${r.v.grade} (vs ${short(r.o === r.v.options[r.v.best] ? r.o : r.v.options[r.v.best])})` : null));
  each(ex.flag, (r, tok) => (r.v.grade === 'good' ? `flag ${tok}, got good${r.v.note ? ` (${r.v.note})` : ''}` : null));
  each(ex.softFlag, (r, tok) => (r.v.grade === 'blunder' ? `softFlag ${tok}, got red` : r.best && r.v.note !== 'mwHabit' ? `softFlag ${tok}, shown as best play` : null));
  each(ex.neverBest, (r, tok) => (r.best ? `neverBest ${tok}, shown as best play` : null));
  for (const [tok, note] of Object.entries(ex.note || {})) each([tok], (r) => (r.v.note !== note ? `note ${tok} should be ${note}, got ${r.v.note || 'none'} (${r.v.grade})` : null));
  for (const [tok, g] of Object.entries(ex.maxGrade || {})) each([tok], (r) => (RANK[r.v.grade] > RANK[g] ? `maxGrade ${tok} ${g}, got ${r.v.grade}` : null));
  if (ex.noGrade) for (const r of rows) if (r.v.grade !== 'good') problems.push(`${short(r.o)}: noGrade spot, got ${r.v.grade}`);
  if (ex.quote) {
    for (const r of rows) {
      if (r.v.grade === 'good') continue;
      const ref = r.v.options[r.v.best];
      if (!matches(`${ex.quote.split(':')[0]}:${+ex.quote.split(':')[1] - 0.06}-${+ex.quote.split(':')[1] + 0.06}`, ref, s, pot)) problems.push(`${short(r.o)}: quotes ${short(ref)}, want ${ex.quote}`);
    }
  }
  // POOL's regressions on the opponent model (kept with the benchmark)
  const ev = (tok) => rows.filter((r) => matches(tok, r.o, s, pot)).map((r) => r.o.ev);
  if (spot.id === 'R02') {
    const chk = ev('check')[0];
    if (Math.max(...ev('bet')) > chk - 15) problems.push(`regression: a river bluff into the station scores ${Math.max(...ev('bet')).toFixed(1)} vs check ${chk.toFixed(1)} (want 15 below)`);
  }
  if (spot.id === 'F12') {
    const fold = ev('fold')[0];
    const call = ev('call')[0];
    const shove = rows[rows.length - 1].o;
    if (Math.abs(call - fold) > 10) problems.push(`regression: call ${call.toFixed(1)} vs fold ${fold.toFixed(1)} (want within $10)`);
    if (shove.ev > fold - 10) problems.push(`regression: ${short(shove)} ${shove.ev.toFixed(1)} (want $10 below fold)`);
  }
  const line = rows.map((r) => `${short(r.o)} ${r.o.ev.toFixed(1)} ${r.v.grade === 'good' ? (r.best ? 'BEST' : r.v.note || 'ok') : r.v.grade.toUpperCase()}`).join(' | ');
  if (problems.length) fails++;
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${spot.id} ${['pre', 'flop', 'turn', 'river'][s.street]} ${v0.options.length ? s.folded.filter((f, i) => i && !f).length + 1 : ''}-way pot $${pot}${VERBOSE || problems.length ? `\n      ${line}` : ''}`);
  for (const p of problems) console.log(`      - ${p}`);
}
console.log(`\n${fails ? `${fails} spot(s) failed` : 'all spots as expected'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(fails ? 1 : 0);
