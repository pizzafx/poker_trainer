// Reads and ranges: properties that must survive any retuning of the opponents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, makeRng } from '../src/engine/cards.js';
import { newHand, applyAction } from '../src/engine/game.js';
import { COMBOS, comboClass, comboIndex } from '../src/engine/hands.js';
import { buildContext } from '../src/bots/policy.js';
import { TYPE_IDS, HERO_PROFILE } from '../src/bots/profiles.js';
import { HandBelief, newRead, posterior } from '../src/trainer/belief.js';

const T = TYPE_IDS.length;
const uniform = () => newRead(new Array(T).fill(1 / T));
const noRake = { pct: 0, cap: 0, promo: 0, noFlopNoDrop: true };
const idx = (id) => TYPE_IDS.indexOf(id);

test('reads: posterior is a distribution with a floor on every type', () => {
  const prior = TYPE_IDS.map((_, i) => (i === 0 ? 0.97 : 0.03 / (T - 1)));
  const p = posterior(newRead(prior));
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  for (const x of p) assert.ok(x > 0.01, 'never fully certain about anyone');
  assert.equal(p.indexOf(Math.max(...p)), 0);
});

// The first player to act preflop (UTG at an 8-handed table) takes `action` every hand.
function watch(action, hands) {
  const read = uniform();
  const rng = makeRng(17);
  for (let h = 0; h < hands; h++) {
    const s = newHand({ stacks: new Array(8).fill(300), button: 0, sb: 2, bb: 3, rng, rake: noRake });
    const seat = s.toAct;
    const reads = new Array(8).fill(null);
    reads[seat] = read;
    const hero = seat === 0 ? 1 : 0;
    const belief = new HandBelief(reads, s.hole[hero]);
    const ctx = buildContext(s);
    const a = action === 'raise' ? { type: 'raise', to: 3 * s.currentBet } : { type: action };
    belief.observe(seat, ctx, a);
    applyAction(s, a, rng);
  }
  return posterior(read);
}

test('reads: folding every hand reads as tight, raising every hand reads as aggressive', () => {
  const folder = watch('fold', 30);
  const raiser = watch('raise', 30);
  assert.ok(folder[idx('nit')] > folder[idx('maniac')], 'folder: nit above maniac');
  assert.ok(folder[idx('nit')] > folder[idx('whale')], 'folder: nit above gambler');
  assert.ok(raiser[idx('maniac')] > raiser[idx('nit')], 'raiser: maniac above nit');
  assert.ok(raiser[idx('maniac')] + raiser[idx('lag')] > 0.4, 'raiser: mostly read as aggressive');
  const limper = watch('call', 30);
  assert.ok(limper[idx('station')] + limper[idx('whale')] + limper[idx('beginner')] > limper[idx('tag')] + limper[idx('gto')], 'open-limper reads as recreational');
});

// Draws `k` combos from a seat's range.
function draw(belief, seat, k, seed = 5) {
  const rng = makeRng(seed);
  const smp = belief.sampler(seat);
  return Array.from({ length: k }, () => smp(rng));
}

test('ranges: never contain a dead card', () => {
  const hero = parseCards('As Kd');
  const reads = [null, uniform()];
  const belief = new HandBelief(reads, hero);
  const board = parseCards('Ah 7c 2d Ks');
  belief.setBoard(board);
  const dead = new Set([...hero, ...board]);
  for (const d of draw(belief, 1, 4000)) {
    const [a, b] = COMBOS[d.combo];
    assert.ok(!dead.has(a) && !dead.has(b), 'sampled a dead card');
    assert.ok(d.type >= 0 && d.type < T);
  }
});

test('ranges: a nit who raises preflop holds stronger hands than one who limps', () => {
  const strength = (raise) => {
    const rng = makeRng(23);
    const s = newHand({ stacks: new Array(8).fill(300), button: 0, sb: 2, bb: 3, rng, rake: noRake });
    const seat = s.toAct;
    const reads = new Array(8).fill(null);
    reads[seat] = newRead(TYPE_IDS.map((id) => (id === 'nit' ? 0.9 : 0.1 / (T - 1))));
    const belief = new HandBelief(reads, s.hole[seat === 0 ? 1 : 0]);
    belief.observe(seat, buildContext(s), raise ? { type: 'raise', to: 9 } : { type: 'call' });
    const xs = draw(belief, seat, 3000).map((d) => HERO_PROFILE.raisePct[comboClass[d.combo]]);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const raised = strength(true);
  const limped = strength(false);
  assert.ok(raised > limped, `raise range ${raised.toFixed(3)} vs limp range ${limped.toFixed(3)}`);
  assert.ok(raised > 0.85, `a nit's raising range is strong (${raised.toFixed(3)})`);
});

test('reads: a showdown that fits a type moves the read towards it', () => {
  // A player open-limps under the gun and shows 9-6 suited: loose players do that, tight ones do
  // not. (Not 7-2 offsuit: every type, even the gambler, folds it there, so showing it says nothing.)
  const rng = makeRng(31);
  const s = newHand({ stacks: new Array(8).fill(300), button: 0, sb: 2, bb: 3, rng, rake: noRake });
  const seat = s.toAct;
  const read = uniform();
  const reads = new Array(8).fill(null);
  reads[seat] = read;
  const belief = new HandBelief(reads, s.hole[seat === 0 ? 1 : 0]);
  belief.observe(seat, buildContext(s), { type: 'call' });
  applyAction(s, { type: 'call' }, rng);
  const before = posterior(read);
  const shown = parseCards('9d 6d');
  assert.ok(comboIndex(shown[0], shown[1]) >= 0);
  belief.reveal(seat, shown);
  const after = posterior(read);
  assert.ok(after[idx('nit')] < before[idx('nit')], 'less likely a nit');
  const loose = (p) => p[idx('whale')] + p[idx('beginner')] + p[idx('station')] + p[idx('maniac')];
  assert.ok(loose(after) > loose(before), 'more likely a loose player');
});
