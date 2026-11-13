// The grading guardrails in Session.temper, one rule at a time. Each test deals until the
// trainee faces the right kind of decision, hands temper a verdict built to trip the rule,
// and checks what comes out. These are product rules, not tuning: they should hold whatever
// the opponents' parameters are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legal, potSize } from '../src/engine/game.js';
import { TIER } from '../src/engine/features.js';
import { buildContext } from '../src/bots/policy.js';
import { Session } from '../src/trainer/session.js';
import { classOf, classNames } from '../src/engine/hands.js';
import { STREET } from '../src/engine/game.js';

function at(match, seed = 5, also = () => true) {
  for (let k = 0; k < 20; k++) {
    const sess = new Session({ seed: seed + 1000 * k, samples: 30 });
    if (!sess.dealUntil(match) || !also(sess)) continue;
    const s = sess.hand.state;
    return { sess, s, ctx: buildContext(s), L: legal(s), pot: potSize(s) };
  }
  throw new Error('no matching spot dealt');
}

// No live opponent is read as someone who cannot fold (station, gambler, maniac, beginner).
const noStickyRead = (sess) => {
  const s = sess.hand.state;
  for (let i = 1; i < s.n; i++) {
    if (s.folded[i]) continue;
    const top = sess.readOf(i).ranked[0];
    if (top.p >= 0.5 && ['station', 'whale', 'maniac', 'beginner'].includes(top.id)) return false;
  }
  return true;
};

// A verdict over the given options ([type, to?, ev]); `mine` and `best` are indexes.
function verdict(spot, opts, mine, best, grade = 'blunder') {
  const options = opts.map(([type, to, ev]) => ({ type, ...(type === 'raise' ? { to } : {}), ev, label: `${type} ${to || ''}`, close: false }));
  return { options, best, mine, loss: options[best].ev - options[mine].ev, se: 0, grade, sameKind: options[best].type === options[mine].type, samples: 100, pot: spot.pot, street: spot.s.street };
}

const judgeOpts = { samples: 30, seed: 1, heat: 0 };
const smallOf = (spot) => Math.max(3 * spot.s.bbAmt, 0.1 * spot.pot);
const run = (spot, v, action) => {
  spot.sess.temper(v, spot.s, spot.ctx, action, judgeOpts);
  return v;
};

test('temper: folding a weak hand preflop is never flagged', () => {
  const spot = at((p) => p.street === 0 && p.toCall > 0 && p.pct < 0.5);
  const v = run(spot, verdict(spot, [['fold', 0, 0], ['call', 0, 80]], 0, 1), { type: 'fold' });
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'preFold');
});

test('temper: folding a strong hand preflop is at most a mistake', () => {
  const spot = at((p) => p.street === 0 && p.toCall > 0 && p.pct >= 0.9);
  const v = run(spot, verdict(spot, [['fold', 0, 0], ['call', 0, 200]], 0, 1), { type: 'fold' });
  assert.notEqual(v.grade, 'blunder');
});

test('temper: not re-raising preflop as a bluff is never flagged', () => {
  const spot = at((p) => p.street === 0 && p.raises >= 1 && p.canRaise && p.pct < 0.5);
  const to = spot.L.minTo;
  const v = run(spot, verdict(spot, [['fold', 0, 0], ['call', 0, 5], ['raise', to, 150]], 1, 2), { type: 'call' });
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'preBluff');
});

test('temper: not bluff-raising a weak hand after the flop is never flagged', () => {
  const spot = at((p) => p.street >= 1 && p.toCall > 0 && p.canRaise && p.tier >= 0 && p.tier <= TIER.MIDDLE_PAIR && p.opponents === 1); // heads-up: multiway, a raise with one pair or a draw is a "not a habit" play (R7)
  const to = spot.L.minTo;
  const v = run(spot, verdict(spot, [['fold', 0, 0], ['call', 0, -5], ['raise', to, 120]], 0, 2), { type: 'fold' });
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'bluffRaise');
});

test('temper: nobody is held to an overbet', () => {
  const spot = at((p) => p.street >= 1 && p.toCall === 0 && p.canRaise && p.opponents === 1, 6); // heads-up: multiway, an overbet with a draw is a "not a habit" play (R7)
  const { L, pot } = spot;
  const half = Math.max(L.minTo, Math.round(pot / 2));
  const huge = Math.min(L.maxTo, Math.round(2.2 * pot));
  assert.ok(huge - spot.s.currentBet > 1.05 * pot, 'need room for an overbet');
  const v = run(spot, verdict(spot, [['check', 0, 0], ['raise', half, 0.2 * smallOf(spot)], ['raise', huge, 200]], 0, 2), { type: 'check' });
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'overbet');
});

test('temper: a bet of 60% of the pot or more is never "too small", and sizing is never red', () => {
  const spot = at((p) => p.street >= 1 && p.toCall === 0 && p.canRaise, 7);
  const { L, pot } = spot;
  const clamp = (x) => Math.max(L.minTo, Math.min(L.maxTo, Math.round(x)));
  const big = clamp(0.7 * pot);
  const full = clamp(pot);
  assert.ok(full > big, 'need two sizes');
  const v1 = run(spot, verdict(spot, [['check', 0, 0], ['raise', big, 10], ['raise', full, 150]], 1, 2), { type: 'raise', to: big });
  assert.equal(v1.grade, 'good');
  assert.equal(v1.note, 'sizeOk');
  const tiny = L.minTo;
  if (tiny < 0.6 * pot) {
    const v2 = run(spot, verdict(spot, [['check', 0, 0], ['raise', tiny, 0], ['raise', full, 300]], 1, 2), { type: 'raise', to: tiny });
    assert.notEqual(v2.grade, 'blunder');
  }
});

