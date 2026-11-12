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
  other: 'Other',
};

const pct = (x) => `${Math.round(100 * x)}%`;

function kind(a) {
  return a.type === 'raise' ? 'raise' : a.type;
}

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
    if (m === 'raise') return weak ? 'badBluff' : d.tier >= TIER.TWO_PAIR ? 'other' : 'overplay';
    if (m === 'call' && b === 'raise') return 'missedValue';
    return 'other';
  }
  if (m === 'check' && b === 'raise') return d.tier >= TIER.TOP_PAIR_WEAK ? 'missedValue' : 'missedBluff';
  if (m === 'raise' && b === 'check') return weak ? 'badBluff' : 'overplay';
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
  if (v.note === 'bluffRaise') return `${mine.label}: fine. (The simulation likes a bluff-raise here, but that only works on these bots; it is not a habit to build.)`;
  if (v.note === 'overbet') return `${mine.label}: fine. (A bet bigger than the pot scores higher against these bots; a pot-sized bet or smaller is all you are held to.)`;
  if (v.note === 'preBluff') return `${mine.label}: fine. (A re-raise bluff scores higher against these bots; it is not a habit to build.)`;
  if (v.note === 'preFold') return `${mine.label}: fine.`;
  if (v.note === 'sizeOk') return `${mine.label}: fine. (A bigger bet scores a little higher, but this is a real value size.)`;
  if (v.note === 'riverBluff' || v.note === 'passedBluff') return `${mine.label}: fine. (A bluff scores higher against these bots; not enough to rely on at a real table.)`;
  if (v.note === 'fragile') return `${mine.label}: fine. (${best.label} scores higher, but not once the opponents are a little looser or tighter than assumed.)`;
  if (v.mine !== v.best) return `${mine.label}: fine. (${best.label} rates about the same.)`;
  const rivals = v.options.filter((o, i) => i !== v.best && o.close);
  if (!rivals.length) return `${mine.label}: the best play here.`;
  return `${mine.label}: good. (${rivals.length === 1 ? rivals[0].label + ' is' : 'Other options are'} too close to call.)`;
}

// What a flagged play cost, as shown: the gap between the two options' values in whole dollars,
// each rounded the way the numbers table and the bars show them, so the three always agree and
// totals add up to the sum of what each verdict said.
export function shownCost(v) {
  if (v.grade === 'good' || v.mine < 0) return 0;
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
    };
  }
  const category = categorise(d);
  const cost = shownCost(v);
  const word = v.grade === 'blunder' ? 'Blunder' : 'Mistake';
  const headline = `${word}: ${mine.label.toLowerCase()} costs about $${cost} compared with ${best.label.toLowerCase()}.`;
  const reasons = [];
  const r1 = readLine(d);
  if (r1) reasons.push(r1);
  const r2 = rangeLine(d);
  if (r2) reasons.push(r2);
  if (d.street !== STREET.PRE && d.opponents >= 3 && d.tier <= TIER.OVERPAIR_TPTK) {
    reasons.push(`There are ${d.opponents} opponents still in. With that many players someone usually has a real hand, so bluffs work less and one pair is worth less.`);
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
  // "A routine fold against a balanced range" is only true of one-pair hands.
  if (category === 'overFold' && d.tier !== null && d.tier > TIER.OVERPAIR_TPTK) theory = null;
  return { category, headline, reasons, theory, cost };
}
