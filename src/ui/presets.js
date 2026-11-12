// Bet-size preset buttons for the action bar, and which size is selected by default.
// Pure functions (no DOM), so they can be tested in Node.
import { STREET } from '../engine/game.js';

export function presets(L, s) {
  const out = [];
  const pot = L.pot;
  if (s.street === STREET.PRE) {
    if (s.raises === 0) {
      let limpers = 0;
      for (const e of s.history) if (e.type === 'call' && !s.folded[e.seat]) limpers++;
      for (const m of [3, 4, 5, 6]) out.push([`${m}x${limpers ? '+' + limpers : ''}`, (m + limpers) * s.currentBet]);
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
  for (let i = 0; i < s.n; i++) if (i !== s.toAct && !s.folded[i]) cover = Math.max(cover, s.bet[i] + s.stacks[i]);
  const top = Math.max(L.minTo, Math.min(L.maxTo, cover));
  const kept = out.filter(([, v]) => Math.round(v) < 0.8 * top);
  if (!kept.length && s.currentBet === 0) {
    kept.push(['⅓ of stacks', top / 3], ['⅔ of stacks', (2 * top) / 3]);
  }
  kept.push([top >= L.maxTo ? 'All-in' : 'Put them all-in', top]);
  return kept.map(([l, v]) => [l, Math.max(L.minTo, Math.min(L.maxTo, Math.round(v)))]);
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
