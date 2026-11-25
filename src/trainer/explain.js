// Turns a judged decision into feedback: a leak category, a headline, the reasons, and a
// note on where the money-making play differs from what game theory would do.

import { STREET } from '../engine/game.js';
import { TIER, isRealDraw, handFeatures, boardTexture } from '../engine/features.js';
import { CATEGORY, evaluate } from '../engine/evaluator.js';
import { PROFILES, TYPE_IDS } from '../bots/profiles.js';
import { anchorStatus, needOf, drawTest, isoQuote, ISO_LIMP_PAIRS } from './grade.js';
import { classOf, classNames } from '../engine/hands.js';
import { isNotGradedNote } from './best.js';

export const CATEGORIES = {
  paidOff: 'Paying off: calling when their bet or raise is almost always the goods',
  overFold: 'Folding too much against players who bluff or bet light',
  badBluff: 'Bluffing players who do not fold',
  missedValue: 'Missed value: checking or just calling with a hand that should bet or raise',
  missedBluff: 'Passing up a profitable bet when everyone has shown weakness',
  overplay: 'Overplaying: betting or raising a hand that only gets called by better',
  sizeSmall: 'Sizing: betting too small',
  sizeBig: 'Sizing: betting too big',
  preLoose: 'Preflop: playing a hand that loses money in this spot',
  preVs3bet: 'Preflop: continuing against a re-raise when folding is better',
  preTight: 'Preflop: folding a hand that makes money in this spot',
  prePassive: 'Preflop: limping or calling when raising makes more',
  preRaise: 'Preflop: raising when calling or folding does better',
  chase: 'Chasing: calling with a draw at the wrong price',
  strongLimp: 'Limped strong hands',
  other: 'Strong hands: raising when calling or folding did better',
};

const pct = (x) => `${Math.round(100 * x)}%`;
// "Bet $30 (81% pot)" -> "Bet $30", for use inside a parenthesis (QA C5)
const bare = (o) => o.label.replace(/\s*\([^)]*\)\s*$/, '');

// R7 ("not a habit to build"): one line on why, per kind of play
// A habit play outside the bar keeps its reason on a fragile or unclear line (STRAT, Nov 2026), so a
// shove there is never presented as plainly fine.
// the habit's line; a draw overbet adds D2's advice as plain text, no estimate figures (STRAT YB-D2c (c), 19 Nov)
const drawAdvice = (key, d) => (key === 'drawOverbet' ? ` With a draw, ${d && d.toCall > 0 ? 'calling is cheaper' : 'bet smaller or check'}.` : '');
const habitWhy = (key, d) => (HABIT_WHY[key] ? HABIT_WHY[key] + drawAdvice(key, d) : '');
const habitTail = (v, d) => (v.habitOut && HABIT_WHY[v.habitOut] ? ` ${HABIT_WHY[v.habitOut].replace(/\.$/, '')}; not a habit to build.${drawAdvice(v.habitOut, d)}` : '');

const HABIT_WHY = {
  raiseCaller: 'A raise into a bettor and a caller is usually called by better.',
  drawRaise: 'A raise into a bettor and a caller is usually called by better.',
  passiveLead: 'One pair is rarely best when a passive player leads into a crowd.',
  drawStation: 'A bet with a draw into a player who does not fold wins only when it hits.',
  drawOverbet: 'An overbet with a draw into several players.',
  foldsBetter: 'A big bet here is a bluff with a pair: worse hands fold and the best ones call.',
};

function kind(a) {
  return a.type === 'raise' ? 'raise' : a.type;
}

// A bet or raise is a bluff only with a weak pair or worse and no real draw (STRAT, QA K6): jacks under
// a king are middle pair, played for value or protection, not bluffed.
const bluffy = (d) => d.tier !== null && d.tier <= TIER.WEAK_PAIR && !isRealDraw(d);

function categorise(d) {
  const v = d.verdict;
  const mine = v.options[v.mine];
  const best = v.options[v.best];
  const m = kind(mine);
  const b = kind(best);
  const facing = d.toCall > 0;
  const weak = d.tier !== null && d.tier <= TIER.MIDDLE_PAIR;
  if (d.street === STREET.PRE) {
    if (m === b && m === 'raise') return mine.to < best.to ? 'sizeSmall' : 'sizeBig';
    // facing a re-raise (a 3-bet or more), a call or a re-raise where folding is best (STRAT, CEO: hand 551)
    if (b === 'fold' && facing && d.raises >= 2 && (m === 'call' || m === 'raise')) return 'preVs3bet';
    if (b === 'fold') return 'preLoose';
    if (m === 'fold') return 'preTight';
    if (b === 'raise') return 'prePassive';
    return 'preRaise';
  }
  if (m === 'raise' && b === 'raise') return mine.to < best.to ? 'sizeSmall' : 'sizeBig';
  if (facing) {
    if (m === 'call' && b === 'fold') return weak && isRealDraw(d) ? 'chase' : 'paidOff';
    if (m === 'fold') return b === 'raise' && weak ? 'missedBluff' : 'overFold';
    if (m === 'raise') return bluffy(d) ? 'badBluff' : d.tier >= TIER.TWO_PAIR ? 'other' : 'overplay';
    if (m === 'call' && b === 'raise') return 'missedValue';
    return 'other';
  }
  // a river value check that left rule 6 (STRAT, PRO, CEO, 20 Nov) is missed value, whatever the pair
  if (m === 'check' && b === 'raise') return d.tier >= TIER.TOP_PAIR_WEAK || v.valueCheck ? 'missedValue' : 'missedBluff';
  if (m === 'raise' && b === 'check') return bluffy(d) ? 'badBluff' : 'overplay';
  return 'other';
}

// STRAT's 'preVs3bet' lines (spec v2, MATH's thresholds and short-stack amendment, CEO-approved 23 Nov), each true by
// construction from the facts measured at the decision (vs3bet.js): the range line (P >= 0.67), the reason (Price, Thin or
// Realisation), the set clause (pocket pairs, under 15x the call behind), and the 4-bet line (P >= 0.85).
const pctR = (x) => Math.round(100 * x);
function vs3betLines(d, v) {
  const f = d.vs3bet;
  if (!f) return [];
  const out = [];
  const mine = v.options[v.mine];
  const fold = v.options.find((o) => o.type === 'fold');
  const raiseWord = f.raises === 2 ? '3-bets' : `${f.raises + 1}-bets`;
  const an = /^[aeiou]/i.test(f.typeWord) ? 'An' : 'A';
  if (f.set && f.P >= 0.67) {
    out.push(`${an} ${f.typeWord} who ${raiseWord} ${f.overYours ? 'over your raise' : 'here'} ${f.P >= 0.85 ? 'almost always' : 'mostly'} has ${f.set}, about ${f.S}%.`);
  }
  // facing a shove the all-in line gives the price and there is no later street: no reason line, no set clause and no
  // position words here (QA P5-1)
  if (v.preShove) return out;
  const oop = !!(d.table && d.table.oop);
  const facts = (oop ? ', out of position' : '') + (f.behind > 4 * f.potAfter ? ', with a lot left to lose when behind' : '');
  if (mine.type === 'raise') {
    // a 4-bet: against an almost-all-strong range the hands that continue are ahead; otherwise a plain line (STRAT)
    // "almost all ahead" only when at least 80% of the range's combos leave hero under 45%; else "ahead or about even"
    // (STRAT, QA-VERDICT: AK or QQ against QQ+ and AK)
    const almost = f.aheadShare == null || f.aheadShare >= 0.8;
    out.push(f.P >= 0.85 ? (almost ? 'The hands that continue are almost all ahead of yours.' : 'The hands that continue are ahead of yours or about even with it.') : 'Re-raising here scores worse than folding against this range.');
  } else if (f.eq < f.need - 0.03) {
    out.push(`You need about ${pctR(f.need)}% to call, and this hand wins only about ${pctR(f.eq)}% against that range, even seeing all five cards.`);
  } else if (f.eq < f.need + 0.05) {
    out.push(`It's about break-even on paper, and you won't see all five cards for free${facts}.`);
  } else if (f.short) {
    // under 1.5x the pot behind the price is the all-in price and the Realisation line never prints (MATH); a hand well
    // above that price is neither break-even nor a realisation story, so a plain line that cannot be false (STRAT)
    out.push(`Against this range, the call scores worse than folding${facts}.`);
  } else {
    const back = fold ? Math.max(0, Math.round(f.call + (mine.ev - fold.ev))) : null;
    out.push(back === null ? `It wins about ${pctR(f.eq)}% if all the cards come, but it doesn't pay back what the call costs${facts}.` : `It wins about ${pctR(f.eq)}% if all the cards come, but playing it out returns only about $${back} of the $${f.call} it costs${facts}.`);
  }
  // the set clause: pocket pairs with too little behind to be paid for a set
  const pair = d.hole && d.hole.length === 2 && d.hole[0] >> 2 === d.hole[1] >> 2;
  // only with at least 2x the call behind: no 'about 0 times' or '1 times' (STRAT)
  if (pair && mine.type === 'call' && f.behind >= 2 * f.call && f.behind < 15 * f.call) {
    const n = Math.round((10 * f.behind) / f.call) / 10;
    out.push(`With only about ${n} times the call left behind, hitting a set doesn't pay enough${oop ? ", and you'd play the rest out of position" : ''}.`);
  }
  return out;
}

