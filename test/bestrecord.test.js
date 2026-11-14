// QA BP2: a ringed play is stored as one. The record's headline and the Disagree report never say
// "fine" for a play the screen marks "best play".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/trainer/session.js';
import { makeRng } from '../src/engine/cards.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction } from '../src/bots/policy.js';
import { HERO_PROFILE } from '../src/bots/profiles.js';
import { classOf } from '../src/engine/hands.js';
import { handFeatures } from '../src/engine/features.js';
import { STREET } from '../src/engine/game.js';
import { isBestPlay, verdictWord } from '../src/trainer/best.js';
import { disputeReport, disputeText } from '../src/trainer/dispute.js';

test('best play: the stored headline and the Disagree report say "best play", never "fine"', () => {
  const sess = new Session({ seed: 7, samples: 120 });
  const rng = makeRng(12);
  for (let h = 0; h < 40; h++) {
    sess.freshStack();
    sess.startPlayable();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const s = sess.hand.state;
      const ctx = buildContext(s);
      const pol = s.street === STREET.PRE ? preflopPolicy(ctx, HERO_PROFILE, classOf(s.hole[0][0], s.hole[0][1])) : postflopPolicy(ctx, HERO_PROFILE, handFeatures(s.hole[0], s.board));
      sess.heroAct(sampleAction(pol, rng));
    }
  }
  const best = sess.decisions.filter((d) => isBestPlay(d.verdict, d));
  assert.ok(best.length >= 3, `only ${best.length} best plays in 40 hands`);
  for (const d of best) {
    assert.match(d.headline, /: best play\./, d.headline);
    assert.doesNotMatch(d.headline, /fine|rates about the same/, d.headline);
    const r = disputeReport(d);
    assert.equal(r.verdict.word, 'best play');
    assert.match(disputeText(r, true), /Verdict: best play - .*: best play\./);
  }
  for (const d of sess.decisions.filter((x) => !isBestPlay(x.verdict, x))) assert.notEqual(verdictWord(d.verdict, d), 'best play');
});
