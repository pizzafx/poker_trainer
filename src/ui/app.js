import { Session, GAMES, RAKES } from '../trainer/session.js';
import { RANKS } from '../engine/cards.js';
import { potSize, positionName, STREET } from '../engine/game.js';
import { classIndex, classOf } from '../engine/hands.js';
import { evaluate } from '../engine/evaluator.js';
import { handFeatures } from '../engine/features.js';
import { PROFILES, TYPE_IDS, baseDef, currentDef, applyOverrides } from '../bots/profiles.js';
import { CONTROLS } from '../trainer/tuning.js';
import { CATEGORIES } from '../trainer/explain.js';
import { DRILLS } from '../trainer/drills.js';
import { TABLES } from '../trainer/players.js';
import { presets, defaultRaise } from './presets.js';
import { disputeReport, disputeText, disputeFileName, disputeIssueUrl } from '../trainer/dispute.js';
import { RANGE_GROUPS, presetRanges, shareOf } from '../trainer/ranges.js';

const $ = (id) => document.getElementById(id);
const HERO = 0;
const SUIT_SYM = ['♣', '♦', '♥', '♠'];
const SUIT_CLS = ['c', 'd', 'h', 's'];

// What a new player starts on: $1/$3 with a 100-big-blind buy-in and a typical capped rake.
// Players who already have saved settings keep theirs.
const DEFAULTS = { v: 3, game: '1/3', maxBuy: 300, rake: 'pct', table: 'typical', onlyRange: true, ranges: presetRanges('standard'), rangesLive: true, mode: 'casino', home: { sb: 1, bb: 2, buy: 200, counts: { station: 2, nit: 1, maniac: 1, abc: 1, beginner: 1, tag: 1 } }, feedback: 'now', reads: true, speed: 450 };
let settings = { ...DEFAULTS };
let firstVisit = true; // nothing saved yet: deal straight in and show the one-time hint
try {
  const raw = localStorage.getItem('trainer-settings');
  firstVisit = !raw;
  const saved = JSON.parse(raw || '{}');
  if (saved.v === DEFAULTS.v) Object.assign(settings, saved);
  else if (saved.v === 2) {
    // Version 2 had "skip junk hands" (the bottom 15%). Its place is taken by your own ranges:
    // on (the standard ranges) for players who had it on, off for those who had it off.
    const { skipJunk, ...rest } = saved;
    Object.assign(settings, rest, { v: DEFAULTS.v, onlyRange: skipJunk !== false, ranges: presetRanges('standard') });
    try {
      localStorage.setItem('trainer-settings', JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  } // anything older is dropped
} catch {
  /* storage unavailable: use defaults */
}
// A buy-in of 100 big blinds, kept inside the room's range.
const defaultBuy = (game) => {
  const g = GAMES[game];
  return Math.max(g.minBuy, Math.min(g.maxBuy, 100 * g.bb));
};
function saveSettings() {
  try {
    localStorage.setItem('trainer-settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

// Player-type changes made on the Players screen: { type: { controlKey: value } }.
let tuning = {};
try {
  tuning = JSON.parse(localStorage.getItem('trainer-tuning') || '{}');
} catch {
  /* storage unavailable */
}
// Turns the saved control values into parameter overrides and puts them in force.
function applyTuning() {
  const all = {};
  for (const [type, vals] of Object.entries(tuning)) {
    if (!TYPE_IDS.includes(type)) continue;
    const base = baseDef(type);
    all[type] = {};
    for (const c of CONTROLS) if (vals[c.key] !== undefined) Object.assign(all[type], c.set(base, vals[c.key]));
  }
  applyOverrides(all);
}
applyTuning();

// Leaks tracked across sessions: { category: { count, loss, streets: { street: count } } }
let leaks = {};
try {
  leaks = JSON.parse(localStorage.getItem('trainer-leaks') || '{}');
} catch {
  /* storage unavailable */
}
function noteLeak(d) {
  if (!d || d.verdict.grade === 'good' || !d.category) return;
  const e = (leaks[d.category] ||= { count: 0, loss: 0, streets: {} });
  e.count++;
  e.loss += d.verdict.loss;
  e.streets[d.street] = (e.streets[d.street] || 0) + 1;
  try {
    localStorage.setItem('trainer-leaks', JSON.stringify(leaks));
  } catch {
    /* ignore */
  }
}
const leakName = (cat) => (CATEGORIES[cat] || cat).split(':')[0];

// Player types you can seat in a home game, in the order shown in Settings.
const HOME_TYPES = [
  ['beginner', 'Total beginner'],
  ['station', 'Calling station'],
  ['whale', 'Gambler'],
  ['abc', 'Straightforward'],
  ['nit', 'Nit (very tight)'],
  ['maniac', 'Maniac (wild, aggressive)'],
  ['lag', 'Tricky aggressive'],
  ['tag', 'Solid player'],
  ['gto', 'Solver-style'],
];

function sessionOpts() {
  const base = { heroRanges: settings.onlyRange ? settings.ranges : null, samples: 600 };
  if (settings.mode === 'home') {
    const h = settings.home;
    const lineup = [];
    for (const [t] of HOME_TYPES) for (let i = 0; i < (h.counts[t] || 0); i++) lineup.push(t);
    return { ...base, custom: { sb: h.sb, bb: h.bb, minBuy: Math.max(h.bb * 10, Math.round(h.buy / 2)), maxBuy: h.buy }, heroBuy: h.buy, lineup };
  }
  // `maxBuy` in settings is the trainee's own buy-in; opponents buy in across the room's range.
  return { ...base, game: settings.game, heroBuy: settings.maxBuy, rake: settings.rake, table: settings.table };
}

let drill = null; // { cat, tried, clean, cost } while drilling one leak
let mainSess = null; // the regular session, parked during a drill
let sess = null;
let timer = null;
let pastLog = []; // log lines from earlier hands
let raiseTo = 0;
// The decision raiseTo belongs to; a new decision (or a new session or drill) starts from the default size.
let raiseHand = null;
let raiseStep = -1;
let shownBoard = 0; // board cards already on screen (new ones animate in)
let shownPot = -1;

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const money = (x) => (x < 0 ? '-' : '') + '$' + Math.abs(Math.round(x)).toLocaleString();
const signed = (x) => (x >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(x)).toLocaleString();

function cardHtml(c) {
  const r = RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2];
  const sym = SUIT_SYM[c & 3];
  return `<span class="card ${SUIT_CLS[c & 3]}"><b${r === '10' ? ' class="ten"' : ''}>${r}</b><i>${sym}</i><u${r === '10' ? ' class="ten"' : ''}>${r}</u></span>`;
}
const backHtml = () => '<span class="card back"></span>';
const cardsInline = (cs) => `<span class="cards-inline">${cs.map((c) => cardHtml(c)).join('')}</span>`;

// ---------------------------------------------------------------- rendering

function renderStats() {
  const g = sess.game;
  if (drill) {
    $('stats').innerHTML = `
      <span class="drill-chip">Drill<b>${esc(leakName(drill.cat))}</b></span>
      <span>Good plays<b class="${drill.clean === drill.tried ? 'pos' : ''}">${drill.clean}</b> of ${drill.tried}</span>
      <span>Mistakes cost<b class="${drill.cost > 0 ? 'neg' : ''}">${money(drill.cost)}</b></span>`;
    return;
  }
  const net = sess.heroNet();
  const rev = sess.review();
  $('stats').innerHTML = `
    <span>$${g.sb}/$${g.bb}${sess.lineup ? ' home game' : ''} · hand<b>${sess.handNo}</b></span>
    <span class="sess-pill"><i class="lbl">Session</i><b class="${net >= 0 ? 'pos' : 'neg'}">${signed(net)}</b></span>
    <span>Mistakes cost<b class="${rev.lost > 0 ? 'neg' : ''}">${money(rev.lost)}</b></span>
    <span>Flagged<b>${rev.flagged}</b> of ${rev.judged}</span>`;
}

// In a drill your earlier decisions in the hand were played for you: say what they were.
function heroStory() {
  const s = sess.hand.state;
  const names = ['Preflop', 'Flop', 'Turn', 'River'];
  const parts = [];
  for (let st = 0; st <= 3; st++) {
    const acts = s.history.filter((e) => e.seat === HERO && e.street === st && !['sb', 'bb', 'straddle'].includes(e.type));
    if (!acts.length) continue;
    parts.push(`${names[st]}: you ${acts.map((e) => (e.type === 'bet' ? `bet $${e.to}` : e.type === 'raise' ? `raised to $${e.to}` : e.type === 'call' ? `called $${e.amount}` : e.type + 'ed')).join(', then ')}`);
  }
  return parts.length ? `So far this hand (played for you) — ${parts.join('. ')}.` : 'This is your first decision of the hand.';
}

function lastStreetAction(s, seat) {
  for (let k = s.history.length - 1; k >= 0; k--) {
    const e = s.history[k];
    if (e.street !== s.street) break;
    if (e.seat === seat) return e;
  }
  return null;
}

// Seat, dealer-button and bet-marker ellipses, in % of the table box: [x radius, y radius].
// Bet markers take [x radius, y radius below the middle, y radius above it]: a seat's plate
// hangs below its centre, so markers of the upper seats sit further in. On a tall phone table
// the side seats are level with the board, so their markers go up (chipLift) and out towards
// the seat (chipOut), clear of the board and of the diagonal seats' markers; the top seat's
// marker sits higher (chipTop) so the markers above the board do not form one crowded row.
const WIDE_GEOM = { cy: 49, seat: [44, 38], dealer: [34, 26.5], chip: [27, 20, 20], chipLift: 0, chipOut: 0, chipTop: 0 };
const PHONE_GEOM = { cy: 50, seat: [37.5, 41], dealer: [25, 31], chip: [23, 24.5, 18], chipLift: 14.5, chipOut: 13, chipTop: 6, heroY: 85 };
const PHONE = matchMedia('(max-width: 600px)');
// At 900px and narrower the coach panel sits below the table in the page (table.css).
const NARROW = matchMedia('(max-width: 900px)');

// A player's drawn avatar: the look's symbol from the sprite inlined in play.html.
const avatarArt = (p) => `<svg class="av-art" viewBox="0 0 48 48" aria-hidden="true"><use href="#av-${p.lookId}"/></svg>`;

function renderTable() {
  const h = sess.hand;
  const s = h.state;
  const n = s.n;
  const over = h.over;
  let seatsHtml = '';
  // Phones get a tall oval table (see the phone block at the end of table.css).
  const G = PHONE.matches ? PHONE_GEOM : WIDE_GEOM;
  for (let i = 0; i < n; i++) {
    const ang = ((90 + (i * 360) / n) * Math.PI) / 180;
    const x = 50 + G.seat[0] * Math.cos(ang);
    // On a phone your own seat sits a little higher, so your cards, plate and hand name stay inside the table box.
    const y = i === HERO && G.heroY ? G.heroY : G.cy + G.seat[1] * Math.sin(ang);
    const p = sess.seats[i];
    const pos = positionName(s, i);
    const cls = ['seat'];
    if (p.nick.length > 11) cls.push('long');
    if (i === HERO) cls.push('hero');
    if (s.folded[i]) cls.push('folded');
    if (!over && s.toAct === i) cls.push('acting');
    if (over && s.result.won[i] > 0) cls.push('winner');
    if (p.steaming) cls.push('steaming');
    if (over && s.result.showdown && !s.folded[i] && i !== HERO) cls.push('shown');
    let cards = '';
    if (i === HERO) cards = s.hole[i].map((c) => cardHtml(c)).join('');
    else if (!s.folded[i]) cards = over && s.result.showdown ? s.hole[i].map((c) => cardHtml(c)).join('') : backHtml() + backHtml();
    let read = '';
    if (i !== HERO && settings.reads) {
      const r = sess.readOf(i);
      const top = r.ranked[0];
      const pc = Math.round(top.p * 100);
      if (top.p >= 0.45) {
        const lvl = top.p >= 0.75 ? 3 : top.p >= 0.6 ? 2 : 1;
        const word = shortType(top.id);
        const label = lvl === 3 ? word : lvl === 2 ? `Likely ${word === 'ABC' ? word : word.toLowerCase()}` : `${word}?`;
        read = `<div class="read ${lvl >= 2 ? 'firm' : ''}"><i class="conf c${lvl}"></i>${esc(label)}</div>`;
      }
    }
    const stack = over ? s.stacks[i] : s.stacks[i];
    const isBtn = pos === 'BTN' || pos === 'BTN/SB';
    const badge = `<span class="badge pos${isBtn ? ' btn' : ''}">${pos}</span>`;
    // VPIP (how often they voluntarily put money in), once there are enough hands to mean something.
    let vp = null;
    if (i !== HERO && p.notes.hands >= 8) {
      const pct = Math.round((100 * p.notes.vpip) / p.notes.hands);
      // Tight to loose: slate, chalk, amber, red (the brand keeps lime for your turn and "fine").
      vp = { pct, color: pct < 18 ? 'var(--slate)' : pct < 32 ? 'var(--text)' : pct < 50 ? 'var(--warn)' : 'var(--bad)' };
    }
    seatsHtml += `<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%" data-seat="${i}"${i === HERO ? '' : ' role="button" tabindex="0"'}>
      <div class="cards">${cards}</div>
      <div class="avatar${vp ? ' has-vpip' : ''}" style="--h:${p.hue ?? 160}${vp ? `;--v:${vp.pct};--vc:${vp.color}` : ''}">${i === HERO ? '' : avatarArt(p)}${badge}${p.steaming ? '<span class="steam-dot" title="On tilt"></span>' : ''}</div>
      <div class="plate"><div class="nick">${esc(p.nick)}${i === HERO ? badge : ''}</div>
      <div class="stack">${money(stack)}</div>${read}</div>${i === HERO ? madeHand() : ''}${vp ? `<div class="vpip" style="--vc:${vp.color}"><b>${vp.pct}%</b> VPIP<div class="vpip-tip"><b>VPIP ${vp.pct}%</b>Put money in voluntarily in ${p.notes.vpip} of the ${p.notes.hands} hands you have watched. ${vp.pct < 18 ? 'Tight: mostly strong hands.' : vp.pct < 32 ? 'About average.' : vp.pct < 50 ? 'Loose: plays a lot of weak hands.' : 'Plays almost anything.'}</div></div>` : ''}${i === HERO ? '' : `<div class="tip ${y < 45 ? 'below' : ''}">${p.steaming ? '<div class="tilt">Tilt</div>' : ''}${tendencies(p).map((t) => `<div>${esc(t)}</div>`).join('')}<div>${esc(readLine(i))}</div><div class="tip-more">Click for details</div></div>`}</div>`;
    if (isBtn) {
      const dx = 50 + G.dealer[0] * Math.cos(ang + 0.2);
      const dy = G.cy + G.dealer[1] * Math.sin(ang + 0.2);
      seatsHtml += `<div class="dealer" style="left:${dx}%;top:${dy}%">D</div>`;
    }
    // Chips / last action, drawn between the seat and the middle.
    const level = Math.cos(ang) ** 8; // 1 for a seat level with the middle, near 0 elsewhere
    const bx = 50 + (G.chip[0] + G.chipOut * level) * Math.cos(ang);
    const up = Math.sin(ang) < 0;
    const by = G.cy + (up ? G.chip[2] + G.chipTop * Math.sin(ang) ** 4 : G.chip[1]) * Math.sin(ang) - G.chipLift * level;
    let chip = '';
    if (over) {
      if (s.result.won[i] > 0) chip = `<span class="what">wins</span>${money(s.result.won[i])}`;
    } else {
      const e = lastStreetAction(s, i);
      if (e) {
        if (e.type === 'check') chip = '<span class="what">check</span>';
        else if (e.type === 'fold') chip = '';
        else chip = `<span class="what">${e.type === 'sb' || e.type === 'bb' ? 'blind' : e.type}</span>$${s.bet[i]}`;
      }
    }
    if (chip) seatsHtml += `<div class="chipbet${over ? ' win' : chip.includes('$') ? '' : ' plain'}" style="left:${bx}%;top:${by}%">${chip}</div>`;
  }
  $('seats').innerHTML = seatsHtml;
  const fresh = Math.min(shownBoard, s.board.length);
  $('board').innerHTML = s.board
    .map((c, k) => (k >= fresh ? cardHtml(c).replace('class="card ', `style="--i:${k - fresh}" class="card new `) : cardHtml(c)))
    .join('');
  shownBoard = s.board.length;
  const potNow = over ? s.result.pot : potSize(s);
  $('pot').innerHTML = `<small>Pot</small>${money(potNow)}`;
  if (potNow !== shownPot) {
    const el = $('pot');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    shownPot = potNow;
  }
  const tapHint = tapHintPending && sess.hand.over ? `${PHONE.matches ? 'Tap' : 'Click'} any player to see what you've noticed about them.` : '';
  $('news').textContent = drill ? (sess.hand.over ? '' : `Drill: ${DRILLS[drill.cat].what}. ${heroStory()}`) : tapHint || sess.news.join('  ');
}

// The coach's current read, in words, for the hover box.
function readLine(seat) {
  const top = sess.readOf(seat).ranked[0];
  if (top.p < 0.45) return "Coach's read: none yet";
  const sure = top.p >= 0.75 ? 'almost certainly' : top.p >= 0.6 ? 'probably' : 'might be';
  return `Coach's read: ${sure} a ${top.name.toLowerCase()}`;
}

// A few words on what you have seen this player do, for the hover box.
function tendencies(p) {
  const n = p.notes;
  if (n.hands < 8) return [`Watched ${n.hands} hand${n.hands === 1 ? '' : 's'}: too few to say much.`];
  const played = n.vpip / n.hands;
  const raised = n.pfr / n.hands;
  const loose = played < 0.16 ? 'Tight' : played < 0.3 ? 'Average looseness' : played < 0.5 ? 'Loose' : 'Plays almost everything';
  const ratio = n.vpip ? n.pfr / n.vpip : 0;
  const style = ratio < 0.2 ? 'mostly limps and calls' : ratio < 0.5 ? 'raises now and then' : 'usually comes in raising';
  const lines = [
    `Watched ${n.hands} hands`,
    `${loose}: plays ${Math.round(played * 100)}%, raises ${Math.round(raised * 100)}%`,
    `Before the flop ${style}`,
  ];
  const sd = n.showdowns[0];
  if (sd) lines.push(`Last shown: ${sd.cards.map((c) => RANKS[c >> 2] + SUIT_SYM[c & 3]).join(' ')} (${sd.won ? 'won' : 'lost'})`);
  if (p.steaming) lines.push('Steaming after a big loss');
  return lines;
}

function shortType(id) {
  return { nit: 'Nit', abc: 'ABC', station: 'Station', whale: 'Gambler', maniac: 'Maniac', gto: 'Solver', tag: 'Solid reg', lag: 'Tricky reg', beginner: 'Beginner' }[id];
}

// Your hand in plain English: "Pair of Sevens", "Flush, Ace high", plus any draw.
const RANK_ONE = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const RANK_MANY = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
function handName(hole, board) {
  let hi = hole[0] >> 2;
  let lo = hole[1] >> 2;
  if (hi < lo) [hi, lo] = [lo, hi];
  if (!board.length) return ''; // nothing to name until there is a flop
  const sc = evaluate([...hole, ...board]);
  const cat = sc >> 20;
  const a = (sc >> 16) & 15;
  const b = (sc >> 12) & 15;
  let name;
  if (cat === 0) name = `${RANK_ONE[hi]} high`; // your own highest card, not the board's
  else if (cat === 1) name = `Pair of ${RANK_MANY[a]}`;
  else if (cat === 2) name = `Two Pair, ${RANK_MANY[a]} and ${RANK_MANY[b]}`;
  else if (cat === 3) name = `Three of a Kind, ${RANK_MANY[a]}`;
  else if (cat === 4) name = `Straight, ${RANK_ONE[a]} high`;
  else if (cat === 5) name = `Flush, ${RANK_ONE[a]} high`;
  else if (cat === 6) name = `Full House, ${RANK_MANY[a]} full of ${RANK_MANY[b]}`;
  else if (cat === 7) name = `Four of a Kind, ${RANK_MANY[a]}`;
  else name = a === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_ONE[a]} high`;
  if (board.length < 5 && cat < 4) {
    const f = handFeatures(hole, board);
    const draws = [];
    if (f.flushDraw) draws.push(f.flushDraw === 2 ? 'nut flush draw' : 'flush draw');
    if (f.straightDraw === 2) draws.push('open-ended straight draw');
    else if (f.straightDraw === 1) draws.push('gutshot');
    if (draws.length) name += ` + ${draws.join(' + ')}`;
  }
  return name;
}
// Your made hand under your plate on the table (shown on phones instead of the row above the sizes).
function madeHand() {
  const s = sess.hand.state;
  if (s.folded[HERO]) return '';
  const name = handName(s.hole[HERO], s.board);
  return name ? `<div class="made">${esc(name)}</div>` : '';
}
function myHand() {
  const s = sess.hand.state;
  if (s.folded[HERO]) return '';
  const name = handName(s.hole[HERO], s.board);
  return `<div class="myhand">${name ? `<span>Your hand</span><b>${esc(name)}</b>` : ''}</div>`;
}

function renderActions() {
  const el = $('actions');
  const st = sess.status();
  const h = sess.hand;
  el.classList.toggle('turn', st === 'hero');
  if (st === 'hero') {
    const L = sess.heroOptions();
    const s = h.state;
    if (raiseHand !== h || raiseStep !== s.history.length || !(raiseTo >= L.minTo && raiseTo <= L.maxTo)) {
      raiseTo = defaultRaise(L, s);
      raiseHand = h;
      raiseStep = s.history.length;
    }
    const verb = s.currentBet === 0 ? 'Bet' : 'Raise to';
    // On a phone the long all-in label becomes "Max"; the full words stay in the tooltip.
    const short = (l) => (PHONE.matches && l === 'Put them all-in' ? 'Max' : l);
    const pre = L.canRaise ? presets(L, s).map(([l, v]) => `<button data-to="${v}" title="${l === 'Put them all-in' ? 'Put them all-in: ' : ''}$${v}">${short(l)}</button>`).join('') : '';
    const need = L.callAmt ? Math.round((100 * L.callAmt) / (L.pot + L.callAmt)) : 0;
    const sizeNote = (to) => (s.currentBet > 0 ? `${(to / s.currentBet).toFixed(1)}× the bet` : `${Math.round((100 * to) / Math.max(1, L.pot))}% of the pot`);
    el.innerHTML = `${myHand()}
      ${L.canRaise ? `<div class="act-row size presets"><div class="sz">${pre}</div>
        <span class="dollar">$</span><input type="number" inputmode="numeric" id="a-num" aria-label="Raise amount" min="${L.minTo}" max="${L.maxTo}" value="${raiseTo}">
        <input type="range" id="a-range" aria-label="Raise amount" min="${L.minTo}" max="${L.maxTo}" value="${raiseTo}"></div>` : '<div class="act-row size empty"></div>'}
      <div class="act-row main">
        <button id="a-fold" ${L.canFold ? '' : 'disabled'}><span>Fold<kbd>F</kbd></span><small>${L.canFold ? '&nbsp;' : 'checking is free'}</small></button>
        <button id="a-call"><span>${L.canCheck ? 'Check' : 'Call ' + money(L.callAmt)}<kbd>C</kbd></span><small>${L.canCheck ? `pot ${money(L.pot)}` : `to win ${money(L.pot)} · need ${need}%`}</small></button>
        ${L.canRaise ? `<button id="a-raise"><span>${verb} <span id="a-amt">$${raiseTo}</span><kbd>R</kbd></span><small id="a-sub">${sizeNote(raiseTo)}</small></button>` : ''}
      </div>
      `;
    const setTo = (v) => {
      raiseTo = Math.max(L.minTo, Math.min(L.maxTo, Math.round(+v || L.minTo)));
      $('a-amt').textContent = '$' + raiseTo;
      $('a-sub').textContent = sizeNote(raiseTo);
      el.querySelectorAll('.presets button').forEach((b) => b.classList.toggle('on', +b.dataset.to === raiseTo));
      if (+$('a-num').value !== raiseTo && document.activeElement !== $('a-num')) $('a-num').value = raiseTo;
      $('a-range').value = raiseTo;
    };
    $('a-fold').onclick = () => act({ type: 'fold' });
    $('a-call').onclick = () => act({ type: L.canCheck ? 'check' : 'call' });
    if (L.canRaise) {
      $('a-raise').onclick = () => act({ type: 'raise', to: raiseTo });
      $('a-num').oninput = (e) => setTo(e.target.value);
      $('a-num').onkeydown = (e) => {
        if (e.key === 'Enter') act({ type: 'raise', to: raiseTo });
        e.stopPropagation();
      };
      $('a-range').oninput = (e) => setTo(e.target.value);
      el.querySelectorAll('.presets button').forEach((b) => (b.onclick = () => setTo(b.dataset.to)));
      setTo(raiseTo);
    }
  } else if (st === 'bot') {
    el.innerHTML = `${myHand()}<div class="hint" style="padding:18px 0">${sess.heroInHand() ? 'Waiting for the other players…' : 'You folded. Playing the hand out…'}</div>`;
  } else {
    const net = h.summary.net;
    const msg = net > 0 ? `You won ${money(net)}.` : net < 0 ? `You lost ${money(-net)}.` : 'No change to your stack.';
    const low = sess.heroStack < sess.heroBuy;
    el.innerHTML = `<div class="act-row over">
      <button class="primary" id="a-next">${drill ? 'Next spot' : 'Next hand'}<kbd>Space</kbd></button>
      ${drill ? '<button id="a-exit">Exit drill</button>' : low ? `<button id="a-top">Top up to ${money(sess.heroBuy)}</button>` : ''}
      <span class="hint">${msg}</span></div>`;
    $('a-next').onclick = nextHand;
    if ($('a-top')) $('a-top').onclick = () => { sess.topUp(); render(); };
    if ($('a-exit')) $('a-exit').onclick = exitDrill;
  }
}

function fbCard(d, showWhere = true) {
  const v = d.verdict;
  const where = showWhere
    ? `<div class="where">Hand ${d.hand} · ${d.streetName} · ${d.position} ${cardsInline(d.hole)}${d.board.length ? ' on ' + cardsInline(d.board) : ''}</div>`
    : `<div class="where">${d.streetName}${d.handText ? ' · you have ' + esc(d.handText) : ''}</div>`;
  const rows = v.options
    .map((o, i) => `<tr class="${i === v.best ? 'best' : ''} ${i === v.mine ? 'mine' : ''}"><td>${esc(o.label)}${o.close && i !== v.best ? ' <span class="approx" title="Too close to the best option to tell apart">≈</span>' : ''}</td><td>${Math.round(o.ev) >= 0 ? '+' : '−'}$${Math.abs(Math.round(o.ev))}</td></tr>`)
    .join('');
  return `<div class="fb ${v.grade}">${where}
    <div class="head">${esc(d.headline)}</div>
    ${d.reasons.map((r) => `<p>${esc(r)}</p>`).join('')}
    ${d.theory ? `<p class="theory">${esc(d.theory)}</p>` : ''}
    <details><summary>Show the numbers</summary>
      <table class="ev">${rows}</table>
      <div class="hint">Average result of each option from this point, over ${v.samples} simulated run-outs against hands that fit how these opponents have played. These are estimates: options marked ≈ are within the margin of error of the best one.</div>
    </details>${v.grade !== 'good' && sess && sess.decisions.includes(d) ? `<button class="disagree" data-id="${d.id}" title="Think the coach got this wrong? Make a report of the hand to send us.">Disagree?</button>` : ''}</div>`;
}

// "Disagree?" on a flagged verdict: the player says what they would have done and why, and gets
// a report of the hand to copy or save and send us. Nothing leaves the browser from here.
function disputeModal(d) {
  const v = d.verdict;
  const others = v.options.filter((_, i) => i !== v.mine).map((o) => o.label);
  openModal(`<h1>Think the coach is wrong? Say so.</h1>
    <p class="sub">It makes a report of the hand for you to send us.</p>
    <div class="fb ${v.grade}"><div class="where">Hand ${d.hand} · ${d.streetName} · ${d.position} ${cardsInline(d.hole)}${d.board.length ? ' on ' + cardsInline(d.board) : ''}</div><div class="head">${esc(d.headline)}</div></div>
    <div class="field"><span>What would you do?</span><div class="chip-row" id="d-chips" role="radiogroup">${others.map((l, i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" role="radio" aria-checked="${i === 0}" data-v="${esc(l)}">${esc(l)}</button>`).join('')}<button type="button" class="chip" role="radio" aria-checked="false" data-v="">Something else</button></div><input type="hidden" id="d-pref" value="${esc(others[0] || '')}"></div>
    <label class="d-label" for="d-why">Why? <small>(optional, but it helps most)</small></label>
    <textarea id="d-why" class="input" rows="3" maxlength="1500" placeholder="For example: this player never folds a pair, so the bluff cannot work."></textarea>
    <details class="d-preview"><summary>What the report contains</summary>
      <p class="hint">Your cards, the board, every action so far, stacks, the coach's read of each opponent and every option with its numbers. ${d.truth ? 'The hand is over, so it also has what each opponent really held.' : 'The hand is still going, so opponents\' cards are left out.'} No personal information.</p>
      <pre id="d-text"></pre></details>
    <div class="modal-actions"><span id="d-status" class="hint" role="status" aria-live="polite"></span><button id="d-close" class="quiet">Close</button><button id="d-save">Save as file</button><button class="primary" id="d-copy">Copy report</button></div>
    <div class="d-issue"><a id="d-issue" class="button" href="#" target="_blank" rel="noopener">Open a GitHub issue</a>
      <span class="hint">Opens a new issue on our GitHub page, filled in with this report. <b>The hand will be public</b> on the repository, and you need a GitHub account to post it.</span></div>`);
  // The chips choose the alternative; the hidden input keeps the value the report reads.
  $('d-chips').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $('d-chips').querySelectorAll('button').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-checked', x === b);
    });
    $('d-pref').value = b.dataset.v;
    $('d-pref').dispatchEvent(new Event('change'));
    if (!b.dataset.v) $('d-why').focus();
  });
  const build = () => disputeReport(d, { preferred: $('d-pref').value, why: $('d-why').value.trim() });
  const show = () => {
    const report = build();
    $('d-text').textContent = disputeText(report);
    $('d-issue').href = disputeIssueUrl(report);
  };
  const status = (msg) => ($('d-status').textContent = msg);
  $('d-pref').onchange = show;
  $('d-why').oninput = show;
  show();
  $('d-close').onclick = closeModal;
  $('d-copy').onclick = async () => {
    const text = disputeText(build());
    try {
      await navigator.clipboard.writeText(text);
      status('Copied. Paste it into a message to us.');
    } catch {
      // Clipboard blocked (older browser or no permission): select the text for a manual copy.
      const pre = $('d-text');
      pre.closest('details').open = true;
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        /* not supported */
      }
      status(copied ? 'Copied. Paste it into a message to us.' : 'Could not copy automatically. The report is selected: copy it with Ctrl+C or Cmd+C.');
    }
  };
  $('d-save').onclick = () => {
    const report = build();
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = disputeFileName(report);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status(`Saved ${a.download}. Attach it to a message to us.`);
  };
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button.disagree');
  if (!b || !sess) return;
  const d = sess.decisions.find((x) => x.id === +b.dataset.id);
  if (d) disputeModal(d);
});

function renderFeedback() {
  const h = sess.hand;
  const el = $('feedback');
  if (!h.decisions.length) {
    el.innerHTML = '<div class="empty">Your decisions are judged against how these particular opponents play, not against a solver. Feedback appears here.</div>';
    return;
  }
  if (settings.feedback === 'after' && !h.over) {
    el.innerHTML = '<div class="empty">Feedback is held until the hand ends.</div>';
    return;
  }
  el.innerHTML = [...h.decisions].reverse().map((d) => fbCard(d, false)).join('');
}

function renderToast() {
  const h = sess.hand;
  const el = $('toast');
  const d = h.decisions[h.decisions.length - 1];
  if (hintOn) {
    el.innerHTML = `<div class="toast hint"><img class="tile" src="assets/logo/tile.svg" alt="" width="22" height="22">
      <span class="t-main">Play it the way you would live. The coach speaks up when a play costs you money.</span>
      <button type="button" class="t-more" id="hint-ok">Got it</button></div>`;
    $('hint-ok').onclick = () => {
      endHint();
      renderToast();
    };
    return;
  }
  if (!d) {
    el.innerHTML = '';
    return;
  }
  if (settings.feedback === 'after' && !h.over) {
    el.innerHTML = '<div class="toast quiet"><span class="t-main">Feedback is held until the hand ends.</span></div>';
    return;
  }
  // When the hand is over, surface the worst play of the hand rather than the last one.
  let show = d;
  if (h.over) {
    for (const x of h.decisions) {
      if (x.verdict.grade !== 'good' && (show.verdict.grade === 'good' || x.verdict.loss > show.verdict.loss)) show = x;
    }
  }
  const pending = !h.over && sess.status() === 'hero';
  const tag = h.over && h.decisions.length > 1 ? `Biggest miss · ${show.streetName}` : `Your last play · ${show.streetName}`;
  const tagText = h.over && show.verdict.grade === 'good' ? `This hand · ${show.streetName}` : tag;
  const icon = { good: '✓', mistake: '!', blunder: '✕' }[show.verdict.grade];
  el.innerHTML = `<button type="button" class="toast ${show.verdict.grade}${pending ? ' prev' : ''}" id="toast-open">
    <span class="t-icon">${icon}</span><span class="t-tag">${tagText}</span>
    <span class="t-main">${esc(show.headline)}</span><span class="t-more">${show.verdict.grade === 'good' ? 'Details' : 'Why?'} ›</span></button>`;
  $('toast-open').onclick = () => (REVIEW_V2 && h.over && !drill ? openReview() : openSide('coach'));
}

function openSide(tab) {
  document.body.classList.remove('side-closed');
  if (tab) showTab(tab);
  // In a narrow window the panel sits below the table rather than over it, so bring it into view.
  if (NARROW.matches) $('side').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
let currentTab = 'coach';
function showTab(tab) {
  currentTab = tab;
  for (const [name, pane] of [['coach', 'feedback'], ['range', 'ranges'], ['log', 'log']]) {
    $('tab-' + name).classList.toggle('on', tab === name);
    $(pane).classList.toggle('hidden', tab !== name);
  }
  if (tab === 'log') $('log').scrollTop = $('log').scrollHeight;
  if (tab === 'range') renderRanges();
}

// ---- range grid: what the coach thinks an opponent can hold, on the 13x13 hand chart ----
const GRID_RANKS = 'AKQJT98765432';
const GRID = []; // [row][col] -> { name, k (class index) }
for (let i = 0; i < 13; i++) {
  GRID.push([]);
  for (let j = 0; j < 13; j++) {
    const name = i === j ? GRID_RANKS[i] + GRID_RANKS[j] : i < j ? GRID_RANKS[i] + GRID_RANKS[j] + 's' : GRID_RANKS[j] + GRID_RANKS[i] + 'o';
    GRID[i].push({ name, k: classIndex(name) });
  }
}
const KINDS = [
  ['Two pair or better', '240,104,95'],
  ['Top pair or overpair', '242,176,74'],
  ['Weaker pair', '219,226,221'],
  ['Draw', '147,166,159'],
  ['Nothing', '100,119,111'],
];
const STREET_TABS = ['Preflop', 'Flop', 'Turn', 'River'];
let rangeSeat = -1;
let rangeStreet = 'now';
let rangeHand = -1;
let rangeMode = 'kind'; // colour by what they hold ('kind') or by whether you beat it ('vs')

function renderRanges() {
  const el = $('ranges');
  if (currentTab !== 'range' || !sess || !sess.hand) return;
  const h = sess.hand;
  const s = h.state;
  if (rangeHand !== h.no) {
    rangeHand = h.no;
    rangeStreet = 'now';
    rangeSeat = -1;
  }
  if (!settings.rangesLive && !h.over) {
    el.innerHTML = '<div class="empty">Ranges are hidden until the hand is over (you turned this on in Settings). Make your read first, then check it here.</div>';
    return;
  }
  const live = [];
  for (let i = 1; i < s.n; i++) if (!s.folded[i]) live.push(i);
  if (!live.length) for (let i = 1; i < s.n; i++) live.push(i);
  if (!live.includes(rangeSeat)) {
    // Default to whoever bet or raised last, else the first player still in.
    rangeSeat = live[0];
    for (let k = s.history.length - 1; k >= 0; k--) {
      const e = s.history[k];
      if ((e.type === 'bet' || e.type === 'raise') && live.includes(e.seat)) {
        rangeSeat = e.seat;
        break;
      }
    }
  }
  if (rangeStreet !== 'now' && !h.rangeSnaps[rangeStreet]) rangeStreet = 'now';
  const g = sess.rangeGrid(rangeSeat, rangeStreet);
  const who = live.map((i) => `<button class="chip ${i === rangeSeat ? 'on' : ''}" data-seat="${i}">${esc(sess.seats[i].nick)}</button>`).join('');
  const steps = STREET_TABS.map((label, st) => `<button class="chip ${rangeStreet === st ? 'on' : ''}" data-street="${st}" ${h.rangeSnaps[st] ? '' : 'disabled'}>${label}</button>`).join('') +
    `<button class="chip ${rangeStreet === 'now' ? 'on' : ''}" data-street="now">${h.over ? 'End' : 'Now'}</button>`;
  if (!g) {
    el.innerHTML = `<div class="chips">${who}</div><div class="chips">${steps}</div><div class="empty">Nothing to show yet.</div>`;
  } else {
    const post = g.street > 0;
    const mine = classOf(s.hole[HERO][0], s.hole[HERO][1]);
    let cells = '';
    for (let i = 0; i < 13; i++) {
      for (let j = 0; j < 13; j++) {
        const c = g.cells[GRID[i][j].k];
        const on = c.fill > 0.015;
        const vs = rangeMode === 'vs' && c.ahead !== null;
        // Three tiers by how much of the hand is still in range (brand S2); in the ahead-or-behind
        // view, lime (you beat it), amber (mixed), red (it beats you), brighter = more likely.
        const tier = c.fill >= 0.45 ? 'in' : c.fill >= 0.12 ? 'some' : on ? 'trace' : 'off';
        const vsRgb = c.ahead >= 0.66 ? '180,228,110' : c.ahead <= 0.34 ? '240,104,95' : '242,176,74';
const tip = on ? `${GRID[i][j].name}: ${Math.round(c.fill * 100)}% of the way to their likeliest hand${post && c.kind >= 0 ? ', mostly ' + KINDS[c.kind][0].toLowerCase() : ''}${c.ahead !== null ? `; you beat ${Math.round(c.ahead * 100)}% of these` : ''}` : `${GRID[i][j].name}: not in range`;
        const me = GRID[i][j].k === mine ? ' me' : '';
        cells += vs && on
          ? `<div class="rc vs${me}" style="background:rgba(${vsRgb},${(0.25 + 0.75 * c.fill).toFixed(2)})" title="${tip}">${GRID[i][j].name}</div>`
          : `<div class="rc ${tier}${me}" title="${tip}">${GRID[i][j].name}</div>`;
      }
    }
    const tierLegend = '<div class="legend"><span><i class="lg-in"></i>In their range</span><span><i class="lg-some"></i>Sometimes</span><span><i class="lg-off"></i>Out</span><span><i class="lg-me"></i>Your hand</span></div>';
    const read = sess.readOf(rangeSeat).ranked[0];
    const sure = read.p >= 0.75 ? 'almost certainly' : read.p >= 0.6 ? 'probably' : read.p >= 0.45 ? 'might be' : null;
    const basis = sure ? `Based on a read that ${esc(sess.seats[rangeSeat].nick)} is ${sure} a ${esc(read.name.toLowerCase())}.` : `No firm read on ${esc(sess.seats[rangeSeat].nick)} yet, so this blends what every type of player would hold: expect it to be wide.`;
    const mix = g.mix ? `<div class="mixbar">${g.mix.map((m, b) => (m > 0.005 ? `<i style="width:${(m * 100).toFixed(1)}%;background:rgb(${KINDS[b][1]})" title="${KINDS[b][0]} ${Math.round(m * 100)}%"></i>` : '')).join('')}</div>
      <div class="legend">${g.mix.map((m, b) => `<span><i style="background:rgb(${KINDS[b][1]})"></i>${KINDS[b][0]} <b>${Math.round(m * 100)}%</b></span>`).join('')}</div>${tierLegend}` : tierLegend;
    // Headline: where you stand against this range, and how that has moved street by street.
    let beats = '';
    if (g.beats !== null) {
      const b = g.beats;
      const word = b >= 0.8 ? 'You are ahead of almost all of it' : b >= 0.6 ? 'You are ahead of most of it' : b > 0.4 ? 'It is close to a coin flip' : b > 0.2 ? 'You are behind most of it' : 'You are behind almost all of it';
      const trend = [1, 2, 3]
        .filter((st) => h.rangeSnaps[st] && h.rangeSnaps[st][rangeSeat] && h.rangeSnaps[st][rangeSeat].beats !== null)
        .map((st) => `${STREET_TABS[st]} ${Math.round(h.rangeSnaps[st][rangeSeat].beats * 100)}%`);
      if (!h.over && rangeStreet === 'now') trend.push(`Now ${Math.round(b * 100)}%`);
      beats = `<div class="standing ${b >= 0.6 ? 'up' : b > 0.4 ? 'even' : 'down'}">
        <div class="st-num">${Math.round(b * 100)}%</div>
        <div><b>${word}.</b><br>Your hand beats ${Math.round(b * 100)}% of the hands ${esc(sess.seats[rangeSeat].nick)} can have${trend.length > 1 ? `. Street by street: ${trend.join(' → ')}` : ''}.</div>
      </div>`;
    }
    const modes = post ? `<div class="chips"><button class="chip ${rangeMode === 'kind' ? 'on' : ''}" data-mode="kind">Colour: what they have</button><button class="chip ${rangeMode === 'vs' ? 'on' : ''}" data-mode="vs">Colour: ahead or behind you</button></div>` : '';
    const vsLegend = '<div class="legend"><span><i style="background:rgb(180,228,110)"></i>You beat it</span><span><i style="background:rgb(242,176,74)"></i>Mixed</span><span><i style="background:rgb(240,104,95)"></i>It beats you</span><span>Brighter = more likely</span></div>';
    const label = rangeStreet === 'now' ? (h.over ? 'at the end of the hand' : 'right now') : `after the ${STREET_TABS[rangeStreet].toLowerCase()} betting`;
    el.innerHTML = `
      <div class="chips">${who}</div>
      <div class="chips">${steps}</div>
      <p class="range-title">What ${esc(sess.seats[rangeSeat].nick)} can hold ${label}</p>
      ${beats}${modes}
      <div class="rgrid">${cells}</div>
      ${rangeMode === 'vs' && post ? vsLegend : mix}
      <p class="hint" style="text-align:left">${basis} Suited hands are above the diagonal, offsuit below, pairs on it. This is the coach's estimate from how they have played, not their actual cards.</p>`;
  }
  el.querySelectorAll('[data-seat]').forEach((b) => (b.onclick = () => { rangeSeat = +b.dataset.seat; renderRanges(); }));
  el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { rangeMode = b.dataset.mode; renderRanges(); }));
  el.querySelectorAll('[data-street]').forEach((b) => (b.onclick = () => { rangeStreet = b.dataset.street === 'now' ? 'now' : +b.dataset.street; renderRanges(); }));
}

function renderLog() {
  const el = $('log');
  const lines = [...pastLog, ...sess.hand.log];
  el.innerHTML = lines.map((l) => `<div class="ln ${l.kind}${l.seat === HERO && l.kind === 'act' ? ' me' : ''}">${esc(l.text)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function render() {
  renderStats();
  renderTable();
  renderActions();
  renderFeedback();
  renderToast();
  renderRanges();
  renderLog();
}


// ---------------------------------------------------------------- hand review (brand S1)
// The coach's review of a finished hand as its own screen: result and cost first, the run-out,
// every decision as a row (flagged ones open in place with the coach's own words and numbers),
// the opponent's card, and Next hand under the thumb. Every figure and sentence comes from the
// decision records; nothing is written here. On for everyone since the owner approved it
// (play.html?review=new, the old preview link, still loads and changes nothing).
const REVIEW_V2 = true;
const GRADE_WORD = { good: 'fine', mistake: 'mistake', blunder: 'blunder' };
const MARK = { good: '✓', mistake: '!', blunder: '✕' };
const STREET_LABEL = ['Preflop', 'Flop', 'Turn', 'River'];

function actionNoun(o) {
  if (!o) return 'play';
  if (o.type === 'raise') return /^bet/i.test(o.label) ? 'bet' : /^all-in/i.test(o.label) ? 'all-in' : 'raise';
  return o.type;
}

function openReview() {
  const h = sess.hand;
  if (!h || !h.over || drill) return;
  const s = h.state;
  const ds = h.decisions;
  const flagged = ds.filter((d) => d.verdict.grade !== 'good');
  const cost = flagged.reduce((a, d) => a + d.verdict.loss, 0);
  const net = h.summary.net;
  const result = net > 0 ? `You won ${money(net)}.` : net < 0 ? `You lost ${money(-net)}.` : 'You broke even.';
  const costLine = !flagged.length
    ? ds.length ? '<span class="ok">Every decision was fine.</span>' : ''
    : flagged.length === 1
      ? `<span class="neg">One ${actionNoun(flagged[0].verdict.options[flagged[0].verdict.mine])} cost you about ${money(flagged[0].verdict.loss)}.</span>`
      : `<span class="neg">${flagged.length} plays cost you about ${money(cost)}.</span>`;
  const shown = [];
  if (s.result && s.result.showdown) for (let i = 1; i < s.n; i++) if (!s.folded[i]) shown.push(i);
  const wins = h.log.filter((e) => e.kind === 'win').map((e) => e.text);
  const runout = `<div class="rv-runout">
    <div><span class="label">Your hand</span>${cardsInline(s.hole[HERO])}</div>
    ${s.board.length ? `<div><span class="label">Board</span>${cardsInline(s.board)}</div>` : ''}
    ${shown.map((i) => `<div><span class="label">${esc(sess.seats[i].nick)} showed</span>${cardsInline(s.hole[i])}</div>`).join('')}
    ${wins.length ? `<p class="rv-vs">${esc(wins.join('. '))}.</p>` : ''}
  </div>`;
  const firstFlag = ds.find((d) => d.verdict.grade !== 'good');
  const rows = ds.map((d) => {
    const v = d.verdict;
    const mine = v.options[v.mine];
    const head = `<span class="label">${STREET_LABEL[d.street] || d.streetName}</span><span class="vmark ${d.verdict.grade}">${MARK[v.grade]}</span><span class="what">${esc(mine ? mine.label : '')}</span><span class="grade ${v.grade}">${GRADE_WORD[v.grade]}</span>`;
    if (v.grade === 'good') return `<div class="rv-step">${head}</div>`;
    const evs = v.options.map((o) => o.ev);
    const lo = Math.min(...evs, 0);
    const hi = Math.max(...evs, 0);
    const width = (ev) => Math.max(4, Math.round(((ev - lo) / Math.max(1e-9, hi - lo)) * 100));
    const bars = v.options.map((o, i) => `<div class="bar ${i === v.best ? 'best' : ''} ${i === v.mine ? 'yours' : ''}"><span>${esc(o.label)}</span><span class="track"><i style="--w:${width(o.ev)}%"></i></span><span class="mono">${Math.round(o.ev) >= 0 ? '+' : '−'}$${Math.abs(Math.round(o.ev))}</span></div>`).join('');
    const eq = d.villain && d.villain.picture && d.villain.picture.equity !== null && d.villain.picture.equity !== undefined ? d.villain.picture.equity : null;
    const duo = eq !== null && d.toCall > 0 ? `<div class="duo"><div class="stat"><span class="label">You beat</span><b>${Math.round(eq * 100)}%</b></div><div class="stat"><span class="label">You needed</span><b>${Math.round(d.odds * 100)}%</b></div></div>` : '';
    return `<details class="rv-flag ${v.grade}" ${d === firstFlag ? 'open' : ''}><summary class="rv-step">${head}</summary>
      <div class="rv-body">
        <h2>${esc(d.headline)}</h2>
        ${d.reasons.map((r) => `<p class="why">${esc(r)}</p>`).join('')}
        <p class="label">What each option is worth, on average</p>
        <div class="bars">${bars}</div>
        ${duo}
        ${d.theory ? `<details class="rv-theory"><summary>Why theory disagrees ›</summary><p>${esc(d.theory)}</p></details>` : ''}
        <div class="rv-acts">
          ${d.villain ? `<button type="button" class="btn small" data-range="${d.villain.seat}">See ${esc(d.villain.nick)}'s range</button>` : ''}
          ${d.category && DRILLS[d.category] ? `<button type="button" class="btn small" data-drill="${d.category}">Drill this leak</button>` : ''}
          <button type="button" class="btn small quiet" data-dispute="${d.id}">Disagree?</button>
        </div>
      </div></details>`;
  }).join('');
  const vSeat = (firstFlag && firstFlag.villain && firstFlag.villain.seat) || shown[0] || null;
  let card = '';
  if (vSeat !== null && vSeat !== undefined) {
    const p = sess.seats[vSeat];
    const r = sess.readOf(vSeat);
    const top = r.ranked[0];
    const lvl = top.p >= 0.75 ? 3 : top.p >= 0.6 ? 2 : top.p >= 0.45 ? 1 : 0;
    const word = shortType(top.id);
    const guess = lvl === 3 ? word : lvl === 2 ? `Likely ${word === 'ABC' ? word : word.toLowerCase()}` : lvl === 1 ? `${word}?` : 'Too early to say';
    card = `<article class="pc" style="--h:${p.hue ?? 160}"><div class="pc-head"><div class="big-avatar" style="--h:${p.hue ?? 160}">${avatarArt(p)}</div><div><div class="pc-name">${esc(p.nick)}</div><div class="pc-sub"><span class="label">${r.notes.hands} hands watched</span></div></div></div>
      <p class="pc-look">${esc(p.look)}.</p>
      <div class="pc-read"><span class="label">Coach's read</span><div class="pc-guess">${esc(guess)}<span class="conf">${[1, 2, 3].map((k) => `<i class="${k <= lvl ? 'on' : ''}"></i>`).join('')}</span></div>
      <p>${r.notes.hands ? `Puts money in ${Math.round((100 * r.notes.vpip) / r.notes.hands)}% of hands, raises ${Math.round((100 * r.notes.pfr) / r.notes.hands)}% before the flop.` : ''}</p></div></article>`;
  }
  const el = $('review');
  el.innerHTML = `<div class="rv-wrap">
    <div class="rv-head"><p class="label signal">Hand ${h.no || sess.handNo} · the coach's review</p><h1>${result} ${costLine}</h1></div>
    ${runout}
    <div class="rv-cols"><div class="rv-steps">${rows || '<p class="sub">You made no decisions this hand.</p>'}</div>
      <aside>${card}<div class="rv-tiles"><div class="stat"><span class="label">This hand</span><b class="${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${signed(net)}</b></div><div class="stat"><span class="label">Mistakes cost</span><b>${money(cost)}</b></div></div></aside></div>
  </div>
  <div class="rv-bar"><div><p>The table stops on a flagged play so you can read why.</p><button type="button" id="rv-leaks">Leak review</button><button type="button" class="primary" id="rv-next">${drill ? 'Next spot' : 'Next hand'}<kbd>Space</kbd></button></div></div>`;
  el.classList.remove('hidden');
  el.scrollTop = 0;
  document.body.classList.add('reviewing');
  $('rv-next').onclick = () => nextHand();
  $('rv-leaks').onclick = () => reviewModal();
  el.querySelectorAll('[data-range]').forEach((b) => (b.onclick = () => { closeReview(); rangeSeat = +b.dataset.range; openSide('range'); }));
  el.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => { closeReview(); startDrill(b.dataset.drill); }));
  el.querySelectorAll('[data-dispute]').forEach((b) => (b.onclick = () => { const d = sess.decisions.find((x) => x.id === +b.dataset.dispute); if (d) disputeModal(d); }));
}
function closeReview() {
  $('review').classList.add('hidden');
  document.body.classList.remove('reviewing');
}

// ---------------------------------------------------------------- flow

function advance() {
  clearTimeout(timer);
  // Once you are out of the hand, play it out immediately.
  if (!sess.heroInHand()) {
    let guard = 0;
    while (sess.status() === 'bot' && guard++ < 500) sess.stepBot();
  }
  render();
  if (sess.status() === 'bot') {
    timer = setTimeout(() => {
      sess.stepBot();
      advance();
    }, settings.speed);
  } else if (sess.status() === 'over') {
    scheduleAuto();
    if (REVIEW_V2 && !drill && sess.hand.decisions.some((d) => d.verdict.grade !== 'good')) openReview();
  }
}

// When the hand is over and nothing you did in it was flagged (all green), deal the next one
// without waiting. A mistake or blunder stops the game so you can read why.
function scheduleAuto() {
  clearTimeout(timer);
  const h = sess.hand;
  const last = h.decisions[h.decisions.length - 1];
  if (h.decisions.some((d) => d.verdict.grade !== 'good')) return; // anything flagged holds the table
  const wait = h.state.folded[HERO] ? 700 : 1800; // a moment to see the result
  timer = setTimeout(() => {
    if (!$('modal').classList.contains('hidden')) return; // a pop-up is open: wait for Space
    nextHand();
  }, wait);
}

function act(action) {
  if (sess.status() !== 'hero') return;
  endHint();
  const d = sess.heroAct(action);
  noteLeak(d);
  raiseTo = 0;
  if (drill) {
    drill.tried++;
    if (d.verdict.grade === 'good') drill.clean++;
    else drill.cost += d.verdict.loss;
    sess.finishAuto(); // the rest of the hand plays itself; on to the next spot
    render();
    scheduleAuto();
    return;
  }
  advance();
}

function nextHand() {
  if (sess.status() !== 'over') return;
  closeReview();
  if (drill) return nextSpot();
  tapHintPending = false; // shown once, at the end of the first hand
  pastLog = [...pastLog, ...sess.hand.log].slice(-120);
  sess.startPlayable();
  raiseTo = 0;
  advance();
}

// Fast-forwards the table: plays hands in an instant (yours are played for you and do not
// count toward your results) so you sit down with something observed about everyone.
function quickSim(hands = 40) {
  if (!sess || drill) return;
  clearTimeout(timer);
  sess.quickSim(hands);
  pastLog = [];
  shownBoard = 0;
  raiseTo = 0;
  advance();
}

function startDrill(cat) {
  clearTimeout(timer);
  closeModal();
  if (!drill) mainSess = sess;
  drill = { cat, tried: 0, clean: 0, cost: 0 };
  sess = new Session(sessionOpts());
  sess.warmUp(40); // give the table some history so there are reads to work with
  nextSpot();
}

function nextSpot() {
  pastLog = [];
  raiseTo = 0;
  shownBoard = 0;
  const seen = leaks[drill.cat] ? Object.keys(leaks[drill.cat].streets).map(Number).filter((st) => st > 0) : null;
  const found = sess.dealUntil((x) => DRILLS[drill.cat].match(x, seen));
  if (!found) sess.dealUntil((x) => DRILLS[drill.cat].match(x, null));
  render();
}

function exitDrill() {
  drill = null;
  sess = mainSess;
  mainSess = null;
  pastLog = [];
  shownBoard = 0;
  advance();
}

function newSession() {
  clearTimeout(timer);
  drill = null;
  mainSess = null;
  sess = new Session(sessionOpts());
  pastLog = [];
  sess.startPlayable();
  advance();
}

document.addEventListener('keydown', (e) => {
  if (!$('modal').classList.contains('hidden')) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (e.key === 'Escape' && !$('review').classList.contains('hidden')) {
    closeReview();
    return;
  }
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'f') $('a-fold')?.click();
  else if (k === 'c') $('a-call')?.click();
  else if (k === 'r') $('a-raise')?.click();
  else if (k === ' ' || k === 'n' || k === 'enter') {
    if ($('a-next')) {
      e.preventDefault();
      nextHand();
    }
  }
});

// ---------------------------------------------------------------- modals

function openModal(html) {
  $('modal-box').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() {
  $('modal').classList.add('hidden');
}
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal') && sess) closeModal();
});

function settingsModal() {
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const seg = (id, items, cur) => `<div class="seg" role="radiogroup" data-for="${id}">${items.map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div><input type="hidden" id="${id}" value="${cur}">`;
  const toggle = (id, on, label) => `<label class="trow" for="${id}"><span>${label}</span><input id="${id}" type="checkbox" class="toggle" ${on ? 'checked' : ''}></label>`;
  openModal(`
    <h1>Your game</h1>
    <div class="field"><span>Where do you play?</span>${seg('s-mode', [['casino', 'Casino'], ['home', 'Home game']], settings.mode)}</div>
    <div id="casino-fields">
      <div class="field"><span>Stakes</span>${seg('s-game', Object.keys(GAMES).map((g) => [g, '$' + g.replace('/', '/$')]), settings.game)}</div>
    </div>
    <div id="home-fields">
      <div class="form-row"><label>Blinds ($)</label><input id="h-sb" type="number" inputmode="numeric" min="1" step="1" value="${settings.home.sb}"><span>/</span><input id="h-bb" type="number" inputmode="numeric" min="1" step="1" value="${settings.home.bb}"></div>
      <div class="form-row"><label>Buy-in ($)</label><input id="h-buy" type="number" inputmode="numeric" min="20" step="10" value="${settings.home.buy}"></div>
      <div class="form-row" style="align-items:flex-start"><label>Players<br><small id="h-total"></small></label>
        <div class="home-grid">${HOME_TYPES.map(([t, label]) => `<label>${label}</label><input class="h-count" data-type="${t}" type="number" inputmode="numeric" min="0" max="8" step="1" value="${settings.home.counts[t] || 0}">`).join('')}</div>
      </div>
      <p class="sub">No rake. Everyone rebuys and nobody leaves. You know who is coming, but not which seat is which.</p>
    </div>
    <details class="more-options"><summary>More options</summary>
      <div id="casino-more">
        <label class="field"><span>Buy-in ($)</span><input id="s-buy" class="input" type="number" inputmode="numeric" min="60" step="20" value="${settings.maxBuy}"></label>
        <label class="field"><span>House cut</span><select id="s-rake" class="input">${Object.entries(RAKES).map(([k, r]) => opt(k, r.label, settings.rake)).join('')}</select></label>
        <label class="field"><span>Who's at the table</span><select id="s-table" class="input">${Object.entries(TABLES).map(([k, t]) => opt(k, t.label, settings.table)).join('')}</select></label>
      </div>
      <label class="field"><span>Feedback</span><select id="s-fb" class="input">${opt('now', 'Right after each decision', settings.feedback)}${opt('after', 'When the hand is over', settings.feedback)}</select></label>
      ${toggle('s-only', settings.onlyRange, "Only deal me hands I'd play")}
      <button type="button" class="link-btn" id="s-edit-ranges">Edit my ranges</button>
      ${toggle('s-ranges', settings.rangesLive, 'Show ranges during the hand')}
      ${toggle('s-reads', settings.reads, "Show the coach's reads on seats")}
      <label class="field"><span>Opponent speed</span><select id="s-speed" class="input">${opt('800', 'Slow', String(settings.speed))}${opt('450', 'Normal', String(settings.speed))}${opt('150', 'Fast', String(settings.speed))}</select></label>
    </details>
    <div class="modal-actions settings-foot">
      <small>Changing these starts a new session.</small>
      <button id="s-close" class="quiet">Close</button>
      <button class="primary" id="s-start">Start new session</button>
    </div>`);
  // Segmented choices write to their hidden input and fire "change" like the old selects did.
  document.querySelectorAll('#modal-box .seg').forEach((g) => {
    g.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      g.querySelectorAll('button').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', x === b);
      });
      const input = $(g.dataset.for);
      input.value = b.dataset.v;
      input.dispatchEvent(new Event('change'));
    });
  });
  const read = () => {
    settings.feedback = $('s-fb').value;
    settings.reads = $('s-reads').checked;
    settings.rangesLive = $('s-ranges').checked;
    settings.onlyRange = $('s-only').checked;
    if (sess) sess.heroRanges = settings.onlyRange ? settings.ranges : null;
    settings.speed = +$('s-speed').value;
  };
  const homeTotal = () => [...document.querySelectorAll('.h-count')].reduce((a, el) => a + Math.max(0, Math.floor(+el.value || 0)), 0);
  const syncMode = () => {
    const home = $('s-mode').value === 'home';
    $('home-fields').classList.toggle('hidden', !home);
    $('casino-fields').classList.toggle('hidden', home);
    $('casino-more').classList.toggle('hidden', home);
    const n = homeTotal();
    $('h-total').textContent = `${n} opponent${n === 1 ? '' : 's'} (1 to 8)`;
    $('h-total').style.color = n >= 1 && n <= 8 ? '' : 'var(--bad)';
  };
  $('s-mode').onchange = syncMode;
  document.querySelectorAll('.h-count').forEach((el) => (el.oninput = syncMode));
  syncMode();
  $('s-game').onchange = () => {
    $('s-buy').value = defaultBuy($('s-game').value);
  };
  $('s-start').onclick = () => {
    if ($('s-mode').value === 'home') {
      const n = homeTotal();
      if (n < 1 || n > 8) return; // the count line is already showing red
      const sb = Math.max(1, Math.floor(+$('h-sb').value || 1));
      const bb = Math.max(sb, Math.floor(+$('h-bb').value || 2));
      const counts = {};
      document.querySelectorAll('.h-count').forEach((el) => {
        const k = Math.max(0, Math.floor(+el.value || 0));
        if (k) counts[el.dataset.type] = k;
      });
      settings.home = { sb, bb, buy: Math.max(bb * 20, Math.floor(+$('h-buy').value || bb * 100)), counts };
    }
    settings.mode = $('s-mode').value;
    read();
    settings.game = $('s-game').value;
    settings.maxBuy = Math.max(GAMES[settings.game].bb * 20, +$('s-buy').value || GAMES[settings.game].maxBuy);
    settings.rake = $('s-rake').value;
    settings.table = $('s-table').value;
    saveSettings();
    closeModal();
    newSession();
  };
  $('s-close').onclick = () => {
    read();
    saveSettings();
    closeModal();
    render();
  };
  $('s-edit-ranges').onclick = () => {
    read();
    saveSettings();
    rangesModal(() => settingsModal());
  };
}

// Your own starting-hand ranges, one per seat group: tap or drag across the chart to add or
// remove hands. Hands outside the range for your seat are folded for you (checked when free).
function rangesModal(back = closeModal) {
  const draft = JSON.parse(JSON.stringify(settings.ranges));
  let group = 'early';
  const draw = () => {
    const sel = new Set(draft[group]);
    const cells = GRID.map((row) => row.map(({ name }) => `<button type="button" class="rg-cell${sel.has(name) ? ' on' : ''}" data-name="${name}" aria-pressed="${sel.has(name)}">${name}</button>`).join('')).join('');
    openModal(`
      <h1>Your ranges</h1>
      <p class="sub">Hands outside your range for the seat are folded for you, and the next hand is dealt.</p>
      <div class="type-chips rg-groups" role="tablist">${RANGE_GROUPS.map(([g, label, seats]) => `<button type="button" class="chip${g === group ? ' on' : ''}" role="tab" aria-selected="${g === group}" data-group="${g}" title="${seats}">${label}</button>`).join('')}</div>
      <div class="rg-bar"><span class="rg-share" id="rg-share"></span>
        <span class="rg-presets">${['tight', 'standard', 'loose'].map((p) => `<button type="button" class="chip" data-preset="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</span></div>
      <div class="rg-grid" id="rg-grid">${cells}</div>
      <p class="hint rg-hint">Suited hands above the diagonal, offsuit below, pairs on it. Tap a hand, or drag across several.</p>
      <div class="modal-actions players-foot">
        <button id="rg-reset" class="quiet">Reset all to standard</button>
        <button id="rg-cancel" class="quiet">Cancel</button>
        <button class="primary" id="rg-done">Done</button>
      </div>`);
    const share = () => ($('rg-share').innerHTML = `<b>${Math.round(shareOf(draft[group]) * 100)}%</b> of hands`);
    share();
    const grid = $('rg-grid');
    const setCell = (el, on) => {
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on);
      const set = new Set(draft[group]);
      if (on) set.add(el.dataset.name);
      else set.delete(el.dataset.name);
      draft[group] = [...set];
      share();
    };
    // Drag to paint: the first cell decides whether the drag adds or removes hands.
    let paint = null;
    grid.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.rg-cell');
      if (!el) return;
      e.preventDefault();
      paint = !el.classList.contains('on');
      setCell(el, paint);
    });
    grid.addEventListener('pointermove', (e) => {
      if (paint === null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rg-cell');
      if (el && el.classList.contains('on') !== paint) setCell(el, paint);
    });
    const stop = () => (paint = null);
    window.addEventListener('pointerup', stop, { once: true });
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);
    $('modal-box').querySelectorAll('[data-group]').forEach((b) => (b.onclick = () => { group = b.dataset.group; draw(); }));
    $('modal-box').querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { draft[group] = presetRanges(b.dataset.preset)[group]; draw(); }));
    $('rg-reset').onclick = () => { Object.assign(draft, presetRanges('standard')); draw(); };
    $('rg-cancel').onclick = () => back();
    $('rg-done').onclick = () => {
      settings.ranges = draft;
      saveSettings();
      if (sess) sess.heroRanges = settings.onlyRange ? settings.ranges : null;
      back();
    };
  };
  draw();
}

