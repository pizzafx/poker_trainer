// Turns a judged decision into feedback: a leak category, a headline, the reasons, and a
// note on where the money-making play differs from what game theory would do.

import { STREET } from '../engine/game.js';
import { TIER, isRealDraw } from '../engine/features.js';
import { PROFILES, TYPE_IDS } from '../bots/profiles.js';
import { anchorStatus, needOf } from './grade.js';

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
  preTight: 'Preflop: folding a hand that makes money in this spot',
  prePassive: 'Preflop: limping or calling when raising makes more',
  preRaise: 'Preflop: raising when calling or folding does better',
  chase: 'Chasing: calling with a draw at the wrong price',
  other: 'Strong hands: raising when calling or folding did better',
};

const pct = (x) => `${Math.round(100 * x)}%`;
// "Bet $30 (81% pot)" -> "Bet $30", for use inside a parenthesis (QA C5)
const bare = (o) => o.label.replace(/\s*\([^)]*\)\s*$/, '');

// R7 ("not a habit to build"): one line on why, per kind of play
const HABIT_WHY = {
  raiseCaller: 'A raise into a bettor and a caller is usually called by better.',
  drawRaise: 'A raise into a bettor and a caller is usually called by better.',
  passiveLead: 'One pair is rarely best when a passive player leads into a crowd.',
  drawStation: 'A bet with a draw into a player who does not fold wins only when it hits.',
  drawOverbet: 'An overbet with a draw into several players.',
  foldsBetter: 'A big bet here mostly folds better hands and gets called by the best ones.',
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
  if (m === 'check' && b === 'raise') return d.tier >= TIER.TOP_PAIR_WEAK ? 'missedValue' : 'missedBluff';
  if (m === 'raise' && b === 'check') return bluffy(d) ? 'badBluff' : 'overplay';
  return 'other';
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
  parts.push(pairedBoard ? `${pct(strong)} trips or better (or two pair without the board's help)` : `${pct(strong)} two pair or better`);
  parts.push(`${pct(b.topPair)} top pair or an overpair`);
  if (b.weakPair >= 0.03) parts.push(`${pct(b.weakPair)} weaker pairs`);
  if (b.draw >= 0.03) parts.push(`${pct(b.draw)} draws`);
  parts.push(`${pct(b.air)} nothing`);
  const verb = d.toCall > 0 ? (d.raises >= 2 ? 'raises' : 'bets') : 'gets here';
  let s = `When ${vil.nick} ${verb} like this, the hands that fit are roughly: ${parts.join(', ')}.`;
  // the same effective price as the coach's estimate (all-in capped; STRAT F6)
  const A = d.verdict && d.verdict.anchors;
  const price = A && A.price !== undefined ? A.price : d.odds;
  if (d.toCall > 0 && d.street === STREET.RIVER) {
    s += ` Your hand beats ${pct(vil.picture.equity)} of that; a call needs ${pct(price)}.`;
  } else if (d.toCall > 0) {
    s += ` You are ahead of ${pct(vil.picture.equity)} of that right now and the price needs ${pct(price)}.`;
  }
  return s;
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

// A note on a fine (or not graded) verdict never hides a gap above the yellow bar behind "a little",
// "about the same" or "scores higher": it states the dollar figure, rounded as the bars show it
// (STRAT, QA Q1, Nov 2026). `v.small` is the yellow bar the guardrails used.
function goodHeadline(v, mine, best, d = {}) {
  const gap = (o) => Math.max(0, Math.round(o.ev) - Math.round(mine.ev));
  const bar = () => v.small || 0; // the yellow bar, the same for every option here (QA E4)
  const top = v.options.reduce((a, o) => (o.ev > a.ev ? o : a), v.options[0]);
  // "scores about $X more", or the fallback wording when the gap is within the bar
  const more = (o, within) => (gap(o) > bar(o) || !within ? (gap(o) > 0 ? `scores about $${gap(o)} more` : 'scores about the same') : within);
  const who = d.opponents === 1 ? 'this player' : 'these players';
  if (v.tip) return `${mine.label}: fine.`; // the tip line underneath says what a raise would do
  if (v.rule === 'R5b') return `${mine.label}: fine. (When a passive player leads into a crowd, one pair is often beaten.)`; // STRAT M5c
  if (v.note === 'premium') return `${mine.label}: fine. (Raising with this hand is never a mistake.)`;
  if (v.note === 'anchorHabit' || v.note === 'anchorEven' || v.note === 'sizePeak') return `${mine.label}: fine.`;
  if (v.note === 'anchorFails') {
    // "gives up less" only when it scores below the reference (STRAT F4)
    if (mine.ev < best.ev) return `${mine.label}: fine. (It gives up less than the coach flags, but by the estimate below it does not work.)`; // the coach's estimate below says why
    // "scores higher" only when it is the judge's best with no option too close to tell apart
    const higher = v.options.every((o, i) => o.ev <= mine.ev && (i === v.mine || !o.close));
    return `${mine.label}: fine. It ${higher ? 'scores higher' : 'is close to the best'} against these players, but by the estimate below it only works if they keep playing this way; ${bare(best).toLowerCase()} is the standard play.`;
  }
  if (v.note === 'anchor') {
    // the bars' gap stated, then why it is not flagged (QA F2)
    const alt = gap(best) > 0 && best !== mine ? best : top;
    return gap(alt) > 0
      ? `${mine.label}: fine. (${bare(alt)} ${more(alt)} on the bars, but by the coach's estimate below this is close, so it is not flagged.)`
      : `${mine.label}: fine. (By the coach's estimate below this is close, so it is not flagged.)`;
  }
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
  if (v.note === 'mwHabit') return `${mine.label}: fine. (${v.habitHigher ? 'It scores higher against these opponents; not a habit to build.' : 'It is close to the best here, but not a habit to build.'}${HABIT_WHY[v.habit] ? ' ' + HABIT_WHY[v.habit] : ''})`;
  if (v.note === 'mwCheck') {
    const m = v.mw || {};
    const whoBet = v.thin && v.thin.nick ? `Against ${v.thin.nick}, a bet` : 'A bet';
    return `${mine.label}: fine. (${whoBet} of about $${m.to ?? bare(best).replace(/^\D+/, '')} does about $${Math.max(0, m.gain || 0)} better here. With ${m.players || 'several'} players in, a check is defensible; a bet is the more profitable habit.)`;
  }
  if (v.note === 'mwDraw') return `${mine.label}: fine. (With a draw and several players in, checking or calling is standard; ${bare(best).toLowerCase()} ${more(best)} against these opponents.)`;
  if (v.note === 'mwSize') return `${mine.label}: fine. (A bigger bet ${more(top, 'rates a little higher')}, but with several players in and this hand, a small bet is reasonable.)`;
  if (v.note === 'tinyPot') return `${mine.label}: fine. (A bet ${more(best, 'rates a little higher')}, but in a pot this small it is not worth a flag.)`;
  if (v.note === 'foldsBetter') return `${mine.label}: fine. (A bet here mostly folds the better hands; checking is the habit to keep.)`;
  if (v.note === 'passiveFold') return `${mine.label}: fine. (When a passive player leads into a crowd, one pair is often beaten.)`;
  if (v.note === 'unclear') {
    // labelled "not graded", not "fine"
    const g = gap(best);
    return `${mine.label}: not graded. ${g > 0 && best !== mine ? `${bare(best)} scores about $${g} more on our read; the` : 'The'} best play changes with small differences in how ${who} play${d.opponents === 1 ? 's' : ''}.`;
  }
  if (v.note === 'checkOOP') return `${mine.label}: fine. (With several players or the preflop raiser still to act behind you, checking one pair is standard.)`;
  if (v.note === 'sizeCheck') return `${mine.label}: fine. (A bet of up to three-quarters of the pot ${more(best, 'rates about the same')}.)`;
  if (v.note === 'callPrice') return `${mine.label}: fine. (Folding ${more(best, 'rates a little higher')}, but this call can only cost its price; later decisions are graded when you make them.)`;
  if (v.note === 'bluffRaise') return `${mine.label}: fine. (A bluff-raise ${more(top)} against these bots, but that only works on bots; it is not a habit to build.)`;
  if (v.note === 'overbet') return `${mine.label}: fine. (A bet bigger than the pot ${more(top)} against these bots; a pot-sized bet or smaller is all you are held to.)`;
  if (v.note === 'preBluff') return `${mine.label}: fine. (A light re-raise ${v.preHigher ? 'scores higher' : 'is close to the best'} against these bots; it is not a habit to build.)`; // STRAT M3
  if (v.note === 'preFold') return `${mine.label}: fine.`;
  if (v.note === 'sizeOk') {
    // the range over the bigger sizes that score more, and why
    const bigger = v.options.filter((o) => o.type === 'raise' && o.to > mine.to && gap(o) > 0).map(gap);
    const lo = Math.min(...bigger);
    const hi = Math.max(...bigger);
    const frac = mine.to / Math.max(1, v.pot);
    const size = frac < 0.42 ? 'a third of the pot' : frac < 0.62 ? 'half pot' : frac < 0.85 ? 'three-quarters of the pot' : 'a pot-sized bet';
    const into = d.opponents >= 2 ? ` into ${NUM_WORDS[d.opponents] || d.opponents} players` : '';
    if (!bigger.length) return `${mine.label}: fine. (This is a sound value size${into}.)`;
    return `${mine.label}: fine. (Bigger bets score about ${lo === hi ? `$${lo}` : `$${lo}–${hi}`} more against these opponents, mostly because they call too often; ${size} is a sound value size${into}.)`;
  }
  if (v.note === 'riverBluff' || v.note === 'passedBluff') return `${mine.label}: fine. (A bluff ${more(top)} against these bots; not enough to rely on at a real table.)`;
  if (v.note === 'fragile') return `${mine.label}: fine. (${bare(best)} ${more(best)} on our read of ${who}, but not under every reasonable read, so it is not graded.)`;
  if (v.mine !== v.best) return `${mine.label}: fine. (${bare(best)} ${more(best, 'rates about the same')}.)`;
  if (gap(top) > bar(top)) return `${mine.label}: fine. (${bare(top)} ${more(top)} on our read, but the coach does not hold you to it here.)`;
  const rivals = v.options.filter((o, i) => i !== v.best && o.close);
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

export function anchorLine(d) {
  const v = d.verdict;
  if (!v.line || !v.anchors || v.mine < 0) return null;
  if (v.line === '8a') return LINE8A;
  if (v.line === '8b') return LINE8B;
  if (v.line === '9') return LINE9;
  const hf = { tier: d.tier ?? 0, drawEquity: d.drawEquity ?? 0, realDraw: !!d.realDraw };
  const opp = d.opponents || 1;
  const st = (o) => o.st ?? anchorStatus(o, v, hf, opp); // grading's own classification (QA E1)
  const river = d.street === STREET.RIVER;
  const now = river ? '' : ' right now';
  const mine = v.options[v.mine];
  const ref = v.options[v.best];
  const made = hf.tier >= TIER.WEAK_PAIR && !(isRealDraw(hf) && hf.tier <= TIER.MIDDLE_PAIR);
  const kw = d.toCall > 0 ? 'raise' : 'bet'; // what the play is called in the line
  const bet = (o0) => {
    const o = { ...o0, alpha: needOf(o0, v) }; // on the river, the folds it needs to beat checking
    const s = st(o0);
    if (made && o.W !== null) {
      const thin = s === 'even' || r5(o.W) === r5(o.need);
      const chk = v.options.find((x) => x.type === 'check');
      const top = v.options.reduce((a, x) => (x.ev > a.ev ? x : a), v.options[0]);
      const checkFine = chk && Math.round(top.ev) - Math.round(chk.ev) <= (v.small || 0);
      if (thin) return `When called you are ${aheadP(o.W, '')} and need ${share(o.need)}. That is thin: ${checkFine ? 'a small bet or a check are both fine' : 'a smaller bet is fine too'}.`;
      if (s === 'works') return `When this ${kw} is called you are ${aheadP(o.W, now)} and need ${share(o.need)}. These players call with worse: bet for value.`;
      return `When this ${kw} is called you are ${aheadP(o.W, now)} and need ${share(o.need)}. They mostly call with better hands.`;
    }
    if (s === 'works') return `${foldsP(o.F)[0].toUpperCase()}${foldsP(o.F).slice(1)} and this ${kw} needs ${share(o.alpha, false)}. A bigger ${kw} needs more folds than you get.`;
    if (s === 'even' || r5(o.F) === r5(o.alpha)) return `This ${kw} about breaks even on folds: you get ${share(o.F, false)} and need ${share(o.alpha, false)}. Fine, not needed.`;
    // a big real draw is not a bluff: say what the draw still does when called (STRAT M4)
    if (isRealDraw(hf) && hf.drawEquity >= 0.25) return `${kw === 'bet' ? 'Betting' : 'Raising'} needs folds ${often(o.alpha)} and they rarely fold; called, your draw still comes in ${often(hf.drawEquity)}. Checking or calling to see the card is fine.`;
    return `${kw === 'bet' ? 'Betting' : 'Raising'} here needs everyone to fold ${often(o.alpha)}; ${o.F < 0.05 ? 'they almost never do' : o.F > 0.95 ? 'they nearly always do' : `they fold only ${often(o.F)}`}. Do not bluff this field.`;
  };
  let line = null;
  if (v.line === '5') {
    // the pro's shorter wording (Nov 2026): three lines at 375 px, about 150 characters
    // (the pro's ~140-character form; a failing bet is never "almost always ahead", and its need is
    // never under 5% or over 95%, so those cases do not reach this line)
    const W = mine.W;
    const nowS = river ? '' : ' now';
    const called = W === null || W === undefined || W < 0.05 ? 'Called, you are almost never ahead' : W > 0.95 ? `Called, you are almost always ahead${nowS}` : `Called, you are ahead${nowS} ${share(W)}`;
    const folds = mine.F < 0.05 ? 'almost no one folds' : mine.F > 0.95 ? 'nearly everyone folds' : `everyone folds ${share(mine.F)}`;
    // the middle sentence alone when the headline above already says "not a habit to build"
    const mid = `${called}; ${folds}, and it needs ${share(mine.alpha, false)}.`;
    line = v.note === 'mwHabit' ? mid : `Scores higher only against these opponents. ${mid} Not a habit.`;
  } else if (ref !== mine && ref.type === 'raise' && mine.type === 'raise' && v.grade !== 'good' && ref.F !== undefined && mine.F !== undefined) {
    // a size flagged against another size: what the size changes
    const $ = (o) => `$${o.to - (d.currentBet || 0)}`;
    if (ref.to > mine.to) {
      line = made && ref.W !== null
        ? `At ${$(ref)} you are still ${aheadP(ref.W, now)} when called, and these players still call: the bigger ${kw} earns more.`
        : `At ${$(ref)} ${foldsP(ref.F)}, against ${share(mine.F, false)} at ${$(mine)}: the bigger ${kw} works better here.`;
    } else {
      line = `At ${$(mine)} ${foldsP(mine.F)}, against ${share(ref.F, false)} at ${$(ref)}: the bigger ${kw} folds out the worse hands you want to keep in.`;
    }
  } else if (ref !== mine && ref.type === 'raise' && v.grade !== 'good' && (mine.type !== 'raise' || ref.to !== mine.to)) {
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
    if (isRealDraw(hf)) {
      // a real draw: its chance to come in, against the price
      line = `Your draw comes in ${often(hf.drawEquity)} and the price needs ${need}${s === 'works' ? '. Call.' : s === 'even' ? ': close.' : '. Not at this price.'}`;
    } else if (s === 'works') line = `You are ${aheadP(A.Q, '').replace('ahead', `ahead${who}`)} and need ${need} at this price. Call.${hf.tier >= TIER.WEAK_PAIR && hf.tier <= TIER.OVERPAIR_TPTK ? ' Raising gets called mostly by better hands.' : ''}`;
    else if (s === 'fails') {
      // "nearly always real" only for a bettor read as passive whose range shows under 15% nothing
      // plus draws (STRAT F1); a loose bettor gets its own line, anyone else the neutral one
      const pic = d.villain && d.villain.picture;
      const post = pic && pic.post;
      let top = -1;
      if (post) for (let k = 0; k < post.length; k++) if (top < 0 || post[k] > post[top]) top = k;
      const type = top >= 0 ? TYPE_IDS[top] : null;
      const b = pic && pic.buckets;
      const loose = b ? Math.round(100 * (b.air + b.draw)) : 100;
      if (['nit', 'abc', 'station', 'beginner'].includes(type) && loose < 15) line = `You are ${aheadP(A.Q, '')} here and need ${need} at this price. Good players bluff just enough to make this close. This player's bets are nearly always real. Fold.`;
      else if (['maniac', 'lag', 'whale'].includes(type)) line = `Even against a player who bluffs this often, you are not ahead often enough at this price. Fold.`;
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
  return v.priceCap !== undefined ? Math.min(gap, Math.round(v.priceCap)) : gap; // a call costs at most its price (STRAT G4)
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
  const category = categorise(d);
  const cost = shownCost(v);
  const m = kind(mine);
  const b = kind(best);
  const word = v.grade === 'blunder' ? 'Blunder' : 'Mistake';
  const ref = v.ref === 'habit' ? `${best.label.toLowerCase()} (the best play the coach teaches here)` : v.ref === 'robust' ? `${best.label.toLowerCase()} (it beats your play under every read)` : v.ref === 'anchor' ? `${best.label.toLowerCase()} (the best play that works against anyone)` : v.ref === 'noRaise' ? `${best.label.toLowerCase()} (the best play that is not a raise)` : v.ref === 'upTo75' ? `the best bet up to three-quarters of the pot (${bare(best).toLowerCase()})` : v.ref === 'upToPot' ? `the best bet up to the size of the pot (${bare(best).toLowerCase()})` : best.label.toLowerCase();
  const capped = v.priceCap !== undefined && Math.round(best.ev) - Math.round(mine.ev) > cost;
  const headline = v.dominated
    ? `${word}: ${mine.label.toLowerCase()} scores at least $${cost} below the best play here under every reasonable read of these players.`
    : capped
      ? `${word}: ${mine.label.toLowerCase()} costs up to its price compared with ${ref}; what happens on later streets is graded there.`
      : `${word}: ${mine.label.toLowerCase()} costs about $${cost} compared with ${ref}.`;
  const reasons = [];
  const r1 = readLine(d);
  if (r1) reasons.push(r1);
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
    if (category === 'preLoose') reasons.push(`From ${where}, with the action so far, this hand loses money on average: it will often be dominated or out of position in a raked pot.`);
    if (category === 'prePassive') reasons.push(`A raise here gets called by worse hands and gives you the betting lead; just calling lets everyone in cheaply against a hand that plays best against few opponents.`);
    if (category === 'preTight') reasons.push(`The players in this pot enter with weak hands and pay off after the flop, so this hand is profitable here even though it is a fold at a tougher table.`);
  }
  // The "theory would call" note only applies when the hand is strong enough that theory would.
  let theory = THEORY[category];
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
  // "when several players check" needs two or more opponents, all checked on this street (STRAT F3)
  if (category === 'missedBluff' && !(d.opponents >= 2 && d.toCall === 0)) theory = null;
  return { category, headline, reasons, theory, cost, anchor: anchorLine(d), anchorExtra: anchorExtra(d) };
}
