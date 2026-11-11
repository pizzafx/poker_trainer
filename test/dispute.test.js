import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/trainer/session.js';
import { disputeReport, disputeText, disputeIssueUrl, REPORT_VERSION, MAX_ISSUE_URL, ISSUE_REPO } from '../src/trainer/dispute.js';

// Plays hands calling everything (a loose player gets flagged fast) until a decision is flagged.
function firstFlagged() {
  const sess = new Session({ seed: 3, samples: 30 });
  for (let h = 0; h < 80; h++) {
    sess.startHand();
    let flagged = null;
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const L = sess.heroOptions();
      const d = sess.heroAct({ type: L.canCheck ? 'check' : 'call' });
      if (!flagged && d.verdict.grade !== 'good') {
        flagged = d;
        flagged.reportDuringHand = disputeReport(d, { preferred: 'Fold', why: 'test' });
      }
    }
    if (flagged) return { sess, d: flagged };
  }
  throw new Error('no flagged decision in 80 hands');
}

test('dispute report: captures the spot, hides cards until the hand is over, round-trips as JSON', () => {
  const { sess, d } = firstFlagged();
  assert.equal(typeof d.id, 'number');
  assert.equal(sess.decisions.find((x) => x.id === d.id), d);

  const during = d.reportDuringHand;
  assert.equal(during.kind, 'trainer-dispute');
  assert.equal(during.version, REPORT_VERSION);
  assert.equal(during.truth, null, 'no opponent cards while the hand was still being played');
  assert.deepEqual(during.player, { preferred: 'Fold', why: 'test' });
  assert.ok(during.decision.hole.split(' ').length === 2);
  assert.equal(during.decision.hand, d.hand);
  assert.equal(during.verdict.grade, d.verdict.grade);
  assert.equal(during.verdict.options.length, d.verdict.options.length);
  assert.equal(during.verdict.options.filter((o) => o.best).length, 1);
  assert.equal(during.verdict.options.filter((o) => o.took).length, 1);

  const t = during.table;
  assert.ok(t, 'table snapshot');
  assert.equal(t.seats.length, sess.seats.length);
  assert.equal(t.seats[0].name, 'You');
  assert.ok(!('read' in t.seats[0]));
  for (const p of t.seats.slice(1)) {
    assert.ok(p.read.length >= 1 && p.read.every((r) => r.p >= 0 && r.p <= 1));
    assert.ok(!('cards' in p) && !('type' in p), 'snapshot holds only what the trainee could see');
  }
  assert.ok(t.actions.length >= 2, 'blinds at least');
  assert.equal(t.blinds[1], sess.game.bb);
  assert.equal(typeof t.judge.seed, 'number');

  // After the hand, the same decision's report carries what everyone held.
  const after = disputeReport(d);
  assert.ok(after.truth);
  assert.equal(after.truth.players.length, sess.seats.length - 1);
  for (const p of after.truth.players) assert.match(p.cards, /^[2-9TJQKA][cdhs] [2-9TJQKA][cdhs]$/);

  // The text form ends with the JSON, which parses back to the same report.
  const text = disputeText(during);
  assert.match(text, /^Trainer dispute/);
  assert.match(text, /I would: Fold/);
  const json = text.slice(text.indexOf('--- data ---') + '--- data ---'.length).trim();
  assert.deepEqual(JSON.parse(json), during);
});

test('dispute issue link: prefilled, always short enough for GitHub, summary always included', () => {
  const sess = new Session({ seed: 3, samples: 30 });
  for (let h = 0; h < 60; h++) {
    sess.startHand();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const L = sess.heroOptions();
      sess.heroAct({ type: L.canCheck ? 'check' : 'call' });
    }
  }
  const flagged = sess.decisions.filter((d) => d.verdict.grade !== 'good');
  assert.ok(flagged.length >= 10);
  for (const d of flagged) {
    for (const why of ['', 'Too tight.', 'x'.repeat(1500)]) {
      const report = disputeReport(d, { preferred: 'Fold', why });
      const url = disputeIssueUrl(report);
      assert.ok(url.startsWith(`${ISSUE_REPO}/issues/new?`));
      assert.ok(url.length <= MAX_ISSUE_URL, `link is ${url.length} characters`);
      const q = new URL(url).searchParams;
      assert.match(q.get('title'), new RegExp(`^Dispute: hand ${d.hand} `));
      const body = q.get('body');
      assert.match(body, /^Trainer dispute/);
      assert.ok(body.includes(report.decision.hole), 'cards in the body');
      if (body.includes('```json')) {
        const json = body.slice(body.indexOf('```json') + 7, body.lastIndexOf('```')).trim();
        assert.deepEqual(JSON.parse(json), report);
      } else assert.match(body, /Save as file/);
    }
  }
});
