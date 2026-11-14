// Player profiles: the numbers that make each opponent type play the way it does.
// Position arrays are [early, middle, late, small blind, big blind].
// Street arrays are [flop, turn, river]. Size weights line up with BET_FRACS in policy.js
// (33%, 50%, 75%, 100%, 150% of the pot).
//
// Only the preflop numbers have tracked live data behind them (see reports/). Every postflop
// number is a modelling assumption in the direction coaches agree on, tuned with
// scripts/calibrate.js, scripts/spots.js and scripts/selfplay.js.

import { EQ_HEADS_UP, EQ_FOUR_WAY } from '../data/preflop.js';
import { classInfo, CLASS_COUNT } from '../engine/hands.js';

const BASE = {
  // --- preflop ---
  vpip: [0.2, 0.22, 0.28, 0.25, 0.3], // share of hands that enter an unraised pot
  pfr: [0.06, 0.07, 0.1, 0.05, 0.03], // share that raise when no one has raised
  isoFactor: 0.7, // raise width multiplier once there are limpers
  openLimp: 0.8, // of playable-but-not-raising hands, share that limp first in
  overLimp: 0.95, // same, behind other limpers
  openSize: 5, // raise size in big blinds
  perLimper: 1,
  sizeTell: 0.4, // 0 = same size with everything, 1 = premium hands always raise bigger
  limpTrap: 0.05, // chance of limping aces/kings
  callRaise: 0.12, // share of hands that call a normal-sized single raise
  callElastic: 0.5, // how fast that shrinks as the raise gets bigger
  callCrowd: 0.12, // extra width per caller already in
  limpCall: 1.3, // width multiplier after limping
  threeBet: 0.015, // value 3-bet width
  threeBetBluff: 0, // chance of 3-betting hands just below the value range
  callThreeBet: 0.05,
  // 3-bet continue (POOL, owner-approved 13 Nov 2026): the opener continues this share of its own
  // opening range [early/middle, late]; null keeps the old callThreeBet rule. On hold (CEO, Nov 2026):
  // POOL is re-deriving the values after a fix to how opponents rank premium hands facing a 3-bet.
  tbCont: null,
  tbSize: 0, // less per x of 3-bet size above 3x
  tbOOP: 0, // less out of position against the 3-bettor
  tbSqueeze: 0, // less per caller squeezed
  fourBet: 0.008,
  fourBetBluff: 0,
  stackOff: 0.012, // share of hands willing to get all-in preflop at 100 big blinds
  // preflop taste: bonuses when ranking hands worth playing
  aceLove: 0,
  suitedLove: 0,
  paintLove: 0,
  // --- postflop, no bet to face ---
  cbet: [0.55, 0.3, 0.15], // bluff c-bet frequency: heads-up, 3-way, 4-way+
  barrel: [0.25, 0.1], // keep bluffing the turn / river after betting the street before
  stab: [0.25, 0.2, 0.08], // bluff when checked to without the betting lead
  valueBet: [0.55, 0.6, 0.66], // minimum strength to bet for value
  semiBluff: 0.3, // bet frequency with a real draw
  slowplay: 0.3, // chance to check or just call with a very strong hand
  donk: 0.35, // chance a value hand leads into the previous street's aggressor
  mwTighten: 0.03, // extra strength needed per additional opponent
  mwBluffCut: 0.45, // bluff frequency cut per additional opponent
  // --- postflop, facing a bet ---
  callThr: [0.34, 0.44, 0.5], // minimum strength to call a half-pot bet
  sizeSens: 0.6, // how much bigger bets raise that bar
  sizeCap: 0.09, // ...up to this much: big bets do not make people fold everything
  chase: 0.8, // draws call when equity >= pot odds x chase (below 1 = chasing)
  overFold: 0.05, // how fast that floor rises for bets bigger than the pot (per doubling)
  neverFold: 0.56, // strength that calls any bet (not raise) regardless of size
  absFrom: 15, // ...starting from a call of this many big blinds
  absSens: 0.07, // extra strength needed each time the price of a call doubles beyond 15 big blinds
  textureBlind: 0.4, // 0 = discounts hands fully on scary boards when calling, 1 = ignores the board
  float: 0.06, // flop call in position with nothing
  raiseValue: [0.8, 0.82, 0.88], // minimum strength to raise
  raiseBluff: [0.03, 0.02, 0.004], // chance to raise as a bluff
  // --- multiway (POOL, Nov 2026; defaults keep the old behaviour) ---
  mwSteps: null, // taper of the multiway call penalty: the k-th extra player behind or caller in adds mwSteps[min(k, len-1)]
  mwCap: 1, // cap on the mwSteps sum
  mwBehind: 0, // linear per-player penalties for types with no taper (station, whale, maniac): per player still to act behind
  mwCaller: 0, // ...and per caller already in
  mwCallTighten: 0.5, // share of mwTighten applied to calls
  mwRiverCaller: 0, // extra river penalty per caller already in (superseded by mwOvercall; 0 everywhere)
  // Overcall (POOL, owner-approved 13 Nov 2026): facing a bet AND a call, two ranges have
  // shown strength, so one pair folds more. Added to the call threshold per caller already in, by
  // street [flop, turn, river], outside penaltyCap and floorCap, and it lifts the never-fold floor.
  mwOvercall: [0, 0, 0],
  ocSize: 0, // the overcall term scales with (bet/pot / 0.5) ^ ocSize; the station only
  mwRaiseCut: null, // multiway cut on bluff-raises (null: mwBluffCut)
  mwTrap3: null, // out-of-position multiway trap rates with strong hands: [raiser behind, I am the raiser, other]
  mwPassiveValue: 0, // value-threshold increase per extra opponent for turn and river bets
  leadIntoRaiser: 0, // value-threshold increase for any lead into the previous street's aggressor
  // Passivity, Revision D (POOL, owner-approved 13 Nov 2026): value betting when checked to.
  m7CheckedTo: 1, // share of M7a (mwPassiveValue) kept when checked to
  mwTightenCheckedTo: null, // mwTighten when checked to (null: the usual mwTighten)
  checkedToShift: [0, 0, 0], // value-threshold shift when checked to [flop, turn, river]
  leadIntoRaiserFlop: null, // the flop's lead-into-the-preflop-raiser term (null: leadIntoRaiser)
  ledRaiseRespect: 0, // call-threshold increase when raised after leading this street
  leadBluffMult: 1, // multiplier on bluff-leads into the aggressor
  penaltyCap: 0.14, // cap on (money term + multiway terms) in the call threshold (MATH safeguard 1)
  floorCap: 0.08, // cap on (overFold term + multiway floor term) in the never-fold floor (safeguard 1)
  anyTwo: 0, // A7: share of out-of-range hands that still limp or call one raise ('any two cards')
  jamBluffMult: 0.25, // R1: bluff-raises that would be all-in or 40%+ of the stack are this much as likely
  raiseRespect: [0.12, 0.17, 0.24], // extra strength needed to continue against a raise
  minRaise: 0.2, // share of raises that are small "click-backs"
  // --- bet sizing ---
  sizeValue: [0.05, 0.25, 0.4, 0.25, 0.05],
  sizeThin: [0.2, 0.45, 0.3, 0.05, 0],
  sizeBluff: [0.2, 0.45, 0.3, 0.05, 0],
  exploit: false,
};

