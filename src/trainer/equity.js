// Preflop equity of the trainee's two cards against an opponent's range, for the Ranges tab.
// The range comes as the 13x13 grid's cells (each class's share of the range); within a class
// every combo that does not use one of your cards counts the same. For each class in the range
// a fixed number of random boards is dealt against a random combo of that class, so every class
// gets its own equity (for colouring the chart) and the overall figure weights each class by
// its share: hands they would only sometimes play count for less.
// Uses its own seeded generator, so it never touches the game's cards and gives the same
// answer for the same inputs.
import { COMBOS, comboClass, CLASS_COUNT } from '../engine/hands.js';
import { makeRng } from '../engine/cards.js';
import { evaluate } from '../engine/evaluator.js';

const BY_CLASS = Array.from({ length: CLASS_COUNT }, () => []);
for (let c = 0; c < 1326; c++) BY_CLASS[comboClass[c]].push(COMBOS[c]);

// hero: two cards; shares: per-class share of the range (sums to about 1).
// Returns { equity: 0..1, cls: Float64Array(169) with each class's equity, or NaN if not in range }.
export function equityVsRange(hero, shares, trials = 64, seed = 7) {
  const rng = makeRng(seed);
  const [h1, h2] = hero;
  const cls = new Float64Array(CLASS_COUNT).fill(NaN);
  const deck = new Int8Array(52);
  const seven = [h1, h2, 0, 0, 0, 0, 0];
  const vill = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  let weight = 0;
  for (let k = 0; k < CLASS_COUNT; k++) {
    const share = shares[k];
    if (!(share > 0)) continue;
    const combos = BY_CLASS[k].filter(([a, b]) => a !== h1 && a !== h2 && b !== h1 && b !== h2);
    if (!combos.length) continue;
    let won = 0;
    for (let t = 0; t < trials; t++) {
      const [v1, v2] = combos[Math.floor(rng() * combos.length)];
      // the 48 cards left, then a partial shuffle for the five board cards
      let n = 0;
      for (let c = 0; c < 52; c++) if (c !== h1 && c !== h2 && c !== v1 && c !== v2) deck[n++] = c;
      for (let i = 0; i < 5; i++) {
        const j = i + Math.floor(rng() * (n - i));
        const x = deck[i];
        deck[i] = deck[j];
        deck[j] = x;
        seven[2 + i] = deck[i];
        vill[2 + i] = deck[i];
      }
      vill[0] = v1;
      vill[1] = v2;
      const a = evaluate(seven);
      const b = evaluate(vill);
      won += a > b ? 1 : a === b ? 0.5 : 0;
    }
    cls[k] = won / trials;
    total += share * cls[k];
    weight += share;
  }
  return { equity: weight > 0 ? total / weight : NaN, cls };
}
