// The blunder judge. At a decision it estimates, for each option, how much money the
// option makes on average against these specific opponents: it deals the opponents hands
// that fit how they have played (from the belief tracker), plays the rest of the hand out
// many times, and averages the results. No game theory involved.

import { makeRng } from '../engine/cards.js';
import { COMBOS } from '../engine/hands.js';
import { legal, applyAction, cloneState, potSize, STREET } from '../engine/game.js';
import { handFeatures, boardTexture, TIER } from '../engine/features.js';
import { evaluate } from '../engine/evaluator.js';
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
  // Say each size relative to the pot (bets) or to the bet being raised, so sizes read the
  // same way whatever the dollar amounts are.
  if (s.currentBet === 0) {
    const pct = Math.round((100 * action.to) / Math.max(1, L.pot));
    return `${allIn ? 'All-in' : 'Bet'} $${action.to} (${pct}% pot)`;
  }
  const times = action.to / s.currentBet;
  return `${allIn ? 'All-in' : 'Raise to'} $${action.to} (${times >= 10 ? Math.round(times) : times.toFixed(1)}x)`;
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
        // A squeeze: with callers after the raise, three times the raise plus one raise per caller
        // (PRO review, item 1). Without it the "small" re-raise tested is one nobody should make.
        if (s.raises === 1) {
          let callers = 0;
          let seen = false;
          for (const h of s.history) {
            if (h.type === 'raise') seen = true;
            else if (seen && h.type === 'call' && !s.folded[h.seat]) callers++;
          }
          if (callers > 0) tos.add(roundChips(base * (3 + callers)));
        }
        if (s.raises >= 2 || L.maxTo <= base * 8) tos.add(L.maxTo);
      }
    } else if (s.currentBet === 0) {
      for (const f of [0.33, 0.5, 0.75, 1.0, 1.5]) tos.add(roundChips(f * pot));
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
  // When stacks are so short that every pot-based size is all-in, size against what is left
  // to bet instead: a third and two-thirds of it, and all of it.
  if (L.canRaise && clean.size === 1 && clean.has(top)) {
    for (const f of [1 / 3, 2 / 3]) {
      const to = roundChips(top * f);
      if (to >= L.minTo && to < 0.8 * top) clean.add(to);
    }
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

// The trainee's stand-in in the play-outs; a scenario can swap it (set for one judgement at a time).
let heroP = HERO_PROFILE;

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
      P = heroP;
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
  // After the flop, each sample's dealt hands, so the free "ranges stronger / weaker" scenarios can
  // count later, only if a flag needs them, how many opponents beat the trainee (MATH_MULTIWAY 2b).
  const dealtCombos = s.board.length >= 3 ? new Uint16Array(N * opps.length) : null;
  // MATH's anchors (MATH_BASELINE_SPEC, phase 2a), after the flop, on the base run only: per option,
  // how the opponents first answered (everyone folds, someone raises, or k callers) and whether the
  // trainee's hand beats every caller's right now; facing a bet, whether it beats everyone who has put
  // money in on this street. No extra play-outs.
  const anchors = s.board.length >= 3 && !opts.shift && !opts.heroProfile;
  const A = anchors ? cands.map(() => ({ allFold: 0, raised: 0, called: 0, ahead: 0, need: 0 })) : null;
  // a made hand's score is evaluate() of the seven (or fewer) cards, as handFeatures' score is
  const scoreOf = (hole) => evaluate([...hole, ...s.board]);
  const myScore = anchors ? scoreOf(s.hole[hero]) : 0;
  const oppScore = new Map();
  const inSeats = [];
  if (anchors) for (const h of s.history) if (h.street === s.street && h.seat !== hero && ['bet', 'raise', 'call'].includes(h.type) && !s.folded[h.seat] && !inSeats.includes(h.seat)) inSeats.push(h.seat);
  let q = 0;
  const startLen = s.history.length;
  // A time budget (the app sets one; tests do not): stop sampling once it is spent, after at least
  // 200 samples, so no decision takes much more than a few seconds on a slow machine.
  const t0 = opts.budgetMs ? performance.now() : 0;
  let n = 0;
  let guard = 0;
  heroP = opts.heroProfile || HERO_PROFILE;
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
          if (dealtCombos) dealtCombos[n * opps.length + j] = d.combo;
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
    if (anchors) {
      oppScore.clear();
      for (const o of opps) oppScore.set(o, scoreOf(base.hole[o]));
      // ahead of everyone who has put money in (1 ahead, 0.5 tied, 0 behind)
      if (inSeats.length) {
        let ok = 1;
        for (const o of inSeats) {
          const sc = oppScore.get(o);
          if (sc > myScore) ok = 0;
          else if (sc === myScore) ok = Math.min(ok, 0.5);
        }
        q += ok;
      }
    }
    for (let c = 0; c < C; c++) {
      const st = cloneState(base);
      applyAction(st, cands[c], rngS);
      playOut(st, hero, prof, seedK, opts.heat || 0, opts.shift || 0);
      res[c][n] = st.stacks[hero] - baseStack;
      if (A && cands[c].type === 'raise') {
        // each opponent's first answer to the bet, on this street
        const hist = st.history;
        const seen = new Set();
        let callers = 0;
        let ok = 1;
        let raised = false;
        for (let i = startLen + 1; i < hist.length && hist[i].street === s.street; i++) {
          const h = hist[i];
          if (h.seat === hero || seen.has(h.seat)) break;
          seen.add(h.seat);
          if (h.type === 'call') {
            callers++;
            const sc = oppScore.get(h.seat);
            if (sc > myScore) ok = 0;
            else if (sc === myScore) ok = Math.min(ok, 0.5);
          } else if (h.type === 'raise' || h.type === 'bet') raised = true;
        }
        const a = A[c];
        if (raised) a.raised++;
        else if (!callers) a.allFold++;
        else {
          a.called++;
          a.need += 1 / (callers + 1);
          a.ahead += ok;
        }
      }
    }
    n++;
    if (opts.budgetMs && n >= 200 && (n & 31) === 0 && performance.now() - t0 > opts.budgetMs) break;
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

  const anchorOf = (c, i) => {
    if (!A || c.type !== 'raise') return {};
    const a = A[i];
    const B = c.to - s.bet[hero];
    return { F: a.allFold / Math.max(1, n), R: a.raised / Math.max(1, n), alpha: B / (pot + B), W: a.called ? a.ahead / a.called : null, need: a.called ? a.need / a.called : null, called: a.called };
  };
  const raiseIdx = cands.map((c, i) => (c.type === 'raise' ? i : -1)).filter((i) => i >= 0);
  const verdict = {
    options: cands.map((c, i) => ({ ...c, ev: evs[i], close: close[i], ...anchorOf(c, i) })),
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
  if (A) {
    verdict.anchors = { n, topSizeBest: raiseIdx.length > 1 && best === raiseIdx[raiseIdx.length - 1] };
    if (inSeats.length) {
      const callAmt = legal(s).callAmt;
      verdict.anchors.Q = q / Math.max(1, n);
      verdict.anchors.price = callAmt / (pot + callAmt);
    }
  }
  // The per-run results, kept out of JSON (reports, storage) but available to pairedGap below.
  const sample = dealtCombos ? { combos: dealtCombos, opps: opps.length, hole: s.hole[hero], board: s.board.slice(), beats: null } : null;
  Object.defineProperty(verdict, 'runs', { value: { res, n, sample }, enumerable: false });
  return verdict;
}

// How much better option `a` did than option `b` on the same run-outs, with its standard error.
export function pairedGap(v, a, b) {
  // A verdict built by hand (tests) has no runs: use its values and its own standard error.
  if (!v.runs) return { mean: v.options[a].ev - v.options[b].ev, se: v.se || 0 };
  const { res, n } = v.runs;
  let sum = 0;
  let sq = 0;
  for (let k = 0; k < n; k++) {
    const d = res[a][k] - res[b][k];
    sum += d;
    sq += d * d;
  }
  const mean = sum / Math.max(1, n);
  return { mean, se: Math.sqrt(Math.max(0, sq / Math.max(1, n) - mean * mean) / Math.max(1, n)) };
}

// Option values with each sample weighted by k^(opponents who beat the trainee in it): k = 2 reads
// every range as twice as strong as the belief says, k = 0.5 as half. Free (no new play-outs).
export function tiltedEvs(v, k) {
  if (!v.runs || !v.runs.sample) return v.options.map((o) => o.ev);
  const { res, n, sample } = v.runs;
  if (!sample.beats) {
    // how many opponents hold a better hand than the trainee right now, per sample (counted once)
    const mine = evaluate([...sample.hole, ...sample.board]);
    sample.beats = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = 0; j < sample.opps; j++) if (evaluate([...COMBOS[sample.combos[i * sample.opps + j]], ...sample.board]) > mine) c++;
      sample.beats[i] = c;
    }
  }
  const beats = sample.beats;
  let W = 0;
  const e = new Array(res.length).fill(0);
  for (let i = 0; i < n; i++) {
    const w = k ** beats[i];
    W += w;
    for (let c = 0; c < res.length; c++) e[c] += w * res[c][i];
  }
  return e.map((x) => x / Math.max(1e-9, W));
}

// Re-marks which options are too close to the best one to tell apart (after a guardrail has
// changed which option counts as best).
export function refreshClose(v) {
  if (!v.runs) return;
  v.options.forEach((o, i) => {
    if (i === v.best) return (o.close = true);
    const g = pairedGap(v, v.best, i);
    o.close = g.mean < 2 * g.se;
  });
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
