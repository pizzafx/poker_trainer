// The Bag's data (scripts/bagbuild.js) and STRAT's gates. Every number the game shows comes from the build; these tests
// hold the shipped file to it and to the gates, so a bot change that moves a set fails here until it is re-gated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBag, inputsHash, SETS } from '../scripts/bagbuild.js';

const shipped = JSON.parse(readFileSync(new URL('../src/bag/bags.json', import.meta.url), 'utf8'));
const strong = (a) => a.filter((h) => h.row === 0).length;
const weak = (a) => a.filter((h) => h.row >= 2).length;
const beats = (a) => a.filter((h) => h.beatsYou === 1).length;

test('the shipped bags are exactly what the build makes from the bots today (no hand-written numbers)', () => {
  assert.deepEqual(shipped, JSON.parse(JSON.stringify(buildBag())));
});

test('the pool: T1 first, then V1, V2, V4, V5, V8; every bag is 20 real hands', () => {
  assert.equal(shipped.firstPlay, 'T1');
  assert.deepEqual(shipped.sets.map((s) => s.id), ['T1', 'V1', 'V2', 'V4', 'V5', 'V8']);
  for (const s of shipped.sets) for (const k of ['start', 'afterCalls', 'nitAfterCalls', 'afterBigBet', 'ifChecked']) assert.equal(s.cards[k].length, 20, `${s.id} ${k}`);
});

for (const s of shipped.sets) {
  test(`STRAT's gates on ${s.id}`, () => {
    const c = s.cards;
    // 1. the caller's big river bet is a real part of its range, and the bag after it mostly beats top pair
    assert.ok(s.gate.leadFreq >= 0.02, `lead ${s.gate.leadFreq}`);
    assert.ok(s.gate.beatsTopPairAfter >= 0.75, `beats top pair ${s.gate.beatsTopPairAfter}`);
    // 2. clearly weak after the calls, clearly strong after the big bet
    assert.ok(strong(c.afterCalls) <= 6, `strong after calls ${strong(c.afterCalls)}`);
    assert.ok(strong(c.afterBigBet) >= 14, `strong after the big bet ${strong(c.afterBigBet)}`);
    // 3. "strong" and "beats you" are the same hands, so the words never disagree
    assert.equal(strong(c.afterCalls), beats(c.afterCalls));
    assert.equal(strong(c.afterBigBet), beats(c.afterBigBet));
    // 4. the careful player's calls leave clearly fewer weak hands
    assert.ok(weak(c.nitAfterCalls) <= weak(c.afterCalls) - 5, `nit weak ${weak(c.nitAfterCalls)}, caller weak ${weak(c.afterCalls)}`);
    // 5. the guard: the checked bag is clearly weak for the hero, and the step is on every pool set
    assert.ok(beats(c.ifChecked) <= 4, `checked bag beats you ${beats(c.ifChecked)}`);
    assert.equal(s.showIfChecked, true);
  });
  // the honest draws keep their own weights; the swap rules (same row and outcome, real weight) live in sampleHands
  test(`display sampler rules on ${s.id}`, () => {
    for (const [k, bag] of Object.entries(s.cards)) {
      if (!Array.isArray(bag)) continue;
      const seen = new Set();
      const pairs = {};
      for (const h of bag) {
        const key = [...h.cards].sort().join('');
        assert.ok(!seen.has(key), `${s.id} ${k}: ${key} twice`);
        seen.add(key);
        const rp = h.cards.map((x) => x[0]).sort().join('');
        pairs[rp] = (pairs[rp] || 0) + 1;
      }
      // at most 3 of one rank pair, unless the build recorded that no real-weight swap existed (the cap gives way)
      const waivedN = (s.capWaived[k] || []).length;
      const over = Object.values(pairs).filter((nn) => nn > 3).length;
      assert.ok(over <= waivedN, `${s.id} ${k}: ${over} rank pairs over the cap, ${waivedN} recorded`);
    }
  });
  test(`STRAT's judge verdicts on ${s.id} are for today's inputs`, () => {
    const def = SETS.find((d) => d.id === s.id);
    assert.equal(s.verdict.lead, 'fold');
    assert.equal(s.verdict.check, 'bet');
    assert.equal(s.verdict.inputs, inputsHash(def), `${s.id}: the bots, the read tracker or the line changed since STRAT's judge check; re-run it and update VERDICTS in scripts/bagbuild.js`);
  });
}

test('Basics: eight hands, strong to weak; the four a straightforward player raises stay', () => {
  assert.equal(shipped.basics.length, 8);
  assert.deepEqual(shipped.basics.map((h) => h.stays), [true, true, true, true, false, false, false, false]);
});

// the Bag's inputs hash covers everything its hands and verdicts rest on (CEO, stability batch)
test('the Bag\'s inputs hash covers the judge, the grading and the bots\' data tables', async () => {
  const { inputFiles } = await import('../scripts/bagbuild.js');
  const files = inputFiles();
  for (const f of ['src/trainer/judge.js', 'src/trainer/grade.js', 'src/trainer/best.js', 'src/bots/policy.js', 'src/bots/rangetables.js', 'src/data/stabfoldref.js', 'src/engine/game.js'])
    assert.ok(files.includes(f), `${f} is not in the Bag's inputs`);
});
