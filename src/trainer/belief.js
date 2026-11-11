// What an attentive player at the table could know about each opponent:
//   - which type they probably are (prior from how they look, updated by how they play)
//   - which hands they can hold right now, given their actions this hand
//
// For each opponent and each candidate type we keep a weight per hole-card combo. Every
// observed action multiplies those weights by the chance that type takes that action with
// that hand. The total weight left tells us how well the type explains the action.

import { COMBOS, comboClass, comboIndex, CLASS_COUNT } from '../engine/hands.js';
import { handFeatures, boardTexture, TIER } from '../engine/features.js';
import { STREET } from '../engine/game.js';
import { preflopPolicy, postflopPolicy, actionLikelihood } from '../bots/policy.js';
import { PROFILES, TYPE_IDS } from '../bots/profiles.js';

const T = TYPE_IDS.length;
const TEMPER = 0.45; // a human observer is not a perfect statistician
const FLOOR = 0.02; // never be fully certain about anyone

export function newRead(prior) {
  const logP = new Float64Array(T);
  for (let t = 0; t < T; t++) logP[t] = Math.log(Math.max(prior[t], 1e-4));
  return { logP, handStart: new Float64Array(T) };
}

export function posterior(read) {
  let max = -Infinity;
  for (let t = 0; t < T; t++) if (read.logP[t] > max) max = read.logP[t];
  const p = new Float64Array(T);
  let sum = 0;
  for (let t = 0; t < T; t++) {
    p[t] = Math.exp(read.logP[t] - max);
    sum += p[t];
  }
  let sum2 = 0;
  for (let t = 0; t < T; t++) {
    p[t] = Math.max(FLOOR, p[t] / sum);
    sum2 += p[t];
  }
  for (let t = 0; t < T; t++) p[t] /= sum2;
  return p;
}

export class HandBelief {
  // seats: array (by seat index) of read objects, or null for the hero / empty seats.
  constructor(reads, heroHole) {
    this.reads = reads;
    this.dead = new Uint8Array(52);
    for (const c of heroHole) this.dead[c] = 1;
    this.w = reads.map((r) => {
      if (!r) return null;
      r.handStart.set(r.logP);
      const arr = [];
      for (let t = 0; t < T; t++) {
        const w = new Float64Array(1326).fill(1);
        for (let c = 0; c < 1326; c++) {
          if (this.dead[COMBOS[c][0]] || this.dead[COMBOS[c][1]]) w[c] = 0;
        }
        arr.push(w);
      }
      return arr;
    });
    this.board = [];
    this.feats = null;
    this.featStreet = -1;
  }

  setBoard(board) {
    for (let i = this.board.length; i < board.length; i++) {
      const card = board[i];
      this.dead[card] = 1;
      for (const arr of this.w) {
        if (!arr) continue;
        for (let c = 0; c < 1326; c++) {
          if (COMBOS[c][0] === card || COMBOS[c][1] === card) {
            for (let t = 0; t < T; t++) arr[t][c] = 0;
          }
        }
      }
    }
    this.board = board.slice();
  }

  features(street) {
    if (this.featStreet !== street) {
      const tex = boardTexture(this.board);
      this.feats = new Array(1326);
      for (let c = 0; c < 1326; c++) {
        if (this.dead[COMBOS[c][0]] || this.dead[COMBOS[c][1]]) continue;
        this.feats[c] = handFeatures(COMBOS[c], this.board, tex);
      }
      this.featStreet = street;
    }
    return this.feats;
  }

  // Call with the context built just before the action was applied.
  observe(seat, ctx, action) {
    const arr = this.w[seat];
    if (!arr) return;
    const read = this.reads[seat];
    const pre = ctx.street === STREET.PRE;
    const feats = pre ? null : this.features(ctx.street);
    const lik = pre ? new Float64Array(CLASS_COUNT) : null;
    for (let t = 0; t < T; t++) {
      const P = PROFILES[TYPE_IDS[t]];
      const w = arr[t];
      let before = 0;
      let after = 0;
      if (pre) {
        lik.fill(-1);
        for (let c = 0; c < 1326; c++) {
          if (w[c] === 0) continue;
          const k = comboClass[c];
          if (lik[k] < 0) lik[k] = actionLikelihood(preflopPolicy(ctx, P, k), action);
          before += w[c];
          w[c] *= lik[k];
          after += w[c];
        }
      } else {
        for (let c = 0; c < 1326; c++) {
          if (w[c] === 0) continue;
          before += w[c];
          w[c] *= actionLikelihood(postflopPolicy(ctx, P, feats[c]), action);
          after += w[c];
        }
      }
      if (before > 0 && after > 0) read.logP[t] += TEMPER * Math.log(after / before);
    }
  }

