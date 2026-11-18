// Stage 1 check of the range tracker: on real hands, at every postflop decision, for the player to act against
// every other live opponent the coach tracks, the chance of being ahead right now as predicted by
//   trk   the tracker (bins, tables, public action only)
//   base  the tracker with the action ignored (flop prior and card transitions only)
//   bel   the coach's belief (src/trainer/belief.js: every hand, every type, with its reads), ranked by bin
//   belX  the same, ranked exactly
// against what was true (the two hands actually held). Lower Brier score is better.
// node scripts/rangecheck.js [hands, default 600] [seed, default 7] [table]
import { walk } from './rangelib.js';
import { RangeTrack, B, RANK, binOf } from '../src/bots/rangetrack.js';
import { RANGE_TABLES } from '../src/bots/rangetables.js';
import { evaluate } from '../src/engine/evaluator.js';
import { COMBOS } from '../src/engine/hands.js';

const HANDS = +(process.argv[2] || 600);
const SEED = +(process.argv[3] || 7);
const TABLE = process.argv[4] || 'typical';
const trk = new RangeTrack(RANGE_TABLES);
// the same tables with every action equally likely from every bin: the action is ignored
const flat = { ...RANGE_TABLES, lik: RANGE_TABLES.lik.map((a) => a.map((r) => r.map(() => 1))) };
const base = new RangeTrack(flat);
const NAMES = ['trk', 'base', 'bel', 'belX'];
const mk = () => Object.fromEntries(NAMES.map((k) => [k, { brier: 0, n: 0 }]));
const all = mk();
const byStreet = [mk(), mk(), mk()];
const calib = Array.from({ length: 10 }, () => ({ p: 0, y: 0, n: 0 }));
let tv = 0;
let tvBase = 0;
let tvN = 0;
let diff = 0;
walk({
  seed: SEED,
  table: TABLE,
  hands: HANDS,
  trackers: [trk, base],
  onPoint: ({ s, seat, sess, bins }) => {
    const belief = sess.hand.belief;
    const feats = belief.features(s.street);
    const my = evaluate([...s.hole[seat], ...s.board]);
    const myBin = bins[seat];
    for (let k = 1; k < s.n; k++) {
      if (k === seat || s.folded[k]) continue;
      const w = belief.range(k);
      const hist = new Float64Array(B);
      let tot = 0;
      let below = 0;
      let belowBin = 0;
      for (let c = 0; c < 1326; c++) {
        const x = w[c];
        if (!(x > 0) || !feats[c]) continue;
        const cb = binOf(feats[c]);
        hist[cb] += x;
        tot += x;
        const sc = evaluate([COMBOS[c][0], COMBOS[c][1], ...s.board]);
        below += sc < my ? x : sc === my ? 0.5 * x : 0;
        belowBin += RANK[cb] < RANK[myBin] ? x : RANK[cb] === RANK[myBin] ? 0.5 * x : 0;
      }
      if (!(tot > 0)) continue;
      const theirs = evaluate([...s.hole[k], ...s.board]);
      const y = my > theirs ? 1 : my === theirs ? 0.5 : 0;
      const pred = { trk: trk.ahead(k, myBin), base: base.ahead(k, myBin), bel: belowBin / tot, belX: below / tot };
      for (const name of NAMES) {
        const d = (pred[name] - y) ** 2;
        all[name].brier += d;
        all[name].n++;
        byStreet[s.street - 1][name].brier += d;
        byStreet[s.street - 1][name].n++;
      }
      const dec = Math.min(9, Math.floor(pred.trk * 10));
      calib[dec].p += pred.trk;
      calib[dec].y += y;
      calib[dec].n++;
      diff += Math.abs(pred.trk - pred.bel);
      // how far the tracker's histogram is from the coach's (total variation, 0 to 1)
      let tt = 0;
      let tb = 0;
      for (let i = 0; i < B; i++) {
        tt += trk.h[k * B + i];
        tb += base.h[k * B + i];
      }
      let d = 0;
      let d0 = 0;
      for (let i = 0; i < B; i++) {
        d += Math.abs(trk.h[k * B + i] / tt - hist[i] / tot);
        d0 += Math.abs(base.h[k * B + i] / tb - hist[i] / tot);
      }
      tv += d / 2;
      tvBase += d0 / 2;
      tvN++;
    }
  },
});
const line = (m) => NAMES.map((k) => `${k} ${(m[k].brier / Math.max(1, m[k].n)).toFixed(4)}`).join(' | ');
console.log(`${TABLE} table, seed ${SEED}, ${HANDS} hands: ${all.trk.n} (player to act, opponent) pairs`);
console.log(`Brier score of "ahead now":  ${line(all)}`);
['flop', 'turn', 'river'].forEach((nm, i) => console.log(`  ${nm.padEnd(6)} (${byStreet[i].trk.n}): ${line(byStreet[i])}`));
console.log(`tracker against the coach's belief: "ahead" differs by ${(100 * diff / tvN).toFixed(1)} points on average; histogram distance ${(tv / tvN).toFixed(3)} (action ignored: ${(tvBase / tvN).toFixed(3)})`);
console.log('calibration of the tracker (predicted, actual, pairs):');
for (const c of calib) if (c.n) console.log(`  ${(100 * c.p / c.n).toFixed(0).padStart(3)}%  ${(100 * c.y / c.n).toFixed(0).padStart(3)}%  ${c.n}`);
const worst = Math.max(0, ...calib.filter((c) => c.n >= 50).map((c) => Math.abs(c.p - c.y) / c.n));
const ratio = all.trk.brier / all.bel.brier;
console.log(`pass bars set before the run: Brier within 10% of the coach's (ratio ${ratio.toFixed(3)}), worst calibration gap 8 points or less (${(100 * worst).toFixed(1)}), better than ignoring the action (${all.trk.brier < all.base.brier ? 'yes' : 'no'})`);