function readLine(d) {
  const vil = d.villain;
  if (!vil || !vil.picture) return null;
  const post = vil.picture.post;
  let top = 0;
  for (let t = 1; t < post.length; t++) if (post[t] > post[top]) top = t;
  const name = PROFILES[TYPE_IDS[top]].name.toLowerCase();
  const p = post[top];
  let conf;
  if (p >= 0.75) conf = `By now ${vil.nick} plays like a ${name}`;
  else if (p >= 0.5) conf = `${vil.nick} is most likely a ${name} (about ${pct(p)})`;
  else conf = `You do not have a firm read on ${vil.nick} yet (best guess: ${name}, ${pct(p)}), so this is judged against the mix of players they could be`;
  if (vil.steaming) conf += ', and they are steaming';
  return conf + '.';
}

function rangeLine(d) {
  const vil = d.villain;
  if (!vil || !vil.picture || !vil.picture.buckets) return null;
  const b = vil.picture.buckets;
  const strong = b.monster + b.strong + b.twoPair;
  const parts = [];
  const pairedBoard = new Set(d.board.map((c) => c >> 2)).size < d.board.length;
  // a board that alone makes two pair or better (STRAT, DESIGN, 20 Nov): parts by what each hand really holds
  const bp = vil.picture.boardParts;
  if (bp) {
    for (const [label, x] of bp) if (x >= 0.03) parts.push(`${pct(x)} ${label}`); // parts under 3% left out (DESIGN)
  } else {
    parts.push(pairedBoard ? `${pct(strong)} trips or better (or two pair without the board's help)` : `${pct(strong)} two pair or better`);
    parts.push(`${pct(b.topPair)} top pair or an overpair`);
    if (b.weakPair >= 0.03) parts.push(`${pct(b.weakPair)} weaker pairs`);
    if (b.draw >= 0.03) parts.push(`${pct(b.draw)} draws`);
    parts.push(`${pct(b.air)} nothing`);
  }
  const verb = d.toCall > 0 ? (d.raises >= 2 ? 'raises' : 'bets') : 'gets here';
  let s = `When ${vil.nick} ${verb} like this, the hands that fit are roughly: ${parts.join(', ')}.`;
  // the same effective price as the coach's estimate (all-in capped; STRAT F6)
  const A = d.verdict && d.verdict.anchors;
  const price = A && A.price !== undefined ? A.price : d.odds;
  if (d.toCall > 0 && d.street === STREET.RIVER && d.opponents >= 2) {
    // one player's range is not the call's: the others still in make it worse (STRAT C3, on the river too)
    const others = d.opponents - 1;
    s += ` Against ${vil.nick}'s range alone your hand beats ${pct(vil.picture.aheadNow)}; the ${others === 1 ? 'other player' : `${NUM_WORDS[others] || others} others`} still in make${others === 1 ? 's' : ''} it worse.`;
  } else if (d.toCall > 0 && d.street === STREET.RIVER) {
    s += ` Your hand beats ${pct(vil.picture.aheadNow)} of that; a call needs ${pct(price)}.`;
  } else if (d.toCall > 0) {
    // before the river the figure is E, what you'd win if it went to showdown, never the share ahead right now set
    // against the price (MATH, STRAT, CEO); multiway it is against this one range, never set against the price
    const ro = d.verdict && d.verdict.runout && d.verdict.runout.seat === vil.seat ? d.verdict.runout : null;
    const others = d.opponents - 1;
    if (!ro) {
      // no figure without E (an old record): never the share ahead now beside the price
    } else if (d.opponents >= 2) {
      s += ` Against ${vil.nick}'s range alone you'd ${winWords(ro.E).verb}; the ${others === 1 ? 'other player' : `${NUM_WORDS[others] || others} others`} still in make${others === 1 ? 's' : ''} it worse.`;
    } else {
      s += ` You'd ${winWords(ro.E).verb}${winWords(ro.E).and}the price needs ${share(price, false)}.`;
      // a money-in flag before the river: the later bets are what make the call lose (QA YB-2)
      if (d.verdict.rule === 'moneyIn' && ro.E >= price) s += ' The bets still to come cost more than that edge is worth.';
    }
  }
  return s;
}

