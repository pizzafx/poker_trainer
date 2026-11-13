// Turns a judged decision into feedback: a leak category, a headline, the reasons, and a
// note on where the money-making play differs from what game theory would do.

import { STREET } from '../engine/game.js';
import { TIER } from '../engine/features.js';
import { PROFILES, TYPE_IDS } from '../bots/profiles.js';

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
const bluffy = (d) => d.tier !== null && d.tier <= TIER.WEAK_PAIR && !(d.drawEquity >= 0.14);

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
    if (m === 'call' && b === 'fold') return weak && d.drawEquity >= 0.14 ? 'chase' : 'paidOff';
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
  if (d.toCall > 0 && d.street === STREET.RIVER) {
    s += ` Your hand beats ${pct(vil.picture.equity)} of that; a call needs ${pct(d.odds)}.`;
  } else if (d.toCall > 0) {
    s += ` You are ahead of ${pct(vil.picture.equity)} of that right now and the price needs ${pct(d.odds)}.`;
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

function goodHeadline(v, mine, best) {
  if (v.tip) return `${mine.label}: fine.`; // the tip line underneath says what a raise would do
  if (v.note === 'premium') return `${mine.label}: fine. (Raising with this hand is never a mistake.)`;
  if (v.note === 'preSize') return `${mine.label}: fine. (${bare(best)} scores about the same; using one size with all your hands is the better habit.)`;
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
    const who = v.thin && v.thin.nick ? `Against ${v.thin.nick}, a bet` : 'A bet';
    return `${mine.label}: fine. (${who} of about $${m.to ?? bare(best).replace(/^\D+/, '')} does about $${Math.max(0, m.gain || 0)} better here. With ${m.players || 'several'} players in, a check is defensible; a bet is the more profitable habit.)`;
  }
  if (v.note === 'mwDraw') return `${mine.label}: fine. (With a draw and several players in, checking or calling is standard; ${bare(best).toLowerCase()} scores higher against these opponents.)`;
  if (v.note === 'mwSize') return `${mine.label}: fine. (A bigger bet rates higher, but with several players in and this hand, a small bet is reasonable.)`;
  if (v.note === 'tinyPot') return `${mine.label}: fine. (A bet rates a little higher, but in a pot this small it is not worth a flag.)`;
  if (v.note === 'foldsBetter') return `${mine.label}: fine. (A bet here mostly folds the better hands; checking is the habit to keep.)`;
  if (v.note === 'passiveFold') return `${mine.label}: fine. (When a passive player leads into a crowd, one pair is often beaten.)`;
  if (v.note === 'unclear') return `${mine.label}: fine. (The best play here changes with small differences in how these players play, so it is not graded.)`;
  if (v.note === 'checkOOP') return `${mine.label}: fine. (With several players or the preflop raiser still to act behind you, checking one pair is standard.)`;
  if (v.note === 'sizeCheck') return `${mine.label}: fine. (A bet of up to three-quarters of the pot rates about the same.)`;
  if (v.note === 'callPrice') return `${mine.label}: fine. (Folding rates a little higher, but this call can only cost its price; later decisions are graded when you make them.)`;
  if (v.note === 'bluffRaise') return `${mine.label}: fine. (The simulation likes a bluff-raise here, but that only works on these bots; it is not a habit to build.)`;
  if (v.note === 'overbet') return `${mine.label}: fine. (A bet bigger than the pot scores higher against these bots; a pot-sized bet or smaller is all you are held to.)`;
  if (v.note === 'preBluff') return `${mine.label}: fine. (A re-raise bluff scores higher against these bots; it is not a habit to build.)`;
  if (v.note === 'preFold') return `${mine.label}: fine.`;
  if (v.note === 'sizeOk') return `${mine.label}: fine. (A bigger bet scores a little higher, but this is a real value size.)`;
  if (v.note === 'riverBluff' || v.note === 'passedBluff') return `${mine.label}: fine. (A bluff scores higher against these bots; not enough to rely on at a real table.)`;
  if (v.note === 'fragile') return `${mine.label}: fine. (${bare(best)} scores higher, but not under every reasonable read of these players.)`;
  if (v.mine !== v.best) return `${mine.label}: fine. (${bare(best)} rates about the same.)`;
  const rivals = v.options.filter((o, i) => i !== v.best && o.close);
  if (!rivals.length) return `${mine.label}: the best play here.`;
  return `${mine.label}: good. (${rivals.length === 1 ? bare(rivals[0]) + ' rates' : 'Other options rate'} about the same.)`;
}

// What a flagged play cost, as shown: the gap between the two options' values in whole dollars,
// each rounded the way the numbers table and the bars show them, so the three always agree and
// totals add up to the sum of what each verdict said.
export function shownCost(v) {
  if (v.grade === 'good' || v.mine < 0) return 0;
  if (v.dominated) return v.dominated; // behind the best play by at least this much under every read
  return Math.max(0, Math.round(v.options[v.best].ev) - Math.round(v.options[v.mine].ev));
}

export function explain(d) {
  const v = d.verdict;
  if (v.mine < 0) return { category: 'other', headline: '', reasons: [], theory: null, cost: 0 };
  const mine = v.options[v.mine];
  const best = v.options[v.best];
  if (v.grade === 'good') {
    return {
      category: null,
      headline: goodHeadline(v, mine, best),
      reasons: [],
      theory: null,
      cost: 0,
      tip: v.tip ? v.tip.text : null, // "Tip: ..." under a fine verdict
      tipKind: v.tip ? v.tip.kind : null,
    };
  }
  const category = categorise(d);
  const cost = shownCost(v);
  const m = kind(mine);
  const b = kind(best);
  const word = v.grade === 'blunder' ? 'Blunder' : 'Mistake';
  const ref = v.ref === 'noRaise' ? `${best.label.toLowerCase()} (the best play that is not a raise)` : v.ref === 'upTo75' ? `the best bet up to three-quarters of the pot (${bare(best).toLowerCase()})` : v.ref === 'upToPot' ? `the best bet up to the size of the pot (${bare(best).toLowerCase()})` : best.label.toLowerCase();
  const headline = v.dominated
    ? `${word}: ${mine.label.toLowerCase()} scores at least $${cost} below the best play here under every reasonable read of these players.`
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
  return { category, headline, reasons, theory, cost };
}
