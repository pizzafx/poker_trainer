// Bet-size preset buttons for the action bar, and which size is selected by default.
// Pure functions (no DOM) so they can be tested in Node. Each preset is [label, amount, title,
// seat]: the title explains a label that hides arithmetic, and the last (all-in) preset names the
// seat it covers, so the page can say whom it puts all in.
import { STREET } from '../engine/game.js';

export function presets(L, s) {
  const out = [];
  const pot = L.pot;
  if (s.street === STREET.PRE) {
    if (s.raises === 0) {
      let limpers = 0;
      for (const e of s.history) if (e.type === 'call' && !s.folded[e.seat]) limpers++;
      // Opens are labelled in dollars ("3x+2" was arithmetic to do mid-hand); the rule is in the title.
      for (const m of [3, 4, 5, 6]) out.push([null, (m + limpers) * s.currentBet, `${m}x the big blind${limpers ? `, plus $${s.currentBet} for each limper` : ''}`]);
    } else {
      for (const m of [2.5, 3, 4]) out.push([`${m}x`, m * s.currentBet]);
    }
  } else if (s.currentBet === 0) {
    for (const [l, f] of [['⅓', 0.33], ['½', 0.5], ['⅔', 0.66], ['Pot', 1], ['1.5x', 1.5]]) out.push([l, f * pot]);
  } else {
    for (const m of [2.5, 3]) out.push([`${m}x`, m * s.currentBet]);
    out.push(['Pot', s.currentBet + pot + L.callAmt]);
  }
  // Betting more than the biggest remaining opponent can call is the same as putting them
  // all-in, so sizes above that are dropped and the last button covers them.
  let cover = 0;
  let coverSeat = -1;
  for (let i = 0; i < s.n; i++) {
    if (i !== s.toAct && !s.folded[i] && s.bet[i] + s.stacks[i] > cover) {
      cover = s.bet[i] + s.stacks[i];
      coverSeat = i;
    }
  }
  const top = Math.max(L.minTo, Math.min(L.maxTo, cover));
  const kept = out.filter(([, v]) => Math.round(v) < 0.8 * top);
  if (!kept.length && s.currentBet === 0) {
    kept.push(['⅓ of stacks', top / 3], ['⅔ of stacks', (2 * top) / 3]);
  }
  // One short label whatever it covers; the title says whether it is your stack or theirs.
  kept.push(['All-in', top, null, top >= L.maxTo ? -1 : coverSeat]);
  return kept.map(([l, v, title = null, seat = -1]) => {
    const to = Math.max(L.minTo, Math.min(L.maxTo, Math.round(v)));
    return [l ?? `$${to}`, to, title, seat];
  });
}

// The size selected when a decision starts. Never the all-in button: shoving should always be
// a deliberate click. Prefer the second preset (a standard open or raise), then the first, then
// the minimum raise. Only when every legal raise puts someone all-in is that the default.
export function defaultRaise(L, s) {
  const p = presets(L, s);
  const allIn = p[p.length - 1][1];
  const sizes = p.slice(0, -1).map(([, v]) => v).filter((v) => v < allIn);
  if (sizes.length >= 2) return sizes[1];
  if (sizes.length === 1) return sizes[0];
  return L.minTo < allIn ? L.minTo : allIn;
}
