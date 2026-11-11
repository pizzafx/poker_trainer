// Opponents: a hidden playing style plus what you can see across the table.
// The looks below are tied to styles only loosely, as in a real card room. The likelihood
// numbers are modelling assumptions (no one has measured how well appearance predicts
// style), chosen so that looks help but mislead often enough to matter.

import { PROFILES, TYPE_IDS, personalise } from '../bots/profiles.js';

// Order of the numbers: nit, abc, station, whale, maniac, gto, tag, lag, beginner (= TYPE_IDS order).
const LOOKS = [
  { id: 'cap', icon: '🧢', nick: 'Ball Cap', text: 'Retiree in a ball cap, coffee, neat stacks, knows every dealer by name', w: [40, 12, 8, 3, 1, 0, 6, 1, 0] },
  { id: 'golf', icon: '⛳', nick: 'Golf Shirt', text: 'Older guy in a golf shirt, in town for the week, chatty', w: [12, 18, 14, 10, 2, 0, 1, 0, 8] },
  { id: 'hoodie', icon: '🎧', nick: 'Hoodie', text: 'Twenties, hoodie and headphones, backpack under the chair', w: [1, 3, 3, 1, 8, 50, 30, 35, 1] },
  { id: 'loud', icon: '🍺', nick: 'Loud Guy', text: 'Young, loud, on his third beer, bought in with crumpled bills', w: [0, 4, 8, 20, 40, 2, 1, 3, 6] },
  { id: 'party', icon: '🎉', nick: 'Party Crew', text: 'Came with friends, laughing, not watching the action closely', w: [0, 8, 12, 25, 20, 0, 0, 0, 15] },
  { id: 'button', icon: '👔', nick: 'Button-Down', text: 'Middle-aged, button-down shirt, quiet, glancing at the game on TV', w: [10, 20, 15, 8, 3, 2, 8, 3, 6] },
  { id: 'shades', icon: '🕶️', nick: 'Shades', text: 'Thirties, sunglasses, riffles chips nonstop, says nothing', w: [5, 3, 2, 0, 4, 25, 35, 35, 0] },
  { id: 'cardigan', icon: '🧶', nick: 'Cardigan', text: 'Sixties, cardigan, friendly, chats with the dealer between hands', w: [15, 12, 12, 4, 1, 0, 2, 1, 6] },
  { id: 'jersey', icon: '🏈', nick: 'Jersey', text: 'Team jersey, eyes mostly on the TVs, plays between sips', w: [2, 15, 20, 12, 8, 0, 1, 1, 8] },
  { id: 'newbie', icon: '🙋', nick: 'New Guy', text: 'Looks new: asks the dealer about the blinds, guards his cards with both hands', w: [8, 15, 12, 5, 1, 1, 0, 0, 60] },
  { id: 'watch', icon: '⌚', nick: 'Big Watch', text: 'Flashy watch, thick roll of hundreds, asking about a bigger game', w: [0, 2, 5, 20, 20, 2, 3, 10, 2] },
  { id: 'plain', icon: '📱', nick: 'Jeans', text: 'Nothing stands out: jeans, phone on the rail', w: [7, 10, 9, 7, 5, 5, 12, 10, 6] },
];

// Normalise so each column is P(look | type).
const T = TYPE_IDS.length;
const colSum = new Array(T).fill(0);
for (const L of LOOKS) for (let t = 0; t < T; t++) colSum[t] += L.w[t];
for (const L of LOOKS) L.p = L.w.map((v, t) => v / colSum[t]);

// How each type tends to buy in, as a share of the table maximum [low, high].
const BUYIN = {
  nit: [0.5, 1],
  abc: [0.4, 1],
  station: [0.35, 1],
  whale: [0.5, 1],
  maniac: [0.7, 1],
  gto: [1, 1],
  tag: [1, 1],
  lag: [1, 1],
  beginner: [0.5, 1],
};

