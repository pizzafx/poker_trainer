// 'preVs3bet' (STRAT's spec v2, MATH's thresholds, CEO-approved 23 Nov; the owner's hand 551): a preflop call or
// re-raise facing a re-raise where folding is best gets its own copy, true by construction from the belief.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../scripts/gradeall.js';
import { vs3betFacts } from '../src/trainer/vs3bet.js';
import { explain } from '../src/trainer/explain.js';
import { parseCards } from '../src/engine/cards.js';

const facts = (spot) => {
  const { s, belief, env } = build(spot);
  return { s, f: vs3betFacts(s, belief, env.readOf) };
};
// a decision record facing the re-raise: hero's play (call or raise) loses to folding by `loss` dollars
const rec = (s, f, { play = 'call', loss = 40, oop = true, raises = 2 } = {}) => {
  const options = [
    { type: 'fold', label: 'Fold', ev: 0 },
    { type: 'call', label: `Call $${f ? f.call : 18}`, ev: play === 'call' ? -loss : -loss / 2 },
    { type: 'raise', to: 200, label: 'Raise to $200', ev: play === 'raise' ? -loss : -loss * 2 },
  ];
  return {
    street: 0, toCall: f ? f.call : 18, raises, opponents: 1, position: 'LJ', hole: s ? s.hole[0] : parseCards('Ts Th'), board: [],
    table: { oop, n: 8 }, vs3bet: f, tier: null, liveTypes: [],
    verdict: { grade: 'mistake', mine: play === 'call' ? 1 : 2, best: 0, options, small: 6, loss, se: 1 },
  };
};

test("hand 551: a calling station's 3-bet over your raise, the price, the set clause and the theory line", () => {
  const { s, f } = facts({ id: 'H551', button: 3, hole: 'Ts Th', board: '', seats: { 3: 'station' }, stacks: { 0: 1405, 3: 413 }, line: '0r21 3r90' });
  assert.ok(f.P >= 0.85, `P ${f.P}`);
  const e = explain(rec(s, f));
  assert.equal(e.category, 'preVs3bet');
  const text = e.reasons.join(' ');
  assert.match(text, /A calling station who 3-bets over your raise almost always has (aces and kings|KK\+ and AK|QQ\+ and AK), about \d+%\./);
  assert.match(text, /You need about \d+% to call, and this hand wins only about \d+% against that range, even seeing all five cards\./, 'Price');
  assert.match(text, /With only about 4\.7 times the call left behind, hitting a set doesn't pay enough, and you'd play the rest out of position\./);
  assert.doesNotMatch(text, /behind most of that range/);
  assert.match(e.theory, /a solver calls here, because its 3-bets include many weaker hands\. This player's don't\./);
});

test('a lag or maniac 3-bettor: no range line and no theory line; the reason is realisation', () => {
  for (const t of ['lag', 'maniac']) {
    const { s, f } = facts({ id: t, button: 3, hole: 'Ts Th', board: '', seats: { 3: t }, line: '0r8 3r26' });
    assert.ok(f.P < 0.67, `${t} P ${f.P}`);
    const e = explain(rec(s, f, { loss: 10 }));
    assert.equal(e.category, 'preVs3bet');
    const text = e.reasons.join(' ');
    assert.doesNotMatch(text, /almost always|mostly has/, `${t}: no strength claim`);
    assert.match(text, /It wins about \d+% if all the cards come, but playing it out returns only about \$\d+ of the \$18 it costs/, `${t}: Realisation`);
    assert.equal(e.theory, null, `${t}: no theory line`);
  }
});

test('a straightforward player with TT: thin; under 1.5x the pot behind never realisation; a 4-bet into a strong range', () => {
  const { s, f } = facts({ id: 'abc', button: 3, hole: 'Ts Th', board: '', seats: { 3: 'abc' }, line: '0r8 3r26' });
  assert.match(explain(rec(s, f, { loss: 3 })).reasons.join(' '), /It's about break-even on paper, and you won't see all five cards for free, out of position/);
  // short stacks: the all-in price, and a hand well above it never reads Realisation; a plain line instead (MATH, STRAT)
  const short = { ...f, short: true, eq: f.need + 0.12, behind: 40, P: 0.5, set: null };
  const t2 = explain(rec(s, short, { loss: 3 })).reasons.join(' ');
  assert.match(t2, /Against this range, the call scores worse than folding/);
  assert.doesNotMatch(t2, /if all the cards come/);
  // a 4-bet where folding is best, against an almost-all-strong range
  const t3 = explain(rec(s, { ...f, P: 0.9, set: 'QQ+ and AK', S: 90 }, { play: 'raise' })).reasons.join(' ');
  assert.match(t3, /The hands that continue are almost all ahead of yours\./);
});

