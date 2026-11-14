// Session-level rules that must survive any retuning: the grading guardrails in
// Session.temper, the money bookkeeping, and the table's memory of the trainee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/cards.js';
import { STREET } from '../src/engine/game.js';
import { classOf } from '../src/engine/hands.js';
import { handFeatures, TIER } from '../src/engine/features.js';
import { HERO_PROFILE } from '../src/bots/profiles.js';
import { Session } from '../src/trainer/session.js';

// Plays `hands` hands with the trainee choosing at random among fold / check-call / a raise
// size, and returns every judged decision with the facts the rules depend on.
function randomSession(hands, seed) {
  const sess = new Session({ seed, samples: 24 });
  const rng = makeRng(seed + 1);
  const out = [];
  for (let h = 0; h < hands; h++) {
    sess.topUp();
    sess.startHand();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const s = sess.hand.state;
      const L = sess.heroOptions();
      const facts = {
        street: s.street,
        cls: classOf(s.hole[0][0], s.hole[0][1]),
        tier: s.street === STREET.PRE ? null : handFeatures(s.hole[0], s.board).tier,
        toCall: L.callAmt,
        pot: L.pot,
        currentBet: s.currentBet,
        bb: s.bbAmt,
      };
      const r = rng();
      let a;
      if (L.canFold && r < 0.3) a = { type: 'fold' };
      else if (L.canRaise && r > 0.65) a = { type: 'raise', to: L.minTo + Math.floor(rng() * (Math.min(L.maxTo, L.minTo + 3 * L.pot) - L.minTo + 1)) };
      else a = { type: L.canCheck ? 'check' : 'call' };
      const d = sess.heroAct(a);
      out.push({ d, facts, a });
    }
  }
  return { sess, out };
}

const { sess, out } = randomSession(70, 12);

test('session: enough decisions of every kind to test the rules', () => {
  assert.ok(out.length >= 100, `${out.length} decisions`);
  const flagged = out.filter((x) => x.d.verdict.grade !== 'good');
  assert.ok(flagged.length >= 10, `${flagged.length} flagged`);
  assert.ok(flagged.some((x) => x.facts.street > 0), 'some flagged postflop');
  assert.ok(flagged.some((x) => x.facts.street === 0), 'some flagged preflop');
});

test('grading: verdicts are consistent with their own numbers', () => {
  for (const { d, facts } of out) {
    const v = d.verdict;
    assert.ok(['good', 'mistake', 'blunder'].includes(v.grade));
    assert.ok(v.mine >= 0 && v.mine < v.options.length);
    const fold = v.options.find((o) => o.type === 'fold');
    if (fold) assert.equal(fold.ev, 0, 'folding is worth exactly zero');
    if (v.grade !== 'good') {
      assert.notEqual(v.best, v.mine, 'a flagged play is not the best option');
      assert.ok(v.loss > 0);
      // best minus mine, except a call against a fold after the flop, which costs at most its price (STRAT G4)
      if (v.priceCap !== undefined) assert.equal(v.loss, v.priceCap, 'a capped call costs its price');
      else assert.ok(Math.abs(v.loss - (v.options[v.best].ev - v.options[v.mine].ev)) < 1e-6, 'loss is best minus mine');
      // Never flagged for less than three big blinds or a tenth of the pot.
      assert.ok(v.loss >= Math.max(3 * facts.bb, 0.1 * v.pot) - 1e-9, `flagged for only $${v.loss.toFixed(2)}`);
    }
  }
});

test('grading: the guardrails in temper hold on every decision', () => {
  for (const { d, facts } of out) {
    const v = d.verdict;
    if (v.grade === 'good') continue;
    const mine = v.options[v.mine];
    const best = v.options[v.best];
    if (facts.street === STREET.PRE) {
      // Preflop folds: only flagged with a hand in the top 35%, and never red.
      if (mine.type === 'fold') {
        assert.ok(HERO_PROFILE.playPct[facts.cls] >= 0.65, 'fold of a weak hand flagged');
        assert.notEqual(v.grade, 'blunder', 'preflop fold flagged red');
      }
    } else {
      // Sizing (a raise where a different raise was better) is never red.
      if (mine.type === 'raise' && best.type === 'raise') assert.notEqual(v.grade, 'blunder', 'sizing flagged red');
      // Nobody is held to an overbet.
      assert.ok(!(best.type === 'raise' && best.to - facts.currentBet > v.pot * 1.05), 'flagged against an overbet');
      // Not bluff-raising a weak hand is never flagged.
      if (facts.toCall > 0 && best.type === 'raise' && mine.type !== 'raise') assert.ok(facts.tier > TIER.MIDDLE_PAIR, 'flagged for not bluff-raising');
      // Passing up a bluff (checking a weak hand) is never red.
      if (facts.toCall === 0 && best.type === 'raise' && mine.type === 'check' && facts.tier <= TIER.MIDDLE_PAIR) assert.notEqual(v.grade, 'blunder', 'missed bluff flagged red');
    }
  }
});

test('session: money adds up and the table memory stays in range', () => {
  const sum = sess.results.reduce((a, b) => a + b, 0);
  assert.equal(sess.heroNet(), sum, 'net result equals the sum of hand results');
  assert.equal(sess.results.length, 70);
  assert.ok(sess.heat >= 0 && sess.heat <= 1, `heat ${sess.heat}`);
  for (const p of sess.seats) assert.ok(Number.isInteger(p.stack) && p.stack >= 0, `${p.nick}: ${p.stack}`);
  const ids = sess.decisions.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'decision ids are unique');
});

test('cost shown: whole dollars, equal to the gap between the rounded values, and totals add up', () => {
  let sum = 0;
  for (const { d } of out) {
    const v = d.verdict;
    if (v.grade === 'good') {
      assert.equal(d.cost, 0);
      continue;
    }
    assert.ok(Number.isInteger(d.cost), `cost ${d.cost} is whole dollars`);
    const gap = Math.round(v.options[v.best].ev) - Math.round(v.options[v.mine].ev);
    if (v.priceCap !== undefined && gap > Math.round(v.priceCap)) {
      // a call against a fold after the flop: at most its price, and the headline says so (STRAT G4)
      assert.equal(d.cost, Math.round(v.priceCap));
      assert.ok(d.headline.includes('costs up to its price compared'), d.headline);
    } else {
      assert.equal(d.cost, gap);
      assert.ok(d.headline.includes(`costs about $${d.cost} compared`), d.headline);
    }
    sum += d.cost;
  }
  const rev = sess.review();
  assert.equal(rev.lost, sum);
  for (const c of rev.list) assert.equal(c.loss, c.examples.reduce((a, x) => a + x.cost, 0));
});
