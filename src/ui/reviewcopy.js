// The review card's headline words (STRAT, owner 26 Nov: "what does it mean it cost me $7. I won the hand"): the result
// is said as a result, and a decision's figure is what it is worth on average, never what it "cost you". The two share
// a sentence only where it says why they differ: the cards that came, and only when the cards decided it (a showdown)
// and the flagged play put money in (a call, bet, raise or all-in). A hand won because everyone folded, or a flagged
// check that still won, stops at "on average" (CEO, STRAT).

// "bet", "raise", "all-in", "call", "check", "fold"
export function actionNoun(o) {
  if (!o) return 'play';
  if (o.type === 'raise') return /^bet/i.test(o.label) ? 'bet' : /^all-in/i.test(o.label) ? 'all-in' : 'raise';
  return o.type;
}

// the best option as the card names it: "folding", "calling", "betting", "raising", "going all-in"
export function ingWord(o) {
  const n = actionNoun(o);
  return n === 'all-in' ? 'going all-in' : { fold: 'folding', check: 'checking', call: 'calling', bet: 'betting', raise: 'raising' }[n] || 'the best play';
}

// net: the hand's result for you; decisions: the hand's judged decisions (verdict, cost); showdown: the cards decided
// it; isBest(d): the decision was the best play; money(x): "$7". Returns { result, cost: { cls, text } | null }.
export function reviewWords({ net, decisions, showdown, isBest, money }) {
  const ds = decisions;
  const flagged = ds.filter((d) => d.verdict.grade !== 'good');
  const total = flagged.reduce((a, d) => a + d.cost, 0);
  const result = net > 0 ? `You won ${money(net)} this hand.` : net < 0 ? `You lost ${money(-net)} this hand.` : 'You broke even this hand.';
  if (!flagged.length) {
    if (!ds.length) return { result, cost: null };
    const nb = ds.filter(isBest).length;
    const fine = !nb ? 'Every decision was fine' : ds.length === 1 ? 'Your decision was the best play' : `Every decision fine, ${nb} of them the best play`;
    return { result, cost: { cls: 'ok', text: net < 0 ? `${fine}: the cards went against you.` : `${fine}.` } };
  }
  if (flagged.length > 1) return { result, cost: { cls: 'neg', text: `${flagged.length} plays were worth about ${money(total)} less than the best ones, on average.` } };
  const v = flagged[0].verdict;
  const ref = v.options[v.best] ? ` than ${ingWord(v.options[v.best])}` : ' than the best play';
  const tail = net > 0 && showdown && ['call', 'raise'].includes(v.options[v.mine] && v.options[v.mine].type) ? ' on average: it won this time because of the cards that came' : ', on average';
  return { result, cost: { cls: 'neg', text: `One ${actionNoun(v.options[v.mine])} was worth about ${money(flagged[0].cost)} less${ref}${tail}.` } };
}
