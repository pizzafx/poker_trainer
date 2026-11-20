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
  // opening range [early/middle, late]; null keeps the old callThreeBet rule. Re-derived values with the
  // facing-aggression order, in POOL's opponent package (owner-approved, Nov 2026).
  tbCont: null,
  tbSize: 0, // less per x of 3-bet size above 3x
  tbOOP: 0, // less out of position against the 3-bettor
  tbSqueeze: 0, // less per caller squeezed
  sqCont: 0, // squeezed after flatting: share of the calling range that continues (0: the old rule)
  blockBet: 0, // river block bets out of position with medium hands (share of the remaining checks)
  tinyFold: 3, // small single bets: continue share at least (1 - tinyFold x pot odds), faded in below 25% of the pot
  pairStab: 0, // checked to on the flop or turn: share of weak and middle pairs that bet (POOL pass 3)
  passiveRaiseMult: null, // passive types: bluff and semi-bluff raises times this (null: off)
  passiveDrawRaiseMult: null, // ...and this for draws with 30% equity or more on the flop and turn
  setMine: 0, // facing one cheap raise (7% of the effective stack or less), pairs call at least this share (POOL HX1)
  slowplayFacing: null, // facing a bet on the flop or turn, monsters flat this share instead of slowplay (POOL HX2; null: slowplay)
  deepJamCap: null, // deep, facing a big 3-bet that is not all-in, non-premium jams capped at this (POOL batch 4)
  setMineEnd: 0.1, // set-mining tapers out from 7% of the effective stack to this (POOL batch 5)
  stackOffRaise: 1, // share of a stack-off that re-raises rather than calls, times 0.6 (POOL batch 5, G5)
  isoRaise: 0.3, // facing an all-in, a non-premium stack-off re-raises this share of the time (POOL batch 5)
  btnMult: 1, // first-in width on the button, times this (POOL batch 6, F5)
  stealDefend: null, // blinds facing a steal: calling width times this (1 from the button, half from the cutoff)
  steal3Bet: null, // ...and 3-bet width times this (default stealDefend)
  tpCheckRaise: 0, // regulars check-raise top pair on wet flops and turns at least this often (H1)
  airRaiseMult: null, // bluff raises with no real draw times this; draws from 25% (flop) / 16% (turn) (H1)
  drawRaiseMult: null, // ...and draw raises times this
  fourBet: 0.008,
  fourBetBluff: 0,
  // POOL batch 8: the opening order's bonuses (finish() builds openPct from them)
  openSuited: 0,
  openPair: 0,
  openConn: 0,
  // POOL batches 7-8: the opener facing one 3-bet (unset is today's play): implied-odds flats (tbPlay and its
  // kinds), offsuit trims (tbOffHi, tbOffLo), 4-bets with AK and suited wheel aces, the offsuit 4-bet bluff trim,
  // and premiums that never fold to one 3-bet that is not all-in
  tbPlay: 0,
  tbSmallPair: 0,
  tbSC: 0,
  tbSCLow: 0,
  tbSuitedAce: 0,
  tbSuitedBw: 0,
  tbPlayStart: 0.1,
  tbPlayEnd: 0.2,
  tbOffHi: null,
  tbOffLo: null,
  tbAK4: 0,
  tbWheel4: 0,
  tbOffBluff4: null,
  premNoFold: 0,
  // POOL batch 10: checked to, out of position with players still to act (unset: the in-position rule)
  ctBehindTighten: null,
  ctBehindShiftMult: 1,
  // POOL batches 9 and 11: passive players' turn air, turn weak-pair stabs, missed-draw river bluffs, and
  // calling one raise of their own turn or river bet with top pair or an overpair (unset: today's play)
  turnAirMult: null,
  pairStabTurn: null,
  missBluff: 0,
  tpRaiseCont: 0,
  opRaiseCont: 0,
  tpRaiseContR: 0,
  opRaiseContR: 0,
  // POOL batch 13: a maniac facing one 3-bet (unset: off): a per-group 4-bet floor (jam4Mix, tapered past 100bb
  // toward jam4DeepMult for the non-pair groups), a continue floor (tbFloor), and 4-bets that are always all-in
  jam4Mix: null,
  tbFloor: 0,
  jam4All: false,
  jam4DeepMult: null,
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
  // POOL batch 15 (the owner's hand 421): first to act after a checked-through street, or on a limped pot's flop,
  // counts as checked to for value bets (probeCT); slowplay and the multiway trap are x ctSlowMult when checked to;
  // a strong hand's flop lead into the raiser on a drawy board uses donkWet instead of donk
  probeCT: false,
  ctSlowMult: null,
  donkWet: null,
  // POOL batch 16 (PRO's review): a checked-to slowplay cut also after your own aggression (initSlow); a monster
  // checked once already bets at trapOnce's slowplay share; a floor on continuing against a bet of a third of the pot
  // or less, by pair class [top+, middle, weak] (smallCont; smallContFirstOnly: as the first defender only); a draw
  // facing a call of 30%+ of the stack counts its own outs and does not float (realDrawOnStack); ocStrongMult: an
  // overpair or TPTK+ overcalling a bet of about half pot or less is not a marginal overcall
  initSlow: false,
  trapOnce: null,
  // POOL batch 19c (PRO, STRAT, CEO): V4 lead and check-raise floors, the V5 dry-flop check share, a dry-river value shift,
  // and caps on air bets into two or more [c-bet into 2, c-bet into 3+, stab or lead]
  v4Lead: null,
  v4LeadMax: null,
  v4CheckRaise: null,
  riverDownBluffMult: null, // POOL batch 19e: river bluffs on a checked-down line (nit)
  riverAirCall: null, // POOL batch 19e: a regular's river air call below 10:1 vs a three-street bettor, [HU, MW or player behind]
  riverTPFloor: null, // POOL batch 19d: river TPGK/overpair value-bet floors by cell (PRO's V1, nit)
  flushRiverRaiseCap: null, // POOL batch 19d: raise share facing a bet on a flush-completing river, set/straight, no flush
  flushRiverStraightFold: null, // POOL batch 19d: [bet over half pot, half pot or less] fold ceiling with the straight
  secondCheckCap: null, // POOL batch 19d (rule 1): a strong hand's check on the turn after checking a checked-through flop
  wetFlopCheckCap: null, // POOL batch 19d: a strong hand's check on a wet flop where V5 scores
  dryFlopSlowIP: null,
  riverDryShift: null,
  mwAirCap: null,
  isoFoldMult: null, // POOL batch 19c (item 8, option B): { all: [1, 2, 3+ limpers] } or { pair, suited }: fold multipliers facing one iso raise
  psLimp: null, // POOL batch 19c (item 8, option B): share of otherwise-folded pairs and suited hands that limp first in or behind
  smallCont: null,
  smallContFirstOnly: false,
  realDrawOnStack: false,
  ocStrongMult: null,
  stackOffRaiseNP: null, // POOL batch 16b: a stack-off re-raise share below QQ+/AK (station, nit)
  stackOffRaiseJJ: null, // ...and JJ's own share (the nit)
  strongRiverFloorDraw: null, // POOL batch 19a: the same on a river that completed a flush or straight
  strongRiverFloor: null, // POOL batch 19a: rule 1, [two pair to a straight, full house+] river bet floor after betting twice / a checked-through street
  raiseFoldCap: null, // POOL batch 19a: TPGK+ fold cap facing a flop/turn raise at 4:1+, { tpgk: [flop, turn] } %
  jam3Cap: null, // POOL batch 19a: jam share caps facing a 3-bet+ by group { jj, aq, tt, ajkq, other } (fractions)
  jam3MinBB: null, // POOL batch 19a: the effective depth jam3Cap starts at
  stabFoldCap: null, // POOL batch 19b: regulars' fold caps facing a stab after a checked-through street (see policy.js)
  foldCap: null, // POOL batch 19: per-type fold caps facing one bet, by price band (PRO's B ceilings v1.2; policy.js foldClassOf)
  airContCap: null, // POOL batch 19: continuing 10-30bb with no pair and no real draw, [heads-up, multiway] %
  pfCallOffCap: null, // POOL batch 19: preflop call-offs in 3-bet+ pots, { ajkq, other } %
  airCallOff: null, // POOL batch 17: a cap on calling off a stack or 30bb+ with air [ace/king-high, worse]
  valueMd: null, // POOL batch 18: the one-pair three-flush markdown when betting with nobody in yet (null: the static 0.85)
  tpLabel: null, // POOL batch 18: weak-kicker top pair counts toward top pair good kicker when betting the turn or river (recreational players bet the label)
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
    riverDownBluffMult: 0.55, // POOL batch 19e (PRO, STRAT, CEO: air <= 5 of its river leads after a checked-down flop and turn; aims about 4.3)
    riverTPFloor: { dryHU: 0.72, dryMW: 0.62, scaryHU: 0.47, scaryMW: 0.37, dryOOP: 0.52, scaryOOP: 0.32 }, // POOL batch 19d (PRO's V1 floors + 7; twin gaps 20+)
    flushRiverRaiseCap: 0.03, // POOL batch 19d (PRO's flush-river ceiling)
    secondCheckCap: 0.05, // POOL batch 19d (rule 1)
    isoFoldMult: { pair: 0.45, suited: 0.75 }, // POOL batch 19c (item 8, option B: PRO + MATH, CEO)
    v4CheckRaise: 0.2, // POOL batch 19c
    stabFoldCap: { river: { wm: [65, 92], tpgk: { dry: 20, paired: 25, comp: 60, flush: 40 }, tpwk: { dry: 35, paired: 40, comp: 75, flush: 55 }, tptk: { dry: 15, paired: 18, comp: 50, flush: 30 } }, turn: { wm: [null, 85], tp: 15 } }, // POOL batch 19b (PRO's stab-fold ceilings)
    strongRiverFloor: [0.97, 0.99], // POOL batch 19a
    strongRiverFloorDraw: [0.9, 0.97], // POOL batch 19a (PRO's V5 river floors on a river that completed a draw)
    jam3Cap: { jj: 0.001, aq: 0.001, tt: 0.001, ajkq: 0.001, other: 0.001 }, // POOL batch 19a (rule 4: QQ+/AK only)
    foldCap: { tpgk: [null, [null, null, 5, 5], [null, null, 8, 8]], tpwk: [null, [null, null, 20, 20], [null, null, 30, 30]] }, // POOL batch 19 (rule 2 shape)
    valueMd: 0.92, // POOL batch 18 (PRO's scary-board floors and ceilings)
    tbCont: [0.55, 0.4], // POOL opponent package (Nov 2026)
    tbSize: 0.05, // POOL opponent package (Nov 2026)
    blockBet: 0.04, // POOL opponent package (Nov 2026)
    sqCont: 0.6, // POOL opponent package (Nov 2026)
    mwOvercall: [0, 0.06, 0.07], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Tight-passive nit',
    airCallOff: [0.03, 0.03], // POOL batch 17
    stackOffRaiseNP: 0.05, // POOL batch 16b
    stackOffRaiseJJ: 0.25, // POOL batch 16b
    smallCont: [0.84,  0.4,  0.2], // POOL batch 16
    initSlow: true, // POOL batch 16
    trapOnce: 0.1, // POOL batch 16
    realDrawOnStack: true, // POOL batch 16
    probeCT: true, // POOL batch 15
    ctSlowMult: 0.4, // POOL batch 15; .6 -> .4 batch 16
    checkedToShift: [0, -0.05, -0.1], // POOL batch 15
    blurb: 'Waits for big hands. Limps a lot, rarely raises, and when the money goes in he has it.',
    share: 0.13,
    vpip: [0.15, 0.16, 0.18, 0.17, 0.22], // POOL A2, Nov 2026: was [0.12, 0.14, 0.17, 0.15, 0.2]
    pfr: [0.054, 0.063, 0.081, 0.036, 0.036],
    isoFactor: 0.6,
    openLimp: 0.9,
    openSize: 5.5,
    sizeTell: 0.8,
    limpTrap: 0.015, // POOL batch 18 (PRO P-V: a nit raises AA/KK first in 98%; was 0.25)
    callRaise: 0.07,
    callElastic: 0.5, // POOL A5, Nov 2026: was 0.7
    limpCall: 1.1,
    threeBet: 0.017, // POOL batch 2 / pass 3 (Nov 2026)
    callThreeBet: 0.03,
    fourBet: 0.006,
    stackOff: 0.018, // POOL opponent package (Nov 2026)
    paintLove: 0.5,
    textureBlind: 0.2,
    absSens: 0.09, // POOL amendment 1, Nov 2026: P1v2 had 0.12 (nits folded top pair to small third bets)
    absFrom: 20, // POOL amendment 1, Nov 2026: was 15 (the base)
    neverFold: 0.66, // POOL P1v2, Nov 2026: was 0.6
    cbet: [0.45, 0.21, 0.085], // POOL batch 19b (PRO: multiway air c-bet into 2 ≤25, into 3+ ≤10; was [0.45, 0.22, 0.1])
    barrel: [0.14, 0.04],
    stab: [0.055, 0.1, 0.04], // POOL batch 17 (was [0.14, 0.1, 0.04])
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
    setMine: 0.7, // POOL HX / batch 4 (Nov 2026)
    // POOL batches 7-11 (Nov 2026)
    turnAirMult: 0.45,
    missBluff: 0.06,
  },
  abc: {
    flushRiverRaiseCap: 0.05, // POOL batch 19d (PRO's flush-river ceiling)
    secondCheckCap: 0.05, // POOL batch 19d (rule 1)
    psLimp: 0.25, // POOL batch 19c (item 8, option B: VPIP back to 35+ through pair and suited limps)
    isoFoldMult: { pair: 0.85, suited: 0.65 }, // POOL batch 19c (item 8, option B: PRO + MATH, CEO)
    v4CheckRaise: 0.2, // POOL batch 19c
    dryFlopSlowIP: 0.13, // POOL batch 19c
    riverDryShift: -0.015, // POOL batch 19c
    foldCap: { mid: [[null, null, 20, 20], [70, 55, 20, 10], [null, 65, 20, 15]], weak: [[null, null, 40, 40], [70, 55, 30, 10], [null, 65, 35, 15]], oesd: [null, [40, 25, 8, 2], null] }, // POOL batch 19b
    strongRiverFloor: [0.97, 0.99], // POOL batch 19a
    strongRiverFloorDraw: [0.9, 0.97], // POOL batch 19a (PRO's V5 river floors on a river that completed a draw)
    raiseFoldCap: { tpgk: [3, 3] }, // POOL batch 19a
    jam3Cap: { jj: 0.085, aq: 0.042, tt: 0.025, ajkq: 0.0085, other: 0.002 }, // POOL batch 19a (PRO's B ceilings x0.85)
    jam3MinBB: 35, // POOL batch 19a
    airContCap: [8, 4], // POOL batch 19
    pfCallOffCap: { ajkq: 25, other: 2 }, // POOL batch 19
    valueMd: 0.92, // POOL batch 18 (PRO's scary-board floors and ceilings)
    tbCont: [0.8, 0.68], // POOL opponent package (Nov 2026)
    tbSize: 0.05, // POOL opponent package (Nov 2026)
    blockBet: 0.1, // POOL opponent package (Nov 2026)
    sqCont: 0.65, // POOL opponent package (Nov 2026)
    m7CheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwTightenCheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    checkedToShift: [0, -0.06, -0.12], // POOL passivity, Revision D (13 Nov 2026)
    leadIntoRaiserFlop: -0.04, // POOL passivity, Revision D (13 Nov 2026)
    mwOvercall: [0, 0.05, 0.09], // POOL overcall, owner-approved 13 Nov 2026 (river .07 -> .09, POOL correction)
    name: 'Straightforward recreational',
    airCallOff: [0.04, 0.04], // POOL batch 17
    tpLabel: 0.8, // POOL batch 18 (PRO's TPWK floors)
    smallCont: [0.92,  0.84,  0.64], // POOL batch 16
    initSlow: true, // POOL batch 16
    trapOnce: 0.1, // POOL batch 16
    realDrawOnStack: true, // POOL batch 16
    probeCT: true, // POOL batch 15
    ctSlowMult: 0.5, // POOL batch 15
    donkWet: 0.65, // POOL batch 15
    blurb: 'Plays his cards face up: bets when he hits, gives up when he misses, limps along a lot.',
    share: 0.375, // MATH's S (CEO for the owner, Nov 2026): six points from station; POOL Nov 2026 was 0.315
    vpip: [0.41, 0.42, 0.44, 0.43, 0.48], // POOL A2, Nov 2026: was [0.26, 0.29, 0.34, 0.32, 0.38]
    pfr: [0.08, 0.096, 0.144, 0.064, 0.048],
    openLimp: 0.85,
    sizeTell: 0.55,
    callRaise: 0.2,
    callElastic: 0.3, // POOL A5, Nov 2026: was 0.45
    limpCall: 1.25, // POOL A2, Nov 2026: was 0.9
    threeBet: 0.02, // POOL batch 2 / pass 3 (Nov 2026)
    callThreeBet: 0.05,
    stackOff: 0.032, // POOL opponent package (Nov 2026)
    aceLove: 0.3,
    textureBlind: 0.5,
    cbet: [0.55, 0.255, 0.125], // POOL batch 19b (PRO: into 2 ≤30, into 3+ ≤15; was [0.55, 0.3, 0.14])
    barrel: [0.2, 0.07],
    stab: [0.22, 0.16, 0.07],
    valueBet: [0.55, 0.6, 0.67],
    semiBluff: 0.22,
    slowplay: 0.3,
    callThr: [0.34, 0.42, 0.34], // POOL opponent package (Nov 2026)
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
    pairStab: 0.2, // POOL batch 2 / pass 3 (Nov 2026)
    passiveRaiseMult: 0.4, // POOL batch 2 / pass 3 (Nov 2026)
    passiveDrawRaiseMult: 0.6, // POOL batch 2 / pass 3 (Nov 2026)
    setMine: 0.9, // POOL HX / batch 4 (Nov 2026)
    slowplayFacing: 0.5, // POOL HX / batch 4 (Nov 2026)
    stackOffRaise: 0.5, // POOL batch 5 (Nov 2026)
    btnMult: 1.15, // POOL batch 6 (Nov 2026)
    // POOL batches 7-11 (Nov 2026)
    turnAirMult: 0.35,
    opRaiseCont: 0.6,
    tpRaiseCont: 0.35,
    missBluff: 0.15, // POOL batch 17 (was 0.3)
    tpRaiseContR: 0.35,
    opRaiseContR: 0.6,
  },
  station: {
    flushRiverRaiseCap: 0.03, // POOL batch 19d (PRO's flush-river ceiling)
    flushRiverStraightFold: [0.05, 0.03], // POOL batch 19d (PRO)
    secondCheckCap: 0.05, // POOL batch 19d (rule 1)
    wetFlopCheckCap: 0.22, // POOL batch 19d (PRO's wet-flop ceiling)
    isoFoldMult: { all: [0.86, 0.73, 0.69] }, // POOL batch 19c (item 8, option B: PRO + MATH, CEO)
    v4LeadMax: 0.3, // POOL batch 19c (PRO's V4 lead target; the type was over its ceiling)
    v4CheckRaise: 0.1, // POOL batch 19c
    riverDryShift: 0.03, // POOL batch 19c
    foldCap: { mid: [[20, 15, 10, 5], [35, 25, 10, 5], [null, 35, 20, 10]], weak: [[20, 15, 10, 5], [35, 25, 10, 5], [null, 35, 20, 10]], oesd: [null, [20, 10, 3, 1], null] }, // POOL batch 19b
    strongRiverFloor: [0.97, 0.99], // POOL batch 19a
    strongRiverFloorDraw: [0.9, 0.97], // POOL batch 19a (PRO's V5 river floors on a river that completed a draw)
    jam3Cap: { jj: 0.001, aq: 0.001, tt: 0.001, ajkq: 0.001, other: 0.001 }, // POOL batch 19a (rule 4: QQ+/AK only)
    airContCap: [15, 8], // POOL batch 19
    pfCallOffCap: { ajkq: 45, other: 5 }, // POOL batch 19
    valueMd: 0.9, // POOL batch 18 (PRO's scary-board floors and ceilings)
    blockBet: 0.12, // POOL opponent package (Nov 2026)
    sqCont: 1.5, // POOL opponent package (Nov 2026)
    m7CheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwTightenCheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    checkedToShift: [0, -0.04, -0.04], // POOL passivity, Revision D (13 Nov 2026)
    leadIntoRaiserFlop: -0.04, // POOL passivity, Revision D (13 Nov 2026)
    mwOvercall: [0, 0.03, 0.13], // POOL overcall, owner-approved 13 Nov 2026
    ocSize: 0.25, // POOL overcall: a pot-sized overcall hits harder than a half-pot one
    name: 'Loose-passive calling station',
    airCallOff: [0.3, 0.1], // POOL batch 17
    tpLabel: 0.5, // POOL batch 18
    stackOffRaiseNP: 0.05, // POOL batch 16b
    smallCont: [0.97,  0.88,  0.72], // POOL batch 16
    initSlow: true, // POOL batch 16
    trapOnce: 0.1, // POOL batch 16
    realDrawOnStack: true, // POOL batch 16
    probeCT: true, // POOL batch 15
    ctSlowMult: 0.5, // POOL batch 15
    donkWet: 0.7, // POOL batch 15
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
    stackOff: 0.05, // POOL opponent package (Nov 2026)
    aceLove: 0.7,
    suitedLove: 0.7,
    paintLove: 0.4,
    textureBlind: 0.8,
    absSens: 0.055,
    neverFold: 0.6, // POOL P1v2, Nov 2026: was 0.55
    cbet: [0.4, 0.17, 0.085], // POOL batch 19b (PRO: into 2 ≤20, into 3+ ≤10; was [0.4, 0.25, 0.14])
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
    sizeThin: [0.3, 0.35, 0.3, 0.05, 0], // POOL batch 2 / pass 3 (Nov 2026)
    sizeBluff: [0.3, 0.35, 0.3, 0.05, 0], // POOL batch 2 / pass 3 (Nov 2026)
    absFrom: 30, // POOL P1v2, Nov 2026: was 40
    overFold: 0.06, // POOL P1v2, Nov 2026: was 0.04
    anyTwo: 0.05, // POOL A7, Nov 2026 (was the shared default)
    mwBehind: 0.01, // POOL M, Nov 2026 (was the shared default)
    mwCaller: 0.01, // POOL M, Nov 2026 (was the shared default)
    mwPassiveValue: 0.08, // POOL M, Nov 2026 (was the shared default)
    leadIntoRaiser: 0.08, // POOL M, Nov 2026 (was the shared default)
    ledRaiseRespect: 0.15, // POOL M, Nov 2026 (was the shared default)
    leadBluffMult: 0.25, // POOL M, Nov 2026 (was the shared default)
    pairStab: 0.35, // POOL batch 2 / pass 3 (Nov 2026)
    passiveRaiseMult: 0.4, // POOL batch 2 / pass 3 (Nov 2026)
    passiveDrawRaiseMult: 0.6, // POOL batch 2 / pass 3 (Nov 2026)
    setMine: 1, // POOL HX / batch 4 (Nov 2026)
    slowplayFacing: 0.65, // POOL HX / batch 4 (Nov 2026)
    stackOffRaise: 0.3, // POOL batch 5 (Nov 2026)
    setMineEnd: 0.125, // POOL batch 5 (Nov 2026)
    // POOL batches 7-11 (Nov 2026)
    turnAirMult: 0.35,
    pairStabTurn: 0.15,
    missBluff: 0.15, // POOL batch 17 (was 0.3)
    tpRaiseContR: 0.65,
    opRaiseContR: 0.85,
  },
  whale: {
    flushRiverRaiseCap: 0.08, // POOL batch 19d (PRO's flush-river ceiling)
    flushRiverStraightFold: [0.06, 0.06], // POOL batch 19d (PRO)
    secondCheckCap: 0.05, // POOL batch 19d (rule 1)
    wetFlopCheckCap: 0.22, // POOL batch 19d (PRO's wet-flop ceiling)
    isoFoldMult: { all: [0.86, 0.84, 0.77] }, // POOL batch 19c (item 8, option B: PRO + MATH, CEO)
    v4LeadMax: 0.47, // POOL batch 19c (PRO's V4 lead target; the type was over its ceiling)
    v4CheckRaise: 0.15, // POOL batch 19c
    dryFlopSlowIP: 0.12, // POOL batch 19c
    strongRiverFloor: [0.97, 0.99], // POOL batch 19a
    strongRiverFloorDraw: [0.9, 0.97], // POOL batch 19a (PRO's V5 river floors on a river that completed a draw)
    airContCap: [25, 15], // POOL batch 19
    pfCallOffCap: { ajkq: 70, other: 10 }, // POOL batch 19
    airCallOff: [0.2, 0.2], // POOL batch 19 (PRO ceiling 6: whale 15-30, halved multiway)
    valueMd: 0.86, // POOL batch 18 (PRO's scary-board floors and ceilings)
    tpLabel: 0.3, // POOL batch 18
    blockBet: 0.08, // POOL opponent package (Nov 2026)
    sqCont: 1.6, // POOL opponent package (Nov 2026)
    m7CheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwTightenCheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    checkedToShift: [0, -0.06, -0.12], // POOL passivity, Revision D (13 Nov 2026)
    leadIntoRaiserFlop: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwOvercall: [0, 0.02, 0.13], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Gambler',
    smallCont: [0.97,  0.94,  0.9], // POOL batch 16
    initSlow: true, // POOL batch 16
    trapOnce: 0.1, // POOL batch 16
    probeCT: true, // POOL batch 15
    ctSlowMult: 0.5, // POOL batch 15
    donkWet: 0.8, // POOL batch 15
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
    stackOff: 0.07, // POOL opponent package (Nov 2026)
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
    sizeThin: [0.3, 0.35, 0.3, 0.05, 0], // POOL batch 2 / pass 3 (Nov 2026)
    sizeBluff: [0.3, 0.35, 0.3, 0.05, 0], // POOL batch 2 / pass 3 (Nov 2026)
    absFrom: 25, // POOL P1v2, Nov 2026: was 30
    overFold: 0.04,
    anyTwo: 0.25, // POOL A7, Nov 2026 (was the shared default)
    mwBehind: 0.005, // POOL M, Nov 2026 (was the shared default)
    mwCaller: 0.005, // POOL M, Nov 2026 (was the shared default)
    mwPassiveValue: 0.05, // POOL M, Nov 2026 (was the shared default)
    leadIntoRaiser: 0.06, // POOL M, Nov 2026 (was the shared default)
    ledRaiseRespect: 0.1, // POOL M, Nov 2026 (was the shared default)
    leadBluffMult: 0.5, // POOL M, Nov 2026 (was the shared default)
    pairStab: 0.38, // POOL batch 2 / pass 3 (Nov 2026)
    setMine: 1, // POOL HX / batch 4 (Nov 2026)
    slowplayFacing: 0.4, // POOL HX / batch 4 (Nov 2026)
    stackOffRaise: 0.7, // POOL batch 5 (Nov 2026)
    setMineEnd: 0.125, // POOL batch 5 (Nov 2026)
  },
  maniac: {
    flushRiverRaiseCap: 0.25, // POOL batch 19d (PRO's flush-river ceiling)
    valueMd: 0.9, // POOL batch 18 (PRO's scary-board floors and ceilings)
    tbCont: [0.75, 0.65], // POOL opponent package (Nov 2026)
    tbSize: 0.05, // POOL opponent package (Nov 2026)
    sqCont: 0.8, // POOL opponent package (Nov 2026)
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
    isoRaise: 0.6, // POOL batch 5 (Nov 2026)
    // POOL batch 13 (Nov 2026): the maniac's answer to a 3-bet
    jam4Mix: [1, 0.8, 0.4, 0.3, 0.25, 0.25, 0.03],
    tbFloor: 0.6,
    jam4All: true,
    jam4DeepMult: 0.3,
    // POOL batch 14 (QA-OPP M1): the floors taper with a big 3-bet's price instead of a fold cliff at 30% of the stack
    bigFloorSpan: 0.5,
    bigFloorMin: 0.2,
    bigFloorBase: 0.7,
  },
  gto: {
    riverAirCall: [0.03, 0.01], // POOL batch 19e (PRO's ceiling; excess folds)
    flushRiverRaiseCap: 0.06, // POOL batch 19d (PRO's flush-river ceiling)
    v4Lead: 0.13, // POOL batch 19c
    v4CheckRaise: 0.3, // POOL batch 19c
    dryFlopSlowIP: 0.12, // POOL batch 19c
    mwAirCap: [0.17, 0.068, 0.068], // POOL batch 19c
    stabFoldCap: { river: { wm: [50, 85], tpgk: { dry: 10, paired: 15, comp: 50, flush: 30 }, tpwk: { dry: 25, paired: 30, comp: 65, flush: 45 }, tptk: { dry: 5, paired: 8, comp: 40, flush: 20 } }, turn: { wm: [null, 75], tp: 10 } }, // POOL batch 19b (PRO's stab-fold ceilings)
    valueMd: 0.86, // POOL batch 18 (PRO's scary-board floors and ceilings)
    tbCont: [0.52, 0.45], // POOL batches 7-11 (Nov 2026)
    tbSize: 0.06, // POOL batch 2 / pass 3 (Nov 2026)
    tbOOP: 0.05, // POOL opponent package (Nov 2026)
    tbSqueeze: 0.08, // POOL opponent package (Nov 2026)
    mwOvercall: [0, 0.28, 0.25], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Solver-style player',
    smallCont: [0.88,  0.55,  0], // POOL batch 16
    initSlow: true, // POOL batch 16
    trapOnce: 0.1, // POOL batch 16
    realDrawOnStack: true, // POOL batch 16
    ocStrongMult: 0.4, // POOL batch 16
    smallContFirstOnly: true, // POOL batch 16
    probeCT: true, // POOL batch 15
    ctSlowMult: 0.5, // POOL batch 15
    blurb: 'Small opens, small range-bets, balanced bluffs and bluff-catches by the chart, whoever he is up against.',
    share: 0.04,
    vpip: [0.17, 0.22, 0.39, 0.34, 0.44],
    pfr: [0.17, 0.22, 0.3, 0.29, 0.1], // POOL batches 7-11 (Nov 2026)
    isoFactor: 1.0, // POOL batches 7-11 (Nov 2026)
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
    fourBetBluff: 0.15, // POOL batches 7-11 (Nov 2026)
    stackOff: 0.04, // POOL opponent package (Nov 2026)
    textureBlind: 0.1,
    absSens: 0.05,
    neverFold: 0.58,
    cbet: [0.78, 0.5, 0.09], // POOL batch 12 (Nov 2026): was [0.78, 0.5, 0.28]
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
    deepJamCap: 0.1, // POOL HX / batch 4 (Nov 2026)
    btnMult: 1.6, // POOL batches 7-11 (Nov 2026)
    airRaiseMult: 0.3, // POOL batch 6 (Nov 2026)
    drawRaiseMult: 1.4, // POOL batch 6 (Nov 2026)
    stealDefend: 1.55, // POOL batch 6 (Nov 2026)
    tpCheckRaise: 0.12, // POOL batch 6 (Nov 2026)
    steal3Bet: 2.6, // POOL batch 6 (Nov 2026)
    // POOL batches 7-11 (Nov 2026)
    tbPlay: 1,
    tbSmallPair: 0.8,
    tbSC: 0.85,
    tbSCLow: 0.6,
    tbSuitedAce: 0.55,
    tbSuitedBw: 0.95,
    tbPlayStart: 0.1,
    tbPlayEnd: 0.2,
    premNoFold: 0.029,
    openSuited: 0.03,
    openPair: 0.15,
    openConn: 0.14,
    tbOffHi: 0.9,
    tbOffLo: 0.5,
    tbAK4: 0.45,
    tbWheel4: 0.25,
    mwTightenCheckedTo: 0.01,
    checkedToShift: [0, -0.06, -0.12],
    ctBehindTighten: 0.03,
    ctBehindShiftMult: 0.5,
  },
  tag: {
    riverAirCall: [0.03, 0.01], // POOL batch 19e (PRO's ceiling; excess folds)
    flushRiverRaiseCap: 0.06, // POOL batch 19d (PRO's flush-river ceiling)
    v4Lead: 0.18, // POOL batch 19c
    v4CheckRaise: 0.3, // POOL batch 19c
    dryFlopSlowIP: 0.12, // POOL batch 19c
    stabFoldCap: { river: { wm: [50, 85], tpgk: { dry: 10, paired: 15, comp: 50, flush: 30 }, tpwk: { dry: 25, paired: 30, comp: 65, flush: 45 }, tptk: { dry: 5, paired: 8, comp: 40, flush: 20 } }, turn: { wm: [null, 75], tp: 10 } }, // POOL batch 19b (PRO's stab-fold ceilings)
    valueMd: 0.87, // POOL batch 18 (PRO's scary-board floors and ceilings)
    tpLabel: 0.25, // POOL batch 18
    tbCont: [0.6, 0.45], // POOL opponent package (Nov 2026)
    tbSize: 0.1, // POOL opponent package (Nov 2026)
    tbOOP: 0.07, // POOL opponent package (Nov 2026)
    tbSqueeze: 0.08, // POOL opponent package (Nov 2026)
    mwOvercall: [0, 0.07, 0.1], // POOL overcall, owner-approved 13 Nov 2026
    name: 'Solid regular',
    smallCont: [0.88,  0.5,  0], // POOL batch 16
    initSlow: true, // POOL batch 16
    trapOnce: 0.1, // POOL batch 16
    realDrawOnStack: true, // POOL batch 16
    probeCT: true, // POOL batch 15
    ctSlowMult: 0.5, // POOL batch 15
    blurb: 'Tight-aggressive grinder. Raises his good hands, isolates limpers, folds when a passive player wakes up.',
    share: 0.15,
    vpip: [0.15, 0.2, 0.34, 0.22, 0.3],
    pfr: [0.13, 0.18, 0.25, 0.15, 0.1], // POOL batches 7-11 (Nov 2026)
    isoFactor: 1.0, // POOL batches 7-11 (Nov 2026)
    openLimp: 0.02,
    overLimp: 0.4,
    openSize: 5,
    sizeTell: 0.1,
    limpTrap: 0,
    callRaise: 0.13,
    callElastic: 0.8,
    threeBet: 0.03, // POOL batch 2 / pass 3 (Nov 2026)
    threeBetBluff: 0.05, // POOL A4, Nov 2026: was 0.12
    callThreeBet: 0.14,
    fourBet: 0.0135, // POOL batches 7-11 (Nov 2026)
    fourBetBluff: 0.03,
    stackOff: 0.028, // POOL opponent package (Nov 2026)
    textureBlind: 0.15,
    neverFold: 0.66, // POOL P1v2, Nov 2026: was 0.62
    cbet: [0.65, 0.28, 0.07], // POOL batch 12 (Nov 2026): was [0.65, 0.35, 0.15]
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
    deepJamCap: 0.1, // POOL HX / batch 4 (Nov 2026)
    btnMult: 1.68, // POOL batches 7-11 (Nov 2026)
    airRaiseMult: 0.3, // POOL batch 6 (Nov 2026)
    drawRaiseMult: 1.4, // POOL batch 6 (Nov 2026)
    stealDefend: 1.3, // POOL batch 6 (Nov 2026)
    tpCheckRaise: 0.1, // POOL batch 6 (Nov 2026)
    // POOL batches 7-11 (Nov 2026)
    tbPlay: 1,
    tbSmallPair: 0.65,
    tbSC: 0.65,
    tbSCLow: 0.4,
    tbSuitedAce: 0.35,
    tbSuitedBw: 0.8,
    tbPlayStart: 0.1,
    tbPlayEnd: 0.2,
    tbOffHi: 0.55,
    tbOffLo: 0.22,
    tbAK4: 0.35,
    premNoFold: 0.029,
    openSuited: 0.03,
    openPair: 0.15,
    openConn: 0.14,
    mwTightenCheckedTo: 0.01,
    checkedToShift: [0, -0.06, -0.12],
    ctBehindTighten: 0.03,
    ctBehindShiftMult: 0.5,
  },
  lag: {
    riverAirCall: [0.06, 0.02], // POOL batch 19e (PRO's ceiling; excess folds)
    flushRiverRaiseCap: 0.12, // POOL batch 19d (PRO's flush-river ceiling)
    v4Lead: 0.23, // POOL batch 19c
    v4CheckRaise: 0.35, // POOL batch 19c
    dryFlopSlowIP: 0.12, // POOL batch 19c
    stabFoldCap: { river: { wm: [40, 75], tpgk: { dry: 10, paired: 15, comp: 50, flush: 30 }, tpwk: { dry: 25, paired: 30, comp: 65, flush: 45 }, tptk: { dry: 5, paired: 8, comp: 40, flush: 20 } }, turn: { wm: [null, 65], tp: 10 } }, // POOL batch 19b (PRO's stab-fold ceilings)
    valueMd: 0.85, // POOL batch 18 (PRO's scary-board floors and ceilings)
    tbCont: [0.6, 0.58], // POOL batches 7-11 (Nov 2026)
    tbSize: 0.1, // POOL opponent package (Nov 2026)
    tbOOP: 0.07, // POOL opponent package (Nov 2026)
    tbSqueeze: 0.08, // POOL opponent package (Nov 2026)
    mwOvercall: [0, 0.1, 0.1], // POOL overcall, owner-approved 13 Nov 2026 (river .09 -> .10, POOL correction)
    name: 'Tricky aggressive regular',
    smallCont: [0.88,  0.6,  0.3], // POOL batch 16
    initSlow: true, // POOL batch 16
    trapOnce: 0.1, // POOL batch 16
    realDrawOnStack: true, // POOL batch 16
    probeCT: true, // POOL batch 15
    ctSlowMult: 0.5, // POOL batch 15
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
    fourBetBluff: 0.3, // POOL batches 7-11 (Nov 2026)
    stackOff: 0.04, // POOL opponent package (Nov 2026)
    textureBlind: 0.15,
    neverFold: 0.6,
    cbet: [0.72, 0.42, 0.12], // POOL batch 12 (Nov 2026): was [0.72, 0.42, 0.2]
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
    isoRaise: 0.45, // POOL batch 5 (Nov 2026)
    btnMult: 1.3, // POOL batch 6 (Nov 2026)
    airRaiseMult: 0.4, // POOL batch 6 (Nov 2026)
    drawRaiseMult: 1.3, // POOL batch 6 (Nov 2026)
    stealDefend: 1.3, // POOL batch 6 (Nov 2026)
    tpCheckRaise: 0.15, // POOL batch 6 (Nov 2026)
    // POOL batches 7-11 (Nov 2026)
    tbPlay: 1,
    tbSmallPair: 0.8,
    tbSC: 0.85,
    tbSCLow: 0.6,
    tbSuitedAce: 0.55,
    tbSuitedBw: 0.95,
    tbPlayStart: 0.1,
    tbPlayEnd: 0.2,
    premNoFold: 0.029,
    tbOffHi: 1,
    tbOffLo: 0.8,
    tbAK4: 0.5,
    tbWheel4: 0.55,
    tbOffBluff4: 0.5,
    mwTightenCheckedTo: 0.01,
    checkedToShift: [0, -0.06, -0.12],
    ctBehindTighten: 0.03,
    ctBehindShiftMult: 0.5,
  },
  beginner: {
    flushRiverRaiseCap: 0.05, // POOL batch 19d (PRO's flush-river ceiling)
    secondCheckCap: 0.05, // POOL batch 19d (rule 1)
    psLimp: 0.25, // POOL batch 19c (item 8, option B: VPIP back to 35+ through pair and suited limps)
    isoFoldMult: { all: [1, 0.85, 0.73] }, // POOL batch 19c (item 8, option B: PRO + MATH, CEO)
    v4LeadMax: 0.38, // POOL batch 19c (PRO's V4 lead target; the type was over its ceiling)
    v4CheckRaise: 0.1, // POOL batch 19c
    strongRiverFloor: [0.97, 0.99], // POOL batch 19a
    strongRiverFloorDraw: [0.9, 0.97], // POOL batch 19a (PRO's V5 river floors on a river that completed a draw)
    valueMd: 0.88, // POOL batch 18 (PRO's scary-board floors and ceilings)
    tpLabel: 0.5, // POOL batch 18
    tbCont: [0.85, 0.8], // POOL opponent package (Nov 2026)
    tbSize: 0.03, // POOL opponent package (Nov 2026)
    blockBet: 0.12, // POOL opponent package (Nov 2026)
    sqCont: 1.2, // POOL opponent package (Nov 2026)
    m7CheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    mwTightenCheckedTo: 0, // POOL passivity, Revision D (13 Nov 2026)
    checkedToShift: [0, -0.05, -0.08], // POOL passivity, Revision D (13 Nov 2026)
    leadIntoRaiserFlop: -0.04, // POOL passivity, Revision D (13 Nov 2026)
    mwOvercall: [0, 0.08, 0.15], // POOL overcall, owner-approved 13 Nov 2026 (river .12 -> .15, POOL correction)
    name: 'Total beginner',
    smallCont: [0.95,  0.88,  0.7], // POOL batch 16
    initSlow: true, // POOL batch 16
    trapOnce: 0.1, // POOL batch 16
    realDrawOnStack: true, // POOL batch 16
    probeCT: true, // POOL batch 15
    ctSlowMult: 0.5, // POOL batch 15
    donkWet: 0.8, // POOL batch 15
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
    stackOff: 0.05, // POOL opponent package (Nov 2026)
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
    pairStab: 0.3, // POOL batch 2 / pass 3 (Nov 2026)
    passiveRaiseMult: 0.4, // POOL batch 2 / pass 3 (Nov 2026)
    passiveDrawRaiseMult: 0.6, // POOL batch 2 / pass 3 (Nov 2026)
    setMine: 0.9, // POOL HX / batch 4 (Nov 2026)
    slowplayFacing: 0.55, // POOL HX / batch 4 (Nov 2026)
    stackOffRaise: 0.4, // POOL batch 5 (Nov 2026)
    setMineEnd: 0.125, // POOL batch 5 (Nov 2026)
  },
};