const DEFS = {
  nit: {
    mwOvercall: [0, 0.06, 0.07], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Tight-passive nit',
    blurb: 'Waits for big hands. Limps a lot, rarely raises, and when the money goes in he has it.',
    share: 0.13,
    vpip: [0.15, 0.16, 0.18, 0.17, 0.22], // POOL A2, Nov 2026: was [0.12, 0.14, 0.17, 0.15, 0.2]
    pfr: [0.054, 0.063, 0.081, 0.036, 0.036],
    isoFactor: 0.6,
    openLimp: 0.9,
    openSize: 5.5,
    sizeTell: 0.8,
    limpTrap: 0.25,
    callRaise: 0.07,
    callElastic: 0.5, // POOL A5, Nov 2026: was 0.7
    limpCall: 1.1,
    threeBet: 0.011,
    callThreeBet: 0.03,
    fourBet: 0.006,
    stackOff: 0.009,
    paintLove: 0.5,
    textureBlind: 0.2,
    absSens: 0.09, // POOL amendment 1, Nov 2026: P1v2 had 0.12 (nits folded top pair to small third bets)
    absFrom: 20, // POOL amendment 1, Nov 2026: was 15 (the base)
    neverFold: 0.66, // POOL P1v2, Nov 2026: was 0.6
    cbet: [0.45, 0.22, 0.1],
    barrel: [0.14, 0.04],
    stab: [0.14, 0.1, 0.04],
    valueBet: [0.58, 0.62, 0.7],
    semiBluff: 0.12,
    slowplay: 0.4,
    donk: 0.3,
    mwTighten: 0.04,
    mwBluffCut: 0.55,
    callThr: [0.42, 0.52, 0.57],
    sizeSens: 0.7,
    sizeCap: 0.07,
    chase: 0.95,
    float: 0.02,
    raiseValue: [0.8, 0.83, 0.87],
    raiseBluff: [0.012, 0.006, 0.001],
    raiseRespect: [0.15, 0.14, 0.25],
    minRaise: 0.3,
    sizeValue: [0, 0.15, 0.45, 0.35, 0.05],
    sizeThin: [0.25, 0.5, 0.25, 0, 0],
    sizeBluff: [0.35, 0.45, 0.2, 0, 0],
    overFold: 0.05, // POOL P1v2, Nov 2026: was 0.03
    mwSteps: [0.05, 0.03, 0.02], // POOL M, Nov 2026 (was the shared default)
    mwCap: 0.1, // POOL M, Nov 2026 (was the shared default)
    mwCallTighten: 0.25, // POOL M, Nov 2026 (was the shared default)
    mwRaiseCut: 0.85, // POOL M, Nov 2026 (was the shared default)
    mwTrap3: [0.6, 0.1, 0.25], // POOL M, Nov 2026 (was the shared default)
  },
  abc: {
    m7CheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwTightenCheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    checkedToShift: [0,  -0.06,  -0.12], // POOL passivity, Revision D (13 Nov 2026)
    leadIntoRaiserFlop: -0.04, // POOL passivity, Revision D (13 Nov 2026)
    mwOvercall: [0, 0.05, 0.09], // POOL overcall, owner-approved 13 Nov 2026 (river .07 -> .09, POOL correction)
    name: 'Straightforward recreational',
    blurb: 'Plays his cards face up: bets when he hits, gives up when he misses, limps along a lot.',
    share: 0.375, // MATH's S (CEO for the owner, Nov 2026): six points from station; POOL Nov 2026 was 0.315
    vpip: [0.41, 0.42, 0.44, 0.43, 0.48], // POOL A2, Nov 2026: was [0.26, 0.29, 0.34, 0.32, 0.38]
    pfr: [0.08, 0.096, 0.144, 0.064, 0.048],
    openLimp: 0.85,
    sizeTell: 0.55,
    callRaise: 0.2,
    callElastic: 0.3, // POOL A5, Nov 2026: was 0.45
    limpCall: 1.25, // POOL A2, Nov 2026: was 0.9
    threeBet: 0.013,
    callThreeBet: 0.05,
    stackOff: 0.012,
    aceLove: 0.3,
    textureBlind: 0.5,
    cbet: [0.55, 0.3, 0.14],
    barrel: [0.2, 0.07],
    stab: [0.22, 0.16, 0.07],
    valueBet: [0.55, 0.6, 0.67],
    semiBluff: 0.22,
    slowplay: 0.3,
    callThr: [0.34, 0.42, 0.38],
    sizeSens: 0.6,
    chase: 0.7,
    raiseValue: [0.8, 0.82, 0.86],
    raiseBluff: [0.02, 0.012, 0.002],
    raiseRespect: [0.12, 0.17, 0.23],
    minRaise: 0.3,
    absSens: 0.08,
    neverFold: 0.62, // POOL P1v2, Nov 2026 (was the shared default)
    mwSteps: [0.02, 0.01], // POOL M, Nov 2026 (was the shared default)
    mwCap: 0.04, // POOL M, Nov 2026 (was the shared default)
    mwTrap3: [0.3, 0.05, 0.12], // POOL M, Nov 2026 (was the shared default)
    mwPassiveValue: 0.08, // POOL M, Nov 2026 (was the shared default)
    leadIntoRaiser: 0.08, // POOL M, Nov 2026 (was the shared default)
    ledRaiseRespect: 0.15, // POOL M, Nov 2026 (was the shared default)
    leadBluffMult: 0.25, // POOL M, Nov 2026 (was the shared default)
  },
  station: {
    m7CheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwTightenCheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    checkedToShift: [0,  -0.04,  -0.04], // POOL passivity, Revision D (13 Nov 2026)
    leadIntoRaiserFlop: -0.04, // POOL passivity, Revision D (13 Nov 2026)
    mwOvercall: [0, 0.03, 0.13], // POOL overcall, owner-approved 13 Nov 2026
    ocSize: 0.25, // POOL overcall: a pot-sized overcall hits harder than a half-pot one
    name: 'Loose-passive calling station',
    blurb: 'Sees a lot of flops and hates folding a pair or a draw. Rarely raises without a big hand.',
    share: 0.16, // MATH's S (CEO for the owner, Nov 2026): six points to abc; POOL Nov 2026 was 0.22
    vpip: [0.66, 0.67, 0.69, 0.68, 0.72], // POOL A2, Nov 2026: was [0.5, 0.53, 0.58, 0.55, 0.62]
    pfr: [0.035, 0.04, 0.055, 0.03, 0.025],
    isoFactor: 0.6,
    openLimp: 1,
    overLimp: 1,
    sizeTell: 0.6,
    limpTrap: 0.15,
    callRaise: 0.31, // POOL A6, Nov 2026: was 0.34
    callElastic: 0.1, // POOL A5, Nov 2026: was 0.25
    callCrowd: 0.15,
    limpCall: 1.15, // POOL A2, Nov 2026: was 0.9
    threeBet: 0.011,
    callThreeBet: 0.09,
    fourBet: 0.006,
    stackOff: 0.016,
    aceLove: 0.7,
    suitedLove: 0.7,
    paintLove: 0.4,
    textureBlind: 0.8,
    absSens: 0.055,
    neverFold: 0.6, // POOL P1v2, Nov 2026: was 0.55
    cbet: [0.4, 0.25, 0.14],
    barrel: [0.2, 0.08],
    stab: [0.2, 0.15, 0.08],
    valueBet: [0.55, 0.6, 0.58],
    semiBluff: 0.12,
    slowplay: 0.45,
    donk: 0.45,
    mwTighten: 0.02,
    callThr: [0.24, 0.3, 0.28], // POOL P1v2 + amendment 1, Nov 2026: was [0.22, 0.26, 0.26]
    sizeSens: 0.35,
    sizeCap: 0.09, // POOL P1v2, Nov 2026: was 0.07
    chase: 0.6,
    float: 0.15,
    raiseValue: [0.82, 0.84, 0.87],
    raiseBluff: [0.012, 0.008, 0.0015],
    raiseRespect: [0.08, 0.12, 0.24],
    minRaise: 0.45,
    sizeValue: [0.1, 0.3, 0.35, 0.2, 0.05],
    sizeThin: [0.4, 0.4, 0.2, 0, 0],
    sizeBluff: [0.4, 0.4, 0.2, 0, 0],
    absFrom: 30, // POOL P1v2, Nov 2026: was 40
    overFold: 0.06, // POOL P1v2, Nov 2026: was 0.04
    anyTwo: 0.05, // POOL A7, Nov 2026 (was the shared default)
    mwBehind: 0.01, // POOL M, Nov 2026 (was the shared default)
    mwCaller: 0.01, // POOL M, Nov 2026 (was the shared default)
    mwPassiveValue: 0.08, // POOL M, Nov 2026 (was the shared default)
    leadIntoRaiser: 0.08, // POOL M, Nov 2026 (was the shared default)
    ledRaiseRespect: 0.15, // POOL M, Nov 2026 (was the shared default)
    leadBluffMult: 0.25, // POOL M, Nov 2026 (was the shared default)
  },
  whale: {
    m7CheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwTightenCheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    checkedToShift: [0,  -0.06,  -0.12], // POOL passivity, Revision D (13 Nov 2026)
    leadIntoRaiserFlop: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwOvercall: [0, 0.02, 0.13], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Gambler',
    blurb: 'Here to play pots. Any two cards, calls far too much, and fires off the odd wild bluff.',
    share: 0.06,
    vpip: [0.62, 0.66, 0.72, 0.7, 0.75],
    pfr: [0.07, 0.08, 0.1, 0.06, 0.05],
    isoFactor: 0.9,
    openLimp: 1,
    overLimp: 1,
    openSize: 5,
    sizeTell: 0.3,
    callRaise: 0.48,
    callElastic: 0.05, // POOL A5, Nov 2026: was 0.15
    callCrowd: 0.15,
    limpCall: 0.95,
    threeBet: 0.014,
    threeBetBluff: 0.05,
    callThreeBet: 0.16,
    fourBet: 0.008,
    stackOff: 0.03,
    aceLove: 0.8,
    suitedLove: 1,
    paintLove: 0.6,
    textureBlind: 0.9,
    absSens: 0.06,
    neverFold: 0.54, // POOL P1v2, Nov 2026: was 0.5
    cbet: [0.5, 0.35, 0.25],
    barrel: [0.3, 0.18],
    stab: [0.32, 0.26, 0.18],
    valueBet: [0.5, 0.55, 0.62],
    semiBluff: 0.3,
    slowplay: 0.25,
    donk: 0.6,
    mwTighten: 0.01,
    mwBluffCut: 0.3,
    callThr: [0.15, 0.2, 0.24],
    sizeSens: 0.25,
    sizeCap: 0.1,
    chase: 0.5,
    float: 0.3,
    raiseValue: [0.76, 0.8, 0.86],
    raiseBluff: [0.04, 0.03, 0.02],
    raiseRespect: [0.05, 0.08, 0.12],
    minRaise: 0.45,
    sizeValue: [0.1, 0.25, 0.3, 0.25, 0.1],
    sizeThin: [0.35, 0.35, 0.2, 0.1, 0],
    sizeBluff: [0.2, 0.3, 0.25, 0.15, 0.1],
    absFrom: 25, // POOL P1v2, Nov 2026: was 30
    overFold: 0.04,
    anyTwo: 0.25, // POOL A7, Nov 2026 (was the shared default)
    mwBehind: 0.005, // POOL M, Nov 2026 (was the shared default)
    mwCaller: 0.005, // POOL M, Nov 2026 (was the shared default)
    mwPassiveValue: 0.05, // POOL M, Nov 2026 (was the shared default)
    leadIntoRaiser: 0.06, // POOL M, Nov 2026 (was the shared default)
    ledRaiseRespect: 0.1, // POOL M, Nov 2026 (was the shared default)
    leadBluffMult: 0.5, // POOL M, Nov 2026 (was the shared default)
  },
  maniac: {
    mwOvercall: [0, 0.07, 0.15], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Loose-aggressive maniac',
    blurb: 'Raises and barrels constantly with a huge range. Big bets mean much less from him.',
    share: 0.035,
    vpip: [0.42, 0.48, 0.58, 0.5, 0.6],
    pfr: [0.3, 0.35, 0.475, 0.35, 0.275],
    isoFactor: 1.1,
    openLimp: 0.3,
    overLimp: 0.5,
    openSize: 6,
    perLimper: 1.5,
    sizeTell: 0,
    limpTrap: 0,
    callRaise: 0.45,
    callElastic: 0.25,
    limpCall: 1.2,
    threeBet: 0.045,
    threeBetBluff: 0.35,
    callThreeBet: 0.2,
    fourBet: 0.025,
    fourBetBluff: 0.12,
    stackOff: 0.1,
    suitedLove: 0.6,
    paintLove: 0.5,
    absSens: 0.06,
    neverFold: 0.5,
    cbet: [0.85, 0.7, 0.5],
    barrel: [0.6, 0.45],
    stab: [0.6, 0.5, 0.4],
    valueBet: [0.42, 0.46, 0.5],
    semiBluff: 0.8,
    slowplay: 0.05,
    donk: 0.7,
    mwTighten: 0.015,
    mwBluffCut: 0.2,
    callThr: [0.24, 0.32, 0.3],
    sizeSens: 0.5,
    chase: 0.5,
    float: 0.35,
    raiseValue: [0.6, 0.66, 0.72],
    raiseBluff: [0.2, 0.15, 0.08],
    raiseRespect: [0.05, 0.08, 0.1],
    minRaise: 0.05,
    sizeValue: [0.05, 0.15, 0.3, 0.3, 0.2],
    sizeThin: [0.05, 0.2, 0.35, 0.25, 0.15],
    sizeBluff: [0.05, 0.15, 0.3, 0.3, 0.2],
    overFold: 0.06,
    jamBluffMult: 0.6, // POOL R1, Nov 2026 (was the shared default)
    anyTwo: 0.1, // POOL A7, Nov 2026 (was the shared default)
    mwBehind: 0.015, // POOL M, Nov 2026 (was the shared default)
    mwCaller: 0.01, // POOL M, Nov 2026 (was the shared default)
  },
  gto: {
    mwOvercall: [0, 0.28, 0.25], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Solver-style player',
    blurb: 'Small opens, small range-bets, balanced bluffs and bluff-catches by the chart, whoever he is up against.',
    share: 0.04,
    vpip: [0.17, 0.22, 0.39, 0.34, 0.44],
    pfr: [0.17, 0.22, 0.39, 0.29, 0.1],
    isoFactor: 0.8, // POOL A3, Nov 2026: was 0.9
    openLimp: 0,
    overLimp: 0.1,
    openSize: 4,
    perLimper: 1,
    sizeTell: 0,
    limpTrap: 0,
    callRaise: 0.16,
    callElastic: 0.6,
    callCrowd: 0.08,
    threeBet: 0.035,
    threeBetBluff: 0.5,
    callThreeBet: 0.2,
    fourBet: 0.018,
    fourBetBluff: 0.3,
    stackOff: 0.032,
    textureBlind: 0.1,
    absSens: 0.05,
    neverFold: 0.58,
    cbet: [0.78, 0.5, 0.28],
    barrel: [0.55, 0.25],
    stab: [0.45, 0.4, 0.35],
    valueBet: [0.5, 0.54, 0.6],
    semiBluff: 0.7,
    slowplay: 0.15,
    donk: 0.05,
    mwBluffCut: 0.35,
    callThr: [0.3, 0.38, 0.44],
    sizeSens: 0.3,
    sizeCap: 0.05,
    chase: 0.95,
    float: 0.2,
    raiseValue: [0.75, 0.78, 0.82],
    raiseBluff: [0.12, 0.1, 0.08],
    raiseRespect: [0.05, 0.07, 0.08],
    minRaise: 0.1,
    sizeValue: [0.45, 0.1, 0.3, 0.05, 0.1],
    sizeThin: [0.45, 0.1, 0.3, 0.05, 0.1],
    sizeBluff: [0.45, 0.1, 0.3, 0.05, 0.1],
    mwSteps: [0.04, 0.03, 0.02], // POOL M, Nov 2026 (was the shared default)
    mwCap: 0.09, // POOL M, Nov 2026 (was the shared default)
    mwCallTighten: 0.25, // POOL M, Nov 2026 (was the shared default)
    mwRaiseCut: 0.6, // POOL M, Nov 2026 (was the shared default)
    mwTrap3: [0.4, 0.1, 0.2], // POOL M, Nov 2026 (was the shared default)
  },
  tag: {
    mwOvercall: [0, 0.07, 0.1], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Solid regular',
    blurb: 'Tight-aggressive grinder. Raises his good hands, isolates limpers, folds when a passive player wakes up.',
    share: 0.15,
    vpip: [0.15, 0.2, 0.34, 0.22, 0.3],
    pfr: [0.13, 0.18, 0.3, 0.15, 0.1],
    isoFactor: 0.8, // POOL A3, Nov 2026: was 1.0
    openLimp: 0.02,
    overLimp: 0.4,
    openSize: 5,
    sizeTell: 0.1,
    limpTrap: 0,
    callRaise: 0.13,
    callElastic: 0.8,
    threeBet: 0.022, // POOL A4, Nov 2026: was 0.03
    threeBetBluff: 0.05, // POOL A4, Nov 2026: was 0.12
    callThreeBet: 0.14,
    fourBet: 0.012,
    fourBetBluff: 0.03,
    stackOff: 0.02,
    textureBlind: 0.15,
    neverFold: 0.66, // POOL P1v2, Nov 2026: was 0.62
    cbet: [0.65, 0.35, 0.15],
    barrel: [0.4, 0.2],
    stab: [0.45, 0.35, 0.2],
    valueBet: [0.5, 0.55, 0.6],
    semiBluff: 0.55,
    slowplay: 0.15,
    donk: 0.15,
    callThr: [0.36, 0.46, 0.47],
    sizeSens: 0.8,
    sizeCap: 0.12,
    chase: 0.95,
    float: 0.12,
    raiseValue: [0.78, 0.8, 0.86],
    raiseBluff: [0.06, 0.035, 0.002], // POOL R2, Nov 2026: was [0.06, 0.035, 0.007]
    raiseRespect: [0.08, 0.12, 0.18],
    minRaise: 0.05,
    sizeValue: [0.05, 0.2, 0.45, 0.22, 0.08],
    sizeThin: [0.15, 0.4, 0.4, 0.05, 0],
    sizeBluff: [0.15, 0.4, 0.4, 0.05, 0], // POOL M, Nov 2026: was [0.1, 0.3, 0.4, 0.15, 0.05]
    mwTighten: 0.05, // POOL M, Nov 2026 (was the shared default)
    mwBluffCut: 0.7, // POOL M, Nov 2026 (was the shared default)
    mwSteps: [0.05, 0.03, 0.02], // POOL M, Nov 2026 (was the shared default)
    mwCap: 0.1, // POOL M, Nov 2026 (was the shared default)
    mwCallTighten: 0.25, // POOL M, Nov 2026 (was the shared default)
    mwRaiseCut: 0.85, // POOL M, Nov 2026 (was the shared default)
    mwTrap3: [0.6, 0.1, 0.25], // POOL M, Nov 2026 (was the shared default)
  },
  lag: {
    mwOvercall: [0, 0.1, 0.1], // POOL overcall, owner-approved 13 Nov 2026 (river .09 -> .10, POOL correction)
    name: 'Tricky aggressive regular',
    blurb: 'Plays many hands in position and applies pressure, but picks his spots better than the maniac.',
    share: 0.04,
    vpip: [0.24, 0.3, 0.48, 0.3, 0.38],
    pfr: [0.19, 0.25, 0.4, 0.22, 0.15],
    isoFactor: 0.9, // POOL A3, Nov 2026: was 1.15
    openLimp: 0.02,
    overLimp: 0.3,
    openSize: 5,
    sizeTell: 0,
    limpTrap: 0,
    callRaise: 0.14,
    callElastic: 0.6,
    threeBet: 0.04,
    threeBetBluff: 0.15, // POOL A4, Nov 2026: was 0.3
    callThreeBet: 0.2, // POOL A8, Nov 2026: was 0.16
    fourBet: 0.016,
    fourBetBluff: 0.12,
    stackOff: 0.03,
    textureBlind: 0.15,
    neverFold: 0.6,
    cbet: [0.72, 0.42, 0.2],
    barrel: [0.5, 0.33],
    stab: [0.55, 0.45, 0.3],
    valueBet: [0.48, 0.52, 0.56],
    semiBluff: 0.7,
    slowplay: 0.1,
    donk: 0.15,
    callThr: [0.32, 0.4, 0.46],
    sizeSens: 0.8,
    chase: 0.9,
    float: 0.25,
    raiseValue: [0.74, 0.77, 0.82],
    raiseBluff: [0.11, 0.08, 0.01], // POOL R2, Nov 2026: was [0.11, 0.08, 0.025]
    raiseRespect: [0.06, 0.09, 0.13],
    minRaise: 0.05,
    sizeValue: [0.05, 0.15, 0.4, 0.25, 0.15],
    sizeThin: [0.1, 0.35, 0.4, 0.1, 0.05],
    sizeBluff: [0.1, 0.35, 0.4, 0.1, 0.05], // POOL M, Nov 2026: was [0.05, 0.2, 0.4, 0.2, 0.15]
    mwTighten: 0.04, // POOL M, Nov 2026 (was the shared default)
    mwBluffCut: 0.6, // POOL M, Nov 2026 (was the shared default)
    mwSteps: [0.04, 0.03, 0.02], // POOL M, Nov 2026 (was the shared default)
    mwCap: 0.09, // POOL M, Nov 2026 (was the shared default)
    mwCallTighten: 0.25, // POOL M, Nov 2026 (was the shared default)
    mwRaiseCut: 0.75, // POOL M, Nov 2026 (was the shared default)
    mwTrap3: [0.5, 0.1, 0.2], // POOL M, Nov 2026 (was the shared default)
  },
  beginner: {
    m7CheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwTightenCheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    checkedToShift: [0,  -0.05,  -0.08], // POOL passivity, Revision D (13 Nov 2026)
    leadIntoRaiserFlop: -0.04, // POOL passivity, Revision D (13 Nov 2026)
    mwOvercall: [0, 0.08, 0.15], // POOL overcall, owner-approved 13 Nov 2026 (river .12 -> .15, POOL correction)
    name: 'Total beginner',
    blurb: 'Still learning. Plays most hands, limps, bets small, calls with any piece of the board, and gets scared off by big bets.',
    share: 0, // never dealt into the casino pool; you seat them in a home game
    vpip: [0.55, 0.58, 0.62, 0.65, 0.7],
    pfr: [0.03, 0.03, 0.04, 0.03, 0.03],
    isoFactor: 0.6,
    openLimp: 1,
    overLimp: 1,
    openSize: 2.5,
    perLimper: 0,
    sizeTell: 0.9,
    limpTrap: 0.3,
    callRaise: 0.42,
    callElastic: 0.5,
    callCrowd: 0.15,
    limpCall: 0.95,
    threeBet: 0.008,
    callThreeBet: 0.12,
    fourBet: 0.005,
    stackOff: 0.03,
    aceLove: 1,
    suitedLove: 1,
    paintLove: 0.8,
    textureBlind: 0.95,
    absSens: 0.1,
    absFrom: 12,
    neverFold: 0.7,
    cbet: [0.35, 0.25, 0.18],
    barrel: [0.15, 0.06],
    stab: [0.2, 0.15, 0.08],
    valueBet: [0.52, 0.56, 0.62],
    semiBluff: 0.1,
    slowplay: 0.5,
    donk: 0.6,
    mwTighten: 0.01,
    mwBluffCut: 0.3,
    callThr: [0.18, 0.24, 0.3],
    sizeSens: 0.9,
    sizeCap: 0.14,
    chase: 0.35,
    float: 0.2,
    raiseValue: [0.84, 0.86, 0.9],
    raiseBluff: [0.01, 0.006, 0.002],
    raiseRespect: [0.1, 0.14, 0.2],
    minRaise: 0.8,
    sizeValue: [0.45, 0.3, 0.15, 0.05, 0.05],
    sizeThin: [0.6, 0.3, 0.1, 0, 0],
    sizeBluff: [0.5, 0.35, 0.15, 0, 0],
    anyTwo: 0.25, // POOL A7, Nov 2026 (was the shared default)
    mwSteps: [0.02, 0.01], // POOL M, Nov 2026 (was the shared default)
    mwCap: 0.04, // POOL M, Nov 2026 (was the shared default)
    mwPassiveValue: 0.08, // POOL M, Nov 2026 (was the shared default)
    leadIntoRaiser: 0.08, // POOL M, Nov 2026 (was the shared default)
    ledRaiseRespect: 0.15, // POOL M, Nov 2026 (was the shared default)
    leadBluffMult: 0.25, // POOL M, Nov 2026 (was the shared default)
  },
};

