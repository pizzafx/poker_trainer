// The verdict checker's fast subset (the full run is `node scripts/verdictcheck.js`): a few hundred
// decisions across the four styles, full ring and heads-up, a home game, every invariant at zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConfig } from '../scripts/verdictcheck.js';

const CONFIGS = [
  { style: 'sensible', game: '1/2', seats: 9, hands: 14, seed: 101 },
  { style: 'passive', game: '2/3', seats: 9, hands: 14, seed: 102 },
  { style: 'aggressive', game: '2/5', seats: 9, hands: 14, seed: 103 },
  { style: 'limper', game: '1/2', seats: 9, hands: 14, seed: 104 },
  { style: 'aggressive', game: '1/2', seats: 2, hands: 14, seed: 105 },
  { style: 'passive', home: true, hands: 10, seed: 106 },
];

test('verdict checker: no verdict breaks an invariant (fast subset)', () => {
  let decisions = 0;
  const bad = [];
  for (const cfg of CONFIGS) {
    const r = runConfig({ ...cfg, samples: 250 });
    decisions += r.decisions;
    for (const { invariant, record } of r.violations) bad.push(`${invariant} | ${cfg.style} ${cfg.home ? 'home' : cfg.game} hand ${record.hand}: ${record.headline}`);
  }
  assert.ok(decisions >= 100, `${decisions} decisions`);
  assert.deepEqual(bad, []);
});
