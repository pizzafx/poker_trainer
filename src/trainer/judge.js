// The blunder judge. At a decision it estimates, for each option, how much money the
// option makes on average against these specific opponents: it deals the opponents hands
// that fit how they have played (from the belief tracker), plays the rest of the hand out
// many times, and averages the results. No game theory involved.

import { makeRng } from '../engine/cards.js';
import { COMBOS } from '../engine/hands.js';
import { legal, applyAction, cloneState, potSize, STREET } from '../engine/game.js';
import { handFeatures, boardTexture, TIER } from '../engine/features.js';
import { classOf } from '../engine/hands.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction } from '../bots/policy.js';
import { PROFILES, TYPE_IDS, HERO_PROFILE } from '../bots/profiles.js';
import { posterior } from './belief.js';

const roundChips = (x) => (x <= 20 ? Math.round(x) : Math.round(x / 5) * 5);

function label(action, s, L) {
  if (action.type === 'fold') return 'Fold';
  if (action.type === 'check') return 'Check';
  if (action.type === 'call') return `Call $${L.callAmt}`;
  const allIn = action.to >= L.maxTo;
  if (s.currentBet === 0) return allIn ? `All-in $${action.to}` : `Bet $${action.to}`;
  return allIn ? `All-in $${action.to}` : `Raise to $${action.to}`;
}

export function candidateActions(s, heroAction) {
  const L = legal(s);
  const out = [];
  if (L.canFold) out.push({ type: 'fold' });
  if (L.canCheck) out.push({ type: 'check' });
  if (L.canCall) out.push({ type: 'call' });
  const tos = new Set();
  if (L.canRaise) {
    const pot = potSize(s);
    if (s.street === STREET.PRE) {
      const base = s.currentBet;
      if (s.raises === 0) {
        let limpers = 0;
        for (const h of s.history) if (h.type === 'call' && !s.folded[h.seat]) limpers++;
        for (const m of [4, 6]) tos.add(roundChips((m + limpers) * base));
      } else {
        tos.add(roundChips(base * 3));
        tos.add(roundChips(base * 4.2));
        if (s.raises >= 2 || L.maxTo <= base * 8) tos.add(L.maxTo);
      }
    } else if (s.currentBet === 0) {
      for (const f of [0.33, 0.66, 1.0, 1.5]) tos.add(roundChips(f * pot));
      if (L.maxTo <= 2 * pot) tos.add(L.maxTo);
    } else {
      tos.add(roundChips(s.currentBet * 2.5));
      tos.add(roundChips(s.currentBet + 0.85 * (pot + L.callAmt)));
      if (L.maxTo <= 2.5 * (pot + L.callAmt)) tos.add(L.maxTo);
    }
  }
  if (heroAction && (heroAction.type === 'raise' || heroAction.type === 'bet') && L.canRaise) {
    tos.add(Math.max(L.minTo, Math.min(L.maxTo, Math.round(heroAction.to))));
  }
  // Betting more than the biggest remaining opponent can call is the same play as putting
  // them all-in, so sizes above that collapse into one option.
  let cover = 0;
  for (let i = 0; i < s.n; i++) if (i !== s.toAct && !s.folded[i]) cover = Math.max(cover, s.bet[i] + s.stacks[i]);
  const top = Math.max(L.minTo, Math.min(L.maxTo, cover));
  const clean = new Set();
  for (let to of tos) {
    to = Math.max(L.minTo, Math.min(top, to));
    if (to >= 0.8 * top) to = top;
    clean.add(to);
  }
  for (const to of [...clean].sort((a, b) => a - b)) out.push({ type: 'raise', to });
  for (const a of out) a.label = label(a, s, L);
  return out;
}

// Which opponent the trainee's stand-in should adjust to at this decision.
function villainFor(st, ctx, hero, prof) {
  if (ctx.toCall > 0 && ctx.aggressor >= 0 && ctx.aggressor !== hero && prof[ctx.aggressor]) {
    return prof[ctx.aggressor];
  }
  let pick = null;
  for (let i = 0; i < st.n; i++) {
    if (i === hero || st.folded[i] || !prof[i]) continue;
    if (!pick || prof[i].foldy < pick.foldy) pick = prof[i]; // a bluff has to get through the stickiest
  }
  return pick;
}

