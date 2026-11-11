import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/cards.js';
import { newHand, applyAction, legal } from '../src/engine/game.js';
import { presets, defaultRaise } from '../src/ui/presets.js';

const noRake = { pct: 0, cap: 0, promo: 0, noFlopNoDrop: true };

// Every raise decision reached by random play at tables with a mix of deep and short stacks.
function* raiseSpots(hands, seed) {
  const rng = makeRng(seed);
  for (let h = 0; h < hands; h++) {
    const n = 2 + Math.floor(rng() * 7);
    const stacks = Array.from({ length: n }, () => (rng() < 0.4 ? 10 + Math.floor(rng() * 60) : 100 + Math.floor(rng() * 900)));
    const s = newHand({ stacks, button: Math.floor(rng() * n), sb: 2, bb: 3, rng, rake: noRake });
    let guard = 0;
    while (!s.done && guard++ < 200) {
      const L = legal(s);
      if (L.canRaise) yield { s, L };
      const r = rng();
      let a;
      if (L.canRaise && r < 0.3) a = { type: 'raise', to: L.minTo + Math.floor(rng() * (L.maxTo - L.minTo + 1)) };
      else if (L.canFold && r < 0.5) a = { type: 'fold' };
      else a = { type: L.canCheck ? 'check' : 'call' };
      applyAction(s, a, rng);
    }
  }
}

test('bet presets: legal sizes, and the default is never all-in when a smaller raise exists', () => {
  let spots = 0;
  let forced = 0;
  for (const { s, L } of raiseSpots(3000, 4242)) {
    spots++;
    const p = presets(L, s);
    assert.ok(p.length >= 1);
    for (const [, v] of p) assert.ok(v >= L.minTo && v <= L.maxTo, `preset ${v} outside ${L.minTo}..${L.maxTo}`);
    const allIn = p[p.length - 1][1];
    const d = defaultRaise(L, s);
    assert.ok(d >= L.minTo && d <= L.maxTo);
    if (L.minTo < allIn) assert.ok(d < allIn, `default ${d} is the all-in size ${allIn} though ${L.minTo} is legal`);
    else forced++;
  }
  assert.ok(spots > 1000, `only ${spots} raise spots`);
  assert.ok(forced < spots / 2);
});

test('bet presets: short biggest opponent preflop does not preselect the shove', () => {
  // Hero on the button with $500; the blinds have $12 and $14. Only the 3x open survives below
  // 80% of what they can call, so the old "second button" default was the shove.
  const rng = makeRng(7);
  const s = newHand({ stacks: [500, 12, 14], button: 0, sb: 2, bb: 3, rng, rake: noRake });
  assert.equal(s.toAct, 0);
  const L = legal(s);
  const p = presets(L, s);
  const allIn = p[p.length - 1][1];
  assert.equal(allIn, 14);
  assert.deepEqual(p.map(([, v]) => v), [9, 14]);
  const d = defaultRaise(L, s);
  assert.ok(d < allIn, `default ${d}`);
  assert.equal(d, 9);
});
