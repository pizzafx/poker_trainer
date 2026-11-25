// The ahead-now copy fix (MATH, STRAT, CEO): before the river, facing a bet, the call or fold line sets E (what you'd
// win if it went to showdown, exact, from the Ranges tab's own pass) against the price, never the share ahead right
// now. The ending follows the verdict; heads-up only; multiway E is one range's and is never set against the price.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runoutLine } from '../src/trainer/explain.js';
import { runoutOf } from '../src/trainer/grade.js';
import { ladderOf, ladderEquity } from '../src/trainer/rangeladder.js';
import { build } from '../scripts/gradeall.js';
import { rejudge } from '../scripts/replay_snapshot.js';
import { anchorLine } from '../src/trainer/explain.js';
import { INVARIANTS } from '../scripts/verdictcheck.js';
import { TYPE_IDS } from '../src/bots/profiles.js';
import { TIER } from '../src/engine/features.js';

const opts = (callEv, foldEv, o = {}) => [{ type: 'fold', ev: foldEv, close: !!o.foldClose }, { type: 'call', ev: callEv, close: !!o.callClose }];
const line = ({ E, P, callEv = 0, foldEv = 0, oop = true, hu = true, note, opp = 1, callClose, foldClose, noE, realDraw } = {}) => {
  const options = opts(callEv, foldEv, { callClose, foldClose });
  const best = callEv >= foldEv ? 1 : 0;
  const v = { options, best, mine: best, grade: 'good', note, anchors: { price: P }, ...(noE ? {} : { runout: { seat: 3, E, hu } }) };
  const d = { verdict: v, opponents: opp, table: { oop }, villain: { nick: 'Jo', seat: 3 }, realDraw: !!realDraw };
  return runoutLine(d, v, v.anchors);
};

test('agreeing cases: not enough, fold / call', () => {
  assert.equal(line({ E: 0.1, P: 0.25, callEv: -20 }), "You'd win about 10% if it went to showdown and need 25%; not enough. Fold.");
  assert.equal(line({ E: 0.45, P: 0.25, callEv: 12 }), "You'd win about 45% if it went to showdown and need 25%. Call.");
});
test('E covers the price but folding is best: the reason, out of position and in position', () => {
  assert.equal(line({ E: 0.29, P: 0.21, callEv: -6 }), "You'd win about 30% if it went to showdown and need 20%, but out of position against this player you won't get there often enough. Fold.");
  assert.equal(line({ E: 0.29, P: 0.21, callEv: -6, oop: false }), "You'd win about 30% if it went to showdown and need 20%, but the bets still to come from this player cost more than that edge. Fold.");
});
test('E short of the price but calling is best: implied odds', () => {
  assert.equal(line({ E: 0.15, P: 0.3, callEv: 4, realDraw: true }), "You'd win about 15% if it went to showdown and need 30%, but when you hit, this player pays you enough to make up the rest. Call.");
  // a made hand with no real draw (STRAT)
  assert.equal(line({ E: 0.15, P: 0.3, callEv: 4 }), "You'd win about 15% if it went to showdown and need 30%, but what you win on later streets makes up the rest. Call.");
});
test('close or not graded: "…: close."', () => {
  assert.equal(line({ E: 0.1, P: 0.25, callEv: -3, callClose: true }), "You'd win about 10% if it went to showdown and need 25%: close.");
  assert.equal(line({ E: 0.1, P: 0.25, callEv: -30, note: 'unclear' }), "You'd win about 10% if it went to showdown and need 25%: close.");
});
test('equal printed figures: "about what the price needs", then the ending, no reason clause', () => {
  assert.equal(line({ E: 0.24, P: 0.26, callEv: -9 }), "You'd win about 25% if it went to showdown, about what the price needs. Fold.");
  assert.equal(line({ E: 0.26, P: 0.24, callEv: 9 }), "You'd win about 25% if it went to showdown, about what the price needs. Call.");
});
test('multiway: against the bettor\'s range alone, never set against the price', () => {
  const s = line({ E: 0.4, P: 0.2, callEv: 5, hu: false, opp: 2 });
  assert.equal(s, "Against Jo's range alone you'd win about 40% if it went to showdown; the others still in make it worse. Call.");
  assert.doesNotMatch(s, /need|price/);
});
test('no E (an old record): the price and the ending, no figure for the hand', () => {
  assert.equal(line({ P: 0.25, callEv: -20, noE: true }), 'The price needs 25%. Fold.');
});

