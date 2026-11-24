// The hand goes on while the coach grades (CEO, owner, 23 Nov): a decision is recorded with a pending verdict, the
// verdict fills in later from the grade job built at that moment, in order, and nothing that needs it runs before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, PENDING_VERDICT } from '../src/trainer/session.js';
import { createVerdictQueue } from '../src/ui/verdictqueue.js';

// a session at a hero decision after the flop, with a few samples so the grade is fast and budget-free
function atHero(seed) {
  for (let k = 0; k < 60; k++) {
    const sess = new Session({ seed: seed + 1000 * k, samples: 30 });
    if (sess.dealUntil((p) => p.street >= 1)) return sess;
  }
  throw new Error('no spot');
}
const actionOf = (sess) => {
  const L = sess.heroOptions();
  return { type: L.canCheck ? 'check' : 'call' };
};

test('a pending decision: recorded now, verdict and explanation filled in later, identical to grading at once', () => {
  const a = atHero(17);
  const b = atHero(17);
  const act = actionOf(a);
  const now = b.heroAct(act); // graded at once, as without a worker
  const job = a.gradeJob(act);
  const copy = structuredClone(job);
  const d = a.heroCommitPending(act);
  assert.equal(d.pending, true);
  assert.equal(d.verdict, PENDING_VERDICT);
  assert.equal(d.headline, undefined, 'no explanation before the verdict');
  assert.equal(a.pendingDecisions().length, 1);
  assert.equal(a.hand.state.history.length, b.hand.state.history.length, 'the action is played at once');
  a.resolveDecision(d, Session.gradeJobHere(copy));
  assert.equal(d.pending, undefined);
  assert.deepEqual(d.verdict.options.map((o) => o.ev), now.verdict.options.map((o) => o.ev), 'the same job gives the same grade');
  assert.equal(d.verdict.grade, now.verdict.grade);
  assert.equal(d.headline, now.headline, 'the same explanation');
  assert.equal(a.pendingDecisions().length, 0);
});

test('the hand record waits for its pending verdicts; saving and the totals skip a pending decision', () => {
  const s = atHero(29);
  const ends = [];
  s.onHandEnd = (rec) => ends.push(rec);
  const job = structuredClone(s.gradeJob(actionOf(s)));
  const d = s.heroCommitPending(actionOf(s));
  s.finishAuto(); // the rest of the hand plays out (later hero decisions graded at once)
  assert.equal(s.status(), 'over');
  assert.equal(ends.length, 0, 'no hand record while a verdict is pending');
  assert.equal(s.hand.endDeferred, true);
  assert.ok(!s.toSaved().decisions.some((x) => x.id === d.id), 'a pending decision is not saved yet');
  const judgedBefore = s.review().judged ?? null;
  assert.doesNotThrow(() => s.review(), 'the session review skips a pending decision');
  const last = s.resolveDecision(d, Session.gradeJobHere(job));
  assert.equal(last, true);
  assert.equal(ends.length, 1, 'the hand record goes out once the verdict is in');
  assert.ok(ends[0].decisions.every((x) => !x.pending && x.verdict.grade !== 'pending'));
  assert.ok(s.toSaved().decisions.some((x) => x.id === d.id), 'saved once graded');
  assert.equal(Object.keys(d).includes('handRef'), false, 'the hand link is never copied');
});

test('verdicts attach in the order the decisions were made, whichever grade finishes first', async () => {
  const seen = [];
  const q = createVerdictQueue((ctx, v) => seen.push([ctx, v]));
  let r1, r2;
  const g1 = new Promise((r) => (r1 = r));
  const g2 = new Promise((r) => (r2 = r));
  q.push('first', g1);
  q.push('second', g2);
  r2('v2'); // the later decision's grade comes back first
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(seen, [], 'the second waits for the first');
  r1('v1');
  await q.idle();
  assert.deepEqual(seen, [['first', 'v1'], ['second', 'v2']]);
  // a failed grade does not stop the ones after it
  const q2 = createVerdictQueue((ctx, v) => seen.push([ctx, v]), () => seen.push(['error']));
  q2.push('bad', Promise.reject(new Error('x')));
  q2.push('next', Promise.resolve('v3'));
  await q2.idle();
  assert.deepEqual(seen.slice(2), [['error'], ['next', 'v3']]);
});

test('a decision the coach could not grade: not graded, no flag, out of the totals, and the hand record still goes out', () => {
  const s = atHero(41);
  const ends = [];
  s.onHandEnd = (rec) => ends.push(rec);
  const d = s.heroCommitPending(actionOf(s));
  s.finishAuto();
  const judged = s.review().judged;
  assert.equal(s.resolveNotGraded(d), true);
  assert.equal(d.notGraded, 'timeout');
  assert.match(d.headline, /: not graded \(the coach timed out\)\.$/);
  assert.equal(d.verdict.grade, 'good');
  assert.equal(s.review().judged, judged, 'not counted as judged');
  assert.equal(ends.length, 1);
});

