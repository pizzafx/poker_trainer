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

test('limp tip: shows even when the judge has the limp a little ahead of one raise, inside the noise', () => {
  assert.ok(limpTipFor(verdict({ limp: 4, r12: 3, r18: 4.2, se: 1 }), firstIn())); // r18 is not below the limp
});

test('limp tip: not when every raise scores below the limp ("usually does better" would be false; STRAT G3)', () => {
  assert.equal(limpTipFor(verdict({ limp: 4, r12: 3, r18: 2, se: 1 }), firstIn()), null);
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
      // behind limpers, the L2/L3 tips (STRAT) may show too: still only on a limp outside the blinds
      const behindLimp = s.street === 0 && d.ctx.raises === 0 && d.ctx.limpers > 0 && d.ctx.pos <= POS.LP && a.type === 'call';
      if (d.tip) {
        tips++;
        assert.ok(first || (behindLimp && ['isoLimp', 'wideLimp'].includes(d.tip.kind || d.tipKind)), 'only limps outside the blinds: first in, or behind limpers with an L2/L3 tip');
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

// ---- the other soft notes: opens outside Standard, junk 3-bets ----
import { openTipFor, junk3betTipFor } from '../src/trainer/session.js';

function openVerdict({ raise = 1, se = 1, grade = 'good' } = {}) {
  return { grade, mine: 1, best: 1, se, options: [{ type: 'fold', ev: 0, label: 'Fold' }, { type: 'raise', to: 12, ev: raise, label: 'Raise to $12 (4.0x)' }] };
}
const openCtx = { street: STREET.PRE, raises: 0, limpers: 0, pos: POS.EP };

test('open note: a hand outside Standard for the seat gets it; Standard hands and clear winners do not', () => {
  const tip = openTipFor(openVerdict(), openCtx, 'K5s', 'early');
  assert.ok(tip);
  assert.equal(tip.kind, 'wideOpen');
  assert.equal(tip.text, 'K5s is outside the Standard range from early position; most players open it only from later seats.');
  assert.equal(openTipFor(openVerdict(), openCtx, 'AKo', 'early'), null, 'in Standard');
  assert.equal(openTipFor(openVerdict({ raise: 5 }), openCtx, 'K5s', 'early'), null, 'the judge clearly likes the open');
  assert.equal(openTipFor(openVerdict(), { ...openCtx, limpers: 1 }, 'K5s', 'early'), null, 'not over limpers');
  assert.equal(openTipFor(openVerdict(), openCtx, 'K5s', 'bb'), null, 'not from the big blind');
  assert.match(openTipFor(openVerdict(), openCtx, 'J4o', 'button').text, /most players fold it here\.$/);
  assert.match(openTipFor(openVerdict({ raise: -4 }), openCtx, 'J4o', 'button').text, /Here folding was about \$4 better\.$/, 'dollars only when clear');
});

function threeBetVerdict({ raise = 1, call = 1.5, se = 1 } = {}) {
  return { grade: 'good', mine: 2, best: 2, se, options: [{ type: 'fold', ev: 0, label: 'Fold' }, { type: 'call', ev: call, label: 'Call $12' }, { type: 'raise', to: 40, ev: raise, label: 'Raise to $40 (3.3x)' }] };
}
const threeCtx = { street: STREET.PRE, raises: 1, limpers: 0, pos: POS.BB };

test('junk 3-bet note: junk gets it; suited aces, suited broadways and 99+ are exempt', () => {
  const tip = junk3betTipFor(threeBetVerdict(), threeCtx, 'J7o', 'bb');
  assert.ok(tip);
  assert.equal(tip.kind, 'junk3bet');
  assert.match(tip.text, /^re-raising with J7o is mostly a bluff/);
  for (const n of ['A4s', 'KJs', 'QTs', '99', 'TT']) assert.equal(junk3betTipFor(threeBetVerdict(), threeCtx, n, 'bb'), null, n);
  assert.equal(junk3betTipFor(threeBetVerdict({ raise: 6, call: 1 }), threeCtx, 'J7o', 'bb'), null, 'the judge clearly likes the re-raise');
  assert.equal(junk3betTipFor(threeBetVerdict(), { ...threeCtx, raises: 2 }, 'J7o', 'bb'), null, 'only against a single raise');
});

// STRAT J1: against an opener read as a regular, "these players seldom fold" is false
test('junk 3-bet note: against a regular opener it says what a solid player does, not "seldom fold"', () => {
  const env = (id, p) => ({ readOf: () => ({ ranked: [{ id, p }] }) });
  const ctx = { ...threeCtx, aggressor: 3 };
  const reg = junk3betTipFor(threeBetVerdict(), ctx, 'J7o', 'bb', env('tag', 0.7));
  assert.match(reg.text, /^re-raising with J7o against a regular rarely pays: they fold their worst hands and keep the ones that have you beaten/);
  assert.doesNotMatch(reg.text, /seldom fold/);
  for (const [id, p] of [['station', 0.8], ['tag', 0.4]]) assert.match(junk3betTipFor(threeBetVerdict(), ctx, 'J7o', 'bb', env(id, p)).text, /seldom fold/, `${id} ${p}`);
});

// STRAT L2, L3: behind limpers (Drills P1 and P2); tips only, grades unchanged
import { isoLimpTipFor, wideLimpTipFor } from '../src/trainer/grade.js';
const behind = (pos, limpers = 1) => ({ street: STREET.PRE, raises: 0, limpers, pos });

test('L2: AJo on the button behind two limpers, the raise clearly ahead of the limp, gets the isolation tip', () => {
  const tip = isoLimpTipFor(verdict({ limp: 2, r12: 6, r18: 5, se: 1 }), behind(POS.LP, 2), 'AJo');
  assert.ok(tip);
  assert.equal(tip.kind, 'isoLimp');
  assert.equal(tip.text, 'raising over the limpers, to about $12, usually does better than limping behind with AJo: you isolate weaker hands and keep the lead. Here raising was about $4 better.');
  // not when the raise is inside the noise, or when a raise scores clearly below the limp
  assert.equal(isoLimpTipFor(verdict({ limp: 2, r12: 3, r18: 2.5, se: 1 }), behind(POS.LP, 2), 'AJo'), null);
  assert.equal(isoLimpTipFor(verdict({ limp: 2, r12: 6, r18: 1, se: 1 }), behind(POS.LP, 2), 'AJo'), null);
});

test('L2: 66 behind limpers (set value) and AKo (the strongLimp rule) get no isolation tip; first in is the limp tip', () => {
  assert.equal(isoLimpTipFor(verdict({ limp: 2, r12: 6, se: 1 }), behind(POS.LP, 2), '66'), null);
  assert.equal(isoLimpTipFor(verdict({ limp: 2, r12: 6, se: 1 }), behind(POS.LP, 1), 'AKo'), null);
  assert.equal(isoLimpTipFor(verdict({ limp: 2, r12: 6, se: 1 }), behind(POS.LP, 0), 'AJo'), null);
  assert.equal(isoLimpTipFor(verdict({ limp: 2, r12: 6, se: 1 }), { ...behind(POS.LP, 1), pos: POS.SB }, 'AJo'), null);
});

test('L3: K5o in the cutoff behind a limper gets the behind-limpers fold note; vetoed only when the limp clearly beats folding', () => {
  const tip = wideLimpTipFor(verdict({ limp: -1, r12: -2, r18: -3, se: 0.2 }), behind(POS.LP, 1), 'K5o', 'cutoff');
  assert.ok(tip);
  assert.equal(tip.kind, 'wideLimp');
  assert.equal(tip.text, 'K5o is outside the Standard range behind limpers from the cutoff; most players fold it here. Here folding was about $1 better.');
  assert.equal(wideLimpTipFor(verdict({ limp: 3, se: 0.5 }), behind(POS.LP, 1), 'K5o', 'cutoff'), null, 'the limp clearly beat folding');
  assert.equal(wideLimpTipFor(verdict({ limp: -1, se: 0.2 }), behind(POS.LP, 1), 'AJs', 'cutoff'), null, 'inside the range');
});
