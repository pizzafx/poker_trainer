// Invariants of the judge that must hold however the opponents are tuned. Clear-cut river
// spots only: the nuts facing a bet, and no pair facing a nit's pot-sized bet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, makeRng } from '../src/engine/cards.js';
import { newHand, applyAction, legal } from '../src/engine/game.js';
import { buildContext } from '../src/bots/policy.js';
import { TYPE_IDS } from '../src/bots/profiles.js';
import { HandBelief, newRead } from '../src/trainer/belief.js';
import { judgeDecision, candidateActions } from '../src/trainer/judge.js';

const noRake = { pct: 0, cap: 0, promo: 0, noFlopNoDrop: true };
const readFor = (type, conf = 0.85) => newRead(TYPE_IDS.map((id) => (id === type ? conf : (1 - conf) / (TYPE_IDS.length - 1))));

// Heads-up, hero (seat 0) on the button: hero limps (or raises to `open`) and is called, both
// check to the river, where the opponent bets `riverBet` and the hero is to act. Opponent
// cards are irrelevant to the judge.
function riverSpot({ hole, board, type, riverBet, open = 0, stacks = [300, 300] }) {
  const rng = makeRng(1);
  const s = newHand({ stacks, button: 0, sb: 2, bb: 3, rng, rake: noRake, hole: [parseCards(hole), null] });
  const bd = parseCards(board);
  for (let k = 0; k < 2; k++) {
    if (bd.includes(s.hole[1][k])) {
      const repl = s.remaining.find((c) => !bd.includes(c));
      s.remaining.splice(s.remaining.indexOf(repl), 1, s.hole[1][k]);
      s.hole[1][k] = repl;
    }
  }
  let dealt = 0;
  const boardRng = () => (s.remaining.indexOf(bd[dealt++]) + 0.5) / s.remaining.length;
  const belief = new HandBelief([null, readFor(type)], s.hole[0]);
  let seen = 0;
  const step = (seat, action) => {
    assert.equal(s.toAct, seat);
    if (seat === 1) belief.observe(1, buildContext(s), action);
    applyAction(s, action, boardRng);
    if (s.board.length > seen) {
      seen = s.board.length;
      belief.setBoard(s.board);
    }
  };
  if (open) {
    step(0, { type: 'raise', to: open });
    step(1, { type: 'call' });
  } else {
    step(0, { type: 'call' });
    step(1, { type: 'check' });
  }
  // flop and turn checked through
  for (let street = 0; street < 2; street++) {
    step(1, { type: 'check' });
    step(0, { type: 'check' });
  }
  // river: the opponent bets
  step(1, { type: 'raise', to: riverBet });
  assert.equal(s.toAct, 0);
  assert.equal(s.board.length, 5);
  return { s, belief };
}

const nuts = () => riverSpot({ hole: 'As Ks', board: 'Qs Js Ts 2d 3c', type: 'station', riverBet: 12 });
// $30 pot, $30 bet: calling costs far more than the 3-big-blind flag threshold.
const air = () => riverSpot({ hole: '7c 2d', board: 'As Kd Qh 9s 4c', type: 'nit', open: 15, riverBet: 30 });

test('judge: folding is worth exactly zero, and options are legal and distinct', () => {
  for (const make of [nuts, air]) {
    const { s, belief } = make();
    const v = judgeDecision(s, 0, belief, null, { samples: 300, seed: 9 });
    const fold = v.options.find((o) => o.type === 'fold');
    assert.ok(fold, 'facing a bet, fold is an option');
    assert.equal(fold.ev, 0);
    const L = legal(s);
    const raises = v.options.filter((o) => o.type === 'raise');
    for (const r of raises) assert.ok(r.to >= L.minTo && r.to <= L.maxTo);
    assert.deepEqual(raises.map((r) => r.to), [...new Set(raises.map((r) => r.to))].sort((a, b) => a - b));
    assert.equal(new Set(v.options.map((o) => o.label)).size, v.options.length);
  }
});

test('judge: same spot and seed give the same verdict', () => {
  const a = air();
  const b = air();
  const v1 = judgeDecision(a.s, 0, a.belief, { type: 'call' }, { samples: 300, seed: 4 });
  const v2 = judgeDecision(b.s, 0, b.belief, { type: 'call' }, { samples: 300, seed: 4 });
  assert.deepEqual(v1.options.map((o) => o.ev), v2.options.map((o) => o.ev));
  assert.equal(v1.grade, v2.grade);
});

test('judge: the nuts facing a bet never folds, and folding them is a blunder', () => {
  const { s, belief } = nuts();
  const v = judgeDecision(s, 0, belief, { type: 'fold' }, { samples: 400, seed: 3 });
  assert.notEqual(v.options[v.best].type, 'fold');
  assert.equal(v.options[v.mine].type, 'fold');
  assert.equal(v.grade, 'blunder');
  const call = v.options.find((o) => o.type === 'call');
  assert.ok(call.ev > 0, 'calling with the nuts wins money');
});

test("judge: calling a nit's river bet with no pair is flagged; folding is fine", () => {
  const { s, belief } = air();
  const vCall = judgeDecision(s, 0, belief, { type: 'call' }, { samples: 400, seed: 3 });
  assert.equal(vCall.options[vCall.best].type, 'fold');
  assert.ok(vCall.grade === 'mistake' || vCall.grade === 'blunder', vCall.grade);
  assert.ok(Math.abs(vCall.loss - (vCall.options[vCall.best].ev - vCall.options[vCall.mine].ev)) < 1e-9);
  const vFold = judgeDecision(s, 0, belief, { type: 'fold' }, { samples: 400, seed: 3 });
  assert.equal(vFold.grade, 'good');
  assert.equal(vFold.loss, 0);
});

test("judge: the trainee's own raise size is always one of the options", () => {
  const { s, belief } = nuts();
  for (const to of [30, 47, 123, 300]) {
    const cands = candidateActions(s, { type: 'raise', to });
    const L = legal(s);
    const want = Math.max(L.minTo, Math.min(L.maxTo, to));
    assert.ok(cands.some((c) => c.type === 'raise' && c.to === want), `size ${want} missing`);
  }
  const v = judgeDecision(s, 0, belief, { type: 'raise', to: 47 }, { samples: 200, seed: 2 });
  assert.equal(v.options[v.mine].to, 47);
});
