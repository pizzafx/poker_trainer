// Sanity check on the judge: a player who always takes the judge's top option should win
// clearly at these tables, and by more than the plain baseline player.
// Run: node scripts/selfplay.js [hands] [seed]
import { classOf } from '../src/engine/hands.js';
import { STREET } from '../src/engine/game.js';
import { handFeatures } from '../src/engine/features.js';
import { makeRng } from '../src/engine/cards.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction } from '../src/bots/policy.js';
import { HERO_PROFILE } from '../src/bots/profiles.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { Session } from '../src/trainer/session.js';

const HANDS = +(process.argv[2] || 600);
const seed = +(process.argv[3] || 5);

function run(mode) {
  const buy = +(process.argv[4] || 0) || undefined; // optional buy-in, to test shallower stacks
  const sess = new Session({ seed, samples: 60, maxBuy: buy, heroBuy: buy });
  const rng = makeRng(seed + 99);
  let k = 0;
  for (let h = 0; h < HANDS; h++) {
    // Reset to a fresh buy-in every hand so results are not driven by one giant stack.
    const me = sess.seats[0];
    sess.invested += sess.heroBuy - me.stack;
    me.stack = sess.heroBuy;
    sess.startHand();
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 400) {
      if (sess.status() === 'bot') {
        sess.stepBot();
        continue;
      }
      const s = sess.hand.state;
      let a;
      if (mode === 'judge') {
        const v = judgeDecision(s, 0, sess.hand.belief, null, { samples: 400, seed: ++k });
        a = v.options[v.best];
      } else {
        const ctx = buildContext(s);
        const pol =
          s.street === STREET.PRE
            ? preflopPolicy(ctx, HERO_PROFILE, classOf(s.hole[0][0], s.hole[0][1]))
            : postflopPolicy(ctx, HERO_PROFILE, handFeatures(s.hole[0], s.board));
        a = sampleAction(pol, rng);
      }
      sess.heroAct(a);
    }
  }
  const net = sess.heroNet();
  const bb = sess.game.bb;
  const mean = net / HANDS;
  const sd = Math.sqrt(sess.results.reduce((acc, x) => acc + (x - mean) ** 2, 0) / HANDS);
  console.log(`${mode.padEnd(9)} ${HANDS} hands: net $${net}  = ${((100 * mean) / bb).toFixed(1)} bb/100  (+/- ${((100 * sd) / Math.sqrt(HANDS) / bb).toFixed(1)})`);
}
run('baseline');
run('judge');
