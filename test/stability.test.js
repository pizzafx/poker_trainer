// The stability batch (STRAT_STABILITY §7, CEO and the owner, 26 Nov): S1's second pass near a line, S2's full-sample
// scenario test near its bar, the fragile-read margin (2 SE) and the best-play tie rule (marks only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/trainer/session.js';
const HERO = 0;
import { judgeDecision, pairedGap, poolVerdicts, tiltedEvs, tiltedGap } from '../src/trainer/judge.js';
import { robustVerdict, nearLine } from '../src/trainer/grade.js';
import { bestPlayEdge } from '../src/trainer/best.js';

// B3: a scenario breaks a pick only when its gap is under bar - 2 SE
test('fragile-read margin: a scenario under the bar but within 2 SE of it no longer breaks the pick (the owner)', () => {
  // options: 0 = mine, 1 = the alternative; bar 10; base gap 20, the "weaker read" scenario's gap 8
  const scen = [[0, 20], [0, 8]];
  const opts = { usable: [false, true], bar: () => 10, significant: () => true, kind: () => 'call', small: 10, notHabit: [true, true] };
  assert.equal(robustVerdict(scen, 0, opts).pick, -1, 'without SEs the scenario at 8 breaks the pick (today)');
  assert.equal(robustVerdict(scen, 0, { ...opts, se: () => 1.5 }).pick, 1, '8 >= 10 - 2 x 1.5: the pick stands');
  assert.equal(robustVerdict(scen, 0, { ...opts, se: () => 0.9 }).pick, -1, '8 < 10 - 2 x 0.9: an alternative read clearly puts the play within the bar');
});

test('fragile-read margin: the same 2 SE applies to near-dominance\'s "never beats it by more than a bar"', () => {
  // the alternative trails on average by far, but one read has your play ahead by 11 (more than the bar of 10)
  const scen = [[0, 60], [0, 50], [11, 0]];
  const opts = { usable: [false, true], bar: () => 10, significant: () => true, kind: () => 'call', small: 10, notHabit: [true, true] };
  assert.notEqual(robustVerdict(scen, 0, opts).near, true, 'today: no near-dominance');
  const r = robustVerdict(scen, 0, { ...opts, se: () => 1 });
  assert.equal(r.pick, 1);
  assert.equal(r.near, true, '-11 >= -10 - 2 x 1: near-dominance holds');
});

// B4: the best-play tie rule, marks only
const hv = (opts, extra = {}) => ({ grade: 'good', mine: 0, best: 0, small: 10, options: opts, ...extra });
test('best-play tie rule (a): a bigger size than a size reference gets the mark only within noise of it', () => {
  const opt = (type, to, ev, pse = 0) => ({ type, to, ev, pse, label: `${type} ${to}` });
  // mine (bet 80) is bigger than the reference (bet 60), $0.80 behind it, with a paired SE of $2
  const within = hv([opt('raise', 80, 49.2, 2), opt('raise', 60, 50), opt('check', 0, 20, 3)], { mine: 0, best: 1, ref: 'upToPot' });
  assert.ok(bestPlayEdge(within), 'within max(1 SE, $1): the trainee\'s size counts as the reference');
  const clear = hv([opt('raise', 80, 46, 1), opt('raise', 60, 50), opt('check', 0, 20, 3)], { mine: 0, best: 1, ref: 'upToPot' });
  assert.equal(bestPlayEdge(clear), null, '$4 behind with an SE of $1: the bigger size is excluded, as today');
});

test('best-play tie rule (b): across kinds the mark needs the reference ahead by 2 paired SEs as well as half a bar', () => {
  const opt = (type, ev, pse) => ({ type, to: 0, ev, pse, label: type });
  assert.ok(bestPlayEdge(hv([opt('call', 0, 0), opt('fold', -6, 2)])), 'ahead by 6 >= max(5, 4)');
  assert.equal(bestPlayEdge(hv([opt('call', 0, 0), opt('fold', -6, 4)])), null, 'ahead by 6 < 2 x 4: a tie, so "fine" on every seed');
  assert.ok(bestPlayEdge(hv([opt('call', 0, 0), opt('fold', -6)])), 'a stored record without pse keeps today\'s rule');
});

// a real spot: the first postflop decision of a seeded session
function spot(seed = 3) {
  const sess = new Session({ seed, samples: 300 });
  for (let h = 0; h < 40; h++) {
    sess.startHand();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const s = sess.hand.state;
      const L = sess.heroOptions();
      const action = { type: L.canCheck ? 'check' : 'call' };
      if (s.board.length >= 3) return { sess, s, belief: sess.hand.belief, action };
      sess.heroAct(action);
    }
  }
  throw new Error('no postflop spot');
}