test('E is exact and the same figure the Ranges tab shows; only flop and turn facing a bet', () => {
  const spot = { id: 'E', button: 2, hole: 'Ah 7h', board: 'Kd 7c 2s 9h 3d', seats: { 5: 'station' }, conf: { 5: 0.85 }, line: '5c 0r9 5c | 5b6' };
  const { s, belief } = build(spot);
  const ro = runoutOf(s, belief);
  assert.equal(ro.seat, 5);
  assert.equal(ro.hu, true);
  assert.equal(ro.E, ladderEquity(ladderOf(belief.range(5), s.board, s.hole[0])).equity);
  const river = build({ id: 'R', button: 0, hole: 'Ad 8d', board: 'As 8h 4c Jd 2s', seats: { 7: 'station', 2: 'station' }, line: '7c 0r15 2c 7c | 2x 7x 0x | 2x 7x 0x | 2b30 7c' });
  assert.equal(runoutOf(river.s, river.belief), null);
  const unbet = build({ id: 'U', button: 2, hole: 'Ah 7h', board: 'Kd 7c 2s 9h 3d', seats: { 5: 'station' }, line: '5c 0r9 5c | 5x' });
  assert.equal(runoutOf(unbet.s, unbet.belief), null);
});

// hand 39 d114 (PRO, STRAT, MATH): E about 29% against a 21% price, and no "not enough. Fold."
test('hand 39 d114: E about 29% against the 21% price, never "not enough. Fold."', () => {
  const rec = JSON.parse(readFileSync(new URL('./fixtures/records/aheadnow-h39d114.json', import.meta.url), 'utf8'));
  const r = rejudge(JSON.parse(JSON.stringify(rec)));
  assert.ok(r.verdict.runout.E > 0.27 && r.verdict.runout.E < 0.31, `E ${r.verdict.runout.E}`);
  const a = anchorLine({ ...rec, verdict: r.verdict });
  assert.match(a, /^You'd win about 30% if it went to showdown and need 20%/);
  assert.doesNotMatch(a, /not enough\. Fold\./);
  assert.doesNotMatch(a, /ahead/);
});

test('verdictcheck AN1: an ahead-now figure beside the price before the river is a violation; "now" on bet lines', () => {
  const an = INVARIANTS[Object.keys(INVARIANTS).find((k) => k.startsWith('AN1'))];
  assert.equal(an({ street: 1, anchor: 'You are ahead about 30% of the time and need 20% at this price. Fold.' }), true);
  assert.equal(an({ street: 1, anchor: "You'd win about 30% if it went to showdown and need 20%. Call." }), false);
  assert.equal(an({ street: 2, anchor: 'When called you are ahead about 60% of the time and need 50%. That is thin.' }), true);
  assert.equal(an({ street: 2, anchor: 'When called you are ahead now about 60% of the time and need 50%. That is thin.' }), false);
  assert.equal(an({ street: 1, anchor: 'You are ahead now 30% of the time and your draw comes in 20% of the time; the price needs 25%: close.' }), false);
  assert.equal(an({ street: 'turn', anchor: 'You are ahead about 30% of the time and need 20% at this price. Fold.' }), true);
  assert.equal(an({ street: 2, anchor: 'A bet of $14: when this bet is called you are ahead right now about 75% of the time and need about 35%. These players call with worse: bet for value.' }), false);
  assert.equal(an({ street: 1, anchor: 'Called, you are almost never ahead; almost no one folds, and it needs 40%.' }), true);
  assert.equal(an({ street: 1, anchor: 'Called, you are almost never ahead now; almost no one folds, and it needs 40%.' }), false);
  assert.equal(an({ street: 2, anchor: 'You are almost never ahead here and need 10% at this price; not enough. Fold.' }), true);
  assert.equal(an({ street: 3, anchor: 'You are ahead about 30% of the time and need 20% at this price. Fold.' }), false);
});

// STRAT (17d5ea6 review): the ends, the range sentences and the raise tail
const lineD = (o, d = {}) => {
  const options = [{ type: 'fold', ev: o.foldEv ?? 0 }, { type: 'call', ev: o.callEv ?? 0 }];
  const best = (o.callEv ?? 0) >= (o.foldEv ?? 0) ? 1 : 0;
  const v = { options, best, mine: best, grade: 'good', anchors: { price: o.P }, runout: { seat: 3, E: o.E, hu: o.hu ?? true } };
  return runoutLine({ verdict: v, opponents: o.hu === false ? 2 : 1, table: { oop: true }, villain: { nick: 'Jo', seat: 3, picture: d.picture }, tier: d.tier }, v, v.anchors);
};
const read = (id, buckets) => ({ post: Float64Array.from(TYPE_IDS.map((t) => (t === id ? 0.9 : 0.1 / (TYPE_IDS.length - 1)))), buckets });
test('the ends read "almost never win" / "almost always win", then ", and need"', () => {
  assert.equal(lineD({ E: 0.02, P: 0.25, callEv: -20 }), "You'd almost never win if it went to showdown, and need 25%; not enough. Fold.");
  assert.equal(lineD({ E: 0.97, P: 0.25, callEv: 20 }), "You'd almost always win if it went to showdown, and need 25%. Call.");
  assert.equal(lineD({ E: 0.02, P: 0.25, callEv: -20, hu: false }), "Against Jo's range alone you'd almost never win if it went to showdown; the others still in make it worse. Fold.");
});
test('a fold the numbers agree with keeps the bettor\'s range sentence', () => {
  assert.equal(lineD({ E: 0.1, P: 0.25, callEv: -20 }, { picture: read('station', { air: 0.05, draw: 0.05 }) }), "You'd win about 10% if it went to showdown and need 25%; not enough. Good players bluff just enough to make this close. This player's bets are nearly always real. Fold.");
  assert.equal(lineD({ E: 0.1, P: 0.25, callEv: -20 }, { picture: read('maniac', { air: 0.3, draw: 0.1 }) }), "Even against a player who bluffs this often, you'd win only 10% if it went to showdown and need 25%. Fold.");
  // E >= P with a fold: the position reason, no range sentence
  assert.match(lineD({ E: 0.3, P: 0.2, callEv: -6 }, { picture: read('station', { air: 0.05, draw: 0.05 }) }), /out of position against a calling station you won't get there often enough\. Fold\.$/);
});
test('a call keeps the raise tail for a pair up to an overpair or top pair, top kicker', () => {
  assert.equal(lineD({ E: 0.45, P: 0.25, callEv: 10 }, { tier: TIER.TOP_PAIR_WEAK }), "You'd win about 45% if it went to showdown and need 25%. Call. Raising gets called mostly by better hands.");
  assert.equal(lineD({ E: 0.45, P: 0.25, callEv: 10 }, { tier: TIER.TWO_PAIR }), "You'd win about 45% if it went to showdown and need 25%. Call.");
});
test('never "Call." under a fine fold or "Fold." under a fine call: close (STRAT M1)', () => {
  const options = [{ type: 'fold', ev: 0 }, { type: 'call', ev: 5 }, { type: 'raise', ev: 30, to: 60 }];
  const v = { options, best: 2, mine: 0, grade: 'good', anchors: { price: 0.2 }, runout: { seat: 3, E: 0.3, hu: true } };
  assert.equal(runoutLine({ verdict: v, opponents: 1, table: { oop: true }, villain: { nick: 'Jo', seat: 3 } }, v, v.anchors), "You'd win about 30% if it went to showdown and need 20%: close.");
});