// Who the theory line is about: "a calling station" with a firm read (0.5 or more), else "this player" or
// "these players" (STRAT_THEORY_COPY).
const SHORT_NAME = { nit: 'nit', abc: 'straightforward player', station: 'calling station', whale: 'gambler', maniac: 'maniac', gto: 'solver-style player', tag: 'solid regular', lag: 'tricky aggressive regular', beginner: 'total beginner' };
function whoOf(d) {
  const post = d.villain && d.villain.picture && d.villain.picture.post;
  if (d.opponents === 1 && post) {
    let top = 0;
    for (let t = 1; t < post.length; t++) if (post[t] > post[top]) top = t;
    if (post[top] >= 0.5) {
      const nm = SHORT_NAME[TYPE_IDS[top]];
      return { who: `${/^[aeiou]/.test(nm) ? 'an' : 'a'} ${nm}`, plural: false };
    }
  }
  return d.opponents === 1 ? { who: 'this player', plural: false } : { who: 'these players', plural: true };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Dry: no suit twice before the river, and no three board cards inside a five-rank window (ace high and low).
export function dryBoard(board, river) {
  if (!river) {
    const suits = board.map((c) => c & 3);
    if (new Set(suits).size < suits.length) return false;
  }
  const ranks = [...new Set(board.map((c) => c >> 2))];
  if (ranks.includes(12)) ranks.push(-1);
  for (let lo = -1; lo <= 8; lo++) if (ranks.filter((r) => r >= lo && r <= lo + 4).length >= 3) return false;
  return true;
}
// Top two (the board's two highest ranks, one card each) or top set (a pocket pair of the board's top rank).
export function blockerHand(hole, board) {
  const br = [...new Set(board.map((c) => c >> 2))].sort((a, b) => b - a);
  const hr = hole.map((c) => c >> 2);
  if (hr[0] === hr[1] && hr[0] === br[0]) return 'set';
  if (br.length >= 2 && hr.includes(br[0]) && hr.includes(br[1]) && hr[0] !== hr[1]) return 'two';
  return null;
}
function callsWith(d) {
  const b = d.villain && d.villain.picture && d.villain.picture.buckets;
  const parts = [];
  if (b && b.weakPair >= 0.1) parts.push('weaker pairs');
  if (b && b.draw >= 0.1) parts.push('draws');
  return parts.length ? parts.join(' and ') : 'worse hands';
}

const THEORY = {
  paidOff:
    'Why theory disagrees: a solver calls here with a hand this strong so that it cannot be bluffed. That protection is worth nothing against a player who does not bluff in this spot. Fold and lose nothing.',
  overFold:
    'Why theory disagrees: against a balanced range this is a routine fold. This player bets and raises far more weak hands than a balanced player would, so your hand is good often enough to continue.',
  badBluff:
    'Why theory disagrees: solvers bluff here at some frequency because solver opponents fold the right amount. These players call too much, so the bluff loses money however good the story is.',
  missedValue:
    'Why theory disagrees: checking to protect your checking range or control the pot only matters against opponents who attack weakness. Against players who call too wide and rarely bluff, a good hand should simply bet.',
  missedBluff:
    'Why theory disagrees: a solver would also bet some of the time here, but it worries about being check-raised. When several players check and this pool so rarely traps, a bet takes the pot down often enough to show a profit.',
  overplay:
    'Why theory disagrees: thin value bets and raises are fine against opponents who call with worse. When the players left in the pot only continue with hands that beat you, the bet just builds a pot you lose.',
  sizeSmall:
    'Why theory disagrees: solvers like small bets with their whole range on many boards. Callers here pay the same hands at a bigger price, so the small size leaves money behind.',
  sizeBig:
    'Why theory disagrees: big sizes are for polarised ranges against opponents who must call some of the time. Here the big size folds out the worse hands you wanted to keep in.',
  preLoose:
    'Why theory disagrees: charts built for raked online six-max or tournament play defend and open wider than this. At a full table, raked, and headed for a multiway pot, this hand does not earn its way in.',
  preVs3bet: "Why theory disagrees: a solver calls here, because its 3-bets include many weaker hands. This player's don't.",
  preTight:
    'Why theory disagrees: a tight chart folds this, but the callers at this table play so badly after the flop that the hand shows a profit here.',
  prePassive:
    'Why theory disagrees: calling keeps your range balanced and the pot small. At this table a raise gets called by worse hands and thins the field, which is worth more.',
  preRaise:
    'Why theory disagrees: solvers 3-bet and 4-bet a mix of value and bluffs. Against a player whose re-raising range is this strong, or who never folds to a raise, the raise gains nothing.',
  chase:
    'Why theory disagrees: draws call when later bets will pay them off. The price here was too high for how often you get there and how much more you can win.',
  other: null,
};

// STRAT (YB-T1 vs U1): a board that devalues a hand below a straight takes it out of the "strong hand for value"
// copy: four to a straight, four of a suit, or three of a suit with three to a straight. Two edges (STRAT): on four of
// a suit a straight is guarded too (a flush is not); and a hand that only plays the board counts as below a straight
export function t1Board(hole, board) {
  if (!Array.isArray(hole) || !Array.isArray(board) || board.length < 3) return true;
  const t = boardTexture(board);
  let cat = handFeatures(hole, board).cat;
  if (board.length === 5) {
    if (evaluate([...hole, ...board]) === evaluate(board)) cat = Math.min(cat, CATEGORY.TRIPS); // the hero plays the board
  }
  const guardUpTo = t.maxSuit >= 4 ? CATEGORY.STRAIGHT : CATEGORY.TRIPS; // the highest category the guard covers
  // STRAT (YB-T1 item 2, CEO 24 Nov): on four of a suit a low flush is guarded too, when two or more ranks of that suit
  // that are neither on the board nor in the hand sit above the hero's highest card of the suit (copy only)
  if (t.maxSuit >= 4 && cat === CATEGORY.FLUSH) {
    const count = [0, 0, 0, 0];
    for (const c of board) count[c & 3]++;
    const suit = count.indexOf(Math.max(...count));
    const mine = hole.filter((c) => (c & 3) === suit).map((c) => c >> 2);
    if (mine.length) {
      const top = Math.max(...mine);
      const seen = new Set([...board, ...hole].filter((c) => (c & 3) === suit).map((c) => c >> 2));
      let above = 0;
      for (let r = top + 1; r <= 12; r++) if (!seen.has(r)) above++;
      if (above >= 2) return false;
    }
  }
  if (cat > guardUpTo) return true;
  return !(t.connected >= 4 || t.maxSuit >= 4 || (t.maxSuit >= 3 && t.connected >= 3));
}

// A note on a fine (or not graded) verdict never hides a gap above the yellow bar behind "a little",
// "about the same" or "scores higher": it states the dollar figure, rounded as the bars show it
// (STRAT, QA Q1, Nov 2026). `v.small` is the yellow bar the guardrails used.
// The read under which a fragile verdict's gap is smallest (the scenario test's scenGaps), in words (STRAT, CEO)
const FLIP_WORDS = {
  'calls-5': 'if this player calls a little less often',
  'calls+5': 'if this player calls a little more often',
  'thin hero': 'if you play the rest of the hand more cautiously',
  'ranges x2': 'if their hands are stronger than we read',
  'ranges x0.5': 'if their hands are weaker than we read',
};
function flipRead(v) {
  const gs = (v.scenGaps || []).filter((x) => x.label !== 'base' && FLIP_WORDS[x.label]);
  if (!gs.length) return '';
  const m = gs.reduce((a, x) => (x.gap < a.gap ? x : a), gs[0]);
  const g = Math.round(m.gap);
  return `${FLIP_WORDS[m.label]}, ${g <= 0 ? 'yours does as well or better' : `the gap is only about $${g}`}`;
}

function goodHeadline(v, mine, best, d = {}) {
  const gap = (o) => Math.max(0, Math.round(o.ev) - Math.round(mine.ev));
  const bar = () => v.small || 0; // the yellow bar, the same for every option here (QA E4)
  const top = v.options.reduce((a, o) => (o.ev > a.ev ? o : a), v.options[0]);
  // "scores about $X more", or the fallback wording when the gap is within the bar
  const more = (o, within) => (gap(o) > bar(o) || !within ? (gap(o) > 0 ? `scores about $${gap(o)} more` : 'scores about the same') : within);
  const who = d.opponents === 1 ? 'this player' : 'these players';
  // STRAT YB-T2: the "scores more" clause names the option that really scores highest; the same kind of play at
  // another size is "a bigger bet, about $X" (or smaller)
  const topName = () => {
    if (top.type === 'raise' && mine.type === 'raise' && top !== mine) {
      const amt = d.toCall > 0 ? `to about $${Math.round(top.to)}` : `about $${Math.round(top.to - (d.currentBet || 0))}`;
      const kind = d.toCall > 0 ? 'raise' : 'bet';
      return `A ${top.to > mine.to ? 'bigger' : 'smaller'} ${kind}, ${amt},`;
    }
    return bare(top);
  };
  // STRAT YB-T1: a two-pair-or-better bet or raise, against players all read as passive, where checking scores
  // highest: never advise the trap with a dollar figure (checking-to-trap rests on them betting for you)
  // STRAT's ruling on YB-T1 vs U1 (18 Nov; at the bar, 19 Nov): only when the check's gap is strictly under the yellow
  // bar (a gap at or above it is always stated, U1's figure), and never on a board that devalues the hand (t1Board)
  const PASSIVE = ['abc', 'station', 'nit', 'beginner', 'whale'];
  const passiveTrap = mine.type === 'raise' && top.type === 'check' && (d.tier ?? -1) >= TIER.TWO_PAIR && Array.isArray(d.liveTypes) && d.liveTypes.length > 0 && d.liveTypes.every((t2) => PASSIVE.includes(t2)) && gap(top) < bar() && t1Board(d.hole, d.board);
  // PRO's words for a TT-type re-raise when calling scores more (STRAT_YELLOW_BAND B), ahead of any tip
  if (v.note === 'iso3bet') return `${mine.label}: fine. Against this player, calling scores a bit higher: it keeps their bluffs in. Re-raising to isolate is also standard.`;
  if (v.tip) return `${mine.label}: fine.`; // the tip line underneath says what a raise would do
  // ...unless the scenario test left it not graded (R5b goes through it since P3-1): then the not-graded line
  // any not-graded note (the shared set) takes its not-graded line (QA-VERDICT: fragileRead read "fine" under a
  // "not graded" word and card)
  if (v.rule === 'R5b' && !isNotGradedNote(v)) return `${mine.label}: fine. (When a passive player leads into a crowd, one pair is often beaten.)`; // STRAT M5c
  if (v.note === 'premium') return `${mine.label}: fine. (Raising with this hand is never a mistake.)`;
  if (v.note === 'anchorHabit' || v.note === 'anchorEven' || v.note === 'sizePeak') return `${mine.label}: fine.`;
  if (v.note === 'anchorFails') {
    // "gives up less" only when it scores below the reference (STRAT F4)
    // over a break-even line it "only breaks even", never "does not work" (QA-VERDICT YB-V4b)
    // the reason follows the line shown: a break-even line (status even, or folds and need rounding to the same
    // 5%) gets STRAT's even wording (YB-6b)
    if (mine.ev < best.ev) return mine.st === 'even' || /about breaks even|That is thin/.test(anchorLine(d) || '')
      ? `${mine.label}: fine. (It gives up less than the coach flags, and by the estimate below it about breaks even.)`
      : `${mine.label}: fine. (It gives up less than the coach flags, but by the estimate below it does not work.)`;
    // "scores higher" only when it is the judge's best with no option too close to tell apart
    const higher = v.options.every((o) => o.ev <= mine.ev) && !mine.close;
    return `${mine.label}: fine. It ${higher ? 'scores higher' : 'is close to the best'} against these players, but by the estimate below it only works if they keep playing this way; ${bare(best).toLowerCase()} is the standard play.`;
  }
  if (v.note === 'anchor') {
    // the bars' gap stated, then why it is not flagged (QA F2), in words that match the estimate line under
    // it: only an "even" veto is "close" (STRAT YB-6); with no line under it, nothing cites one
    const from = v.anchorWhy === 'A2' && v.options[v.anchorFrom] ? v.options[v.anchorFrom] : null;
    // the option the veto is about (the reference, or A2's unsupported play), and the clause naming the top option
    const alt = from || (gap(best) > 0 && best !== mine ? best : top);
    if (passiveTrap) return `${mine.label}: fine. (Betting a strong hand for value is the standard play against these players. Checking to trap scores about the same against these bots, but it relies on them betting for you.)`;
    const bars = gap(top) > 0 && top !== mine ? `${topName()} ${more(top)} against these bots, but ` : '';
    const lined = !!anchorLine(d);
    // A2 (STRAT, YB-V4b): "the coach's estimate below" only when the line below is about the option it names;
    // otherwise the unsupported play is named plainly, and the comparison that decides the grade is its own sentence
    if (from && lined) {
      const named = (anchorLine(d) || '').match(/^A bet of \$(\d+):/);
      const lineAbout = from === mine || (named && from.type === 'raise' && Math.round(from.to - (d.currentBet || 0)) === +named[1]);
      const ing = { fold: 'folding', check: 'checking', call: 'calling' }[mine.type] || 'this';
      const lead = bars;
      const it = from === top ? 'it' : bare(from).toLowerCase();
      if (!lineAbout) return `${mine.label}: fine. (${lead ? `${lead}${it}` : bare(from)} is not a play that works against anyone here. Against ${bare(best).toLowerCase()}, ${ing} gives up too little to flag.)`;
      const w = `by the coach's estimate below ${it} does not work; against ${bare(best).toLowerCase()} this gives up too little to flag`;
      return `${mine.label}: fine. (${lead ? lead + w : w[0].toUpperCase() + w.slice(1)}.)`;
    }
    if (!lined) return gap(top) > 0 && top !== mine ? `${mine.label}: fine. (${topName()} ${more(top)} against these bots, but it is not flagged.)` : `${mine.label}: fine.`;
    const playWord = mine.type === 'call' ? 'call' : d.toCall > 0 ? 'raise' : 'bet';
    let why;
    if (v.anchorWhy === 'works') why = `by the coach's estimate below your ${playWord} works, so it is not flagged`;
    else if (v.anchorWhy === 'fails') why = `by the coach's estimate below ${bare(alt).toLowerCase()} does not work here, so this is not flagged`;
    else if (v.anchorWhy === 'A2') why = `by the coach's estimate below it does not work; against ${bare(best).toLowerCase()} this gives up too little to flag`;
    else why = "by the coach's estimate below this is close, so it is not flagged";
    return `${mine.label}: fine. (${bars ? bars + why : why[0].toUpperCase() + why.slice(1)}.)`;
  }
  // STRAT YB-T1, the scenario test's form: the grading state kept, no figure for the check
  if (passiveTrap && v.note === 'unclear') return `${mine.label}: not graded. Betting a strong hand for value is the standard play against these players; checking to trap scores about the same here.`;
  if (passiveTrap && v.note === 'fragileRead') return `${mine.label}: not graded. (Betting a strong hand for value is the standard play against these players; checking to trap scores about the same here.)`;
  if (passiveTrap && v.note === 'fragile') return `${mine.label}: fine. (Betting a strong hand for value is the standard play against these players; checking to trap scores about the same here.)`;
  if (v.note === 'closeCall') return `${mine.label}: not graded.`;
  if (v.note === 'preSize') return `${mine.label}: fine. (${bare(best)} ${more(best, 'scores about the same')}; using one size with all your hands is the better habit.)`;
  if (v.note === 'semiBluff') return `${mine.label}: fine. (With a draw this good, betting is standard against players who can fold.)`;
  if (v.note === 'flatOk') return `${mine.label}: fine. (Re-raising also works here.)`;
  if (v.note === 'callAlso') return `${mine.label}: fine. (Calling also works here.)`;
  if (v.note === 'callOne3bet') return `${mine.label}: fine. (A re-raise from this kind of player is usually a big pair: calling once is fine, stacking off unimproved is not.)`;
  if (v.note === 'thinValue') {
    if (!v.thin) return `${mine.label}: fine.`;
    // K2/K3: the real figure, rounded as the table shows it; "a little" only below the yellow bar
    const by = v.thin.small || !(v.thin.gain > 0) ? 'rates a little higher' : `does about $${v.thin.gain} better`;
    return `${mine.label}: fine. (${v.thin.nick ? `Against ${v.thin.nick}, a bet` : 'A bet'} of about ${v.thin.size} ${by}.)`;
  }
  // "scores higher" only when it does; within the yellow bar but lower, "close to the best play" (QA M1)
  if (v.note === 'mwHabit') return `${mine.label}: fine. (${v.habitHigher ? 'It scores higher against these opponents; not a habit to build.' : 'It is close to the best here, but not a habit to build.'}${HABIT_WHY[v.habit] ? ' ' + habitWhy(v.habit, d) : ''})`;
  if (v.note === 'mwCheck') {
    const m = v.mw || {};
    const whoBet = v.thin && v.thin.nick ? `Against ${v.thin.nick}, a bet` : 'A bet';
    return `${mine.label}: fine. (${whoBet} of about $${m.to ?? bare(best).replace(/^\D+/, '')} does about $${Math.max(0, m.gain || 0)} better here. With ${m.players || 'several'} players in, a check is defensible; a bet is the more profitable habit.)`;
  }
  if (v.note === 'mwDraw') return `${mine.label}: fine. (With a draw and several players in, checking or calling is standard; ${bare(best).toLowerCase()} ${more(best)} against these opponents.)`;
  if (v.note === 'mwSize') return `${mine.label}: fine. (A bigger bet ${more(top, 'rates a little higher')}, but with several players in and this hand, a small bet is reasonable.)`;
  if (v.note === 'tinyPot') return `${mine.label}: fine. (A bet ${more(best, 'rates a little higher')}, but in a pot this small it is not worth a flag.)`;
  if (v.note === 'foldsBetter') return `${mine.label}: fine. (Worse hands won't call a bet here, so it would only be a bluff; with a pair, checking to showdown is the habit to keep.)`;
  if (v.note === 'passiveFold') return `${mine.label}: fine. (When a passive player leads into a crowd, one pair is often beaten.)`;
  if (v.note === 'unclear') {
    // labelled "not graded", not "fine"
    const g = gap(best);
    // your play trails the reference by the bar on our read: say which way the read leans, and what
    // changes it (STRAT, the owner's report, 14 Nov; invariant U1)
    if (best !== mine && g >= bar(best) * (best.type === mine.type ? 1.6 : 1)) {
      const flip = v.flip >= 0 ? v.options[v.flip] : null;
      const them = d.opponents === 1 ? 'this player calls' : 'these players call';
      const refName = best.type === 'check' ? 'a check' : best.type === 'fold' ? 'folding' : best.type === 'call' ? 'a call' : bare(best).toLowerCase();
      if (flip && flip.type === 'raise' && flip.to !== mine.to) {
        const big = /^All-in/.test(flip.label) || (flip.to - (d.currentBet || 0)) >= (2 / 3) * Math.max(1, v.pot);
        return `${mine.label}: not graded. On our read ${refName} is better by about $${g}. If ${them} a little differently, a ${big ? 'big' : 'small'} ${d.toCall > 0 ? 'raise' : 'bet'} does better instead, so we don't grade it.${habitTail(v, d)}`;
      }
      return `${mine.label}: not graded. On our read ${refName} is better by about $${g}, but that changes if ${them} a little differently, so we don't grade it.${habitTail(v, d)}`;
    }
    return `${mine.label}: not graded. ${g > 0 && best !== mine ? `${bare(best)} scores about $${g} more on our read; the` : 'The'} best play changes with small differences in how ${who} play${d.opponents === 1 ? 's' : ''}.${habitTail(v, d)}`;
  }
  if (v.note === 'checkOOP') return `${mine.label}: fine. (With several players or the preflop raiser still to act behind you, checking one pair is standard.)`;
  if (v.note === 'sizeCheck') return `${mine.label}: fine. (A bet of up to three-quarters of the pot ${more(best, 'rates about the same')}.)`;
  if (v.note === 'callPrice') return `${mine.label}: fine. (Folding ${more(best, 'rates a little higher')}, but this call can only cost its price; later decisions are graded when you make them.)`;
  // "bluff" only when the top play does not win when called as often as it needs, for every hand (STRAT, 20 Nov;
  // board-made hands, MATH)
  const bluffWord = (o) => (o.W !== null && o.W !== undefined && o.need !== null && o.need !== undefined && o.W >= o.need ? null : 'bluff');
  if (v.note === 'bluffRaise') return `${mine.label}: fine. (A ${bluffWord(top) ? 'bluff-raise' : 'raise'} ${more(top)} against these bots, but that only works on bots; it is not a habit to build.)`;
  if (v.note === 'overbet') return `${mine.label}: fine. (A bet bigger than the pot ${more(top)} against these bots; a pot-sized bet or smaller is all you are held to.)`;
  if (v.note === 'preBluff') return `${mine.label}: fine. (A light re-raise ${v.preHigher ? 'scores higher' : 'is close to the best'} against these bots; it is not a habit to build.)`; // STRAT M3
  if (v.note === 'preFold') return `${mine.label}: fine.`;
  if (v.note === 'sizeOk') {
    // the range over the bigger sizes that score more, and why
    const bigger = v.options.filter((o) => o.type === 'raise' && o.to > mine.to && gap(o) > 0).map(gap);
    const lo = Math.min(...bigger);
    const hi = Math.max(...bigger);
    const frac = mine.to / Math.max(1, v.pot);
    const SIZES = [[1 / 3, 'a third of the pot'], [0.5, 'half pot'], [2 / 3, 'two-thirds of the pot'], [0.75, 'three-quarters of the pot'], [1, 'a pot-sized bet']];
    const size = SIZES.reduce((a, x) => (Math.abs(x[0] - frac) < Math.abs(a[0] - frac) ? x : a))[1]; // the nearest name (STRAT N4)
    const into = d.opponents >= 2 ? ` into ${NUM_WORDS[d.opponents] || d.opponents} players` : '';
    if (!bigger.length) return `${mine.label}: fine. (This is a sound value size${into}.)`;
    return `${mine.label}: fine. (Bigger bets score about ${lo === hi ? `$${lo}` : `$${lo}–${hi}`} more against these opponents, mostly because they call too often; ${size} is a sound value size${into}.)`;
  }
  // STRAT, CEO (thin-value copy): a passed river bet the headline names reads as value when its win rate once raises
  // are counted (wNet, as valueBet) reaches its need: thin under need + 0.10, clear value above. Under need it keeps
  // the line below, where bluffWord still reads W (a bet that wins when called but loses to raises is "a bet")
  const seenTop = (top.C || 0) + (top.R || 0);
  const wNet = top.W == null || top.need == null ? null : seenTop > 0 ? (top.W * (top.C || 0)) / seenTop : top.W;
  if (v.note === 'passedBluff' && d.street === STREET.RIVER && wNet !== null && wNet >= top.need) {
    if (wNet < top.need + 0.1) return `${mine.label}: fine. (A thin value bet ${more(top)}; once raises are counted it barely wins often enough, so checking is fine.)`;
    return `${mine.label}: fine. (A value bet ${more(top)}; it wins clearly more often than it needs when called, so betting is the better habit.)`;
  }
  if (v.note === 'riverBluff' || v.note === 'passedBluff') return `${mine.label}: fine. (A ${bluffWord(top) || 'bet'} ${more(top)} against these bots; not enough to rely on at a real table.)`;
  // STRAT, CEO (fragile label fix): the scenario test's own fragile (fragileRead) is not graded and names the read that
  // flips it; the other two fragile passes stay 'fine' and no longer say "not graded" (they contradicted themselves)
  // STRAT, CEO: an R5b call the scenario test leaves not graded keeps R5b's reason after the scenario
  const r5bWhy = v.rule === 'R5b' && v.habitOut !== 'passiveLead' ? ' When a passive player leads into a crowd, one pair is often beaten.' : '';
  if (v.note === 'fragileRead') return `${mine.label}: not graded. (${bare(best)} ${more(best)} on our read of ${who}, but not under every reasonable read${flipRead(v) ? `: ${flipRead(v)}` : ''}.${habitTail(v, d)}${r5bWhy})`;
  if (v.note === 'fragile') return `${mine.label}: fine. (${bare(best)} ${more(best, 'rates about the same')} on our read of ${who}.${habitTail(v, d)})`;
  if (v.mine !== v.best) return `${mine.label}: fine. (${bare(best)} ${more(best, 'rates about the same')}.)`;
  // ...never naming a play the coach does not teach here (R7 habits: the reference already leaves them out; STRAT, F10)
  if (gap(top) > bar(top) && v.ref !== 'habit') return `${mine.label}: fine. (${bare(top)} ${more(top)} on our read, but the coach does not hold you to it here.)`;
  // "about the same" only within the bar (1.6 times it for the same kind of play), whatever the close marks say (STRAT, QA-VERDICT V13)
  const rivals = v.options.filter((o, i) => i !== v.best && o.close && Math.abs(Math.round(o.ev) - Math.round(mine.ev)) <= (v.small || 0) * (o.type === mine.type ? 1.6 : 1));
  if (!rivals.length) return `${mine.label}: fine.`; // "best play" only under the ring (bestHeadline replaces this then; STRAT F2)
  return `${mine.label}: good. (${rivals.length === 1 ? bare(rivals[0]) + ' rates' : 'Other options rate'} about the same.)`;
}
const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

// ---- the anchors' line (MATH_BASELINE_SPEC 4; the live pro's wording) ----
// Percentages to the nearest 5; "almost never" / "almost always" at the ends; what you get, then what
// you need; "ahead right now" before the river. Shown under flags, notes, vetoes and not-graded
// decisions only; never under a play a rule-based note overrules (R5, R5b, R7).
// Shares in words (QA F3): rounded to the nearest 5, and below 5% / above 95% in words that fit the
// sentence, never a number outside 5-95 and never "almost never of the time".
//  often(x):  "about 45% of the time" | "almost never" | "almost always"   (how often something happens)
//  share(x):  "about 45%" | "almost nothing" | "almost all of it"           (what a play needs or gets)
const r5 = (x) => Math.round(Math.max(0, Math.min(1, x)) * 20);
export const often = (x) => (x < 0.05 ? 'almost never' : x > 0.95 ? 'almost always' : `about ${r5(x) * 5}% of the time`);
export const share = (x, about = true) => (x < 0.05 ? 'almost nothing' : x > 0.95 ? 'almost all of it' : `${about ? 'about ' : ''}${r5(x) * 5}%`);
// "ahead about 70% of the time" / "almost never ahead" / "almost always ahead"
const aheadP = (x, now) => (x < 0.05 ? `almost never ahead${now}` : x > 0.95 ? `almost always ahead${now}` : `ahead${now} ${often(x)}`);
// "everyone folds about 45% of the time" / "almost no one folds" / "nearly everyone folds"
const foldsP = (x, only = false) => (x < 0.05 ? 'almost no one folds' : x > 0.95 ? 'nearly everyone folds' : `everyone folds ${only ? 'only ' : ''}${often(x)}`);
const LINE8A = 'Close. The price is right for a call, but the bets still to come take most of that back. Nothing here is graded.';
const LINE8B = 'Close. A raise with another player in the pot is usually a strong hand. Calling and folding are both reasonable; nothing here is graded.';
const LINE9 = 'Bigger bets score higher only because these opponents call any size. Use half to three-quarters of the pot; bigger is not required.';

// "an ace or a king": your hole cards above the board's top card, in words
const RANK_WORD = { A: 'an ace', K: 'a king', Q: 'a queen', J: 'a jack', T: 'a ten', 9: 'a nine', 8: 'an eight', 7: 'a seven', 6: 'a six', 5: 'a five', 4: 'a four', 3: 'a three' };
function overcardWords(d) {
  if (!d.hole || !d.board || !d.board.length) return null;
  const top = Math.max(...d.board.map((c) => c >> 2));
  const over = [...new Set(d.hole.filter((c) => c >> 2 > top).sort((a, b) => b - a).map((c) => '23456789TJQKA'[c >> 2]))];
  return over.length ? over.map((r) => RANK_WORD[r]).join(' or ') : null;
}

// The call or fold line before the river, facing a bet (STRAT's final strings, MATH's build note; CEO): E, what you'd
// win if it went to showdown, against the price. Which ending shows follows the verdict (the better of call and fold,
// or close when not graded or the two can't be told apart), never the anchors' works/even/fails. The variant (E >= P or
// E < P) is chosen on the unrounded E; figures print rounded as everywhere else. Heads-up only (one opponent with money
// in on this street); multiway, E is against the bettor's range alone and never set against the price. Without E (an
// old record) the line keeps the price and the ending, with no figure for the hand.
// A bet or raise line's share of the callers you beat (STRAT): "about 60%", "almost none", "almost all", with " of the
// callers" when asked and "right now" before the river
function beatOf(W, of, river) {
  const rn = river ? '' : ' right now';
  if (W < 0.05) return `almost none${of ? ` of${of}` : ''}${rn}`;
  if (W > 0.95) return `almost all${of ? ` of${of}` : ''}${rn}`;
  return `${share(W)}${of ? ` of${of}` : ''}${rn}`;
}

export function runoutLine(d, v, A) {
  const ro = v.runout || null;
  const need = share(A.price, false);
  const call = v.options.find((o) => o.type === 'call');
  const fold = v.options.find((o) => o.type === 'fold');
  const callBest = call && (!fold || call.ev >= fold.ev);
  // close: not graded, or the other of call and fold is too close to the best to tell apart
  const other = callBest ? fold : call;
  // never "Fold." under a fine call or "Call." under a fine fold: the estimate says it is close (STRAT M1)
  const mineT = v.mine >= 0 && v.options[v.mine] ? v.options[v.mine].type : null;
  const against = v.grade === 'good' && ((mineT === 'call' && !callBest) || (mineT === 'fold' && callBest));
  const close = isNotGradedNote(v) || against || !!(other && other.close);
  // a call keeps the raise tail for a pair up to an overpair or top pair, top kicker (STRAT)
  const raiseTail = (d.tier ?? -1) >= TIER.WEAK_PAIR && (d.tier ?? -1) <= TIER.OVERPAIR_TPTK ? ' Raising gets called mostly by better hands.' : '';
  const end = close ? ': close.' : callBest ? `. Call.${raiseTail}` : '. Fold.';
  const nick = d.villain ? d.villain.nick : 'the bettor';
  if (!ro) return `The price needs ${need}${end}`;
  const W = winWords(ro.E);
  if (!ro.hu) return `Against ${nick}'s range alone you'd ${W.verb}; the others still in make it worse${end}`;
  if (share(ro.E, false) === need) return `You'd ${W.verb}, about what the price needs${end}`;
  const base = `You'd ${W.verb}${W.and}need ${need}`;
  if (close) return `${base}: close.`;
  const { who } = whoOf(d);
  if (!callBest && ro.E >= A.price) return d.table && d.table.oop ? `${base}, but out of position against ${who} you won't get there often enough. Fold.` : `${base}, but the bets still to come from ${who} cost more than that edge. Fold.`;
  if (!callBest) {
    // the numbers agree with the fold: the bettor's range sentences stay (STRAT F1, POOL batch 12)
    const rk = rangeKind(d);
    if (rk === 'real') return `${base}; not enough. Good players bluff just enough to make this close. This player's bets are nearly always real. Fold.`;
    if (rk === 'loose') return `Even against a player who bluffs this often, you'd ${ro.E < 0.05 ? W.verb : `win only ${share(ro.E, false)} if it went to showdown`}${W.and}need ${need}. Fold.`;
    return `${base}; not enough. Fold.`;
  }
  // E short of the price with a call best: a real draw pays when it hits; a made hand wins more on later streets (STRAT)
  if (ro.E < A.price) return d.realDraw ? `${base}, but when you hit, ${who} pays you enough to make up the rest. Call.${raiseTail}` : `${base}, but what you win on later streets makes up the rest. Call.${raiseTail}`;
  return `${base}. Call.${raiseTail}`;
}
// "win about 30% if it went to showdown"; at the ends "almost never win" / "almost always win", then ", and need" (STRAT)
function winWords(E) {
  if (E < 0.05) return { verb: 'almost never win if it went to showdown', and: ', and ' };
  if (E > 0.95) return { verb: 'almost always win if it went to showdown', and: ', and ' };
  return { verb: `win ${share(E)} if it went to showdown`, and: ' and ' };
}
// The bettor's range, for the fold sentences: 'real' for a bettor read as passive whose range shows under 15% nothing
// plus draws (STRAT F1); 'loose' for a maniac, lag or gambler whose range shows 25% or more (STRAT, POOL batch 12)
function rangeKind(d) {
  const pic = d.villain && d.villain.picture;
  const post = pic && pic.post;
  let top = -1;
  if (post) for (let k = 0; k < post.length; k++) if (top < 0 || post[k] > post[top]) top = k;
  const type = top >= 0 ? TYPE_IDS[top] : null;
  const b = pic && pic.buckets;
  // on a board that alone makes two pair or better, "nothing better than the board" is the air (STRAT, 20 Nov)
  const loose = pic && pic.boardAir !== undefined ? Math.round(100 * (pic.boardAir + (b ? b.draw : 0))) : b ? Math.round(100 * (b.air + b.draw)) : 100;
  if (['nit', 'abc', 'station', 'beginner'].includes(type) && loose < 15) return 'real';
  if (['maniac', 'lag', 'whale'].includes(type) && loose >= 25) return 'loose';
  return null;
}

export function anchorLine(d) {
  const v = d.verdict;
  if (!v.line || !v.anchors || v.mine < 0) return null;
  if (v.line === '8a') {
    // by street and direction (STRAT P7-1): on the river there are no bets still to come
    const a4 = v.a4 || {};
    if (a4.raw === 'call') return 'Close. Our estimate and the price disagree here, so nothing is graded.';
    if (d.street === STREET.RIVER) {
      if (a4.behind > 0) return `Close. The price is right against the bet, but ${a4.behind === 1 ? 'the player' : `the ${NUM_WORDS[a4.behind] || a4.behind} players`} still to act can raise or call with better. Nothing here is graded.`;
      return 'Close. Nothing here is graded.';
    }
    return LINE8A;
  }
  if (v.line === '8b') return LINE8B;
  if (v.line === '9') return LINE9;
  const hf = { tier: d.tier ?? 0, drawEquity: d.drawEquity ?? 0, ownDrawEquity: d.ownDrawEquity ?? d.drawEquity ?? 0, overEquity: d.overEquity ?? 0, realDraw: !!d.realDraw };
  const opp = d.opponents || 1;
  const st = (o) => o.st ?? anchorStatus(o, v, hf, opp); // grading's own classification (QA E1)
  const river = d.street === STREET.RIVER;
  const now = river ? '' : ' right now';
  const mine = v.options[v.mine];
  const ref = v.options[v.best];
  const made = hf.tier >= TIER.WEAK_PAIR && !(isRealDraw(hf) && hf.tier <= TIER.MIDDLE_PAIR);
  const kw = d.toCall > 0 ? 'raise' : 'bet'; // what the play is called in the line
  // a hand the board makes (AK on 2-2-2; MATH, STRAT 20 Nov): the bet's lines follow the judge's numbers for that bet,
  // value lines when it wins when called at least as often as it needs, the fold-equity lines otherwise
  const madeFor = (o) => (d.boardMade ? o.W !== null && o.W !== undefined && o.need !== null && o.need !== undefined && o.W >= o.need : made);
  const chkO = v.options.find((x) => x.type === 'check');
  const bet = (o0) => {
    const o = { ...o0, alpha: needOf(o0, v) }; // on the river, the folds it needs to beat checking
    const s = st(o0);
    const made = madeFor(o0);
    if (made && (o.W === null || o.W === undefined)) {
      // never called in the samples: they fold everything to this size (QA-VERDICT N5)
      return `This ${kw} is almost never called here: they fold ${often(o.F)}. A smaller ${kw} gets paid by worse hands.`;
    }
    if (made && o.W !== null) {
      const thin = s === 'even' || r5(o.W) === r5(o.need);
      const chk = v.options.find((x) => x.type === 'check');
      const top = v.options.reduce((a, x) => (x.ev > a.ev ? x : a), v.options[0]);
      const checkFine = chk && Math.round(top.ev) - Math.round(chk.ev) <= (v.small || 0);
      if (thin) return `Of the hands that call, you beat ${beatOf(o.W, '', river)} and need ${share(o.need)}. That is thin: ${checkFine ? 'a small bet or a check are both fine' : 'a smaller bet is fine too'}.`;
      if (s === 'works') return `Of the hands that call, you beat ${beatOf(o.W, '', river)} and need ${share(o.need)}. These players call with worse: bet for value.`;
      return `Of the hands that call, you beat ${beatOf(o.W, '', river)} and need ${share(o.need)}. They mostly call with better hands.`;
    }
    // a real draw below top pair, up to 1.05x the pot: the combined test's two inputs and its verdict (MATH 19b,
    // STRAT); past that the draw does not count and the bluff wording below applies
    const dt = isRealDraw(hf) && hf.tier <= TIER.MIDDLE_PAIR ? drawTest(o0, hf, opp) : null;
    // a real draw past the pot that fails on folds is never called a bluff (STRAT D2): too big to lean on the draw;
    // one that works or breaks even on folds keeps the folds wording below
    if (dt && dt.e === 0 && s === 'fails') return `This is too big to lean on your draw: it needs everyone to fold ${often(o.alpha)}, ${o.F < 0.05 ? 'and almost no one folds' : `and they fold only ${often(o.F)}`}. With a draw, ${d.toCall > 0 ? 'calling is cheaper' : 'bet smaller or check'}.`;
    if (dt && dt.e > 0) return `${foldsP(o.F)[0].toUpperCase()}${foldsP(o.F).slice(1)}; called, your draw comes in ${often(hf.ownDrawEquity)}. Together that is ${s === 'works' ? 'enough' : s === 'even' ? 'about even' : 'not enough'}.`;
    if (s === 'works') return `${foldsP(o.F)[0].toUpperCase()}${foldsP(o.F).slice(1)} and this ${kw} needs ${share(o.alpha, false)}. A bigger ${kw} needs more folds than you get.`;
    if (s === 'even' || r5(o.F) === r5(o.alpha)) return `This ${kw} about breaks even on folds: you get ${share(o.F, false)} and need ${share(o.alpha, false)}. Fine, not needed.`;
    // a big real draw is not a bluff: say what the draw still does when called (STRAT M4)
    if (o.alpha < 0.05) return `This ${kw} is tiny next to the pot: it needs almost no folds, but they ${o.F < 0.05 ? 'almost never fold' : `fold only ${often(o.F)}`}.`;
    // a board-made hand: the "do not bluff" line never prints when the bet rates within the bar of checking or better
    // (MATH's guard); within the bar it is fine, not needed; above it, the folds it gets
    if (d.boardMade && chkO && o0 !== chkO && Math.round(o0.ev) - Math.round(chkO.ev) > -(v.small || 0)) {
      if (Math.round(o0.ev) - Math.round(chkO.ev) > (v.small || 0)) return `${foldsP(o.F)[0].toUpperCase()}${foldsP(o.F).slice(1)} and this ${kw} needs ${share(o.alpha, false)}.`;
      return `This ${kw} rates about the same as checking: you get ${share(o.F, false)} folds and need ${share(o.alpha, false)}. Fine, not needed.`;
    }
    return `${kw === 'bet' ? 'Betting' : 'Raising'} here needs everyone to fold ${often(o.alpha)}; ${o.F < 0.05 ? 'they almost never do' : o.F > 0.95 ? 'they nearly always do' : `they fold only ${often(o.F)}`}. Do not bluff this field.`;
  };
  let line = null;
  if (v.line === '5') {
    // the pro's shorter wording (Nov 2026): three lines at 375 px, about 150 characters
    // (the pro's ~140-character form; a failing bet is never "almost always ahead", and its need is
    // never under 5% or over 95%, so those cases do not reach this line)
    const W = mine.W;
    const nowS = river ? '' : ' now';
    // a draw quotes its outs, never "ahead now" (STRAT, QA-VERDICT C8a-W1)
    const drawing = !river && isRealDraw(hf) && hf.tier <= TIER.MIDDLE_PAIR;
    const called = drawing ? `Called, your draw comes in ${share(hf.ownDrawEquity)}` : `Called, you beat ${beatOf(W === null || W === undefined ? 0 : W, ' the callers', river)}`;
    const folds = mine.F < 0.05 ? 'almost no one folds' : mine.F > 0.95 ? 'nearly everyone folds' : `everyone folds ${share(mine.F)}`;
    // the middle sentence alone when the headline above already says "not a habit to build"
    const mid = `${called}; ${folds}, and it needs ${share(mine.alpha, false)}.`;
    // a draw's bet over 1.05x the pot: the draw does not count (D2), so neither its outs nor a separate need
    // are quoted (STRAT, QA YB-D2c)
    const over = drawing && mine.alpha !== undefined && mine.alpha / (1 - mine.alpha) > 1.05;
    const d2 = `a bet this big needs everyone to fold ${share(mine.alpha)}, and ${mine.F < 0.05 ? 'almost no one folds' : `they fold only ${share(mine.F)}`}. With a draw, ${d.toCall > 0 ? 'calling is cheaper' : 'bet smaller or check'}.`;
    // at or under 1.05x the pot a draw's line is the combined test's (MATH 19b), verdict by the sign of its gain,
    // with no separate need (STRAT, QA YB-C8d)
    const dt19 = drawing && !over ? drawTest(mine, hf, d.opponents || 1) : null;
    const combined = dt19 && dt19.e > 0 ? `${foldsP(mine.F)[0].toUpperCase()}${foldsP(mine.F).slice(1)}; called, your draw comes in ${often(hf.ownDrawEquity)}. Together that is ${dt19.st === 'works' ? 'enough' : dt19.st === 'even' ? 'about even' : 'not enough'}.` : null;
    if (over) line = v.note === 'mwHabit' ? d2[0].toUpperCase() + d2.slice(1) : `Not a habit to build: ${d2}`;
    else if (combined) line = v.note === 'mwHabit' ? combined : `${combined} Not a habit to build.`;
    else line = v.note === 'mwHabit' ? mid : `Scores higher only against these opponents. ${mid} Not a habit.`;
  } else if (ref !== mine && ref.type === 'raise' && mine.type === 'raise' && v.grade !== 'good' && ref.F !== undefined && mine.F !== undefined) {
    // a size flagged against another size: what the size changes
    const $ = (o) => `$${o.to - (d.currentBet || 0)}`;
    if (ref.to > mine.to) {
      line = madeFor(ref) && ref.W !== null
        ? `At ${$(ref)} you still beat ${beatOf(ref.W, ' the callers', river)}, and these players still call: the bigger ${kw} earns more.`
        : `At ${$(ref)} ${foldsP(ref.F)}, against ${share(mine.F, false)} at ${$(mine)}: the bigger ${kw} works better here.`;
    } else {
      line = `At ${$(mine)} ${foldsP(mine.F)}, against ${share(ref.F, false)} at ${$(ref)}: the bigger ${kw} folds out the worse hands you want to keep in.`;
    }
  } else if (ref !== mine && ref.type === 'raise' && (v.grade !== 'good' || v.note === 'anchor') && (mine.type !== 'raise' || ref.to !== mine.to)) {
    const b = bet(ref);
    line = `${d.toCall > 0 ? `A raise to $${ref.to}` : `A bet of $${ref.to - (d.currentBet || 0)}`}: ${b[0].toLowerCase()}${b.slice(1)}`;
  } else if (mine.type === 'raise') line = bet(mine);
  else if (v.anchors.Q !== undefined && (mine.type === 'call' || mine.type === 'fold')) {
    const A = v.anchors;
    const call = v.options.find((o) => o.type === 'call');
    let s = call ? st(call) : null;
    // never "Fold." under a fine call or "Call." under a fine fold: the estimate says it is close (STRAT M1)
    if (v.grade === 'good' && ((mine.type === 'call' && s === 'fails') || (mine.type === 'fold' && s === 'works'))) s = 'even';
    const who = d.toCall > 0 && opp === 2 && d.raises <= 1 ? ' of both players' : '';
    const need = share(A.price, false);
    const tail = s === 'works' ? '. Call.' : s === 'even' ? ': close.' : '. Not at this price.';
    if (isRealDraw(hf) && hf.tier <= TIER.HIGH_CARD) {
      // a pure draw: its own chance to come in, against the price (STRAT P4-2); when only overcards make it
      // close, name them (pass 6 watch item)
      const overs = s === 'even' && hf.ownDrawEquity < A.price ? overcardWords(d) : null;
      line = overs
        ? `Your draw comes in ${often(hf.ownDrawEquity)}; ${overs} may be good too. The price needs ${need}: close.`
        : `Your draw comes in ${often(hf.ownDrawEquity)} and the price needs ${need}${tail}`;
    } else if (isRealDraw(hf) && hf.tier <= TIER.MIDDLE_PAIR) {
      // a weak or middle pair plus a real draw: both (STRAT P4-2); top pair or better reads as a made hand
      line = `You are ${aheadP(A.Q, river ? '' : ' now')} and your draw comes in ${often(hf.ownDrawEquity)}; the price needs ${need}${tail}`;
    } else if (!river && d.toCall > 0) line = runoutLine(d, v, A);
    else if (s === 'works') line = `You are ${aheadP(A.Q, '').replace('ahead', `ahead${who}`)} and need ${need} at this price. Call.${hf.tier >= TIER.WEAK_PAIR && hf.tier <= TIER.OVERPAIR_TPTK ? ' Raising gets called mostly by better hands.' : ''}`;
    else if (s === 'fails') {
      // "nearly always real" only for a bettor read as passive whose range shows under 15% nothing
      // plus draws (STRAT F1); a loose bettor gets its own line, anyone else the neutral one
      const pic = d.villain && d.villain.picture;
      const post = pic && pic.post;
      let top = -1;
      if (post) for (let k = 0; k < post.length; k++) if (top < 0 || post[k] > post[top]) top = k;
      const type = top >= 0 ? TYPE_IDS[top] : null;
      const b = pic && pic.buckets;
      // on a board that alone makes two pair or better, "nothing better than the board" is the air: those hands can
      // only chop or lose, so a bet with them is a bluff (STRAT, 20 Nov); a tie on a straight board is not a real hand
      const loose = pic && pic.boardAir !== undefined ? Math.round(100 * (pic.boardAir + (b ? b.draw : 0))) : b ? Math.round(100 * (b.air + b.draw)) : 100;
      if (['nit', 'abc', 'station', 'beginner'].includes(type) && loose < 15) line = `You are ${aheadP(A.Q, '')} here and need ${need} at this price. Good players bluff just enough to make this close. This player's bets are nearly always real. Fold.`;
      // "this often" only when the range shown really is loose: 25% or more nothing plus draws (STRAT, POOL batch 12)
      else if (['maniac', 'lag', 'whale'].includes(type) && loose >= 25) line = `Even against a player who bluffs this often, you are not ahead often enough at this price. Fold.`;
      else line = `You are ${aheadP(A.Q, '')} here and need ${need} at this price; not enough. Fold.`;
    }
    else line = `You are ${aheadP(A.Q, '')} here and need ${need} at this price: close.`;
  } else if (mine.type === 'check' && ref.type === 'raise' && ref !== mine) {
    const b = bet(ref);
    line = `A bet of $${ref.to - (d.currentBet || 0)}: ${b[0].toLowerCase()}${b.slice(1)}`;
  }
  return line;
}

// The optional clauses (MATH_BASELINE_SPEC 4), kept apart from the line so a phone can leave them out
// (the line itself should fit two lines at 375 px).
function anchorExtra(d) {
  if (!anchorLine(d)) return null;
  const post = d.villain && d.villain.picture && d.villain.picture.post;
  if (!post) return null;
  let top = 0;
  for (let k = 1; k < post.length; k++) if (post[k] > post[top]) top = k;
  if (post[top] < 0.5) return 'You have not seen much of these players yet. Take the play that works against anyone.';
  if (['tag', 'lag'].includes(TYPE_IDS[top])) return `${d.villain.nick} is a solid player: do not count on the loose calls or the missing bluffs you get from the others.`;
  return null;
}

// What a flagged play cost, as shown: the gap between the two options' values in whole dollars,
// each rounded the way the numbers table and the bars show them, so the three always agree and
// totals add up to the sum of what each verdict said.
export function shownCost(v) {
  if (v.grade === 'good' || v.mine < 0) return 0;
  if (v.dominated) return v.dominated; // behind the best play by at least this much under every read
  const gap = Math.max(0, Math.round(v.options[v.best].ev) - Math.round(v.options[v.mine].ev));
  const cap = v.priceCap ?? v.moneyInCap; // a call costs at most its price (STRAT G4; the money-in arm too, QA-VERDICT V4)
  return cap !== undefined ? Math.min(gap, Math.round(cap)) : gap;
}

// The live limpers in front of a preflop decision and how many the player reads as stations (top read station at
// 50% or more, as shown: the reader-view rule of allNitLimpers), from the record's snapshot
export function stationLimpers(d) {
  const sn = d.snapshot;
  if (!sn || !sn.actions || !sn.seats) return { n: 0, stations: 0 };
  const seats = [...new Set(sn.actions.filter((a) => a.street === 'preflop' && a.type === 'call' && a.seat !== 0).map((a) => a.seat))];
  const live = seats.map((i) => sn.seats.find((x) => x.seat === i)).filter((r) => r && !r.folded);
  const stations = live.filter((r) => r.read && r.read[0] && r.read[0].type === 'station' && Math.round(r.read[0].p * 1000) / 1000 >= 0.5).length;
  return { n: live.length, stations };
}

export function explain(d) {
  const v = d.verdict;
  if (v.mine < 0) return { category: 'other', headline: '', reasons: [], theory: null, cost: 0 };
  const mine = v.options[v.mine];
  const best = v.options[v.best];
  if (v.grade === 'good') {
    return {
      category: null,
      headline: goodHeadline(v, mine, best, d),
      reasons: [],
      theory: null,
      cost: 0,
      tip: v.tip ? v.tip.text : null, // "Tip: ..." under a fine verdict
      tipKind: v.tip ? v.tip.kind : null,
      anchor: anchorLine(d),
      anchorExtra: anchorExtra(d),
    };
  }
  const category = v.rule === 'strongLimp' ? 'strongLimp' : categorise(d);
  const cost = shownCost(v);
  if (v.rule === 'strongLimp') {
    // the owner's rule (STRAT L-S1): no dollar clause when raising does not score more on our read
    const sl = v.strongLimp || {};
    return {
      category,
      headline: `Mistake: limping ${sl.name || 'this hand'}. A hand this strong should raise: limping lets the field in cheaply and gives up value.${cost > 0 ? ` Raising scores about $${cost} more on our read; a standard open is about $${sl.std}.` : ` A standard open is about $${sl.std}.`}`,
      reasons: [],
      theory: null,
      cost,
      anchor: null,
      anchorExtra: null,
    };
  }
  const m = kind(mine);
  const b = kind(best);
  const word = v.grade === 'blunder' ? 'Blunder' : 'Mistake';
  const ref = v.ref === 'quarterPot' ? `the best bet of at least a quarter of the pot (${bare(best).toLowerCase()})` : v.ref === 'habit' ? `${best.label.toLowerCase()} (the best play the coach teaches here)` : v.ref === 'robust' ? `${best.label.toLowerCase()} (it beats your play under every read)` : v.ref === 'anchor' ? `${best.label.toLowerCase()} (the best play that works against anyone)` : v.ref === 'noRaise' ? `${best.label.toLowerCase()} (the best play that is not a raise)` : v.ref === 'giveUp' ? `${best.label.toLowerCase()} (giving up the pot)` : v.ref === 'upTo75' ? `the best bet up to three-quarters of the pot (${bare(best).toLowerCase()})` : v.ref === 'upToPot' ? `the best bet up to the size of the pot (${bare(best).toLowerCase()})` : best.label.toLowerCase();
  // a call whose cost is capped at its price (rule 7, or the money-in arm) states that cost, and that later
  // streets are graded there; never "up to its price" (STRAT YB-1 / section 17 C2, QA YB-C3)
  const capped = (v.priceCap ?? v.moneyInCap) !== undefined && Math.round(best.ev) - Math.round(mine.ev) > cost;
  const headline = v.dominated
    ? `${word}: ${mine.label.toLowerCase()} scores at least $${cost} below the best play here under every reasonable read of these players.`
    : capped
      ? `${word}: ${mine.label.toLowerCase()} costs about $${cost} compared with ${ref}; what happens on later streets is graded there.`
      : `${word}: ${mine.label.toLowerCase()} costs about $${cost} compared with ${ref}.`;
  const reasons = [];
  if (v.iso3bet) reasons.push('Against this player, calling scores a bit higher: it keeps their bluffs in. Re-raising to isolate is also standard.');
  // a play that loses money by itself (STRAT_YELLOW_BAND C)
  if (v.rule === 'moneyIn' && v.moneyIn) reasons.push(`On our read this ${mine.type === 'call' ? 'call' : 'bet'} loses money by itself: ${v.moneyIn.loss >= 0.95 * v.moneyIn.put ? 'about all' : `about $${v.moneyIn.loss}`} of the $${v.moneyIn.put} it puts in, compared with ${v.moneyIn.give === 'fold' ? 'folding' : 'checking'}.`);
  // R5b's reason under a flagged call of a passive lead into a crowd (STRAT G5)
  if (v.setRaise && best.type === 'call') reasons.push('Calling keeps in the hands you beat; a re-raise folds them.');
  if (v.rule === 'R5b' && best.type === 'fold') reasons.push(`When a passive player leads into a crowd, one pair is often beaten. Folding scores about $${Math.max(0, Math.round(best.ev) - Math.round(mine.ev))} more.`);
  const r1 = readLine(d);
  if (r1) reasons.push(r1);
  // preVs3bet: its lines come straight after the read line, so nothing generic sits between "plays like a calling
  // station" and what that player's re-raise holds (STRAT, QA-VERDICT's 551 read)
  if (category === 'preVs3bet') reasons.push(...vs3betLines(d, v));
  const r2 = rangeLine(d);
  if (r2) reasons.push(r2);
  const multiway = d.street !== STREET.PRE && d.opponents >= 2;
  if (multiway && d.tier <= TIER.OVERPAIR_TPTK) {
    reasons.push(
      b === 'raise' && m !== 'raise'
        ? `With ${d.opponents + 1} players in, someone usually has a piece and calls, so a made hand gets paid; pick a size you are happy to have called by a better hand.`
        : `There are ${d.opponents} opponents still in. With that many players someone usually has a real hand, so bluffs work less and one pair is worth less.`,
    );
  }
  if (d.street === STREET.PRE) {
    const where = d.position;
    if (v.preAllIn) {
      // facing an all-in, calling ends your betting: the price against their range (STRAT P5-1)
      const shover = d.villain && d.villain.nick;
      reasons.push(`Facing an all-in there is no later street: it is the price against their range. You need ${share(v.preAllIn.price)}; against what ${d.opponents >= 2 || !shover ? 'they have shown here (the all-in and the call)' : `${shover} shoves with here`} you have ${share(v.preAllIn.E)}.`);
    } else if (v.preShove && category === 'preLoose') reasons.push(`From ${where}, against this action, this hand loses money on average: it is often dominated by what continues.`);
    else if (category === 'preLoose') {
      const T = d.table || {};
      reasons.push(`From ${where}, with the action so far, this hand loses money on average: it will often be dominated${T.oop ? ' or out of position' : ''}${T.raked ? ' in a raked pot' : ''}.`);
    }
    if (category === 'prePassive') {
      // 77 and 88 limped on the button behind 3+ limpers who mostly call (STRAT, CEO, PRO): the pair-specific reason
      const sl = stationLimpers(d);
      const hand = d.hole && d.hole.length === 2 ? classNames[classOf(d.hole[0], d.hole[1])] : null;
      if (hand && ISO_LIMP_PAIRS.has(hand) && d.raises === 0 && d.position === 'BTN' && sl.n >= 3 && sl.stations * 2 > sl.n) {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][sl.n] || String(sl.n);
        reasons.push(`Behind ${words} limpers who mostly call, raising ${hand} on the button makes more than limping: they call the raise with worse hands, and you play the bigger pot in position on all of them.`);
      } else reasons.push(`A raise here gets called by worse hands and gives you the betting lead; just calling lets everyone in cheaply against a hand that plays best against few opponents.`);
    }
    if (category === 'preTight') {
      if (d.raises === 0 && !(d.ctx && d.ctx.limpers > 0)) reasons.push(`This hand is a profitable open from ${where} here, even though a tight chart folds it.`);
      else {
        // 77 and 88 behind 3+ limpers (STRAT, 19 Nov): raise or limp both make money; the iso size as L2 and L4 quote it
        const hand = d.hole && d.hole.length === 2 ? classNames[classOf(d.hole[0], d.hole[1])] : null;
        const n = d.ctx && d.ctx.limpers;
        if (hand && ISO_LIMP_PAIRS.has(hand) && n >= 3 && d.raises === 0) {
          const to = isoQuote(v, d.ctx);
          const limp = v.options.find((o) => o.type === 'call');
          const fold = v.options.find((o) => o.type === 'fold');
          const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][n] || String(n);
          reasons.push(limp && fold && limp.ev > fold.ev
            ? `Behind ${words} limpers ${hand} makes money either way: raise to isolate, to about $${to}, or limp behind and play for a set. Folding throws away a profitable hand.`
            : `${hand} makes money here: raise to isolate, to about $${to}. Folding throws away a profitable hand.`);
        } else reasons.push(`The players in this pot enter with weak hands and pay off after the flop, so this hand is profitable here even though it is a fold at a tougher table.`);
      }
    }
  }
  // The "theory would call" note only applies when the hand is strong enough that theory would.
  let theory = v.preShove ? null : THEORY[category]; // no multiway or position theory with an all-in in play (STRAT P5-1)
  if (category === 'paidOff' && (d.tier === null || d.tier < TIER.TOP_PAIR_GOOD)) theory = null;
  if (category === 'overplay' && m === 'raise' && d.toCall > 0) {
    theory = 'Why theory disagrees: a raise here is meant to get called by worse or to fold out better. These players fold the hands you beat and continue with the ones that beat you, so the raise mostly gets called by better. Calling keeps their worse hands and bluffs in.';
  }
  // "A routine fold against a balanced range" is only true of one-pair hands.
  if (category === 'overFold' && d.tier !== null && d.tier > TIER.OVERPAIR_TPTK) theory = null;
  // "A good hand should simply bet" is for top pair with a good kicker or better, and the pot-control
  // sentence is wrong while a regular, who does attack weakness, is still in the hand.
  if (category === 'missedValue') {
    if (d.tier === null || d.tier < TIER.TOP_PAIR_GOOD || (multiway && d.tier <= TIER.OVERPAIR_TPTK)) theory = null; // R11
    else if (d.regularIn) theory = 'Why theory disagrees: against players who call too wide and rarely bluff, a good hand should simply bet.';
  }
  // the theory about checking only under a check; under a call where a raise scored best, its own line (STRAT F5)
  if (category === 'missedValue' && theory && m !== 'check') theory = m === 'call' ? 'Why theory disagrees: with a hand this strong, raising builds the pot while worse hands still pay; slow-playing is fine sometimes, not as a habit.' : null;
  // ...and under a check with two pair or better, a line chosen by the hand (STRAT_THEORY_COPY section 1)
  else if (category === 'missedValue' && theory && d.tier >= TIER.TWO_PAIR) {
    const river = d.street === STREET.RIVER;
    if (d.opponents !== 1 || !dryBoard(d.board, river)) theory = null; // theory bets here too, to charge the draws
    else if (!d.regularIn) {
      const { who } = whoOf(d);
      const bl = blockerHand(d.hole, d.board);
      theory = bl
        ? `Why theory disagrees: theory sometimes checks here: your cards block ${bl === 'set' ? 'most' : 'many'} of the hands that would call${river ? '' : ', and on a dry board a free card rarely hurts'}. Against ${who} that doesn't matter: they call with ${callsWith(d)}.`
        : river
          ? `Why theory disagrees: on the river theory sometimes checks a hand this strong so that worse hands bet. Against ${who}, betting gets paid more: they call with ${callsWith(d)}.` // STRAT T-2
          : `Why theory disagrees: on a dry board theory sometimes checks a hand this strong to let worse hands bet or catch up. Against ${who}, betting gets paid more: they call with ${callsWith(d)}.`;
    }
  }
  // preflop: every clause only when it is true (STRAT_THEORY_COPY section 2)
  const T = d.table || {};
  if (category === 'prePassive' && !(d.raises >= 1 || (d.raises === 0 && ['SB', 'BTN/SB'].includes(d.position)))) theory = null; // heads-up the small blind is 'BTN/SB'
  if (category === 'preRaise' && !(d.raises >= 1)) theory = null;
  if (category === 'preLoose' && theory) {
    const parts = [];
    if (T.n >= 7) parts.push('at a full table');
    if (T.raked) parts.push('raked');
    if (T.voluntary >= 2) parts.push('headed for a multiway pot');
    const list = parts.length <= 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
    theory = parts.length ? `Why theory disagrees: charts built for raked online six-max or tournament play defend and open wider than this. ${cap(list)}, this hand does not earn its way in.` : null;
  }
  if (category === 'preTight' && d.raises === 0 && !(d.ctx && d.ctx.limpers > 0)) theory = null;
  // the "solver calls" line only when the belief's re-raising range is almost all strong hands (CEO's condition)
  if (category === 'preVs3bet') {
    if (!(d.vs3bet && d.vs3bet.P >= 0.85)) theory = null;
    // "a solver calls here" is false of a re-raise: the 4-bet takes preRaise's line (STRAT)
    else if (m === 'raise') theory = THEORY.preRaise;
  }
  if (category === 'sizeSmall' && theory) {
    if (d.street === STREET.PRE) theory = 'Why theory disagrees: at a tough table a smaller raise does the job. These players call bigger raises with worse, so make it bigger.';
    else if (d.street !== STREET.FLOP) theory = 'Why theory disagrees: theory mixes small bets into a balanced strategy. Callers here pay the same hands at a bigger price, so the small size leaves money behind.';
  }
  // "these players" only when there are several (STRAT_THEORY_COPY section 2)
  if (theory && d.opponents === 1 && (category === 'badBluff' || category === 'overplay')) {
    const { who } = whoOf(d);
    theory = theory
      .replace('These players call too much', `${cap(who)} calls too much`)
      .replace('When the players left in the pot only continue with hands that beat you', `When ${who} only continues with hands that beat you`)
      .replace('These players fold the hands you beat and continue with the ones that beat you', `${cap(who)} folds the hands you beat and continues with the ones that beat you`)
      .replace('Calling keeps their worse hands and bluffs in.', 'Calling keeps their worse hands and bluffs in.');
  }
  // "when several players check" needs two or more opponents, all checked on this street (STRAT F3)
  if (category === 'missedBluff' && !(d.opponents >= 2 && d.toCall === 0)) theory = null;
  return { category, headline, reasons, theory, cost, anchor: anchorLine(d), anchorExtra: anchorExtra(d) };
}
