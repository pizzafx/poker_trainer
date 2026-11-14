// Snapshot replay (scripts/replay_snapshot.js): a judged decision rebuilt from its table snapshot and
// judged again. The round trip must give the trainer's own verdict back; every saved set piece in
// test/fixtures/snapshots/ must still get the verdict its "expect" block pins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { Session } from '../src/trainer/session.js';
import { disputeReport } from '../src/trainer/dispute.js';
import { rejudge, rejudgeFixture } from '../scripts/replay_snapshot.js';
import { explain } from '../src/trainer/explain.js';

// Decisions from a seeded session that calls everything: preflop and later streets, flagged and not.
function decisions(want = 8) {
  const sess = new Session({ seed: 11, samples: 120 });
  const out = [];
  for (let h = 0; h < 60 && out.length < want; h++) {
    sess.startHand();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const L = sess.heroOptions();
      const d = sess.heroAct({ type: L.canCheck ? 'check' : 'call' });
      const flagged = d.verdict.grade !== 'good';
      if (flagged || (d.street > 0 && out.filter((x) => x.street > 0).length < 3)) out.push(d);
    }
  }
  return out;
}

test('snapshot replay: a decision rebuilt from its "Disagree?" report gets the same verdict', () => {
  const ds = decisions();
  assert.ok(ds.length >= 5, `found ${ds.length} decisions`);
  assert.ok(ds.some((d) => d.verdict.grade !== 'good'), 'at least one flagged decision');
  assert.ok(ds.some((d) => d.street > 0), 'at least one after the flop');
  for (const d of ds) {
    const r = rejudge(JSON.parse(JSON.stringify(disputeReport(d))));
    const v = r.verdict;
    const tag = `hand ${d.hand} ${d.streetName}: ${d.verdict.options[d.verdict.mine]?.label}`;
    assert.equal(v.grade, d.verdict.grade, `${tag}: grade`);
    assert.equal(v.options[v.best].label, d.verdict.options[d.verdict.best].label, `${tag}: best`);
    assert.equal(r.took, d.verdict.options[d.verdict.mine].label, `${tag}: the play`);
    assert.equal(v.options.length, d.verdict.options.length, `${tag}: options`);
    for (const [k, o] of v.options.entries()) assert.ok(Math.abs(o.ev - d.verdict.options[k].ev) < 0.05, `${tag}: ${o.label} ${o.ev} vs ${d.verdict.options[k].ev}`);
    // the coach's words come out the same too
    assert.equal(explain({ ...d, verdict: v }).headline, d.headline.startsWith('Best') ? explain(d).headline : d.headline, `${tag}: headline`);
  }
});

const DIR = new URL('./fixtures/snapshots/', import.meta.url);
let files = [];
try {
  files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
} catch {
  /* no set pieces yet */
}
for (const f of files) {
  const fx = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
  test(`snapshot set piece ${fx.name}: ${fx.why || 'pinned verdict'}`, () => {
    const r = rejudgeFixture(fx);
    const e = fx.expect || {};
    const tag = `${fx.name}: ${r.verdict.options.map((o) => `${o.label} ${o.ev.toFixed(1)}`).join(' | ')}`;
    if (e.grade) assert.equal(r.grade, e.grade, `${tag}: grade`);
    if (e.notGrade) assert.notEqual(r.grade, e.notGrade, `${tag}: grade`);
    if (e.best) assert.equal(r.best, e.best, `${tag}: best`);
    if (e.ref !== undefined) assert.equal(r.ref, e.ref, `${tag}: reference`);
    if (e.notNote) assert.notEqual(r.verdict.note, e.notNote, `${tag}: note`);
  });
}
