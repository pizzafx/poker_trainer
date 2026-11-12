// The soft "a raise does better" tip on open-limps: when it shows and when it must not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREET } from '../src/engine/game.js';
import { POS } from '../src/bots/policy.js';
import { Session, limpTipFor } from '../src/trainer/session.js';
import { explain } from '../src/trainer/explain.js';

const BB = 3;
// A graded-fine verdict: fold, limp (call $3), raise to $12 and to $18 with the given values.
function verdict({ limp = 2, r12 = 6, r18 = 9, mine = 1, grade = 'good' } = {}) {
  return {
    grade,
    mine,
    best: 3,
    options: [
      { type: 'fold', ev: 0, label: 'Fold' },
      { type: 'call', ev: limp, label: 'Call $3' },
      { type: 'raise', to: 12, ev: r12, label: 'Raise to $12 (4.0x)' },
      { type: 'raise', to: 18, ev: r18, label: 'Raise to $18 (6.0x)' },
    ],
  };
}
const firstIn = (pos = POS.EP) => ({ street: STREET.PRE, raises: 0, limpers: 0, pos });
// The stress re-runs: the same options, with the raise's lead over the limp scaled by `keep`.
const rejudgeKeeping = (v, keep) => () => {
  const lead = v.options[3].ev - v.options[1].ev;
  const opts = v.options.map((o) => ({ ...o }));
  opts[3].ev = opts[1].ev + lead * keep;
  return { ...v, options: opts };
};

test('limp tip: first-in limp from under the gun with a clear raise shows, with the real size and whole dollars', () => {
  const v = verdict({ limp: 2.4, r18: 9.6 });
  const tip = limpTipFor(v, firstIn(POS.EP), BB, rejudgeKeeping(v, 0.8));
  assert.ok(tip);
  assert.equal(tip.to, 18);
  assert.equal(tip.gain, 8); // 10 - 2, as the numbers table rounds them
  assert.equal(tip.text, 'a raise to $18 does about $8 better here. Fewer players see the flop, and you keep the lead.');
  // middle and late position too
  assert.ok(limpTipFor(v, firstIn(POS.MP), BB, rejudgeKeeping(v, 0.8)));
  assert.ok(limpTipFor(v, firstIn(POS.LP), BB, rejudgeKeeping(v, 0.8)));
});

test('limp tip: not when limping behind another limper', () => {
  const v = verdict();
  assert.equal(limpTipFor(v, { ...firstIn(), limpers: 1 }, BB, rejudgeKeeping(v, 1)), null);
});

test('limp tip: not from the small or big blind', () => {
  const v = verdict();
  assert.equal(limpTipFor(v, firstIn(POS.SB), BB, rejudgeKeeping(v, 1)), null);
  assert.equal(limpTipFor(v, firstIn(POS.BB), BB, rejudgeKeeping(v, 1)), null);
});

test('limp tip: never for a raise, a fold, a flagged play or after a raise', () => {
  const v = verdict();
  assert.equal(limpTipFor({ ...v, mine: 2 }, firstIn(), BB, rejudgeKeeping(v, 1)), null);
  assert.equal(limpTipFor({ ...v, mine: 0 }, firstIn(), BB, rejudgeKeeping(v, 1)), null);
  assert.equal(limpTipFor({ ...v, grade: 'mistake' }, firstIn(), BB, rejudgeKeeping(v, 1)), null);
  assert.equal(limpTipFor(v, { ...firstIn(), raises: 1 }, BB, rejudgeKeeping(v, 1)), null);
  assert.equal(limpTipFor(v, { ...firstIn(), street: STREET.FLOP }, BB, rejudgeKeeping(v, 1)), null);
});

test('limp tip: not when the best raise is less than a big blind better', () => {
  const v = verdict({ limp: 4, r12: 5, r18: 6.9 }); // 2.9 < 3
  assert.equal(limpTipFor(v, firstIn(), BB, rejudgeKeeping(v, 1)), null);
  const w = verdict({ limp: 4, r12: 5, r18: 7 }); // exactly a big blind
  assert.ok(limpTipFor(w, firstIn(), BB, rejudgeKeeping(w, 1)));
});

test('limp tip: not when the gap does not survive the looser/tighter re-runs', () => {
  const v = verdict({ limp: 2, r18: 8 }); // 6 = 2bb
  assert.equal(limpTipFor(v, firstIn(), BB, rejudgeKeeping(v, 0.2)), null); // 1.2 < 1.5
  assert.ok(limpTipFor(v, firstIn(), BB, rejudgeKeeping(v, 0.3))); // 1.8 >= 1.5
  let calls = 0;
  const once = (shift) => (++calls === 2 || shift > 0 ? rejudgeKeeping(v, 0.1)() : rejudgeKeeping(v, 1)());
  assert.equal(limpTipFor(v, firstIn(), BB, once), null, 'failing either re-run is enough');
});

test('limp tip: the verdict stays green with its normal headline, plus the tip line', () => {
  const v = verdict({ limp: 2, r18: 9 });
  v.tip = limpTipFor(v, firstIn(), BB, rejudgeKeeping(v, 1));
  const out = explain({ verdict: v, street: STREET.PRE });
  assert.equal(v.grade, 'good');
  assert.equal(out.cost, 0);
  assert.ok(!/raise/i.test(out.headline.split(':')[0]), out.headline);
  assert.equal(out.tip, v.tip.text);
});

test('limp tip: in a real session it appears on first-in limps only, and never counts as a flag', () => {
  const sess = new Session({ seed: 31, samples: 60 });
  let tips = 0;
  let limps = 0;
  for (let h = 0; h < 160 && tips < 2; h++) {
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
      // limp whenever the pot is unraised, check or fold otherwise
      const a = s.street === 0 && s.raises === 0 && L.canCall ? { type: 'call' } : { type: L.canCheck ? 'check' : 'fold' };
      const d = sess.heroAct(a);
      if (s.street === 0 && a.type === 'call') limps++;
      if (d.tip) {
        tips++;
        assert.equal(d.verdict.grade, 'good');
        assert.equal(d.street, 0);
        assert.equal(d.cost, 0);
        assert.equal(d.ctx.limpers, 0, 'first in: nobody limped before');
        assert.equal(d.ctx.raises, 0);
        assert.ok(['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN'].includes(d.position), d.position);
        assert.match(d.tip, /^a raise to \$\d+ does about \$\d+ better here\./);
      }
    }
  }
  assert.ok(limps > 10, `${limps} limps`);
  assert.ok(tips >= 1, 'a habitual limper sees the tip');
  const rev = sess.review();
  assert.equal(rev.flagged, sess.decisions.filter((d) => d.verdict.grade !== 'good').length, 'tips are not flags');
});