// First visit only. The coach strip shows one line on how this works until "Got it" or the
// first action; when the first hand ends, the news line says once that players can be tapped.
let hintOn = false;
let tapHintPending = false;
function endHint() {
  if (!hintOn) return;
  hintOn = false;
  try {
    localStorage.setItem('trainer-hint-seen', '1');
  } catch {
    /* ignore */
  }
}
function startHints() {
  try {
    if (localStorage.getItem('trainer-hint-seen')) return;
  } catch {
    /* storage unavailable: show it this time */
  }
  hintOn = true;
  tapHintPending = true;
}

function playerModal(seat) {
  const p = sess.seats[seat];
  const r = sess.readOf(seat);
  const n = r.notes;
  const bars = r.ranked
    .filter((t) => t.p >= 0.03)
    .map((t) => `<span>${esc(t.name)}</span><span class="bar"><i style="width:${Math.round(t.p * 100)}%"></i></span><span>${Math.round(t.p * 100)}%</span>`)
    .join('');
  const sds = n.showdowns.length
    ? n.showdowns
        .map((sd) => `<div class="sd"><div class="sd-top"><span class="sd-hand">Hand ${sd.hand}</span>${cardsInline(sd.cards)}<span class="sd-on">on</span>${cardsInline(sd.board)}<span class="sd-res ${sd.won ? 'pos' : 'neg'}">${sd.won ? 'Won' : 'Lost'}</span></div><div class="line">${esc(sd.line)}</div></div>`)
        .join('')
    : '<div class="empty">No showdowns seen yet.</div>';
  const top = r.ranked[0];
  const lvl = top.p >= 0.75 ? 3 : top.p >= 0.6 ? 2 : top.p >= 0.45 ? 1 : 0;
  // Same wording as the read on the seat: "Nit", "Likely nit", "Nit?".
  const word = shortType(top.id);
  const guess = lvl === 3 ? word : lvl === 2 ? `Likely ${word === 'ABC' ? word : word.toLowerCase()}` : lvl === 1 ? `${word}?` : 'Too early to say';
  openModal(`
    <div class="pc" style="--h:${p.hue ?? 160}">
      <div class="pc-head"><div class="big-avatar" style="--h:${p.hue ?? 160}">${avatarArt(p)}</div>
        <div><h1 class="pc-name">${esc(p.nick)}</h1><div class="pc-sub"><span class="label">${n.hands} hand${n.hands === 1 ? '' : 's'} watched</span>${p.steaming ? ' <span class="label tilt">Tilt</span>' : ''}</div></div></div>
      <p class="pc-look">${esc(p.look)}. Stack <span class="mono">${money(p.stack)}</span>.</p>
      <div class="pc-read"><span class="label">Coach's read</span>
        <div class="pc-guess">${esc(guess)}<span class="conf">${[1, 2, 3].map((k) => `<i class="${k <= lvl ? 'on' : ''}"></i>`).join('')}</span></div></div>
    </div>
    <div class="kv">
      <div class="stat"><small>Hands watched</small><b>${n.hands}</b></div>
      <div class="stat"><small>Put money in</small><b>${n.hands ? Math.round((100 * n.vpip) / n.hands) + '%' : '–'}</b></div>
      <div class="stat"><small>Raised preflop</small><b>${n.hands ? Math.round((100 * n.pfr) / n.hands) + '%' : '–'}</b></div>
      <div class="stat"><small>Showdowns</small><b>${n.showdowns.length}</b></div>
    </div>
    <h3>Showdowns</h3>
    ${sds}
    <h3>How the coach reads them</h3>
    <p class="sub">What a sharp observer could conclude from the look, the betting and the showdowns so far. This is the read your decisions are judged against.</p>
    <div class="bars">${bars}</div>
    <p class="sub" style="margin-top:10px">${esc(r.ranked[0].name)}: ${esc(PROFILES[r.ranked[0].id].blurb)}</p>
    <div id="p-truth"></div>
    <div class="modal-actions"><button id="p-reveal" class="quiet">Reveal true style (spoiler)</button><button class="primary" id="p-close">Close</button></div>`);
  $('p-close').onclick = closeModal;
  $('p-reveal').onclick = () => {
    $('p-truth').innerHTML = `<p class="spoiler"><b>Actually: ${esc(PROFILES[p.type].name)}${p.tilt ? ', currently on tilt' : ''}.</b> ${esc(PROFILES[p.type].blurb)}</p>`;
  };
}

