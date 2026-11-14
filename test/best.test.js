// The best-play rule (trainer/best.js; STRAT's rule, header design Addendum B), on hand-built verdicts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isBestPlay, bestPlayEdge, bestHeadline, verdictWord } from '../src/trainer/best.js';

// A turn spot, pot $100, yellow bar $10: check, bet $50, bet $75, bet $100.
const base = (over = {}) => ({
  grade: 'good',
  mine: 1,
  best: 1,
  small: 10,
  pot: 100,
  options: [
    { type: 'check', label: 'Check', ev: 20, close: false },
    { type: 'raise', to: 50, label: 'Bet $50 (50% pot)', ev: 40, close: true },
    { type: 'raise', to: 75, label: 'Bet $75 (75% pot)', ev: 36, close: true },
    { type: 'raise', to: 100, label: 'Bet $100 (100% pot)', ev: 33, close: false },
  ],
  ...over,
});
const withOpt = (i, o) => {
  const v = base();
  v.options[i] = { ...v.options[i], ...o };
  return v;
};

test('best play: the best kind, clearly ahead of the other kind, gets the ring and names the alternative', () => {
  const e = bestPlayEdge(base(), {});
  assert.ok(e);
  assert.equal(e.label, 'Check');
  assert.equal(e.gap, 20);
});

test('best play: an option of another kind marked ≈ means fine', () => {
  assert.equal(isBestPlay(withOpt(0, { close: true }), {}), false);
});

test('best play: an edge under half the yellow bar means fine', () => {
  assert.equal(isBestPlay(withOpt(0, { ev: 36 }), {}), false); // $4 < $5
  assert.equal(isBestPlay(withOpt(0, { ev: 35 }), {}), true); // $5
});

test('best play: a size within the yellow bar of the best size counts; one beyond it does not', () => {
  assert.equal(isBestPlay(base({ mine: 2 }), {}), true); // $4 behind
  assert.equal(isBestPlay(base({ mine: 3 }), {}), true); // $7 behind, within the $10 bar
  const v = base({ mine: 3 });
  v.options[3].ev = 29; // $11 behind the best size
  assert.equal(isBestPlay(v, {}), false);
});

test('best play: a bigger size than the reference never earns the ring', () => {
  // the guardrail capped the comparison at 3/4 pot: the reference is bet $75
  const v = base({ best: 2, ref: 'upTo75', note: 'sizeCheck', mine: 3 });
  v.options[3].ev = 35;
  assert.equal(isBestPlay(v, {}), false);
  assert.equal(isBestPlay(base({ best: 2, ref: 'upTo75', note: 'sizeCheck', mine: 2 }), {}), true);
});

test('best play: the wrong kind, a flag, a note, a guardrail, a rule or a tip means no ring', () => {
  assert.equal(isBestPlay(base({ mine: 0 }), {}), false);
  assert.equal(isBestPlay(base({ grade: 'mistake' }), {}), false);
  for (const note of ['mwHabit', 'preBluff', 'fragile', 'unclear', 'anchor', 'mwCheck', 'mwDraw', 'tinyPot', 'anchorEven', 'passedBluff']) assert.equal(isBestPlay(base({ note }), {}), false, note);
  assert.equal(isBestPlay(base({ ref: 'noRaise' }), {}), false);
  assert.equal(isBestPlay(base({ costly: { note: 'mwCheck' } }), {}), false);
  assert.equal(isBestPlay(base({ rule: 'R5' }), {}), false);
  assert.equal(isBestPlay(base(), { tipKind: 'wideOpen' }), false);
});

test('best play: a fold or check is not marked when the alternative loses by three yellow bars or more', () => {
  const fold = (betEv) => ({
    grade: 'good', mine: 0, best: 0, small: 10, pot: 100,
    options: [{ type: 'fold', label: 'Fold', ev: 0, close: true }, { type: 'call', label: 'Call $40', ev: betEv, close: false }],
  });
  assert.equal(isBestPlay(fold(-12), {}), true); // a hard fold: 1.2 bars
  assert.equal(isBestPlay(fold(-30), {}), false); // trivial: 3 bars
  // a value bet is never excluded for being obvious
  assert.equal(isBestPlay(withOpt(0, { ev: -100 }), {}), true);
});

test('best play headline: never "fine" under the ring; names a size of the same kind within the bar', () => {
  // bet $50 is best; bet $75 is $4 behind (within the $10 bar), bet $100 is $7 behind
  assert.equal(bestHeadline(base(), {}), 'Bet $50 (50% pot): best play. (Bet $75 works about as well.)');
  // no other size within the bar: the plain line
  const v = base();
  v.options[2].ev = 25;
  v.options[3].ev = 20;
  assert.equal(bestHeadline(v, {}), 'Bet $50 (50% pot): best play.');
  // a play without the ring keeps the coach's own headline (null here)
  assert.equal(bestHeadline(base({ note: 'mwHabit' }), {}), null);
  for (const h of [bestHeadline(base(), {}), bestHeadline(v, {})]) assert.ok(!/fine|rates about the same/.test(h), h);
});

test('grade word: "best play" exactly when the ring shows, for every verdict shape', () => {
  const cases = [base(), base({ mine: 0 }), base({ mine: 2 }), base({ note: 'mwHabit' }), base({ note: 'sizeCheck', ref: 'upTo75', best: 2, mine: 2 }), withOpt(0, { close: true }), withOpt(0, { ev: 36 }), base({ rule: 'R5' })];
  for (const v of cases) for (const d of [{}, { tipKind: 'wideOpen' }]) assert.equal(verdictWord(v, d) === 'best play', isBestPlay(v, d), JSON.stringify({ mine: v.mine, note: v.note, d }));
  assert.equal(verdictWord(base({ grade: 'mistake' }), {}), 'mistake');
  assert.equal(verdictWord(base({ note: 'unclear' }), {}), 'not graded');
  assert.equal(verdictWord(base({ mine: 0 }), {}), 'fine');
});

test('the table strip takes its word and ring from the verdict, in the dimmed state too (owner bug, Nov 2026)', () => {
  // stripHtml is DOM code; guard its source: the word comes from verdictWord and the ring from isBest,
  // neither gated on the previous-decision state; only the pop is
  const src = fs.readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function stripHtml('), src.indexOf('function renderToast('));
  assert.match(body, /const best = isBest\(show\);/);
  assert.match(body, /const word = verdictWord\(v, show\);/);
  assert.match(body, /const sheen = best && !prev &&/);
  assert.doesNotMatch(body, /best = !prev/);
});
