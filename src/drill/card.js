// Drill: the spot card's facts, from a bank spot record. Replays the hand with the engine (no judge, no read
// tracker) and says what the player sees before acting: the street, board, cards, seat, stacks, pot and price,
// one line per street of action, and each live opponent's read. Shared by the Drill page and the offline
// sheets (the blind check).

import { newHand, applyAction, legal, STREET, positionName } from '../engine/game.js';
import { cardStr } from '../engine/cards.js';

const HERO = 0;
const STREET_WORDS = ['Preflop', 'Flop', 'Turn', 'River'];
export const TYPE_WORDS = {
  nit: 'Nit',
  abc: 'Straightforward',
  station: 'Calling station',
  whale: 'Gambler',
  maniac: 'Maniac',
  gto: 'Solver-style',
  tag: 'Solid regular',
  lag: 'Tricky aggressive',
  beginner: 'Beginner',
};
// one plain line on how each type plays, for the read (after the flop; before it the read says how many hands
// the player plays)
export const TYPE_LINES = {
  nit: 'Bets big only with strong hands',
  abc: 'Bets good hands, checks weak ones',
  station: 'Folds to bets: rarely',
  whale: 'Plays most hands, calls too much',
  maniac: 'Bets and raises with almost anything',
  gto: 'Balanced: bluffs at a sensible rate',
  tag: 'Plays few hands, bets them hard',
  lag: 'Plays many hands, bluffs often',
  beginner: 'Calls a lot, bets only big hands',
};

// before the flop on a small sample (under 20 hands): the type's own line, never a session VPIP (DESIGN)
export const PRE_LINES = {
  nit: 'Plays few hands',
  tag: 'Plays few hands, raises most',
  abc: 'Plays a normal range',
  lag: 'Plays many hands, raises often',
  station: 'Plays most hands, calls a lot',
  whale: 'Plays most hands, calls a lot',
  beginner: 'Plays most hands, calls a lot',
  maniac: 'Plays and raises almost everything',
  gto: 'Plays a standard range',
};
export const SMALL_SAMPLE = 20;

// the table at the decision
export function replayTable(rec) {
  let dealt = 0;
  let s = null;
  const fixed = () => {
    const idx = s.remaining.indexOf(rec.board[dealt++]);
    return (idx + 0.5) / s.remaining.length;
  };
  s = newHand({ stacks: rec.stacks, button: rec.button, sb: rec.sb, bb: rec.bb, straddle: rec.straddle, rake: rec.rake, hole: rec.hole, rng: fixed });
  const steps = [];
  for (const a of rec.actions) {
    const before = { street: s.street, toCall: s.currentBet - s.bet[a.seat], pos: positionName(s, a.seat), pot: s.total.reduce((x, y) => x + y, 0) };
    applyAction(s, a.type === 'raise' ? { type: 'raise', to: a.to } : { type: a.type }, fixed);
    const h = s.history[s.history.length - 1];
    steps.push({ ...before, seat: a.seat, type: h.type, to: h.to, amount: h.amount, allIn: !!h.allIn });
  }
  return { s, steps };
}

const money = (x) => `$${Math.round(x)}`;
function verb(st, who) {
  const you = st.seat === HERO;
  const s3 = (w) => (you ? w : `${w}s`);
  if (st.type === 'fold') return `${who} ${s3('fold')}`;
  if (st.type === 'check') return `${who} ${s3('check')}`;
  if (st.type === 'call') return `${who} ${st.isLimp ? (you ? 'limp' : 'limps') : s3('call')} ${money(st.amount)}${st.allIn ? ' (all-in)' : ''}`;
  if (st.type === 'bet') return `${who} ${s3('bet')} ${money(st.to)}${st.allIn ? ' (all-in)' : ''}`;
  return `${who} ${you ? 'raise' : 'raises'} to ${money(st.to)}${st.allIn ? ' (all-in)' : ''}`;
}

// The card's facts. `reads` is the bank entry's { seat: { type, hands, vpip } }.
export function spotCard(rec, reads = {}) {
  const { s, steps } = replayTable(rec);
  const bb = rec.bb;
  const pot = s.total.reduce((x, y) => x + y, 0);
  const toCall = Math.max(0, s.currentBet - s.bet[HERO]);
  const L = legal(s);
  // one line per street; preflop calls with no raise before them are limps
  const lines = [];
  let raisedPre = false;
  for (let st = 0; st <= s.street; st++) {
    const parts = [];
    for (const x of steps.filter((y) => y.street === st)) {
      if (st === STREET.PRE && x.type === 'call') x.isLimp = !raisedPre;
      if (st === STREET.PRE && (x.type === 'raise' || x.type === 'bet')) raisedPre = true;
      const who = x.seat === HERO ? 'you' : x.pos;
      const t = verb(x, who);
      if (t) parts.push(t);
    }
    const boardNow = st === 1 ? rec.board.slice(0, 3) : st === 2 ? rec.board.slice(3, 4) : st === 3 ? rec.board.slice(4, 5) : [];
    lines.push({ street: STREET_WORDS[st], board: boardNow.map(cardStr), boardIds: boardNow, text: parts.length ? parts.join(', ') : st === s.street ? '' : 'no action', current: st === s.street });
  }
  if (lines.length) {
    const cur = lines[lines.length - 1];
    cur.text = cur.text ? `${cur.text}. It’s on you.` : 'It’s on you.';
  }
  const effective = Math.min(s.stacks[HERO] + s.bet[HERO], Math.max(0, ...[...Array(s.n).keys()].filter((i) => i !== HERO && !s.folded[i]).map((i) => s.stacks[i] + s.bet[i])));
  const opponents = Object.entries(reads).map(([seat, r]) => ({
    seat: +seat,
    pos: positionName(s, +seat),
    type: r.type,
    label: TYPE_WORDS[r.type] || r.type,
    strength: 'strong read',
    hands: r.hands,
    // a banked read is pinned, so it has no session sample: the type's own line, never "N hands" or a VPIP (CURR, spec 3)
    line: s.street === STREET.PRE ? PRE_LINES[r.type] || '' : TYPE_LINES[r.type] || '',
    vpip: r.vpip,
  }));
  return {
    street: STREET_WORDS[s.street],
    board: s.board.map(cardStr),
    hole: s.hole[HERO].map(cardStr),
    boardIds: s.board.slice(),
    holeIds: s.hole[HERO].slice(),
    position: positionName(s, HERO),
    stack: s.stacks[HERO] + s.bet[HERO],
    stackBb: +((s.stacks[HERO] + s.bet[HERO]) / bb).toFixed(0),
    effectiveBb: +(effective / bb).toFixed(0),
    pot,
    potBb: +(pot / bb).toFixed(1),
    toCall,
    toCallBb: +(toCall / bb).toFixed(1),
    bb,
    sb: rec.sb,
    lines,
    opponents,
    canCheck: L.canCheck,
    behind: [...Array(s.n).keys()].filter((i) => i !== HERO && !s.folded[i] && !steps.some((x) => x.seat === i && x.street === s.street && x.type !== 'sb' && x.type !== 'bb')).length,
  };
}