  // Cards shown at showdown: score each type by how well it explains the whole line with
  // the hand actually held.
  reveal(seat, hole) {
    const arr = this.w[seat];
    if (!arr) return;
    const read = this.reads[seat];
    const c = comboIndex(hole[0], hole[1]);
    for (let t = 0; t < T; t++) {
      read.logP[t] = read.handStart[t] + TEMPER * Math.log(Math.max(arr[t][c], 1e-12));
    }
  }

  // Sampler for the judge: draws (type index, combo index) for a seat.
  sampler(seat) {
    const arr = this.w[seat];
    const post = posterior(this.reads[seat]);
    const typeCum = new Float64Array(T);
    const cums = new Array(T).fill(null);
    let acc = 0;
    for (let t = 0; t < T; t++) {
      let mass = 0;
      for (let c = 0; c < 1326; c++) mass += arr[t][c];
      acc += mass > 0 ? post[t] : 0;
      typeCum[t] = acc;
    }
    const total = acc;
    return (rng) => {
      let r = rng() * total;
      let t = 0;
      while (t < T - 1 && r >= typeCum[t]) t++;
      if (!cums[t]) {
        const cum = new Float64Array(1326);
        let a = 0;
        for (let c = 0; c < 1326; c++) {
          a += arr[t][c];
          cum[c] = a;
        }
        cums[t] = cum;
      }
      const cum = cums[t];
      const x = rng() * cum[1325];
      let lo = 0;
      let hi = 1325;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] > x) hi = mid;
        else lo = mid + 1;
      }
      return { type: t, combo: lo };
    };
  }

  // The range rolled up onto the 13x13 starting-hand grid: for each of the 169 hand classes,
  // how much of it is still in the range (0..1, relative to the fullest class), its share of
  // the whole range, and what those hands mostly are on this board. `heroScore` (optional)
  // adds the share of the range the trainee's hand currently beats.
  grid(seat, heroScore = null) {
    const w = this.range(seat);
    const n = this.board.length;
    const street = n === 0 ? 0 : n === 3 ? 1 : n === 4 ? 2 : 3;
    const feats = n === 0 ? null : this.features(street);
    const sum = new Float64Array(CLASS_COUNT);
    const size = new Float64Array(CLASS_COUNT);
    const bucket = Array.from({ length: CLASS_COUNT }, () => [0, 0, 0, 0, 0]); // strong, good pair, weak pair, draw, nothing
    const totals = [0, 0, 0, 0, 0];
    const won = new Float64Array(CLASS_COUNT); // weight of each class the trainee's hand beats
    let beat = 0;
    let all = 0;
    for (let c = 0; c < 1326; c++) {
      const k = comboClass[c];
      size[k]++;
      const x = w[c];
      if (x <= 0) continue;
      sum[k] += x;
      all += x;
      if (feats && feats[c]) {
        const f = feats[c];
        const b = f.tier >= TIER.TWO_PAIR ? 0 : f.tier >= TIER.TOP_PAIR_WEAK ? 1 : f.drawEquity >= 0.14 && n < 5 ? 3 : f.tier >= TIER.WEAK_PAIR ? 2 : 4;
        bucket[k][b] += x;
        totals[b] += x;
        if (heroScore !== null) {
          const part = heroScore > f.score ? x : heroScore === f.score ? x / 2 : 0;
          beat += part;
          won[k] += part;
        }
      }
    }
    let max = 0;
    for (let k = 0; k < CLASS_COUNT; k++) max = Math.max(max, sum[k] / size[k]);
    const cells = [];
    for (let k = 0; k < CLASS_COUNT; k++) {
      let top = -1;
      if (feats && sum[k] > 0) {
        top = 0;
        for (let b = 1; b < 5; b++) if (bucket[k][b] > bucket[k][top]) top = b;
      }
      cells.push({
        fill: max > 0 ? sum[k] / size[k] / max : 0,
        share: all > 0 ? sum[k] / all : 0,
        kind: top,
        ahead: heroScore !== null && feats && sum[k] > 0 ? won[k] / sum[k] : null, // share of this class you beat
      });
    }
    return {
      street,
      cells,
      mix: feats && all > 0 ? totals.map((t) => t / all) : null,
      beats: heroScore !== null && feats && all > 0 ? beat / all : null,
    };
  }

  // Combined range for a seat (averaged over what type they might be): weight per combo.
  range(seat) {
    const arr = this.w[seat];
    const post = posterior(this.reads[seat]);
    const out = new Float64Array(1326);
    let sum = 0;
    for (let t = 0; t < T; t++) {
      let mass = 0;
      for (let c = 0; c < 1326; c++) mass += arr[t][c];
      if (mass <= 0) continue;
      const k = post[t] / mass;
      for (let c = 0; c < 1326; c++) out[c] += arr[t][c] * k;
      sum += post[t];
    }
    if (sum > 0) for (let c = 0; c < 1326; c++) out[c] /= sum;
    return out;
  }
}
