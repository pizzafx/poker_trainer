// Shared by scripts/rangetables.js and scripts/rangecheck.js: plays whole hands in a Session and calls back at
// every postflop decision with the tracker brought up to date, then records the action.
import { Session, APP_GAME } from '../src/trainer/session.js';
import { STREET } from '../src/engine/game.js';
import { handFeatures, boardTexture } from '../src/engine/features.js';
import { binOf } from '../src/bots/rangetrack.js';

// onPoint({ s, seat, sit, sess, bins, tex }) before a postflop action; onAct({ seat, sit, e, bin }) after it;
// onStreet({ s, prevBins, bins, len }) when the board has grown (bins of every live player before and after).
export function walk({ seed, table = 'typical', hands, trackers, onPoint, onAct, onStreet, onFlop, noBelief = false }) {
  const sess = new Session({ game: APP_GAME.game, rake: APP_GAME.rake, heroBuy: APP_GAME.heroBuy, seed, samples: 60, table, seats: 8 });
  for (let hno = 0; hno < hands; hno++) {
    sess.freshStack();
    sess.heat = 0;
    sess.startHand();
    const s = sess.hand.state;
    if (noBelief) sess.hand.belief.observe = () => {}; // the coach's range update is most of a hand's cost
    for (const t of trackers) t.reset();
    let bins = null;
    let seen = 0;
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 500) {
      const seat = s.toAct;
      let sit = null;
      let bin = -1;
      if (s.street !== STREET.PRE) {
        if (s.board.length !== seen) {
          const tex = boardTexture(s.board);
          const nb = new Int8Array(s.n).fill(-1);
          for (let p = 0; p < s.n; p++) if (!s.folded[p]) nb[p] = binOf(handFeatures(s.hole[p], s.board, tex));
          // a street dealt with nobody able to act is skipped here, so only single-card steps are reported
          if (seen === 0 && onFlop) onFlop({ s, bins: nb });
          else if (seen > 0 && s.board.length === seen + 1 && onStreet) onStreet({ s, prevBins: bins, bins: nb, len: s.board.length });
          bins = nb;
          seen = s.board.length;
        }
        for (const t of trackers) t.sync(s);
        sit = trackers[0].sit(s, seat);
        bin = bins[seat];
        if (onPoint) onPoint({ s, seat, sit, sess, bins });
      }
      const hl = s.history.length;
      if (sess.status() === 'bot') sess.stepBot();
      else sess.autoHero();
      if (sit) {
        const e = s.history[hl];
        for (const t of trackers) t.act(seat, sit, e);
        if (onAct) onAct({ seat, sit, e, bin });
      }
    }
  }
}
