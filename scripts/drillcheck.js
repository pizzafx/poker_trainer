// Drill bank: the re-gate. Replays every spot in the shipped bank (src/drill/bank.json) and runs the gate again
// at the current model and grading. A spot that now fails, or whose families changed, is reported; with
// --write the bank is rewritten without the failures and stamped with the current version. Run it after any
// change to the opponent model or grading (the bank version says when one happened).
//
//   node scripts/drillcheck.js [--write] [--shard k/n] [--seeds 4,5,6] [--file path]
//   --seeds: re-gate on seeds the pipeline did not use (MATH's sign-off check); reports only, never writes

import fs from 'node:fs';
import { SKILLS } from './drill/skills.js';
import { gateSpot } from './drill/gate.js';
import { replaySpot, pinnedReads } from './drill/spot.js';
import { bankVersion } from './drill/version.js';
import { derive } from './drillentry.js';

const args = process.argv.slice(2);
const write = args.includes('--write');
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [k, n] = shardArg.split('/').map(Number);
const seeds = args.includes('--seeds') ? args[args.indexOf('--seeds') + 1].split(',').map(Number) : null;
const FILE = args.includes('--file') ? args[args.indexOf('--file') + 1] : 'src/drill/bank.json';
const bank = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const version = bankVersion();
console.log(`bank ${bank.version}, ${bank.spots.length} spots; current version ${version}${bank.version === version ? ' (unchanged)' : ''}`);

const keep = [];
const dropped = [];
bank.spots.forEach((e, i) => {
  if (i % n !== k) return;
  const skill = SKILLS[e.skill];
  const { s, belief } = replaySpot(e.spot);
  const reads = pinnedReads(e.spot.types);
  const g = gateSpot(s, belief, reads, skill, { ...(skill.gate || {}), ...(seeds ? { seeds, screenSeed: 900 + seeds[0] } : {}) });
  const same = g.ok && JSON.stringify(g.result.families) === JSON.stringify(e.families);
  if (!same) return dropped.push({ id: e.id, skill: e.skill, difficulty: e.difficulty, why: g.ok ? `families now ${JSON.stringify(g.result.families)}` : g.reason });
  // everything the label rests on comes from the current bots: the D1 draw rule, tricky, difficulty and the
  // coach's estimate lines (CURR, spec 2.3); the answers (families) never change on a kept spot
  const d = derive(e.skill, s, belief, reads, e.spot.types, g.result, e.spot.nicks);
  if (d.reject) return dropped.push({ id: e.id, skill: e.skill, difficulty: e.difficulty, why: d.reject });
  keep.push({ ...e, bankVersion: version, difficulty: d.difficulty, estimate: d.estimate, options: g.result.options, marginBars: g.result.marginBars, marginBb: g.result.marginBb, costBb: g.result.costBb, costBucket: g.result.costBucket, gate: { ...e.gate, samples: g.result.samples, tricky: d.tricky }, was: { difficulty: e.difficulty, version: e.bankVersion } });
});
for (const d of dropped) console.log(`DROP ${d.id}: ${d.why}`);
console.log(`${keep.length} pass, ${dropped.length} drop`);
// before / after per lesson (CURR): spots, the easy and tricky shares, and how many labels moved
const share = (es, lv) => (es.length ? Math.round((100 * es.filter((x) => x === lv).length) / es.length) : 0);
for (const code of Object.keys(SKILLS)) {
  const before = bank.spots.filter((e, i) => i % n === k && e.skill === code).map((e) => e.difficulty);
  if (!before.length) continue;
  const kept = keep.filter((e) => e.skill === code);
  const after = kept.map((e) => e.difficulty);
  const moved = kept.filter((e) => e.was.difficulty !== e.difficulty).length;
  console.log(`${code}: ${before.length} -> ${after.length} spots | easy ${share(before, 1)}% -> ${share(after, 1)}% | tricky ${share(before, 3)}% -> ${share(after, 3)}% | ${moved} label${moved === 1 ? '' : 's'} moved`);
}
if (write && n === 1 && !seeds) {
  fs.writeFileSync(FILE, JSON.stringify({ ...bank, version, spots: keep.map(({ was, ...e }) => e) }));
  console.log(`rewrote ${FILE} at ${version}`);
}
process.exitCode = dropped.length ? 1 : 0;