// the owner's real line (QA's h551s.mjs): $1/$3 build, UTG and UTG+1 limp, hero isolates to $21 from the LJ, the station on
// the button 3-bets to $90, the limpers fold
test("hand 551, the owner's line: over your raise, the price, the set clause and the theory line", () => {
  const { s, f } = facts({ id: 'H551', button: 3, hole: 'Ts Th', board: '', seats: { 3: 'station', 6: 'pool', 7: 'pool' }, conf: { 3: 0.85 }, stacks: { 0: 1405, 3: 413 }, line: '6c 7c 0r21 3r90 6f 7f' });
  assert.equal(f.overYours, true);
  const e = explain(rec(s, f));
  assert.equal(e.category, 'preVs3bet');
  const text = e.reasons.join(' ');
  assert.match(text, /A calling station who 3-bets over your raise almost always has/);
  assert.match(text, /You need about \d+% to call, and this hand wins only about \d+% against that range/, 'Price');
  assert.match(text, /With only about 4\.7 times the call left behind, hitting a set doesn't pay enough, and you'd play the rest out of position\./);
  assert.match(e.theory, /a solver calls here/);
});

// MATH's 40bb spot (tb5.mjs): $1/$2, $80 stacks, a one-hot nit read; $55 behind is under 1.5x the $53 pot, so the price is
// the all-in price (72/163) and TT reads Thin, not Realisation
import { newHand, applyAction } from '../src/engine/game.js';
import { buildContext } from '../src/bots/policy.js';
import { HandBelief, newRead } from '../src/trainer/belief.js';
import { TYPE_IDS } from '../src/bots/profiles.js';
import { makeRng } from '../src/engine/cards.js';
test("MATH's 40bb nit: the all-in price, Thin", () => {
  const s = newHand({ stacks: new Array(9).fill(80), button: 3, sb: 1, bb: 2, rng: makeRng(5), hole: [parseCards('Tc Td'), ...new Array(8).fill(null)] });
  const reads = [null, ...new Array(8).fill(0).map(() => newRead(TYPE_IDS.map(() => 1 / TYPE_IDS.length)))];
  reads[2] = newRead(TYPE_IDS.map((id) => (id === 'nit' ? 1 : 1e-4)));
  const belief = new HandBelief(reads, s.hole[0]);
  for (const [seat, a] of [[6, 'f'], [7, 'f'], [8, 'f'], [0, 'r8'], [1, 'f'], [2, 'r25'], [3, 'f'], [4, 'f'], [5, 'f']]) {
    assert.equal(s.toAct, seat);
    const act = a === 'f' ? { type: 'fold' } : { type: 'raise', to: +a.slice(1) };
    if (seat !== 0) belief.observe(seat, buildContext(s), act);
    applyAction(s, act, makeRng(1));
  }
  const f = vs3betFacts(s, belief, () => ({ ranked: [{ id: 'nit', p: 0.86 }] }));
  assert.equal(f.call, 17);
  assert.equal(f.behind, 55);
  assert.equal(f.short, true);
  assert.ok(Math.abs(f.need - 72 / 163) < 1e-3, `need ${f.need}`);
  assert.ok(f.P < 0.67, `P ${f.P}`);
  const t = explain(rec(s, f, { loss: 2 })).reasons.join(' ');
  assert.match(t, /break-even on paper/, t);
  assert.doesNotMatch(t, /if all the cards come/);
});

test('STRAT fixes: a 4-bet into a wide range, the 4-bet theory line, a short stack well above the price, the label', () => {
  const s0 = null;
  const base = { seat: 3, P: 0.5, set: null, S: null, eq: 0.4, need: 0.32, short: false, call: 18, behind: 200, potAfter: 56, raises: 2, overYours: true, type: 'lag', typeWord: 'loose-aggressive regular' };
  assert.match(explain(rec(s0, base, { play: 'raise' })).reasons.join(' '), /Re-raising here scores worse than folding against this range\./);
  const strong = { ...base, P: 0.9, set: 'QQ+ and AK', S: 90 };
  const e4 = explain(rec(s0, strong, { play: 'raise' }));
  assert.doesNotMatch(e4.theory || '', /a solver calls here/);
  assert.ok(e4.theory, 'the 4-bet gets preRaise theory at P >= 0.85');
  const t2 = explain(rec(s0, { ...base, short: true, eq: 0.45, need: 0.32 }, { loss: 2 })).reasons.join(' ');
  assert.match(t2, /Against this range, the call scores worse than folding/);
  assert.doesNotMatch(t2, /break-even/);
});

test('an open or a defend with folding best keeps preLoose; no facts, no preVs3bet', () => {
  assert.equal(explain(rec(null, null, { raises: 1 })).category, 'preLoose');
  const { s } = build({ id: 'open', button: 3, hole: 'Ts Th', board: '', seats: { 3: 'station' }, line: '' });
  assert.equal(vs3betFacts(s, null, () => null), null, 'no re-raise: no facts');
});