test('temper: passing up a bluff needs a wide margin and is never red', () => {
  // Against nobody read as unable to fold, so the margin rule is what passes it.
  const spot = at((p) => p.street >= 1 && p.toCall === 0 && p.canRaise && p.tier >= 0 && p.tier <= TIER.HIGH_CARD, 8, noStickyRead);
  const to = Math.max(spot.L.minTo, Math.round(spot.pot / 2));
  const small = smallOf(spot);
  const v1 = run(spot, verdict(spot, [['check', 0, 0], ['raise', to, 1.5 * small]], 0, 1, 'mistake'), { type: 'check' });
  assert.equal(v1.grade, 'good');
  assert.equal(v1.note, 'passedBluff');
  const v2 = run(spot, verdict(spot, [['check', 0, 0], ['raise', to, 20 * small]], 0, 1), { type: 'check' });
  assert.notEqual(v2.grade, 'blunder');
});

// ---- PRO review, steps 1 and 2 ----
const holding = (names) => (sess) => names.includes(classNames[classOf(sess.hand.state.hole[0][0], sess.hand.state.hole[0][1])]);

test('temper: raising aces preflop is never flagged, at any size', () => {
  const spot = at((p) => p.street === 0 && p.canRaise && p.pct > 0.995, 11, holding(['AA']));
  const to = spot.L.minTo;
  const v = run(spot, verdict(spot, [['fold', 0, 0], ['call', 0, 300], ['raise', to, 100]], 2, 1), { type: 'raise', to });
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'premium');
});

test('temper: checking a strong hand on the flop is never red', () => {
  // (a turn check that closes the action with two pair or better may be red: owner, Nov 2026; see mwrules.test.js)
  const spot = at((p) => p.street === STREET.FLOP && p.toCall === 0 && p.canRaise && p.tier >= TIER.TWO_PAIR, 12);
  const to = Math.max(spot.L.minTo, Math.round(spot.pot / 2));
  const v = run(spot, verdict(spot, [['check', 0, 0], ['raise', to, 40 * smallOf(spot)]], 0, 1), { type: 'check' });
  assert.notEqual(v.grade, 'blunder');
});

test('temper: checking weak top pair or a weaker pair before the river is never flagged', () => {
  // heads-up: multiway the R1 note carries it (next test)
  const spot = at((p) => p.street >= 1 && p.street < STREET.RIVER && p.toCall === 0 && p.canRaise && p.tier >= TIER.WEAK_PAIR && p.tier <= TIER.TOP_PAIR_WEAK && p.opponents === 1, 13);
  const to = Math.max(spot.L.minTo, Math.round(spot.pot / 2));
  const v = run(spot, verdict(spot, [['check', 0, 0], ['raise', to, 30 * smallOf(spot)]], 0, 1), { type: 'check' });
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'thinValue');
});

test('temper: multiway, a one-pair check before the river is the R1 note, ahead of the older rules (QA M3)', () => {
  const spot = at((p) => p.street >= 1 && p.street < STREET.RIVER && p.toCall === 0 && p.canRaise && p.tier >= TIER.WEAK_PAIR && p.tier <= TIER.TOP_PAIR_WEAK && p.opponents >= 2, 13);
  const to = Math.max(spot.L.minTo, Math.round(spot.pot / 2));
  const v = run(spot, verdict(spot, [['check', 0, 0], ['raise', to, 30 * smallOf(spot)]], 0, 1), { type: 'check' });
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'mwCheck');
});

test('temper: a call is graded on its price, not on money lost later', () => {
  const spot = at((p) => p.street >= 1 && p.toCall > 0 && p.toCall < 2 * 3, 14);
  // the call "loses" far more than it costs; the price is under the flag bar, so it is fine
  const v = run(spot, verdict(spot, [['fold', 0, 0], ['call', 0, -10 * smallOf(spot)]], 1, 0), { type: 'call' });
  assert.equal(v.grade, 'good');
  assert.equal(v.note, 'callPrice');
});

test('temper: a small flop or turn call with top pair or better is never red', () => {
  const spot = at((p) => p.street >= 1 && p.street < STREET.RIVER && p.toCall > 0 && p.tier >= TIER.TOP_PAIR_WEAK, 15, (sess) => {
    const s = sess.hand.state;
    const L = legal(s);
    return L.callAmt <= 0.5 * (potSize(s) - L.callAmt) && L.callAmt <= 15 * s.bbAmt && L.callAmt >= 8 * s.bbAmt;
  });
  const v = run(spot, verdict(spot, [['fold', 0, 0], ['call', 0, -spot.L.callAmt]], 1, 0), { type: 'call' });
  assert.notEqual(v.grade, 'blunder');
});

test('temper: a regraded flag must clear its own margin of error', () => {
  const spot = at((p) => p.street >= 1 && p.toCall === 0 && p.canRaise, 6);
  const { L, pot } = spot;
  const half = Math.max(L.minTo, Math.round(pot / 2));
  const huge = Math.min(L.maxTo, Math.round(2.2 * pot));
  // the half-pot bet beats the check by 3x the flag bar, but with a standard error that big it is noise
  const v = verdict(spot, [['check', 0, 0], ['raise', half, 3 * smallOf(spot)], ['raise', huge, 200]], 0, 2);
  v.se = 2 * smallOf(spot);
  run(spot, v, { type: 'check' });
  assert.equal(v.grade, 'good');
});