// The stand-in for the trainee when a simulation needs their later decisions:
// a solid player who adjusts to who they are up against.
const HERO_DEF = {
  ...DEFS.tag,
  // POOL batch 19c (CEO): the new tag fields stay off on the stand-in until QA-VERDICT's flip check and STRAT and MATH rule
  v4Lead: null,
  v4CheckRaise: null,
  dryFlopSlowIP: null,
  secondCheckCap: null, // POOL batch 19d: pinned off for the stand-in (adoption is a separate step)
  flushRiverRaiseCap: null, // POOL batch 19d: pinned off for the stand-in (QA-VERDICT flip check first)
  riverTPFloor: null,
  riverAirCall: null, // POOL batch 19e: pinned off for the stand-in (QA-VERDICT flip check first)
  riverDownBluffMult: null,
  flushRiverStraightFold: null,
  wetFlopCheckCap: null,
  // the stand-in hero (and the judge's play-out profile) keeps the pre-bundle tag until STRAT and MATH rule
  // on it: the POOL batches 7-12 tag changes are for the opponents only (POOL, 16 Nov 2026)
  pfr: [0.13, 0.18, 0.3, 0.15, 0.1],
  isoFactor: 0.8,
  btnMult: 1.4,
  fourBet: 0.012,
  cbet: [0.65, 0.35, 0.15],
  tbCont: [0.6, 0.45],
  openSuited: 0,
  openPair: 0,
  openConn: 0,
  tbPlay: 0,
  tbSmallPair: 0,
  tbSC: 0,
  tbSCLow: 0,
  tbSuitedAce: 0,
  tbSuitedBw: 0,
  tbPlayStart: 0.1,
  tbPlayEnd: 0.2,
  tbOffHi: null,
  tbOffLo: null,
  tbAK4: 0,
  tbWheel4: 0,
  tbOffBluff4: null,
  premNoFold: 0,
  ctBehindTighten: null,
  ctBehindShiftMult: 1,
  mwTightenCheckedTo: null,
  checkedToShift: [0, 0, 0],
  // The stand-in adopts the tag's batch 15-16 fields (CEO, 18 Nov 2026: QA verified batch 15's grading with them).
  // test/heroprofile.test.js pins the whole profile, so any later change to the stand-in has to be deliberate.
  name: 'Exploitative baseline',
  share: 0,
  exploit: true,
  overLimp: 0.5,
  raiseBluff: [0.04, 0.025, 0.006],
  // mwOvercall comes from the tag, [0, .07, .10]: a solid player folds one pair more behind a bet
  // and a call (POOL, 13 Nov 2026).
  // POOL batch 18: the stand-in takes the tag's tpLabel 0.25 and valueMd 0.87 (STRAT and MATH, 18 Nov 2026, after
  // QA-VERDICT's budget-off flip check: 0.27% of grades); test/heroprofile.test.js names both
  tpLabel: 0.25,
  valueMd: 0.87,
  stabFoldCap: null, // POOL batch 19b: opponent-only until STRAT and MATH rule on the stand-in (batch 7-12 precedent)
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
  // POOL batch 8: a type's first-in opening order can favour suited hands, pairs and suited connectors over
  // offsuit high cards (a live regular's open); used for opens and isolation only, raisePct elsewhere
  if (P.openSuited || P.openPair || P.openConn) {
    const openScore = new Float64Array(CLASS_COUNT);
    for (let k = 0; k < CLASS_COUNT; k++) {
      const c = classInfo(k);
      openScore[k] = raiseScore[k] + (c.suited ? P.openSuited : 0) + (c.pair ? P.openPair : 0) + (c.suited && c.gap <= 2 && c.lo >= 3 ? P.openConn : 0);
    }
    P.openPct = percentiles(openScore);
  } else P.openPct = P.raisePct;
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
