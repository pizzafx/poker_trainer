// The owner's empty table (Nov 2026): a session saved by an older build carries opponent profiles
// without the fields added since (Revision D's checkedToShift, the overcall terms, the 3-bet continue
// values, ...). Restoring it must fill them in, and the session must play on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/trainer/session.js';
import { makeRng } from '../src/engine/cards.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction } from '../src/bots/policy.js';
import { HERO_PROFILE, PROFILES } from '../src/bots/profiles.js';
import { classOf } from '../src/engine/hands.js';
import { handFeatures } from '../src/engine/features.js';
import { STREET } from '../src/engine/game.js';

// every profile field added since the profiles were first saved with sessions
const NEWER = ['checkedToShift', 'm7CheckedTo', 'mwTightenCheckedTo', 'leadIntoRaiserFlop', 'mwOvercall', 'ocSize', 'tbCont', 'tbSize', 'tbOOP', 'tbSqueeze', 'sqCont', 'blockBet', 'tinyFold'];

function play(sess, hands, rng) {
  for (let h = 0; h < hands; h++) {
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
}

test('restore: a session saved with an older profile shape fills the new fields and plays 50 hands', () => {
  const rng = makeRng(21);
  const sess = new Session({ seed: 21, samples: 30 });
  play(sess, 3, rng);
  // as stored: a structured clone of the saved session, then the older shape
  const saved = structuredClone(sess.toSaved());
  let stripped = 0;
  for (const p of saved.seats) {
    if (!p.profile) continue;
    for (const k of NEWER) if (k in p.profile) {
      delete p.profile[k];
      stripped++;
    }
  }
  assert.ok(stripped > 20, `${stripped} fields stripped`);
  const back = Session.fromSaved(saved);
  for (const p of back.seats) if (p.profile) for (const k of NEWER) if (k in PROFILES[p.type]) assert.notEqual(p.profile[k], undefined, `${p.nick}: ${k}`);
  play(back, 50, rng);
  assert.ok(back.handNo >= 53, `hand ${back.handNo}`);
});
