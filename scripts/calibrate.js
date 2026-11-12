// Plays many hands between bots and prints the stats that emerge, per player type and for
// the table as a whole, so profile numbers can be checked against research figures.
// Run: node scripts/calibrate.js [hands] [type,type,...]

import { makeRng } from '../src/engine/cards.js';
import { newHand, applyAction, STREET } from '../src/engine/game.js';
import { handFeatures, boardTexture, TIER } from '../src/engine/features.js';
import { classOf } from '../src/engine/hands.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction } from '../src/bots/policy.js';
import { PROFILES, TYPE_IDS } from '../src/bots/profiles.js';
import { HAND, GAME_LINE } from './config.js';

const HANDS = +(process.argv[2] || 30000);
console.log(GAME_LINE);
const lineup = process.argv[3] ? process.argv[3].split(',') : null;
const rng = makeRng(12345);

function pickTable() {
  if (lineup) return lineup.slice();
  const t = [];
  for (let i = 0; i < 9; i++) {
    let r = rng();
    for (const id of TYPE_IDS) {
      if ((r -= PROFILES[id].share) < 0) {
        t.push(id);
        break;
      }
    }
    if (t.length <= i) t.push('station');
  }
  return t;
}

const mk = () => ({
  hands: 0, vpip: 0, pfr: 0, threeBetOpp: 0, threeBet: 0, sawFlop: 0, wtsd: 0, net: 0,
  cbetOpp: 0, cbet: 0, faceCbet: 0, foldCbet: 0, riverRaise: 0, riverRaiseBluff: 0,
  riverBet: 0, riverBetBluff: 0, limpFaceRaise: 0, limpCallRaise: 0,
});
const stats = Object.fromEntries(TYPE_IDS.map((id) => [id, mk()]));
let flops = 0;
let playersAtFlop = 0;
let headsUpFlops = 0;
let fivePlus = 0;
let limpedPots = 0;
let totalHands = 0;
let rakeTotal = 0;

let table = pickTable();
let button = 0;
for (let h = 0; h < HANDS; h++) {
  if (h % 200 === 0) table = pickTable();
  const n = table.length;
  button = (button + 1) % n;
  const s = newHand({ stacks: new Array(n).fill(300), button, ...HAND, rng });
  const did = table.map(() => ({ vpip: false, pfr: false, limped: false }));
  let pfRaises = 0;
  let pfAgg = -1;
  let tex = null;
  let texStreet = -1;
  let flopBetMade = false;
  let cbetMade = false;
  totalHands++;
  while (!s.done) {
    const seat = s.toAct;
    const P = PROFILES[table[seat]];
    const st = stats[table[seat]];
    const ctx = buildContext(s);
    let pol;
    let f = null;
    if (s.street === STREET.PRE) {
      pol = preflopPolicy(ctx, P, classOf(s.hole[seat][0], s.hole[seat][1]));
    } else {
      if (texStreet !== s.street) {
        tex = boardTexture(s.board);
        texStreet = s.street;
      }
      f = handFeatures(s.hole[seat], s.board, tex);
      pol = postflopPolicy(ctx, P, f);
    }
    const a = sampleAction(pol, rng);
    if (s.street === STREET.PRE) {
      if (ctx.raises === 1 && !ctx.iRaised) {
        st.threeBetOpp++;
        if (a.type === 'raise') st.threeBet++;
      }
      if (ctx.raises === 1 && did[seat].limped) {
        st.limpFaceRaise++;
        if (a.type !== 'fold') st.limpCallRaise++;
      }
      if (a.type === 'call') {
        did[seat].vpip = true;
        if (ctx.raises === 0) did[seat].limped = true;
      }
      if (a.type === 'raise') {
        did[seat].vpip = true;
        did[seat].pfr = true;
        pfRaises++;
        pfAgg = seat;
      }
    } else if (s.street === STREET.FLOP) {
      if (seat === pfAgg && ctx.toCall === 0 && !flopBetMade) {
        st.cbetOpp++;
        if (a.type === 'raise') {
          st.cbet++;
          cbetMade = true;
        }
      } else if (cbetMade && ctx.raises === 1 && ctx.aggressor === pfAgg) {
        st.faceCbet++;
        if (a.type === 'fold') st.foldCbet++;
      }
      if (a.type === 'raise') flopBetMade = true;
    } else if (s.street === STREET.RIVER && a.type === 'raise') {
      const bluff = f.tier <= TIER.MIDDLE_PAIR;
      if (ctx.toCall > 0) {
        st.riverRaise++;
        if (bluff) st.riverRaiseBluff++;
      } else {
        st.riverBet++;
        if (bluff) st.riverBetBluff++;
      }
    }
    const wasPre = s.street === STREET.PRE;
    applyAction(s, a, rng);
    if (wasPre && s.street !== STREET.PRE && s.sawFlop && !s.countedFlop) {
      s.countedFlop = true;
      let live = 0;
      for (let i = 0; i < n; i++) {
        if (!s.folded[i]) {
          live++;
          stats[table[i]].sawFlop++;
        }
      }
      flops++;
      playersAtFlop += live;
      if (live === 2) headsUpFlops++;
      if (live >= 5) fivePlus++;
      if (pfRaises === 0) limpedPots++;
    }
  }
  rakeTotal += s.result.rake;
  for (let i = 0; i < n; i++) {
    const st = stats[table[i]];
    st.hands++;
    if (did[i].vpip) st.vpip++;
    if (did[i].pfr) st.pfr++;
    st.net += s.result.net[i];
    if (s.result.showdown && !s.folded[i]) st.wtsd++;
  }
}

