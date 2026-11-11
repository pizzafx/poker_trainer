import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, makeRng, fullDeck } from '../src/engine/cards.js';
import { evaluate, categoryOf } from '../src/engine/evaluator.js';
import { newHand, applyAction, legal, cloneState, positionName, STREET } from '../src/engine/game.js';

const ev = (s) => evaluate(parseCards(s));

test('evaluator: category counts over all 2,598,960 five-card hands', () => {
  const counts = new Array(9).fill(0);
  const h = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++)
        for (let d = c + 1; d < 52; d++)
          for (let e = d + 1; e < 52; e++) {
            h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
            counts[categoryOf(evaluate(h))]++;
          }
  assert.deepEqual(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
});

test('evaluator: seven cards equals best of the 21 five-card subsets', () => {
  const rng = makeRng(7);
  for (let t = 0; t < 20000; t++) {
    const d = fullDeck();
    for (let i = 0; i < 7; i++) {
      const j = i + Math.floor(rng() * (52 - i));
      [d[i], d[j]] = [d[j], d[i]];
    }
    const seven = d.slice(0, 7);
    let best = -1;
    for (let x = 0; x < 7; x++)
      for (let y = x + 1; y < 7; y++) {
        const five = seven.filter((_, i) => i !== x && i !== y);
        best = Math.max(best, evaluate(five));
      }
    assert.equal(evaluate(seven), best);
  }
});

test('evaluator: orderings and kickers', () => {
  assert.ok(ev('As Ks Qs Js Ts') > ev('9h 9d 9c 9s Ah'));
  assert.ok(ev('Ah Kd 7c 7s 2h') > ev('Ah Qd 7c 7s 2h'));
  assert.ok(ev('5h 4d 3c 2s Ah 9c 9d') < ev('6h 5d 4c 3s 2h'));
  assert.equal(ev('Ah Kd Qc Js 9h 3c 2d'), ev('As Kc Qd Jh 9s 4c 2h'));
  assert.equal(ev('Ah Ad Kc Ks Qh Qc 2d'), ev('As Ac Kd Kh Qs 3c 2h'));
  assert.ok(ev('Kh Kd Kc 2s 2h 2c 9d') > ev('Qh Qd Qc As Ah 3c 9d'));
});

const noRake = { pct: 0, cap: 0, promo: 0, noFlopNoDrop: true };

test('engine: blinds, positions and a walk', () => {
  const rng = makeRng(1);
  const s = newHand({ stacks: [300, 300, 300, 300], button: 0, sb: 2, bb: 3, rng, rake: noRake });
  assert.equal(s.sbSeat, 1);
  assert.equal(s.bbSeat, 2);
  assert.equal(s.toAct, 3);
  assert.equal(positionName(s, 3), 'CO');
  applyAction(s, { type: 'fold' }, rng);
  applyAction(s, { type: 'fold' }, rng);
  applyAction(s, { type: 'fold' }, rng);
  assert.ok(s.done);
  assert.deepEqual(s.result.net, [0, -2, 2, 0]);
});

test('engine: big blind gets the option, min-raise sizes', () => {
  const rng = makeRng(2);
  const s = newHand({ stacks: [500, 500, 500], button: 0, sb: 2, bb: 3, rng, rake: noRake });
  assert.equal(s.toAct, 0);
  applyAction(s, { type: 'call' }, rng);
  applyAction(s, { type: 'call' }, rng);
  assert.equal(s.toAct, 2);
  let L = legal(s);
  assert.ok(L.canCheck && L.canRaise);
  assert.equal(L.minTo, 6);
  applyAction(s, { type: 'raise', to: 15 }, rng);
  L = legal(s);
  assert.equal(L.seat, 0);
  assert.equal(L.minTo, 27);
  applyAction(s, { type: 'call' }, rng);
  applyAction(s, { type: 'fold' }, rng);
  assert.equal(s.street, STREET.FLOP);
  assert.equal(s.board.length, 3);
  assert.equal(s.toAct, 2); // first live seat left of the button
});