test('pooling two runs: the values are the mean over both, the samples add, and the first verdict is unchanged', () => {
  const { s, belief, action } = spot();
  const v = judgeDecision(s, HERO, belief, action, { samples: 200, seed: 5 });
  const w = judgeDecision(s, HERO, belief, action, { samples: 200, seed: 5 + 7919 });
  const before = v.options.map((o) => o.ev);
  const p = poolVerdicts(v, w, s);
  assert.equal(p.samples, 400);
  assert.equal(p.runs.n, 400);
  p.options.forEach((o, i) => assert.ok(Math.abs(o.ev - (v.options[i].ev + w.options[i].ev) / 2) < 1e-9, o.label));
  assert.deepEqual(v.options.map((o) => o.ev), before);
  const g = pairedGap(p, p.best, p.mine >= 0 ? p.mine : 0);
  assert.ok(g.se >= 0);
});

test('the tilted gap at k = 1 is the plain paired gap', () => {
  const { s, belief, action } = spot();
  const v = judgeDecision(s, HERO, belief, action, { samples: 200, seed: 9 });
  if (v.mine < 0 || !v.runs.sample) return;
  const a = v.mine === 0 ? 1 : 0;
  const t1 = tiltedGap(v, 1, a, v.mine);
  const p = pairedGap(v, a, v.mine);
  assert.ok(Math.abs(t1.mean - p.mean) < 1e-9);
  assert.ok(Math.abs(t1.se - p.se) < 1e-6 * Math.max(1, p.se) + 1e-9, `${t1.se} vs ${p.se}`);
  assert.ok(Math.abs(tiltedEvs(v, 2)[a] - tiltedEvs(v, 2)[v.mine] - tiltedGap(v, 2, a, v.mine).mean) < 1e-9);
});

test('every graded decision carries verdict.stab { pass2, n1, n2, cut }, and the second pass fires only near a line', () => {
  const sess = new Session({ seed: 21, samples: 300 });
  let fired = 0;
  let seen = 0;
  for (let h = 0; h < 40; h++) {
    sess.startHand();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const L = sess.heroOptions();
      const d = sess.heroAct({ type: L.canCheck ? 'check' : 'call' });
      const st = d.verdict.stab;
      assert.ok(st && typeof st.pass2 === 'boolean' && st.n1 > 0, JSON.stringify(st));
      seen++;
      if (st.pass2) {
        fired++;
        assert.equal(d.verdict.samples, st.n1 + st.n2);
        assert.equal(st.cut, st.n2 < st.n1);
        assert.deepEqual(d.verdict.pass2, { want: st.n1, reached: st.n2 });
      } else assert.equal(st.n2, 0);
    }
  }
  assert.ok(seen > 20, `${seen} decisions`);
  assert.ok(fired < seen, `${fired} of ${seen} fired`);
});

test('nearLine: a gap within 1.5 SE of the yellow line fires; far from both lines does not', () => {
  const s = { bbAmt: 2 };
  const mk = (loss, se) => {
    const v = { mine: 1, best: 0, sameKind: false, pot: 40, options: [{ ev: 0 }, { ev: -loss }], se };
    Object.defineProperty(v, 'runs', { value: null, enumerable: false });
    return v;
  };
  // without runs nearLine is off (a hand-built verdict); with runs pairedGap gives its own SE, tested by the session test
  assert.equal(nearLine(mk(6, 1), s), false);
});

test('fragile-read margin: the SE only decides whether a pick holds; which alternative is named goes by the plain shortfall (QA-VERDICT)', () => {
  // options: 0 = mine; 1 clears the bar by 5 in every read; 2 clears by 2 but is very noisy (SE 6)
  const scen = [[0, 15, 12], [0, 15, 12]];
  const opts = { usable: [false, true, true], bar: () => 10, significant: () => true, kind: (a) => ['call', 'fold', 'raise'][a], small: 10, notHabit: [true, true, true] };
  assert.equal(robustVerdict(scen, 0, { ...opts, se: (k, a) => (a === 2 ? 6 : 0.5) }).pick, 1, 'the noisier option does not win the name on its SE');
  assert.equal(robustVerdict(scen, 0, opts).pick, 1, 'today: the same pick');
});

// QA-MOBILE's timing gate: the second pass and S2 stay inside the decision's budget
import { budgetSpent, reRunOpts } from '../src/trainer/grade.js';
test('budget: a first pass the budget cut or extended leaves no budget for the second pass or S2; a replay passes lean back', () => {
  const opts = { budgetMs: 2000, samples: 3000 };
  assert.equal(budgetSpent({ samples: 3000, extended: false }, opts), false, 'full first pass: budget left');
  assert.equal(budgetSpent({ samples: 900, extended: false }, opts), true, 'cut first pass (a phone)');
  assert.equal(budgetSpent({ samples: 800, extended: true }, opts), true, 'extended first pass');
  assert.equal(budgetSpent({ samples: 900 }, { samples: 3000 }), false, 'no budget (tests, replays without a record): never lean');
  assert.equal(budgetSpent({ samples: 3000 }, { ...opts, lean: true }), true, 'a replay of a lean verdict stays lean');
});
test('re-runs scale with the first pass\'s reach, never the pooled count', () => {
  const v = { samples: 1600, stab: { pass2: true, n1: 800, n2: 800 } };
  assert.equal(reRunOpts({ samples: 3000, budgetMs: 2000 }, 1500, v).samples, 400, '1500 x 800/3000');
});