// Every decision in a simulated hand gets its own random number, fixed by (sample, seat,
// street, how many times that seat has acted). So when two options are compared, a player
// who was going to fold to the smaller bet also folds to the bigger one, and the comparison
// is between the options, not between two different strokes of luck.
function decisionRng(seedK, seat, street, count) {
  const h = (Math.imul(seedK, 73856093) ^ Math.imul(seat + 1, 19349663) ^ Math.imul(street + 1, 83492791) ^ Math.imul(count + 1, 2654435761)) >>> 0;
  return makeRng(h);
}

function playOut(st, hero, prof, seedK, heat, shift) {
  let tex = null;
  let texLen = -1;
  const acts = new Uint8Array(st.n * 4);
  while (!st.done) {
    const seat = st.toAct;
    const rng = decisionRng(seedK, seat, st.street, acts[seat * 4 + st.street]++);
    const ctx = buildContext(st);
    let P;
    if (seat === hero) {
      P = HERO_PROFILE;
      ctx.villain = villainFor(st, ctx, hero, prof);
    } else {
      P = prof[seat];
      if (shift) ctx.shift = shift;
      if (heat && ctx.aggressor === hero && ctx.toCall > 0) ctx.heat = heat;
    }
    let pol;
    if (st.street === STREET.PRE) {
      pol = preflopPolicy(ctx, P, classOf(st.hole[seat][0], st.hole[seat][1]));
    } else {
      if (texLen !== st.board.length) {
        tex = boardTexture(st.board);
        texLen = st.board.length;
      }
      pol = postflopPolicy(ctx, P, handFeatures(st.hole[seat], st.board, tex));
    }
    applyAction(st, sampleAction(pol, rng), rng);
  }
}

