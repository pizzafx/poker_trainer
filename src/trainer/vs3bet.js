// The facts behind the coach's 'preVs3bet' copy (STRAT's spec v2 with MATH's thresholds, notes/MATH_PREVS3BET.md;
// CEO-approved 23 Nov): a preflop call or re-raise facing a re-raise. Measured at the decision, from the read tracker,
// so the copy says only what the belief supports.
import { STREET } from '../engine/game.js';
import { classNames } from '../engine/hands.js';
import { buildContext } from '../bots/policy.js';
import { equityVsRange } from './equity.js';

// P: the share of the re-raiser's belief range in JJ+, AKs and AKo (MATH)
const PREMIUM = ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo'];
// the smallest rung of MATH's ladder whose share reaches the bar is the one named
export const LADDER = [
  ['aces and kings', ['AA', 'KK']],
  ['KK+ and AK', ['AA', 'KK', 'AKs', 'AKo']],
  ['QQ+ and AK', ['AA', 'KK', 'QQ', 'AKs', 'AKo']],
  ['JJ+ and AK', ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo']],
];
// how the copy names a read (STRAT): short, the way a player would say it
const TYPE_WORD = { nit: 'nit', abc: 'straightforward player', station: 'calling station', whale: 'gambler', maniac: 'maniac', gto: 'solver-style player', tag: 'solid regular', lag: 'loose-aggressive regular', beginner: 'beginner' };

// null unless it is a preflop decision facing a re-raise (a 3-bet or more) by one opponent
export function vs3betFacts(s, belief, readOf, hero = 0) {
  if (s.street !== STREET.PRE) return null;
  const ctx = buildContext(s, hero);
  const agg = ctx.aggressor;
  if (!(ctx.toCall > 0) || ctx.raises < 2 || agg < 0 || agg === hero) return null;
  const g = belief.grid(agg);
  const idx = (n) => classNames.indexOf(n);
  const shareOf = (names) => names.reduce((a, n) => a + g.cells[idx(n)].share, 0);
  const P = shareOf(PREMIUM);
  const bar = P >= 0.85 ? 0.85 : P >= 0.67 ? 0.67 : null;
  let set = null;
  let S = null;
  if (bar !== null) {
    for (const [name, list] of LADDER) {
      const x = shareOf(list);
      if (x >= bar - 1e-9) {
        set = name;
        S = Math.round((100 * x) / 5) * 5;
        break;
      }
    }
  }
  const ev = equityVsRange(s.hole[hero], g.cells.map((c) => c.share), 400);
  const eq = ev.equity;
  // STRAT (QA-VERDICT's AK vs QQ+/AK): the share of the range's combos left after hero's cards that hero has under 45%
  // against; the 4-bet's "almost all ahead" line needs at least 80%. Measured only when that line can print (P >= 0.85).
  let aheadShare = null;
  if (P >= 0.85) {
    let w = 0;
    let a = 0;
    g.cells.forEach((c, k) => {
      if (!(c.share > 0) || !(ev.live[k] > 0) || Number.isNaN(ev.cls[k])) return;
      const x = c.share * ev.live[k];
      w += x;
      if (ev.cls[k] < 0.45) a += x;
    });
    aheadShare = w > 0 ? +(a / w).toFixed(3) : null;
  }
  const call = ctx.toCall;
  const pot = ctx.pot; // what is in the middle now, the re-raise included
  const heroLeft = s.stacks[hero];
  const villLeft = s.stacks[agg];
  // what hero still has to put in if it all goes in, and the pot that makes; what is behind after the call
  const allIn = Math.min(heroLeft, villLeft + call);
  const behind = Math.max(0, Math.min(heroLeft - call, villLeft));
  const potAfter = pot + call;
  // STRAT's amendment (MATH's short-stack table): under 1.5x the pot behind, the price is the all-in price
  const short = behind < 1.5 * potAfter;
  const need = short ? allIn / (pot + allIn + (allIn - call)) : call / (pot + call);
  // the re-raise over hero's own raise: the raise before this one was hero's
  const raisesPre = s.history.filter((h) => h.street === STREET.PRE && (h.type === 'raise' || h.type === 'bet'));
  const overYours = raisesPre.length >= 2 && raisesPre[raisesPre.length - 2].seat === hero;
  const top = readOf(agg) && readOf(agg).ranked && readOf(agg).ranked[0];
  return {
    seat: agg,
    P: +P.toFixed(3),
    set,
    S,
    eq: +eq.toFixed(3),
    aheadShare,
    need: +need.toFixed(3),
    short,
    call,
    behind,
    potAfter,
    raises: ctx.raises,
    overYours,
    type: top ? top.id : null,
    typeWord: top ? TYPE_WORD[top.id] || 'player' : 'player',
  };
}
