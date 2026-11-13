// The soft limp tip: on every open-limp outside the blinds, rule-based, vetoed only when the judge
// clearly prefers the limp. When it shows and when it must not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREET } from '../src/engine/game.js';
import { POS } from '../src/bots/policy.js';
import { Session, limpTipFor } from '../src/trainer/session.js';
import { explain } from '../src/trainer/explain.js';

// A graded-fine verdict: fold, limp (call $3), raise to $12 and to $18 with the given values and a
// standard error for every gap (hand-built verdicts carry no runs).
function verdict({ limp = 2, r12 = 3, r18 = 2.5, mine = 1, grade = 'good', se = 1 } = {}) {
  return {
    grade,
    mine,
    best: 2,
    se,
    options: [
      { type: 'fold', ev: 0, label: 'Fold' },
      { type: 'call', ev: limp, label: 'Call $3' },
      { type: 'raise', to: 12, ev: r12, label: 'Raise to $12 (4.0x)' },
      { type: 'raise', to: 18, ev: r18, label: 'Raise to $18 (6.0x)' },
    ],
  };
}
const firstIn = (pos = POS.EP) => ({ street: STREET.PRE, raises: 0, limpers: 0, pos });

test('limp tip: every first-in limp outside the blinds gets it, quoting the standard open, no dollars', () => {
  for (const pos of [POS.EP, POS.MP, POS.LP]) {
    const tip = limpTipFor(verdict(), firstIn(pos));
    assert.ok(tip, `position ${pos}`);
    assert.equal(tip.to, 12);
    assert.equal(tip.text, 'raising first in, to about $12, usually does better than limping. Fewer players see the flop, and you keep the lead.');
    assert.ok(!/\$\d+ (better|more)/.test(tip.text));
  }
});

test('limp tip: shows even when the judge has the limp a little ahead, inside the noise', () => {
  assert.ok(limpTipFor(verdict({ limp: 4, r12: 3, r18: 2, se: 1 }), firstIn())); // 1 < 2.2 se
});

test('limp tip: vetoed only when the judge clearly prefers the limp', () => {
  assert.equal(limpTipFor(verdict({ limp: 9, r12: 3, r18: 4, se: 1 }), firstIn()), null); // 5 > 2.2 se
});

test('limp tip: not when limping behind another limper, from the blinds, after a raise, or postflop', () => {
  assert.equal(limpTipFor(verdict(), { ...firstIn(), limpers: 1 }), null);
  assert.equal(limpTipFor(verdict(), firstIn(POS.SB)), null);
  assert.equal(limpTipFor(verdict(), firstIn(POS.BB)), null);
  assert.equal(limpTipFor(verdict(), { ...firstIn(), raises: 1 }), null);
  assert.equal(limpTipFor(verdict(), { ...firstIn(), street: STREET.FLOP }), null);
});

test('limp tip: never for a raise, a fold or a flagged play', () => {
  assert.equal(limpTipFor(verdict({ mine: 2 }), firstIn()), null);
  assert.equal(limpTipFor(verdict({ mine: 0 }), firstIn()), null);
  assert.equal(limpTipFor(verdict({ grade: 'mistake' }), firstIn()), null);
});

test('limp tip: the verdict stays green with a plain headline, plus the tip line', () => {
  const v = verdict();
  v.tip = limpTipFor(v, firstIn());
  const out = explain({ verdict: v, street: STREET.PRE });
  assert.equal(v.grade, 'good');
  assert.equal(out.cost, 0);
  assert.equal(out.headline, 'Call $3: fine.');
  assert.equal(out.tip, v.tip.text);
});

test('limp tip: in a real session it appears on first-in limps and never counts as a flag', () => {
  const sess = new Session({ seed: 31, samples: 60 });
  let tips = 0;
  let openLimps = 0;
  for (let h = 0; h < 80; h++) {
    sess.freshStack();
    sess.startHand();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const s = sess.hand.state;
      const L = sess.heroOptions();
      const a = s.street === 0 && s.raises === 0 && L.canCall ? { type: 'call' } : { type: L.canCheck ? 'check' : 'fold' };
      const d = sess.heroAct(a);
      const first = s.street === 0 && d.ctx.raises === 0 && d.ctx.limpers === 0 && d.ctx.pos <= POS.LP && a.type === 'call';
      if (first && d.verdict.grade === 'good') openLimps++;
      if (d.tip) {
        tips++;
        assert.ok(first, 'only first-in limps outside the blinds');
        assert.equal(d.verdict.grade, 'good');
        assert.equal(d.cost, 0);
      }
    }
  }
  assert.ok(openLimps >= 5, `${openLimps} open-limps`);
  assert.ok(tips >= openLimps * 0.7, `${tips} tips on ${openLimps} open-limps`);
  const rev = sess.review();
  assert.equal(rev.flagged, sess.decisions.filter((d) => d.verdict.grade !== 'good').length, 'tips are not flags');
});