// The stand-in for the trainee when a simulation needs their later decisions:
// a solid player who adjusts to who they are up against.
const HERO_DEF = {
  ...DEFS.tag,
  name: 'Exploitative baseline',
  share: 0,
  exploit: true,
  overLimp: 0.5,
  raiseBluff: [0.04, 0.025, 0.006],
  // mwOvercall comes from the tag, [0, .07, .10]: a solid player folds one pair more behind a bet
  // and a call (POOL, 13 Nov 2026).
};

export const TYPE_IDS = Object.keys(DEFS);

// Percentile (0 = worst, 1 = best) of each hand class under a score, weighted by combos.
function percentiles(score) {
  const idx = [...Array(CLASS_COUNT).keys()].sort((a, b) => score[a] - score[b]);
  const pct = new Float64Array(CLASS_COUNT);
  let below = 0;
  for (const k of idx) {
    const info = classInfo(k);
    const combos = info.pair ? 6 : info.suited ? 4 : 12;
    pct[k] = (below + combos / 2) / 1326;
    below += combos;
  }
  return pct;
}

function finish(id, def) {
  const P = { ...BASE, ...def, id };
  const raiseScore = new Float64Array(CLASS_COUNT);
  const playScore = new Float64Array(CLASS_COUNT);
  for (let k = 0; k < CLASS_COUNT; k++) {
    const c = classInfo(k);
    raiseScore[k] = 0.6 * EQ_HEADS_UP[k] + EQ_FOUR_WAY[k];
    let s = EQ_FOUR_WAY[k];
    if (c.suited) s += 0.02 + 0.05 * P.suitedLove;
    if (!c.pair && c.gap <= 2 && c.lo >= 2) s += 0.015;
    if (c.pair) s += 0.04;
    if (c.hi === 12) s += 0.06 * P.aceLove;
    if (c.lo >= 8) s += 0.04 * P.paintLove;
    playScore[k] = s;
  }
  P.raisePct = percentiles(raiseScore);
  P.playPct = percentiles(playScore);
  // Summary indices used by exploit-aware play: how much aggression means, how much they fold.
  const bluffiness =
    (P.barrel[0] + P.barrel[1] + P.stab[1] + P.stab[2]) / 4 + 2.5 * (P.raiseBluff[1] + P.raiseBluff[2]);
  P.aggro = Math.max(0, Math.min(1, bluffiness / 0.75));
  const avgCall = (P.callThr[0] + P.callThr[1] + P.callThr[2]) / 3;
  P.foldy = Math.max(0, Math.min(1, (avgCall - 0.22) / 0.3));
  return P;
}