function playersModal(type = 'station') {
  const draft = JSON.parse(JSON.stringify(tuning)); // edited copy; saved only on "Done"
  const changedType = (id) => draft[id] && Object.keys(draft[id]).length > 0;
  const draw = (t) => {
    const base = baseDef(t);
    const vals = draft[t] || {};
    const rows = CONTROLS.map((c) => {
      const def = c.get(base);
      const v = vals[c.key] !== undefined ? vals[c.key] : def;
      const min = Math.min(c.min, def);
      const max = Math.max(c.max, def);
      const isChanged = vals[c.key] !== undefined;
      return `${c.group ? `<h3 class="label tune-group">${c.group}</h3>` : ''}
        <div class="tune ${isChanged ? 'changed' : ''}" data-key="${c.key}">
          <div class="tune-top"><label>${c.label}</label><b class="tune-val">${esc(c.fmt(v))}</b></div>
          <input type="range" min="${min}" max="${max}" step="${c.step}" value="${v}" aria-label="${c.label}">
          <div class="tune-hint"><span class="tune-help">${esc(c.hint)}</span><span class="tune-was">was ${esc(c.fmt(def))} <button type="button" class="tune-reset">Reset</button></span></div>
        </div>`;
    }).join('');
    openModal(`
      <h1>Players</h1>
      <p class="sub">How each type of opponent plays. Every verdict rests on these, so if a type does not match your game, change it. Saved in this browser.</p>
      <div class="type-chips" role="tablist">${TYPE_IDS.map((id) => `<button type="button" class="chip${id === t ? ' on' : ''}${changedType(id) ? ' changed' : ''}" role="tab" aria-selected="${id === t}" data-type="${id}">${esc(PROFILES[id].name)}</button>`).join('')}</div>
      <p class="sub type-blurb">${esc(PROFILES[t].blurb)}</p>
      ${rows}
      <div class="modal-actions players-foot">
        <button id="t-reset-all" class="quiet" ${Object.values(draft).some((x) => Object.keys(x).length) ? '' : 'disabled'}>Reset all to shipped</button>
        <span class="players-note">Changes start a new session.</span>
        <button id="t-cancel" class="quiet">Cancel</button>
        <button class="primary" id="t-save">Done</button>
      </div>`);
    $('modal-box').querySelectorAll('.type-chips .chip').forEach((b) => (b.onclick = () => draw(b.dataset.type)));
    const on = $('modal-box').querySelector('.type-chips .chip.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    const refresh = () => {
      $('t-reset-all').disabled = !Object.values(draft).some((x) => Object.keys(x).length);
      const chip = $('modal-box').querySelector(`.type-chips .chip[data-type="${t}"]`);
      if (chip) chip.classList.toggle('changed', changedType(t));
    };
    $('modal-box').querySelectorAll('.tune').forEach((row) => {
      const c = CONTROLS.find((x) => x.key === row.dataset.key);
      const def = c.get(base);
      const input = row.querySelector('input');
      const set = (v) => {
        draft[t] = draft[t] || {};
        if (Math.abs(v - def) < c.step / 2) delete draft[t][c.key];
        else draft[t][c.key] = v;
        row.classList.toggle('changed', draft[t][c.key] !== undefined);
        row.querySelector('.tune-val').textContent = c.fmt(v);
        refresh();
      };
      input.oninput = (e) => set(+e.target.value);
      row.querySelector('.tune-reset').onclick = () => {
        input.value = def;
        set(def);
      };
    });
    $('t-reset-all').onclick = () => {
      for (const k of Object.keys(draft)) delete draft[k];
      draw(t);
    };
    $('t-cancel').onclick = closeModal;
    $('t-save').onclick = () => {
      tuning = draft;
      for (const k of Object.keys(tuning)) if (!Object.keys(tuning[k]).length) delete tuning[k];
      try {
        localStorage.setItem('trainer-tuning', JSON.stringify(tuning));
      } catch {
        /* ignore */
      }
      applyTuning();
      closeModal();
      newSession();
    };
  };
  draw(type);
}