// s: live state with the hero to act. belief: HandBelief. heroAction: what the trainee chose.
export function judgeDecision(s, hero, belief, heroAction, opts = {}) {
  const N = opts.samples || 500;
  const seed = opts.seed || 1;
  const cands = candidateActions(s, heroAction);
  const C = cands.length;
  const opps = [];
  for (let i = 0; i < s.n; i++) if (i !== hero && !s.folded[i]) opps.push(i);
  const samplers = opps.map((o) => belief.sampler(o));
  const res = cands.map(() => new Float64Array(N));
  const used = new Uint8Array(52);
  const baseStack = s.stacks[hero];
  const rngS = makeRng(seed * 7919 + 13);
  const prof = new Array(s.n).fill(null);
  let n = 0;
  let guard = 0;
  while (n < N && guard++ < N * 4) {
    used.fill(0);
    for (const c of s.hole[hero]) used[c] = 1;
    for (const c of s.board) used[c] = 1;
    const base = cloneState(s);
    let ok = true;
    for (let j = 0; j < opps.length && ok; j++) {
      let tries = 0;
      for (;;) {
        const d = samplers[j](rngS);
        const [a, b] = COMBOS[d.combo];
        if (!used[a] && !used[b]) {
          used[a] = used[b] = 1;
          base.hole[opps[j]] = [a, b];
          prof[opps[j]] = PROFILES[TYPE_IDS[d.type]];
          break;
        }
        if (++tries > 30) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    const remaining = [];
    for (let c = 0; c < 52; c++) if (!used[c]) remaining.push(c);
    // Decide the rest of the board now, so every option is tried on the same run-out.
    const plan = s.board.slice();
    while (plan.length < 5) {
      const i = Math.floor(rngS() * remaining.length);
      plan.push(remaining[i]);
      remaining[i] = remaining[remaining.length - 1];
      remaining.pop();
    }
    base.plan = plan;
    const seedK = (seed * 104729 + n) | 0;
    for (let c = 0; c < C; c++) {
      const st = cloneState(base);
      applyAction(st, cands[c], rngS);
      playOut(st, hero, prof, seedK, opts.heat || 0, opts.shift || 0);
      res[c][n] = st.stacks[hero] - baseStack;
    }
    n++;
  }

  const evs = res.map((r) => {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += r[k];
    return sum / Math.max(1, n);
  });
  let best = 0;
  for (let c = 1; c < C; c++) if (evs[c] > evs[best]) best = c;

  // Which option did the trainee take?
  let mine = -1;
  if (heroAction) {
    const t = heroAction.type === 'bet' ? 'raise' : heroAction.type;
    if (t === 'raise') {
      let bd = Infinity;
      for (let c = 0; c < C; c++) {
        if (cands[c].type !== 'raise') continue;
        const d = Math.abs(cands[c].to - heroAction.to);
        if (d < bd) {
          bd = d;
          mine = c;
        }
      }
    } else {
      mine = cands.findIndex((c) => c.type === t);
    }
    if (mine < 0) mine = cands.findIndex((c) => c.type === 'check' || c.type === 'call');
  }

  let loss = 0;
  let se = 0;
  if (mine >= 0 && mine !== best) {
    let sum = 0;
    let sq = 0;
    for (let k = 0; k < n; k++) {
      const d = res[best][k] - res[mine][k];
      sum += d;
      sq += d * d;
    }
    loss = sum / n;
    se = Math.sqrt(Math.max(0, sq / n - loss * loss) / n);
  }

  // Which options are too close to the best one to tell apart at this sample size?
  const close = cands.map((_, c) => {
    if (c === best) return true;
    let sum = 0;
    let sq = 0;
    for (let k = 0; k < n; k++) {
      const d = res[best][k] - res[c][k];
      sum += d;
      sq += d * d;
    }
    const m = sum / n;
    return m < 2 * Math.sqrt(Math.max(0, sq / n - m * m) / n);
  });

  const pot = potSize(s);
  const bb = s.bbAmt;
  const sameKind = mine >= 0 && cands[mine].type === cands[best].type;
  const sig = loss > 2.2 * se;
  let grade = 'good';
  if (mine >= 0 && mine !== best && sig) {
    const big = Math.max(8 * bb, 0.2 * pot) * (sameKind ? 1.6 : 1);
    const small = Math.max(3 * bb, 0.1 * pot) * (sameKind ? 1.6 : 1);
    if (loss >= big) grade = 'blunder';
    else if (loss >= small) grade = 'mistake';
  }

  return {
    options: cands.map((c, i) => ({ ...c, ev: evs[i], close: close[i] })),
    best,
    mine,
    loss,
    se,
    grade,
    sameKind,
    samples: n,
    pot,
    street: s.street,
  };
}

// A plain-language picture of one opponent's likely holdings, for the feedback text.
export function rangePicture(belief, seat, s, hero) {
  const w = belief.range(seat);
  const post = posterior(belief.reads[seat]);
  const pre = s.street === STREET.PRE;
  const out = { seat, buckets: null, equity: null, post };
  if (pre) return out;
  const feats = belief.features(s.street);
  const b = { monster: 0, strong: 0, twoPair: 0, topPair: 0, weakPair: 0, draw: 0, air: 0 };
  const mine = handFeatures(s.hole[hero], s.board).score;
  let ahead = 0;
  let tie = 0;
  let total = 0;
  for (let c = 0; c < 1326; c++) {
    const x = w[c];
    if (x <= 0 || !feats[c]) continue;
    const f = feats[c];
    total += x;
    if (f.tier >= TIER.MONSTER) b.monster += x;
    else if (f.tier >= TIER.STRONG) b.strong += x;
    else if (f.tier >= TIER.TWO_PAIR) b.twoPair += x;
    else if (f.tier >= TIER.TOP_PAIR_WEAK) b.topPair += x;
    else if (f.drawEquity >= 0.14 && s.board.length < 5) b.draw += x;
    else if (f.tier >= TIER.WEAK_PAIR) b.weakPair += x;
    else b.air += x;
    if (mine > f.score) ahead += x;
    else if (mine === f.score) tie += x;
  }
  if (total > 0) {
    for (const k in b) b[k] /= total;
    out.buckets = b;
    out.equity = (ahead + tie / 2) / total; // share of their range you beat right now
  }
  return out;
}