export const PROFILES = {};
for (const id of TYPE_IDS) PROFILES[id] = finish(id, DEFS[id]);

// Changes made from the Players screen: { type: { parameter: value } } on top of the
// shipped numbers above.
const OVERRIDES = {};

// The shipped numbers for a type, and the numbers currently in force.
export function baseDef(type) {
  return { ...BASE, ...DEFS[type] };
}
export function currentDef(type) {
  return { ...BASE, ...DEFS[type], ...(OVERRIDES[type] || {}) };
}

// Replaces all overrides and rebuilds every type. Players already seated keep the numbers
// they were dealt in with, so start a new session afterwards.
export function applyOverrides(all) {
  for (const id of TYPE_IDS) {
    OVERRIDES[id] = (all && all[id]) || {};
    PROFILES[id] = finish(id, { ...DEFS[id], ...OVERRIDES[id] });
  }
}
export const HERO_PROFILE = finish('hero', HERO_DEF);

// The theory baseline: never dealt and not one of the read types (not in TYPE_IDS). It starts as a
// copy of the solver-style type and is where SOLVER's equilibrium retunes go, so the dealt 'gto'
// can stay a population type. Not wired into grading yet; MATH's anchors and the balanced-field
// test are meant to point here later.
const BASELINE_DEF = { ...DEFS.gto, name: 'Theory baseline', share: 0 };
export const BASELINE_PROFILE = finish('baseline', BASELINE_DEF);