function reviewModal() {
  const rev = sess.review();
  const sessionLeaks = rev.list
    .map(
      (c, i) => `<div class="leak"><div class="leak-head" data-leak="${i}"><span>${esc(CATEGORIES[c.category] || c.category)}</span><span class="mono">${c.count}× · ${money(c.loss)}</span></div>
          <div class="leak-body hidden" id="leak-${i}" style="margin-top:8px">${c.examples.slice(0, 4).map((d) => fbCard(d)).join('')}</div></div>`,
    )
    .join('');
  const all = Object.entries(leaks).sort((x, y) => y[1].loss - x[1].loss);
  // One row per leak across all sessions: name, total cost, count, Drill. The costliest leads.
  const allHtml = all
    .map(([cat, e], i) => `<div class="leak-row${i === 0 ? ' top' : ''}"><div class="lr-main"><span class="lr-name">${esc(CATEGORIES[cat] || cat)}</span><span class="lr-count">${e.count} time${e.count === 1 ? '' : 's'}</span></div>
      <span class="lr-cost">${money(e.loss)}</span><button class="drill-btn${i === 0 ? ' primary' : ''}" data-cat="${cat}">Drill</button></div>`)
    .join('');
  openModal(`
    <h1>Leak review</h1>
    <p class="sub">Where your money goes, biggest leak first, measured against the best option.</p>
    <div class="kv">
      <div class="stat"><small>Hands</small><b>${rev.hands}</b></div>
      <div class="stat"><small>Result</small><b class="${rev.net > 0 ? 'pos' : rev.net < 0 ? 'neg' : ''}">${signed(rev.net)}</b></div>
      <div class="stat"><small>Decisions judged</small><b>${rev.judged}</b></div>
      <div class="stat"><small>Cost of mistakes</small><b>${money(rev.lost)}</b></div>
    </div>
    ${all.length || rev.list.length ? `
    ${all.length ? `<h3>Your leaks, all sessions</h3><div class="leak-list">${allHtml}</div>` : ''}
    ${rev.list.length ? `<h3>This session, with examples</h3>${sessionLeaks}` : ''}` : '<p class="empty-line">No leaks yet. They build up here as you play.</p>'}
    <div class="modal-actions"><button id="r-close">Close</button></div>`);
  $('r-close').onclick = closeModal;
  $('modal-box').querySelectorAll('.drill-btn').forEach((b) => (b.onclick = () => startDrill(b.dataset.cat)));
  $('modal-box').querySelectorAll('.leak-head').forEach((el) => {
    el.onclick = () => {
      const body = $('leak-' + el.dataset.leak);
      if (!body) return; // all-sessions rows have no examples to expand
      body.style.display = body.style.display === 'block' ? 'none' : 'block';
    };
  });
  $('modal-box').querySelectorAll('.leak-body').forEach((b) => (b.style.display = 'none'));
}

