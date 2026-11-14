// The value 3-bet size tip (CEO for the owner, Nov 2026): rule-based, never a flag. Against a regular,
// about 3.5 to 4x the open; against players who call anyway, 4 to 5x plus 1x per caller. Only shown
// when the size is outside that band, and only on a value re-raise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeDecision } from '../src/trainer/grade.js';
import { build } from '../scripts/gradeall.js';

const spot = (hole, opener) => ({ id: 'size3b', button: 6, hole, board: '', seats: { 5: opener }, line: '5r15' });
const tipOf = (hole, opener, to) => {
  const { s, belief, env } = build(spot(hole, opener));
  const v = gradeDecision(s, belief, { type: 'raise', to }, { samples: 600, seed: 5 }, env);
  return { grade: v.grade, tip: v.tip || null };
};

test('value 3-bet size tip: regulars 3.5 to 4x, callers 4 to 5x, only outside the band, never a flag', () => {
  // against a regular: 3x is outside the band, 4x inside
  const regSmall = tipOf('Qs Qh', 'tag', 45);
  assert.equal(regSmall.grade, 'good');
  assert.equal(regSmall.tip && regSmall.tip.kind, 'size3bet');
  assert.match(regSmall.tip.text, /3\.5 to 4x the open works best against regulars/);
  assert.equal(tipOf('Qs Qh', 'tag', 60).tip, null);
  // against a calling station: 3x is outside 4-5x, 4.5x inside
  const stnSmall = tipOf('Qs Qh', 'station', 45);
  assert.equal(stnSmall.grade, 'good');
  assert.equal(stnSmall.tip && stnSmall.tip.kind, 'size3bet');
  assert.match(stnSmall.tip.text, /make value re-raises bigger: about 4 to 5x plus 1x per caller/);
  assert.equal(tipOf('Qs Qh', 'station', 68).tip, null);
  // a light 3-bet gets the never-best habit note, not a size tip
  const light = tipOf('7s 6s', 'tag', 45);
  assert.ok(!light.tip || light.tip.kind !== 'size3bet');
});