// Each real player is their own version of a type: a bit looser or tighter, more or less
// aggressive, more or less sticky. The trainee's reads and the judge only ever know the
// type, never these personal numbers.
export function personalise(type, rng) {
  const D = { ...DEFS[type], ...(OVERRIDES[type] || {}) };
  const B = { ...BASE, ...D };
  const j = (spread) => 1 + (rng() * 2 - 1) * spread;
  const sh = (spread) => (rng() * 2 - 1) * spread;
  const looser = j(0.18);
  const aggr = j(0.25);
  const stick = sh(0.035);
  return finish(type, {
    ...D,
    vpip: B.vpip.map((v) => Math.min(0.95, v * looser)),
    pfr: B.pfr.map((v) => v * aggr),
    callRaise: B.callRaise * looser,
    cbet: B.cbet.map((v) => Math.min(0.95, v * j(0.15))),
    barrel: B.barrel.map((v) => Math.min(0.9, v * aggr)),
    stab: B.stab.map((v) => Math.min(0.9, v * aggr)),
    raiseBluff: B.raiseBluff.map((v) => v * j(0.4)),
    callThr: B.callThr.map((v) => v + stick),
    neverFold: B.neverFold + sh(0.03),
    raiseRespect: B.raiseRespect.map((v) => v * j(0.25)),
    slowplay: Math.min(0.8, B.slowplay * j(0.3)),
    valueBet: B.valueBet.map((v) => v + sh(0.025)),
  });
}