// Chance of going on tilt after losing a big pot, and of rebuying after busting.
const TILT = { nit: 0.05, abc: 0.2, station: 0.3, whale: 0.45, maniac: 0.5, gto: 0.15, tag: 0.08, lag: 0.15, beginner: 0.2 };
const REBUY = { nit: 0.5, abc: 0.6, station: 0.7, whale: 0.9, maniac: 0.85, gto: 0.9, tag: 0.9, lag: 0.9, beginner: 0.8 };

// Table types: the same player types, in a different mix. Numbers multiply each type's
// usual share of the pool (order: nit, abc, station, whale, maniac, gto, tag, lag), so even
// the extreme tables are made of players you really meet, just more of one kind.
export const TABLES = {
  typical: { label: 'Typical mix', mix: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  aggressive: { label: 'Aggressive: more maniacs, gamblers and tricky regulars', mix: [0.4, 0.6, 0.8, 1.8, 2.5, 1.5, 1.2, 2.5, 1] },
  tight: { label: 'Conservative: more nits and careful players', mix: [2.5, 1.4, 0.6, 0.3, 0.2, 1, 1.4, 0.6, 1] },
  loose: { label: 'Loose and passive: a limp-fest of callers', mix: [0.6, 1, 1.6, 1.8, 0.6, 0.5, 0.6, 0.5, 1] },
};

function sharesFor(mix) {
  const sh = TYPE_IDS.map((id, i) => PROFILES[id].share * (mix ? mix[i] : 1));
  const sum = sh.reduce((a, b) => a + b, 0);
  return sh.map((v) => v / sum);
}

export function tiltChance(type) {
  return TILT[type];
}
export function rebuyChance(type) {
  return REBUY[type];
}

// Chance a player of each type sits down short, with the table minimum.
const SHORT = { nit: 0.15, abc: 0.25, station: 0.3, whale: 0.2 };

export function buyIn(type, minBuy, maxBuy, rng) {
  if (rng() < (SHORT[type] || 0)) return minBuy;
  const [lo, hi] = BUYIN[type];
  const x = (lo + (hi - lo) * rng()) * maxBuy;
  return Math.max(minBuy, Math.round(x / 20) * 20);
}

let nextId = 1;

// `fixed` (home games): { type, shares } seats a chosen type; `shares` is the make-up of the
// table, which is what you know going in (who is which, you have to work out).
export function makePlayer(rng, takenNicks, minBuy, maxBuy, mix, fixed) {
  const shares = fixed ? fixed.shares : sharesFor(mix);
  let r = rng();
  let type = TYPE_IDS[0];
  if (fixed) type = fixed.type;
  else {
    for (const id of TYPE_IDS) {
      if ((r -= shares[TYPE_IDS.indexOf(id)]) < 0) {
        type = id;
        break;
      }
    }
  }
  const t = TYPE_IDS.indexOf(type);
  let q = rng();
  let look = LOOKS[LOOKS.length - 1];
  for (const L of LOOKS) {
    if ((q -= L.p[t]) < 0) {
      look = L;
      break;
    }
  }
  // What the look alone tells you: prior over types.
  // You know what kind of table you sat down at, so the starting read uses that mix.
  const prior = TYPE_IDS.map((id, i) => shares[i] * look.p[i]);
  const sum = prior.reduce((a, b) => a + b, 0);
  let nick = look.nick;
  let k = 2;
  while (takenNicks.has(nick)) nick = `${look.nick} ${k++}`;
  return {
    id: nextId++,
    type,
    profile: personalise(type, rng), // this player's own version of the type
    nick,
    look: look.text,
    icon: look.icon,
    prior: prior.map((v) => v / sum),
    stack: buyIn(type, minBuy, maxBuy, rng),
    tilt: 0,
    tiltHands: 0,
    steaming: false, // visible to the trainee
    notes: { hands: 0, vpip: 0, pfr: 0, showdowns: [] },
    read: null,
  };
}
