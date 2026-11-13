// The hand history keeps a compact record of each hand; the replayer rebuilds it action by action.
// The rebuilt hand must match what happened, and the rebuilt ranges must match the coach's ranges
// as they stood at the end of each street during play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/trainer/session.js';
import { replayHand } from '../src/trainer/replay.js';
import { presetRanges, presetRaised } from '../src/trainer/ranges.js';

function play(hands, seed) {
  const sess = new Session({ seed, samples: 16, heroRanges: presetRanges('loose'), heroRangesRaised: presetRaised('loose') });
  const records = [];
  sess.onHandEnd = (rec) => records.push({ rec, snaps: rec.kind === 'hand' ? sess.hand.rangeSnaps : null });
  let k = 0;
  for (let h = 0; h < hands; h++) {
    sess.startPlayable();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') sess.stepBot();
      else {
        const L = sess.heroOptions();
        const r = (k++ * 7919) % 10;
        const a = L.canRaise && r < 3 ? { type: 'raise', to: Math.min(L.maxTo, Math.max(L.minTo, Math.round(L.pot * 0.7))) } : L.canCheck ? { type: 'check' } : r < 7 ? { type: 'call' } : { type: 'fold' };
        sess.heroAct(a);
      }
    }
  }
  return { sess, records };
}

test('replay: recorded hands rebuild exactly, ranges included', () => {
  const { records } = play(40, 5);
  const hands = records.filter((x) => x.rec.kind === 'hand');
  assert.ok(hands.length >= 30, `${hands.length} hands kept`);
  assert.ok(records.some((x) => x.rec.kind === 'skip'), 'hands folded for you are marked, not kept');
  let compared = 0;
  for (const { rec, snaps } of hands) {
    const json = JSON.stringify(rec);
    assert.ok(json.length < 60000, `record is ${json.length} bytes`);
    const back = JSON.parse(json); // what storage gives back
    const { steps, final } = replayHand(back);
    assert.deepEqual(final.stacks, rec.startStacks.map((x, i) => x + rec.result.net[i]), `hand ${rec.no}: stacks`);
    assert.deepEqual(final.board, rec.board);
    assert.equal(steps.length - 1, rec.history.filter((e) => !['sb', 'bb', 'straddle'].includes(e.type)).length);
    // end-of-street ranges: the step just before each new street's first card holds them
    for (const [street, bySeat] of Object.entries(snaps)) {
      const boardAfter = [3, 4, 5][+street];
      const step = steps.find((st) => st.board >= boardAfter);
      if (!step) continue;
      for (const [seat, g] of Object.entries(bySeat)) {
        if (!g || !step.ranges[seat]) continue;
        const a = step.ranges[seat].cells.map((c) => [c.fill, c.share, c.kind, c.ahead].map((x) => (x === null ? null : +x.toFixed(9))));
        const b = g.cells.map((c) => [c.fill, c.share, c.kind, c.ahead].map((x) => (x === null ? null : +x.toFixed(9))));
        assert.ok(b.some((x) => x[1] > 0), 'a real range');
        assert.deepEqual(a, b, `hand ${rec.no} street ${street} seat ${seat}`);
        compared++;
      }
    }
  }
  assert.ok(compared > 20, `${compared} ranges compared`);
});

test('replay: a saved session comes back between hands', () => {
  const { sess } = play(12, 9);
  const saved = structuredClone(sess.toSaved()); // what IndexedDB stores and gives back
  const back = Session.fromSaved(saved);
  assert.equal(back.handNo, sess.handNo);
  assert.equal(back.heroNet(), sess.heroNet());
  assert.equal(back.seats.length, sess.seats.length);
  assert.equal(back.decisions.length, sess.decisions.length);
  back.startPlayable();
  let guard = 0;
  while (back.status() !== 'over' && guard++ < 400) {
    if (back.status() === 'bot') back.stepBot();
    else back.heroAct({ type: back.heroOptions().canCheck ? 'check' : 'fold' });
  }
  assert.equal(back.status(), 'over');
});