// Tilt: looser, more aggressive, stickier. level 0 = normal, 1 = steaming.
export function tilted(P, level) {
  if (!level) return P;
  if (!P.tiltVersions) P.tiltVersions = {};
  let T = P.tiltVersions[level];
  if (T) return T;
  const k = level;
  const def = {
    ...P,
    vpip: P.vpip.map((v) => Math.min(0.95, v * (1 + 0.45 * k))),
    pfr: P.pfr.map((v) => Math.min(0.6, v * (1 + 0.7 * k))),
    callRaise: Math.min(0.7, P.callRaise * (1 + 0.5 * k)),
    stackOff: P.stackOff * (1 + 0.8 * k),
    cbet: P.cbet.map((v) => Math.min(0.95, v * (1 + 0.3 * k))),
    barrel: P.barrel.map((v) => Math.min(0.9, v * (1 + 0.8 * k) + 0.05 * k)),
    stab: P.stab.map((v) => Math.min(0.9, v * (1 + 0.6 * k) + 0.04 * k)),
    callThr: P.callThr.map((v) => v - 0.07 * k),
    raiseBluff: P.raiseBluff.map((v) => v * (1 + 1.5 * k) + 0.01 * k),
    chase: P.chase * (1 - 0.25 * k),
  };
  T = finish(P.id, def);
  T.tilt = level;
  P.tiltVersions[level] = T;
  return T;
}