test('the deal in steps gives the same hand as the deal at once', () => {
  const a = new Session({ seed: 77, samples: 30, skipBelow: 0.5 });
  const b = new Session({ seed: 77, samples: 30, skipBelow: 0.5 });
  for (let i = 0; i < 5; i++) {
    a.startPlayable();
    const g = b.startPlayableSteps();
    let r = g.next();
    let steps = 0;
    while (!r.done) { r = g.next(); steps++; }
    assert.deepEqual(b.hand.state.hole[0], a.hand.state.hole[0], `hand ${i}`);
    assert.equal(b.handNo, a.handNo);
    a.finishAuto();
    b.finishAuto();
  }
});

test('the stepped deal yields only after a hand is decided as skipped, never with a doomed hand live (QA AG3)', () => {
  const s = new Session({ seed: 91, samples: 30, skipBelow: 0.7 });
  let yields = 0;
  for (let i = 0; i < 6; i++) {
    const g = s.startPlayableSteps();
    let r = g.next();
    while (!r.done) {
      yields++;
      assert.equal(s.hand.over, true, 'between slices the table shows a finished hand');
      r = g.next();
    }
    s.finishAuto();
  }
  assert.ok(yields > 0, 'some hands were skipped');
});

test('a grade job is a copy taken at the decision, untouched by later play (QA AG6)', () => {
  const s = atHero(53);
  const job = s.gradeJob(actionOf(s));
  const len = job.state.history.length;
  s.heroCommitPending(actionOf(s));
  s.finishAuto();
  assert.equal(job.state.history.length, len, 'the job still holds the table as it was');
  assert.notEqual(job.state, s.hand.state);
});

// QA AG6 (CEO): a job held for the worker's hello, a job resent after a timeout, and one that times out twice. The first
// two grade exactly as an immediate grade of the same decision; the table having moved on changes nothing.
import { createJudge } from '../src/ui/judgeclient.js';
// a stand-in for the judge worker: postMessage copies like the real one; it grades with the worker's own code, after
// `helloMs`, and drops every grade while `drop` says so
function fakeWorkers({ helloDelay = 0, dropFirst = 0 } = {}) {
  let made = 0;
  let dropped = 0;
  return () => {
    made++;
    const w = {
      onmessage: null,
      onerror: null,
      terminated: false,
      terminate() { this.terminated = true; },
      postMessage(m0) {
        const m = structuredClone(m0);
        if (m.type === 'hello') setTimeout(() => !w.terminated && w.onmessage({ data: { type: 'hello', stale: [] } }), helloDelay);
        else if (m.type === 'grade') {
          if (dropped < dropFirst) { dropped++; return; }
          setTimeout(() => !w.terminated && w.onmessage({ data: { type: 'graded', id: m.id, verdict: Session.gradeJobHere(m.job) } }), 5);
        }
      },
    };
    return w;
  };
}
const evs = (v) => v.options.map((o) => +o.ev.toFixed(9));
test('a held job, a resent job and a twice-timed-out job (QA AG6): the first two grade as at once; the third is not graded', async () => {
  for (const [name, cfg, opts] of [['held for the hello', { helloDelay: 40 }, {}], ['resent after a timeout', { dropFirst: 1 }, { timeoutMs: 60 }]]) {
    const a = atHero(67);
    const b = atHero(67);
    const act = actionOf(a);
    const now = b.heroAct(act).verdict;
    const judge = createJudge({ makeWorker: fakeWorkers(cfg), ...opts });
    const p = judge.grade(a.gradeJob(act));
    a.heroCommitPending(act);
    a.finishAuto(); // the table moves on (later streets, the hand's end) before the grade is made
    const v = await p;
    assert.deepEqual(evs(v), evs(now), `${name}: the same option values as an immediate grade`);
    assert.equal(v.grade, now.grade, name);
    assert.equal(v.options.length, now.options.length, name);
  }
  const judge = createJudge({ makeWorker: fakeWorkers({ dropFirst: 2 }), timeoutMs: 40 });
  const s = atHero(67);
  await assert.rejects(judge.grade(s.gradeJob(actionOf(s))), /timeout/, 'timed out twice: rejected, so the page shows not graded');
});
test('a grade job is snapshotted frozen: nothing can change it after the click', async () => {
  let seen = null;
  const judge = createJudge({ timeoutMs: 20, helloMs: 50, makeWorker: () => ({ terminate() {}, postMessage(m) { if (m.type === 'hello') setTimeout(() => this.onmessage({ data: { type: 'hello', stale: [] } }), 0); else seen = m.job; } }) });
  const s = atHero(71);
  const p = judge.grade(s.gradeJob(actionOf(s))).catch(() => 'not graded');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await p, 'not graded', 'never answered: not graded, never graded on the page');
  assert.ok(Object.isFrozen(seen) && Object.isFrozen(seen.state) && Object.isFrozen(seen.state.history));
});
