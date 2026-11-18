// The coach's stand-in (HERO_PROFILE: the judge's play-out profile for the trainee) is pinned, so a change to it is
// always deliberate (CEO, 18 Nov 2026: batches 15-16 reached it through DEFS.tag unnoticed). The snapshot is the
// profile as shipped with batch 16, which adopts the tag's batch 15-16 fields. A field that differs fails; a new
// field passes only while it is off (null, false or absent), so a new tag knob cannot reach the stand-in silently.
// Changing the stand-in on purpose means updating the snapshot, reviewed by STRAT and MATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HERO_PROFILE } from '../src/bots/profiles.js';

const norm = (v) => (ArrayBuffer.isView(v) ? Array.from(v, (x) => +x.toFixed(9)) : Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)])) : typeof v === 'number' ? +v.toFixed(9) : v);

test('the stand-in hero profile matches its pinned snapshot; new fields stay off', () => {
  const want = JSON.parse(readFileSync(new URL('./fixtures/hero_profile.json', import.meta.url), 'utf8'));
  const got = norm(HERO_PROFILE);
  for (const [k, v] of Object.entries(want)) assert.deepEqual(got[k], v, `HERO_PROFILE.${k} moved`);
  for (const [k, v] of Object.entries(got)) if (!(k in want)) assert.ok(v === null || v === false || v === undefined, `new field HERO_PROFILE.${k} = ${JSON.stringify(v)} reached the stand-in`);
});