$('seats').addEventListener('click', (e) => {
  const el = e.target.closest('.seat');
  if (!el) return;
  const seat = +el.dataset.seat;
  if (seat !== HERO) playerModal(seat);
});
$('seats').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('.seat');
  if (el && +el.dataset.seat !== HERO) {
    e.preventDefault();
    e.stopPropagation();
    playerModal(+el.dataset.seat);
  }
});
$('btn-side').onclick = () => (document.body.classList.contains('side-closed') ? openSide() : document.body.classList.add('side-closed'));
PHONE.addEventListener('change', () => sess && render());
// The header menu: on a phone a sheet behind "Menu" that closes after any choice or a tap
// elsewhere; from 601px always open, so the buttons sit in the header row as before.
const menuEl = $('menu');
const syncMenu = () => (menuEl.open = !PHONE.matches);
syncMenu();
PHONE.addEventListener('change', syncMenu);
menuEl.querySelector('.top-actions').addEventListener('click', () => {
  if (PHONE.matches) menuEl.open = false;
});
document.addEventListener('click', (e) => {
  if (PHONE.matches && menuEl.open && !menuEl.contains(e.target)) menuEl.open = false;
});
$('btn-sim-menu').onclick = () => quickSim();
$('side-close').onclick = () => document.body.classList.add('side-closed');
$('tab-coach').onclick = () => showTab('coach');
$('tab-log').onclick = () => showTab('log');
$('tab-range').onclick = () => showTab('range');
if (window.innerWidth < 1180) document.body.classList.add('side-closed');
$('btn-sim').onclick = () => {
  $('btn-sim').classList.remove('fresh'); // stop drawing attention once it has been used
  quickSim();
};
$('btn-players').onclick = () => playersModal();
$('btn-review').onclick = () => sess && reviewModal();
$('btn-settings').onclick = () => settingsModal();

