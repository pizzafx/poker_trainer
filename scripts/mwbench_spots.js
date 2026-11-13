// STRAT's multiway benchmark spots (notes/strat/mwbench_spots.js, 12 Nov 2026) and the expectations
// from MULTIWAY_COACH_SPEC.md (FINAL), checked by scripts/mwbench.js.
// Table: 8 seats, $1/$3, typical rake (unless `rake` says otherwise), 100bb ($300) stacks unless
// `stacks` overrides a seat. Hero is always seat 0.
// Position of a seat = (seat - button) mod 8: 0 BTN, 1 SB, 2 BB, 3 UTG, 4 UTG+1, 5 LJ, 6 HJ, 7 CO.
// `seats`: opponents in the hand, seat -> type id ('pool' = unknown, read at the population prior).
// `conf`: how sure the read is per seat (default 0.85; ignored for 'pool').
// `line`: actions in order, each "<seat><action>": c call, x check, f fold, bN / rN bet or raise to $N.
//   '|' is only for readability. Seats not in `seats` (and not hero) fold automatically preflop.
// `board`: every community card that will appear, in order.
// After the last token it must be hero's turn: that is the benchmark decision.

export const SPOTS = [
  // ---------------- flop, hero in position, checked to hero ----------------
  { id: 'F01', name: 'Iso-raised pot, 3-way: top pair, 9 kicker, checked to hero on the button',
    button: 0, hole: 'Ks 9s', board: 'Kd 7c 2h', seats: { 7: 'station', 2: 'abc' },
    line: '7c 0r15 2c 7c | 2x 7x' },
  { id: 'F02', name: 'Iso-raised pot, 4-way: top pair top kicker on a two-tone board, checked to hero',
    button: 0, hole: 'Ah Qd', board: 'Qs 8s 5c', seats: { 6: 'abc', 7: 'station', 2: 'tag' },
    line: '6c 7c 0r18 2c 6c 7c | 2x 6x 7x' },
  { id: 'F03', name: 'Iso-raised pot, 4-way: overpair JJ on a low two-tone board, checked to hero',
    button: 0, hole: 'Jd Jc', board: '9h 6h 3c', seats: { 5: 'station', 7: 'station', 2: 'nit' },
    line: '5c 7c 0r18 2c 5c 7c | 2x 5x 7x' },
  { id: 'F04', name: 'Iso-raised pot, 3-way: nut flush draw, no pair, checked to hero',
    button: 0, hole: 'Ah 5h', board: 'Kh 8h 3c', seats: { 6: 'abc', 2: 'station' },
    line: '6c 0r15 2c 6c | 2x 6x' },
  { id: 'F05', name: 'Iso-raised pot, 3-way: two overcards, no draw, checked to hero',
    button: 0, hole: 'Kd Qc', board: '8s 6h 3c', seats: { 7: 'station', 2: 'abc' },
    line: '7c 0r15 2c 7c | 2x 7x' },
  { id: 'F06', name: 'Iso-raised pot, 4-way: ace high, no draw, on a wet board, checked to hero',
    button: 0, hole: 'Ac Jd', board: '9h 7h 6s', seats: { 5: 'station', 6: 'station', 2: 'abc' },
    line: '5c 6c 0r18 2c 5c 6c | 2x 5x 6x' },
  { id: 'F07', name: 'Iso-raised pot, 4-way: middle set, checked to hero',
    button: 0, hole: '7d 7c', board: 'Ks 7h 2c', seats: { 5: 'abc', 7: 'station', 2: 'whale' },
    line: '5c 7c 0r18 2c 5c 7c | 2x 5x 7x' },
  { id: 'F08', name: 'Home game, no rake: 5-way limped pot, open-ended straight draw, checked to hero on the button',
    button: 0, hole: '6s 5s', board: '7d 4c Kh', rake: 'none',
    seats: { 3: 'beginner', 5: 'whale', 7: 'beginner', 1: 'station', 2: 'beginner' },
    line: '3c 5c 7c 0c 1c 2x | 1x 2x 3x 5x 7x' },

  // ---------------- flop, hero out of position ----------------
  { id: 'F09', name: 'Big blind, limped 4-way pot: top pair good kicker, hero first to act',
    button: 6, hole: 'Kc Tc', board: 'Td 6s 2h', seats: { 1: 'abc', 4: 'station', 6: 'whale' },
    line: '1c 4c 6c 0x' },
  { id: 'F10', name: 'Big blind, limped 4-way: top pair J kicker; hero checks, station bets half pot, abc calls, BTN folds',
    button: 6, hole: 'Qh Jd', board: 'Qs 9c 4d', seats: { 1: 'station', 4: 'abc', 6: 'nit' },
    line: '1c 4c 6c 0x | 0x 1b6 4c 6f' },
  { id: 'F11', name: 'Small blind, limped 4-way: flush draw; checks, BB checks, station bets 2/3, abc calls',
    button: 7, hole: 'Jh 9h', board: 'Kh 6h 2c', seats: { 1: 'tag', 2: 'station', 6: 'abc' },
    line: '2c 6c 0c 1x | 0x 1x 2b8 6c' },
  { id: 'F12', name: 'Cold-called a nit UTG open with 99 in the CO, BTN and BB call; flop under a ten; nit bets half pot',
    button: 1, hole: '9d 9c', board: 'Ts 5h 2c', seats: { 4: 'nit', 1: 'abc', 3: 'station' },
    line: '4r15 0c 1c 3c | 3x 4b30' },
  { id: 'F13', name: 'Raised UTG with AK, four callers: top pair top kicker on a two-tone board, BB checks to hero',
    button: 5, hole: 'As Kd', board: 'Ah Jh 7c', seats: { 3: 'abc', 4: 'whale', 5: 'station', 7: 'tag' },
    line: '0r15 3c 4c 5c 7c | 7x' },
  { id: 'F14', name: 'Raised UTG with KQs, three callers: missed, BB checks to hero',
    button: 5, hole: 'Ks Qs', board: '9d 8c 4h', seats: { 4: 'station', 5: 'abc', 7: 'tag' },
    line: '0r15 4c 5c 7c | 7x' },
  { id: 'F15', name: 'Big blind with 98s vs a regular CO open and a station BTN call: bottom two; hero checks, CO c-bets, BTN calls',
    button: 6, hole: '9s 8s', board: '9d 8c 3h', seats: { 5: 'tag', 6: 'station' },
    line: '5r12 6c 0c | 0x 5b20 6c' },

  // ---------------- turn ----------------
  { id: 'T01', name: 'The A6s spot: limped pot; regular in the BB led the flop pot-sized and checks the turn, station checks; hero on the button',
    button: 0, hole: 'As 6s', board: '2h Tc Ah 8d', seats: { 5: 'pool', 6: 'station', 2: 'tag' }, conf: { 6: 0.66, 2: 0.56 },
    stacks: { 0: 500 }, line: '5c 6c 0c 2x | 2b14 5f 6c 0c | 2x 6x' },
  { id: 'T02', name: 'Iso-raised pot, flop c-bet called by two: top pair top kicker, blank turn checked to hero',
    button: 0, hole: 'Ad Kc', board: 'Ks 9h 4c 2d', seats: { 7: 'station', 2: 'abc' },
    line: '7c 0r15 2c 7c | 2x 7x 0b25 2c 7c | 2x 7x' },
  { id: 'T03', name: 'Iso-raised pot, flop c-bet called by two: open-ended straight draw, blank turn checked to hero',
    button: 0, hole: 'Qs Js', board: 'Th 9c 3d 2s', seats: { 7: 'station', 2: 'abc' },
    line: '7c 0r15 2c 7c | 2x 7x 0b25 2c 7c | 2x 7x' },
  { id: 'T04', name: 'Big blind, limped 4-way, flop checked through: top two pair on the turn, hero first to act',
    button: 6, hole: 'Ad 8d', board: 'As 8h 4c Jd', seats: { 1: 'abc', 4: 'station', 6: 'whale' },
    line: '1c 4c 6c 0x | 0x 1x 4x 6x' },
  { id: 'T05', name: 'Iso-raised pot, flop c-bet called by two: overpair QQ; station in the BB leads the turn half pot, abc calls',
    button: 0, hole: 'Qd Qh', board: '8s 5d 2c Jc', seats: { 7: 'abc', 2: 'station' },
    line: '7c 0r15 2c 7c | 2x 7x 0b25 2c 7c | 2b45 7c' },

  // ---------------- river ----------------
  { id: 'R01', name: 'Iso-raised pot: flop c-bet called by two, turn checked through; river checked to hero with top pair Q kicker',
    button: 0, hole: 'Kd Qs', board: 'Kh 8c 5d 3s 2h', seats: { 7: 'station', 2: 'abc' },
    line: '7c 0r15 2c 7c | 2x 7x 0b25 2c 7c | 2x 7x 0x | 2x 7x' },
  { id: 'R02', name: 'Same line: missed flush draw (jack high), river checked to hero',
    button: 0, hole: 'Jh Th', board: 'Ah 9h 4c 2s 6d', seats: { 7: 'station', 2: 'abc' },
    line: '7c 0r15 2c 7c | 2x 7x 0b25 2c 7c | 2x 7x 0x | 2x 7x' },
  { id: 'R03', name: 'Same line: station leads the river, abc calls; hero last with top pair good kicker',
    button: 0, hole: 'Ac Qd', board: 'Qh 7c 3s 9d 2c', seats: { 7: 'abc', 2: 'station' },
    line: '7c 0r15 2c 7c | 2x 7x 0b25 2c 7c | 2x 7x 0x | 2b40 7c' },
  { id: 'R04', name: 'Hero opened CO with KK, BTN gambler and BB station called; bet flop and turn, both called; scare river checked to hero',
    button: 1, hole: 'Kc Kh', board: '9s 6c 2d Jh Qs', seats: { 1: 'whale', 3: 'station' },
    line: '0r12 1c 3c | 3x 0b25 1c 3c | 3x 0b70 1c 3c | 3x' },
  { id: 'R05', name: 'Limped 4-way pot checked to the river: second pair, ace kicker, hero last to act',
    button: 0, hole: 'Ah Td', board: 'Kc Tc 6h 3d 2s', seats: { 5: 'abc', 7: 'station', 2: 'nit' },
    line: '5c 7c 0c 2x | 2x 5x 7x 0x | 2x 5x 7x 0x | 2x 5x 7x' },

  // ---------------- facing aggression ----------------
  { id: 'X01', name: 'Iso-raised pot, 3-way: AA c-bets, abc in the BB check-raises, station calls the raise',
    button: 0, hole: 'As Ad', board: '8h 7h 5c', seats: { 7: 'station', 2: 'abc' },
    line: '7c 0r15 2c 7c | 2x 7x 0b30 2r90 7c' },
];
export const EXPECT = {
  F01: { accept: ['check', 'bet:0.3-0.8'] },                 // R1 (3-way, K9 not goodTP)
  F02: { accept: ['bet:0.45-1.05'], flag: ['check'] },       // 4-way check → R1 makes it a note: see note †
  F03: { accept: ['bet:0.45-1.05'], flag: ['check'] },       // †
  F04: { accept: ['check', 'bet:0.3-0.6'] },                 // R4
  F05: { accept: ['check', 'bet:0.3-0.4'] },
  F06: { accept: ['check'] },
  F07: { accept: ['bet:0.6-1.6'], flag: ['check'] },          // set: not onePair, R1 does not apply
  F08: { accept: ['check', 'bet:0.3-0.5'], softFlag: ['bet:1.0-1.6'] }, // R4, R7
  F09: { accept: ['check', 'bet:0.45-0.8'] },                // R8 tiny pot
  F10: { accept: ['call'], softFlag: ['raise'], noGrade: true },
  F11: { accept: ['call', 'raise'], flag: ['fold'], note: { raise: 'mwHabit' }, neverBest: ['raise'] }, // owner: R7 note, never flagged; fold flagged (draw above the price)
  F12: { accept: ['fold', 'call'], noGrade: true },
  F13: { accept: ['bet:0.45-1.05'], flag: ['check'] },       // †
  F14: { accept: ['check'] },
  F15: { accept: ['raise:2.5-5.5'], flag: ['call'], maxGrade: { call: 'mistake' } }, // owner: call is yellow
  T01: { accept: ['check', 'bet:0.3-0.6'] },                 // R1, R3
  T02: { accept: ['bet:0.6-1.05'], flag: ['check'] },        // 3-way goodTP IP pfr: R1 exception
  T03: { accept: ['check', 'bet'], note: { bet: 'mwHabit' }, neverBest: ['bet'], noGrade: true }, // owner: R7 note, never flagged; MATH: do not grade
  T04: { accept: ['bet:0.6-1.05'], flag: ['check'] },        // two pair: R1 does not apply; R8? pot 4.3bb → see ‡
  T05: { accept: ['call', 'fold', 'raise'], note: { raise: 'mwHabit' }, neverBest: ['raise'] }, // owner: R7 note, never flagged; R5b
  R01: { accept: ['bet:0.3-0.8'], flag: ['check'], maxGrade: { check: 'mistake' }, quote: 'bet:0.74' }, // owner: check yellow; R3 quotes $90, $60 good
  R02: { accept: ['check'] },
  // CEO, 13 Nov 2026 (QA M1): R7 waives only plays within the yellow bar of the best other option. The
  // $100 raise (+$3 over the call) keeps the note; the shove ($64 below the call) is graded, red.
  R03: { accept: ['call', 'fold', 'raise:2-3'], note: { 'raise:2-3': 'mwHabit' }, neverBest: ['raise'], flag: ['raise:6-7'] }, // R5b, R7
  R04: { accept: ['bet:0.3-0.4'], softFlag: ['check'] },     // river cap: never red
  R05: { accept: ['check', 'bet:0.3-0.8'], noGrade: true },  // R8; v2 do-not-grade
  // The raises are $62-65 below folding, so no "not a habit" waiver (QA M1); the scenario test leaves
  // them ungraded, as MATH's do-not-grade list says.
  X01: { accept: ['fold', 'call'], neverBest: ['raise'], noGrade: true }, // R6 required
};
