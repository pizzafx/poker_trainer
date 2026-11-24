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
  // short stacks: the all-in price, and a hand well above it still reads Thin, never Realisation (MATH, STRAT)
  const short = { ...f, short: true, eq: f.need + 0.12, behind: 40, P: 0.5, set: null };
  const t2 = explain(rec(s, short, { loss: 3 })).reasons.join(' ');
  assert.match(t2, /break-even on paper/);
  assert.doesNotMatch(t2, /if all the cards come/);
  // a 4-bet where folding is best, against an almost-all-strong range
  const t3 = explain(rec(s, { ...f, P: 0.9, set: 'QQ+ and AK', S: 90 }, { play: 'raise' })).reasons.join(' ');
  assert.match(t3, /The hands that continue are almost all ahead of yours\./);
});

test('an open or a defend with folding best keeps preLoose; no facts, no preVs3bet', () => {
  assert.equal(explain(rec(null, null, { raises: 1 })).category, 'preLoose');
  const { s } = build({ id: 'open', button: 3, hole: 'Ts Th', board: '', seats: { 3: 'station' }, line: '' });
  assert.equal(vs3betFacts(s, null, () => null), null, 'no re-raise: no facts');
});