const pc = (a, b) => (b ? ((100 * a) / b).toFixed(1).padStart(5) : '    -');
console.log('type      hands   VPIP   PFR   3bet  limp-call  cbet  fold-to-cbet  WTSD(of flops)  river-bet-bluff  river-raise-bluff  bb/100');
const tot = mk();
for (const id of TYPE_IDS) {
  const s = stats[id];
  if (!s.hands) continue;
  for (const k in tot) tot[k] += s[k];
  console.log(
    id.padEnd(8), String(s.hands).padStart(6), pc(s.vpip, s.hands), pc(s.pfr, s.hands), pc(s.threeBet, s.threeBetOpp),
    '   ', pc(s.limpCallRaise, s.limpFaceRaise), ' ', pc(s.cbet, s.cbetOpp), '     ', pc(s.foldCbet, s.faceCbet),
    '       ', pc(s.wtsd, s.sawFlop), '          ', pc(s.riverBetBluff, s.riverBet), '           ', pc(s.riverRaiseBluff, s.riverRaise),
    `(${s.riverRaise})`.padStart(7), ((100 * s.net) / 3 / s.hands).toFixed(1).padStart(7),
  );
}
console.log(
  'POOL    ', String(tot.hands).padStart(6), pc(tot.vpip, tot.hands), pc(tot.pfr, tot.hands), pc(tot.threeBet, tot.threeBetOpp),
  '   ', pc(tot.limpCallRaise, tot.limpFaceRaise), ' ', pc(tot.cbet, tot.cbetOpp), '     ', pc(tot.foldCbet, tot.faceCbet),
  '       ', pc(tot.wtsd, tot.sawFlop), '          ', pc(tot.riverBetBluff, tot.riverBet), '           ', pc(tot.riverRaiseBluff, tot.riverRaise),
);
console.log(
  `flop seen ${pc(flops, totalHands)}% of hands | players per flop ${(playersAtFlop / flops).toFixed(2)} | heads-up flops ${pc(headsUpFlops, flops)}% | 5+ way ${pc(fivePlus, flops)}% | unraised flops ${pc(limpedPots, flops)}% | rake/hand $${(rakeTotal / totalHands).toFixed(2)}`,
);
