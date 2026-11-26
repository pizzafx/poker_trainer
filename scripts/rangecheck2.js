// Check of the tracker's read of a bet (RangeTrack.betRead), on real hands: every time a player bets with
// nobody having bet before them on the street, the predicted chance that someone calls or raises, and the
// predicted chance of being ahead of everyone who does, against what happened (each opponent's first answer
// to the bet, and the hands actually held).
// node scripts/rangecheck2.js [hands, default 6000] [seed, default 7] [table]
import { walk } from './rangelib.js';
import { RangeTrack } from '../src/bots/rangetrack.js';
import { RANGE_TABLES } from '../src/bots/rangetables.js';
import { evaluate } from '../src/engine/evaluator.js';

const HANDS = +(process.argv[2] || 6000);
const SEED = +(process.argv[3] || 7);
const TABLE = process.argv[4] || 'typical';
const trk = new RangeTrack(RANGE_TABLES);
const bands = () => Array.from({ length: 10 }, () => ({ p: 0, y: 0, n: 0 }));
const calC = bands(); // called
const calA = bands(); // ahead when called
const calN = bands(); // "ahead now" used as if it were ahead when called (the naive figure)
const brier = { called: 0, calledBase: 0, n: 0, ahead: 0, naive: 0, m: 0 };
const bySt = [0, 1, 2].map(() => ({ ahead: 0, naive: 0, m: 0, gap: 0 }));
let open = [];
let rate = 0;
const put = (cal, p, y) => {
  const b = cal[Math.min(9, Math.floor(p * 10))];
  b.p += p;
  b.y += y;
  b.n++;
};
function close(r) {
  if (!r.can) return;
  const cont = r.answers.filter((a) => a.cont);
  const y = cont.length ? 1 : 0;
  brier.called += (r.pred.called - y) ** 2;
  brier.n++;
  rate += y;
  put(calC, r.pred.called, y);
  if (!cont.length) return;
  let ya = 1;
  for (const a of cont) ya = Math.min(ya, r.my > a.score ? 1 : r.my === a.score ? 0.5 : 0);
  brier.ahead += (r.pred.ahead - ya) ** 2;
  brier.naive += (r.pred.aheadNow - ya) ** 2;
  brier.m++;
  const b = bySt[r.street - 1];
  b.ahead += (r.pred.ahead - ya) ** 2;
  b.naive += (r.pred.aheadNow - ya) ** 2;
  b.gap += r.pred.ahead - ya;
  b.m++;
  put(calA, r.pred.ahead, ya);
  put(calN, r.pred.aheadNow, ya);
}
walk({
  seed: SEED,
  table: TABLE,
  hands: HANDS,
  trackers: [trk],
  noBelief: true,
  onAct: ({ seat, sit, e, bin, s }) => {
    // answers to the bets still open
    for (const r of open) {
      if (r.done) continue;
      if (e.street !== r.street || seat === r.seat) {
        r.done = true;
        continue;
      }
      if (!r.seen.has(seat)) {
        r.seen.add(seat);
        r.answers.push({ cont: e.type === 'call' || e.type === 'raise', score: evaluate([...r.holes[seat], ...r.board]) });
      }
    }
    if (!sit.facing && e.type === 'bet') {
      let can = 0;
      for (let p = 0; p < s.n; p++) if (p !== seat && !s.folded[p] && !s.allIn[p]) can++;
      open.push({ seat, street: e.street, can, pred: trk.betRead(s, seat, bin, e.amount / Math.max(1, sit.pot)), my: evaluate([...s.hole[seat], ...s.board.slice(0, e.street + 2)]), board: s.board.slice(0, e.street + 2), holes: s.hole.map((h) => h && h.slice()), seen: new Set(), answers: [] });
    }
  },
  onHandEnd: () => {
    for (const r of open) close(r);
    open = [];
  },
});
const show = (name, cal) => {
  console.log(`${name} (predicted, actual, bets):`);
  for (const c of cal) if (c.n) console.log(`  ${(100 * c.p / c.n).toFixed(0).padStart(3)}%  ${(100 * c.y / c.n).toFixed(0).padStart(3)}%  ${c.n}`);
  return Math.max(0, ...cal.filter((c) => c.n >= 100).map((c) => Math.abs(c.p - c.y) / c.n));
};
console.log(`${TABLE} table, seed ${SEED}, ${HANDS} hands: ${brier.n} bets, ${(100 * rate / brier.n).toFixed(0)}% got a call or a raise`);
const wC = show('someone calls or raises', calC);
const wA = show('ahead of everyone who continues', calA);
const wN = show('the naive figure: ahead of the ranges as they stand, read as ahead when called', calN);
console.log(`Brier, ahead when called: tracker ${(brier.ahead / brier.m).toFixed(4)} | naive ${(brier.naive / brier.m).toFixed(4)} (${brier.m} called bets)`);
['flop', 'turn', 'river'].forEach((nm, i) => bySt[i].m && console.log(`  ${nm.padEnd(6)} (${bySt[i].m}): tracker ${(bySt[i].ahead / bySt[i].m).toFixed(4)} | naive ${(bySt[i].naive / bySt[i].m).toFixed(4)} | mean predicted minus actual ${(100 * bySt[i].gap / bySt[i].m).toFixed(1)} points`));
console.log(`bars set before the run: worst calibration gap 8 points or less in bands of 100+ bets: called ${(100 * wC).toFixed(1)}, ahead when called ${(100 * wA).toFixed(1)} (naive ${(100 * wN).toFixed(1)}); tracker beats the naive figure: ${brier.ahead < brier.naive ? 'yes' : 'no'}`);