test('engine: short all-in raise does not reopen betting', () => {
  const rng = makeRng(3);
  // Seat 2 has a short stack and will shove for less than a full raise.
  const s = newHand({ stacks: [500, 500, 28, 500], button: 3, sb: 2, bb: 3, rng, rake: noRake });
  // Seats: 0 = SB, 1 = BB, 2 first to act, 3 = button.
  assert.equal(s.toAct, 2);
  applyAction(s, { type: 'call' }, rng);
  applyAction(s, { type: 'raise', to: 20 }, rng); // button
  applyAction(s, { type: 'call' }, rng); // SB
  applyAction(s, { type: 'fold' }, rng); // BB
  assert.equal(s.toAct, 2);
  applyAction(s, { type: 'raise', to: 28 }, rng); // all-in, raise of 8 < 17
  assert.equal(s.toAct, 3);
  const L = legal(s);
  assert.equal(L.canRaise, false);
  assert.equal(L.callAmt, 8);
});

test('engine: side pots pay the right players', () => {
  const rng = makeRng(4);
  const hole = [parseCards('As Ah'), parseCards('Ks Kh'), parseCards('Qs Qh')];
  // Seat 0 (button) has 50, seat 1 (SB) 200, seat 2 (BB) 200.
  const s = newHand({ stacks: [50, 200, 200], button: 0, sb: 2, bb: 3, rng, rake: noRake, hole });
  applyAction(s, { type: 'raise', to: 50 }, rng);
  applyAction(s, { type: 'raise', to: 200 }, rng);
  applyAction(s, { type: 'call' }, rng);
  assert.ok(s.done);
  const total = s.stacks.reduce((a, b) => a + b, 0);
  assert.equal(total, 450);
  assert.equal(s.result.pots.length, 2);
  assert.equal(s.result.pots[0].amount, 150);
  assert.equal(s.result.pots[1].amount, 300);
  assert.deepEqual(s.result.pots[1].eligible, [1, 2]);
});

test('engine: rake is capped and skipped with no flop', () => {
  const rng = makeRng(5);
  const rake = { pct: 0.1, cap: 5, promo: 1, noFlopNoDrop: true };
  const hole = [parseCards('As Ah'), parseCards('7c 2d')];
  const s = newHand({ stacks: [300, 300], button: 0, sb: 2, bb: 3, rng, rake, hole });
  applyAction(s, { type: 'raise', to: 300 }, rng);
  applyAction(s, { type: 'call' }, rng);
  assert.equal(s.result.rake, 6);
  assert.equal(s.stacks[0] + s.stacks[1], 594);

  const t = newHand({ stacks: [300, 300, 300], button: 0, sb: 2, bb: 3, rng, rake });
  applyAction(t, { type: 'raise', to: 15 }, rng);
  applyAction(t, { type: 'fold' }, rng);
  applyAction(t, { type: 'fold' }, rng);
  assert.equal(t.result.rake, 0);
  assert.deepEqual(t.result.net, [5, -2, -3]);
});

test('engine: random play conserves chips and always terminates', () => {
  const rng = makeRng(99);
  const rake = { pct: 0.1, cap: 6, promo: 1, noFlopNoDrop: true };
  for (let h = 0; h < 4000; h++) {
    const n = 2 + Math.floor(rng() * 8);
    const stacks = [];
    for (let i = 0; i < n; i++) stacks.push(10 + Math.floor(rng() * 800));
    const before = stacks.reduce((a, b) => a + b, 0);
    const straddle = rng() < 0.2 ? 6 : 0;
    let s = newHand({ stacks, button: Math.floor(rng() * n), sb: 2, bb: 3, straddle, rng, rake });
    let steps = 0;
    while (!s.done) {
      if (rng() < 0.05) s = cloneState(s);
      const L = legal(s);
      const r = rng();
      if (L.canRaise && r < 0.3) {
        const to = L.minTo + Math.floor(rng() * rng() * (L.maxTo - L.minTo + 1));
        applyAction(s, { type: 'raise', to }, rng);
      } else if (L.canCheck) {
        applyAction(s, { type: 'check' }, rng);
      } else if (r < 0.75) {
        applyAction(s, { type: 'call' }, rng);
      } else {
        applyAction(s, { type: 'fold' }, rng);
      }
      assert.ok(++steps < 500, 'hand did not terminate');
    }
    const after = s.stacks.reduce((a, b) => a + b, 0);
    assert.equal(after + s.result.rake, before);
    assert.ok(s.stacks.every((v) => v >= 0));
    if (s.result.showdown) assert.equal(s.board.length, 5);
  }
});