// Handle for debugging from the browser console.
window.trainer = { get session() { return sess; }, settings, act, nextHand };

// http://localhost:5173/play.html?demo=7 jumps to a mid-session decision
// with coach feedback showing (used for screenshots). The number picks the session.
function demo(seed) {
  // Always the standard casino table, whatever is saved in Settings.
  Object.assign(settings, DEFAULTS, { home: settings.home });
  sess = new Session({ ...sessionOpts(), seed });
  sess.startPlayable();
  for (let k = 0; k < 4000; k++) {
    const st = sess.status();
    if (st === 'bot') sess.stepBot();
    else if (st === 'over') sess.startPlayable();
    else {
      const s = sess.hand.state;
      const L = sess.heroOptions();
      let live = 0;
      for (let i = 1; i < s.n; i++) if (!s.folded[i]) live++;
      const flagged = sess.hand.decisions.some((d) => d.verdict.grade !== 'good' && d.street > 0 && d.reasons.length >= 2);
      if (sess.handNo > 20 && s.board.length >= 4 && flagged && L.callAmt > 0 && L.canRaise && live >= 2) break;
      sess.heroAct({ type: L.canCheck ? 'check' : 'call' });
    }
  }
  pastLog = [];
  document.body.classList.remove('side-closed');
  render();
}

const demoSeed = new URLSearchParams(location.search).get('demo');
if (demoSeed !== null) demo(+demoSeed || 7);
else {
  // No setup screen: deal straight in on the saved settings, or the defaults on a first visit
  // (saved now, so the next visit counts as returning).
  if (firstVisit) {
    saveSettings();
    startHints();
  }
  newSession();
}
