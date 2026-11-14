import { Session, GAMES, RAKES, APP_GAME } from '../trainer/session.js';
import { RANKS, holeOrder } from '../engine/cards.js';
import { potSize, positionName, STREET } from '../engine/game.js';
import { classIndex, classOf } from '../engine/hands.js';
import { evaluate } from '../engine/evaluator.js';
import { handFeatures } from '../engine/features.js';
import { PROFILES, TYPE_IDS, baseDef, currentDef, applyOverrides } from '../bots/profiles.js';
import { CONTROLS } from '../trainer/tuning.js';
import { CATEGORIES, shownCost } from '../trainer/explain.js';
import { DRILLS } from '../trainer/drills.js';
import { TABLES } from '../trainer/players.js';
import { presets, defaultRaise } from './presets.js';
import { disputeReport, disputeText, disputeFileName, disputeIssueUrl } from '../trainer/dispute.js';
import { RANGE_GROUPS, presetRanges, presetRaised, shareOf, previousStandard, groupOf } from '../trainer/ranges.js';
import { equityVsRange } from '../trainer/equity.js';
import { BUILD, HASHES } from '../trainer/version.js';
import { keepHand, saveSession, loadSession, clearSession, listHands, clearHands } from './store.js';
import { framesOf } from '../trainer/replay.js';
import { bestPlayEdge } from '../trainer/best.js';

const $ = (id) => document.getElementById(id);
const HERO = 0;
const SUIT_SYM = ['♣', '♦', '♥', '♠'];
const SUIT_CLS = ['c', 'd', 'h', 's'];

// What a new player starts on: $1/$3 with a 100-big-blind buy-in and a typical capped rake.
// Players who already have saved settings keep theirs.
const DEFAULTS = { v: 3, game: APP_GAME.game, maxBuy: APP_GAME.heroBuy, rake: APP_GAME.rake, table: 'typical', onlyRange: true, ranges: presetRanges('standard'), rangesRaised: presetRaised('standard'), rangesLive: true, mode: 'casino', home: { sb: 1, bb: 2, buy: 200, counts: { station: 2, nit: 1, maniac: 1, abc: 1, beginner: 1, tag: 1 } }, feedback: 'now', reads: true, speed: 450, sideW: null };
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
// Standard became hand-written in Nov 2026. A seat's saved range that is still exactly the old
// Standard moves to the new one; anything the player changed is left as it is.
{
  const was = previousStandard();
  const now = { first: presetRanges('standard'), raised: presetRaised('standard') };
  const same = (a, b) => Array.isArray(a) && a.length === b.length && b.every((n) => a.includes(n));
  let moved = false;
  for (const [key, kind] of [['ranges', 'first'], ['rangesRaised', 'raised']]) {
    if (!settings[key]) continue;
    for (const [g] of RANGE_GROUPS) {
      if (same(settings[key][g], was[kind][g]) && !same(settings[key][g], now[kind][g])) {
        settings[key] = { ...settings[key], [g]: now[kind][g] };
        moved = true;
      }
    }
  }
  if (moved && !firstVisit) {
    try {
      localStorage.setItem('trainer-settings', JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }
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
let overrides = {};
function applyTuning() {
  const all = {};
  for (const [type, vals] of Object.entries(tuning)) {
    if (!TYPE_IDS.includes(type)) continue;
    const base = baseDef(type);
    all[type] = {};
    for (const c of CONTROLS) if (vals[c.key] !== undefined) Object.assign(all[type], c.set(base, vals[c.key]));
  }
  overrides = all;
  applyOverrides(all);
  judge.tune();
}

// ---- the judge worker: grading runs off the main thread so the table stays responsive. If the
// worker cannot start, or its cached modules are a different build from the page's, decisions
// are graded here instead, as before.
const judge = {
  worker: null,
  ready: false,
  next: 1,
  waiting: new Map(),
  start() {
    try {
      this.worker = new Worker(new URL(`../trainer/judge.worker.js?v=${BUILD}`, import.meta.url), { type: 'module' });
    } catch {
      return;
    }
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'hello') {
        // ready only when the modules the worker loaded are byte for byte the page's (W2). Its own
        // copy of version.js is not compared: that file changes on every push and is only a label.
        this.ready = Array.isArray(m.stale) && !m.stale.length;
        if (this.ready) this.tune();
        else this.stop();
        return;
      }
      const w = this.waiting.get(m.id);
      if (!w) return;
      this.waiting.delete(m.id);
      if (m.type === 'graded') w.resolve(m.verdict);
      else w.reject(new Error(m.error));
    };
    this.worker.onerror = () => this.stop();
    this.worker.postMessage({ type: 'hello', hashes: HASHES });
  },
  stop() {
    this.ready = false;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    for (const w of this.waiting.values()) w.reject(new Error('judge worker stopped'));
    this.waiting.clear();
  },
  tune() {
    if (this.worker && this.ready) this.worker.postMessage({ type: 'tuning', overrides });
  },
  // A grade the worker has not answered within 20 seconds is made on the page instead (W3).
  slowNoted: false,
  grade(job) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.waiting.has(id)) return;
        this.waiting.delete(id);
        if (!this.slowNoted) {
          this.slowNoted = true;
          console.warn('The judge worker took more than 20 s; grading on the page instead.');
        }
        reject(new Error('timeout'));
      }, 20000);
      this.waiting.set(id, { resolve: (v) => { clearTimeout(timeout); resolve(v); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
      this.worker.postMessage({ type: 'grade', id, job });
    });
  },
};
judge.start();
applyTuning();

// Leaks tracked across sessions: { category: { count, loss, streets: { street: count } } }
let leaks = {};
try {
  leaks = JSON.parse(localStorage.getItem('trainer-leaks') || '{}');
} catch {
  /* storage unavailable */
}
// Habits the coach noted with a tip (not mistakes): counted across sessions for Leak review.
const HABITS = {
  limp: 'Limped first in (raising usually does better)',
  wideOpen: 'Opened a hand outside the Standard range for the seat',
  junk3bet: 'Re-raised with a hand that is mostly a bluff here',
};
let habits = {};
try {
  habits = JSON.parse(localStorage.getItem('trainer-habits') || '{}');
} catch {
  /* storage unavailable */
}
function noteHabit(d) {
  if (!d || !d.tipKind || drill) return;
  habits[d.tipKind] = (habits[d.tipKind] || 0) + 1;
  try {
    localStorage.setItem('trainer-habits', JSON.stringify(habits));
  } catch {
    /* ignore */
  }
}
function noteLeak(d) {
  if (!d || d.verdict.grade === 'good' || !d.category) return;
  const e = (leaks[d.category] ||= { count: 0, loss: 0, streets: {} });
  e.count++;
  e.loss += d.cost;
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
  const base = { heroRanges: settings.onlyRange ? settings.ranges : null, heroRangesRaised: settings.onlyRange ? settings.rangesRaised : null, samples: 600 };
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

// The session placard on the table's top-left corner (header design, section 1): the
// figures the header pills used to show. Full when it clears every seat, else a one-line pill;
// decided by measuring after each layout (fitPlacard), not by the window's width.
const plural = (n, one, many = one + 's') => (n === 1 ? one : many);
function renderStats() {
  const g = sess.game;
  const wrap = $('placard-wrap');
  if (drill) {
    const res = `${drill.clean} of ${drill.tried} right`;
    wrap.innerHTML = `<button type="button" id="placard" class="placard drill" aria-label="${esc(`Drill: ${leakName(drill.cat)}. ${res}. Mistakes cost ${money(drill.cost)}. Opens Leak review.`)}">
      <span class="pl-top">Drill · <b>${esc(leakName(drill.cat))}</b></span>
      <span class="pl-res"><b>${drill.clean}</b><small>of ${drill.tried} right</small></span>
      <span class="pl-sub full">Mistakes cost <b class="${drill.cost > 0 ? 'neg' : ''}">${money(drill.cost)}</b></span>
      <span class="pl-sub short">Drill · ${res} · <b class="${drill.cost > 0 ? 'neg' : ''}">${money(drill.cost)}</b></span></button>
      <button type="button" class="drill-exit" id="drill-exit">Exit drill</button>`;
    fitPlacard();
    return;
  }
  const stakes = `$${g.sb}/$${g.bb}${sess.lineup ? ' home game' : ' No-limit'}`;
  if (!sess.results.length && !sess.decisions.length) {
    // before the first hand is over: nothing to show yet, and Quick sim lives here
    wrap.innerHTML = `<div id="placard" class="placard fresh"><span class="pl-top">${esc(stakes)} · hand <b>${sess.handNo}</b></span>
      <span class="pl-sub full">New session. Nothing to show yet.</span>
      <span class="pl-sub short">New session</span>
      <button type="button" id="btn-sim" class="pl-sim" title="Plays 40 hands in about a second so you sit down already knowing something about every player. Your results in those hands do not count.">Quick sim · 40 hands</button></div>`;
    fitPlacard();
    return;
  }
  const net = sess.heroNet();
  const rev = sess.review();
  const cls = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
  const said = `Session: ${net > 0 ? 'up ' : net < 0 ? 'down ' : 'even, '}${money(Math.abs(net))} after ${sess.handNo} ${plural(sess.handNo, 'hand')}. Mistakes cost ${money(rev.lost)}; ${rev.flagged} of ${rev.judged} ${plural(rev.judged, 'decision')} flagged. Opens Leak review.`;
  wrap.innerHTML = `<button type="button" id="placard" class="placard" aria-label="${esc(said)}" title="Your session so far · opens Leak review">
    <span class="pl-top">${esc(stakes)} · hand <b>${sess.handNo}</b></span>
    <span class="pl-res"><b class="${cls}">${net === 0 ? '$0' : signed(net).replace('-', '−')}</b><small>session</small></span>
    <span class="pl-sub full">Mistakes cost <b class="${rev.lost > 0 ? 'neg' : ''}">${money(rev.lost)}</b> · flagged <b>${rev.flagged}</b> of ${rev.judged}</span>
    <span class="pl-sub short">hand ${sess.handNo} · <b class="${rev.flagged ? 'neg' : ''}">${rev.flagged}</b> flagged</span></button>`;
  fitPlacard();
}
// Full size only where its box clears every seat (8px to spare); otherwise the pill. Phones: always
// the pill. Where even the pill would touch a seat (the narrowest table areas), the table moves
// down by just that much. Seats are measured as they would sit without that move, so the
// decision is the same each time it is made.
let placardRoom = 0;
function fitPlacard() {
  const el = $('placard');
  const table = $('table');
  let room = 0;
  if (el && !(RP && document.body.classList.contains('replaying'))) {
    const parts = [];
    for (const part of document.querySelectorAll('#seats .seat .avatar, #seats .seat .plate, #seats .seat .cards')) {
      const b = part.getBoundingClientRect();
      if (b.width) parts.push({ left: b.left, right: b.right, top: b.top - placardRoom, bottom: b.bottom - placardRoom });
    }
    const hits = (a) => parts.filter((b) => a.left - 8 < b.right && b.left < a.right + 8 && a.top - 8 < b.bottom && b.top < a.bottom + 8);
    el.classList.remove('compact');
    if (NARROW.matches || hits(el.getBoundingClientRect()).length) {
      el.classList.add('compact');
      const a = el.getBoundingClientRect();
      for (const b of hits(a)) room = Math.max(room, Math.ceil(a.bottom + 8 - b.top));
    }
  }
  if (room === placardRoom) return;
  placardRoom = room;
  table.style.marginTop = '';
  if (room) table.style.marginTop = parseFloat(getComputedStyle(table).marginTop) + room + 'px';
  fitTable();
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
// A touch screen (no hover): wording says tap, not hover or click.
const TOUCH = matchMedia('(hover: none), (pointer: coarse)');

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
    if (!over && s.toAct === i && !h.replay) cls.push('acting');
    if (h.actor === i) cls.push('acted');
    if (over && s.result.won[i] > 0) cls.push('winner');
    if (p.steaming) cls.push('steaming');
    if (over && s.result.showdown && !s.folded[i] && i !== HERO) cls.push('shown');
    let cards = '';
    if (i === HERO) cards = holeOrder(s.hole[i]).map((c) => cardHtml(c)).join('');
    else if (!s.folded[i]) cards = over && s.result.showdown ? holeOrder(s.hole[i]).map((c) => cardHtml(c)).join('') : h.showAll ? `<span class="unseen">${holeOrder(s.hole[i]).map((c) => cardHtml(c)).join('')}</span>` : backHtml() + backHtml();
    else if (h.showAll && s.hole[i]) cards = `<span class="unseen">${holeOrder(s.hole[i]).map((c) => cardHtml(c)).join('')}</span>`;
    let read = '';
    if (i !== HERO && settings.reads) {
      const r = sess.readOf(i);
      const top = r.ranked[0];
      const pc = Math.round(top.p * 100);
      if (top.p >= 0.45) {
        const lvl = top.p >= 0.75 ? 3 : top.p >= 0.6 ? 2 : 1;
        const label = readGuess(top);
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
      <div class="plate">${i === HERO && isBtn ? '<div class="dealer mine" title="You are on the button">D</div>' : ''}<div class="nick">${esc(p.nick)}${i === HERO ? badge : ''}</div>${i !== HERO && !drill && newSeats.get(i) === h.no ? '<span class="new-tag" title="New player this hand">NEW</span>' : ''}
      <div class="stack">${money(stack)}${h.raiser === i ? '<span class="raiser-tag">Raiser</span>' : ''}</div>${read}</div>${i === HERO ? madeHand() : ''}${vp ? `<div class="vpip" style="--vc:${vp.color}"><b>${vp.pct}%</b> VPIP<div class="vpip-tip"><b>VPIP <span class="num">${vp.pct}%</span></b>Put money in voluntarily in ${p.notes.vpip} of the ${p.notes.hands} hands you have watched. ${vpipVerdict(vp.pct)}</div></div>` : ''}${i === HERO ? '' : `<div class="tip ${y < 45 ? 'below' : ''}">${p.steaming ? '<div class="tilt">Tilt</div>' : ''}${tendencies(p).map((t) => `<div>${esc(t)}</div>`).join('')}<div>${esc(readLine(i))}</div><div class="tip-more">Click for details</div></div>`}</div>`;
    if (isBtn && i !== HERO) {
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
}

// What a player's VPIP says, in words: the hover box on the pill and the player card share it.
function vpipVerdict(pct) {
  return pct < 18 ? 'Tight: mostly strong hands.' : pct < 32 ? 'About average.' : pct < 50 ? 'Loose: plays a lot of weak hands.' : 'Plays almost anything.';
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
  if (sd) lines.push(`Last shown: ${holeOrder(sd.cards).map((c) => RANKS[c >> 2] + SUIT_SYM[c & 3]).join(' ')} (${sd.won ? 'won' : 'lost'})`);
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
  el.classList.toggle('busy', thinking);
  if (st === 'hero') {
    const L = sess.heroOptions();
    const s = h.state;
    if (raiseHand !== h || raiseStep !== s.history.length || !(raiseTo >= L.minTo && raiseTo <= L.maxTo)) {
      raiseTo = defaultRaise(L, s);
      raiseHand = h;
      raiseStep = s.history.length;
    }
    const verb = s.currentBet === 0 ? 'Bet' : 'Raise to';
    // Every chip is one short word or amount; the exact amount, and whom an all-in covers, are in
    // the title and the accessible name ("All-in: $158 puts Jersey all in").
    const short = (l) => (!PHONE.matches ? l : l.replace(' of stacks', ' stack'));
    const chipTitle = (l, v, title, seat) =>
      l === 'All-in' ? (seat >= 0 ? `All-in: $${v} puts ${sess.seats[seat].nick} all in` : `All-in: $${v}, your whole stack`) : title ? `${title}: $${v}` : `$${v}`;
    const pre = L.canRaise
      ? presets(L, s)
          .map(([l, v, title, seat]) => {
            const t = esc(chipTitle(l, v, title, seat));
            return `<button data-to="${v}" title="${t}" aria-label="${t}">${short(l)}</button>`;
          })
          .join('')
      : '';
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

const tipLine = (d, cls = 'tip-line') =>
  d.tip
    ? `<p class="${cls}"><b class="tip-label">Tip:</b> ${esc(d.tip)}${d.tipKind === 'wideOpen' && d.position ? ` <button type="button" class="link-btn edit-ranges" data-edit-ranges="${groupOf(d.position)}">Edit ranges for ${esc(d.position)} ›</button>` : ''}</p>`
    : '';
// The coach's note on a fine verdict, without the "X: fine." it starts with (QA K1: the review shows it
// under the fine row, as the strip and the panel do).
function noteText(d) {
  if (d.tip || !d.verdict.note || !d.headline) return '';
  const k = d.headline.indexOf(': ');
  const body = (k >= 0 ? d.headline.slice(k + 2) : d.headline).replace(/^(fine|good|not graded)\.\s*/, '').replace(/^\((.*)\)$/, '$1');
  return body;
}
// MATH's anchors: "The coach's estimate" under flags, notes, vetoes and not-graded decisions
const anchorHtml = (d) => (d.anchor ? `<p class="anchor-line"><span class="label">The coach's estimate</span> ${esc(d.anchor)}${d.anchorExtra ? `<span class="anchor-extra"> ${esc(d.anchorExtra)}</span>` : ''}</p>` : '');
const notGraded = (v) => v.note === 'unclear' || v.note === 'closeCall';
const noteLine = (d, cls) => {
  const n = noteText(d);
  return n ? `<p class="${cls}">${esc(n)}</p>` : '';
};
// The coach's read in words, the same everywhere (seat, player card, review): "Nit", "Likely nit",
// "Nit?", or "Too early to say" below 45%.
const readLevel = (top) => (top.p >= 0.75 ? 3 : top.p >= 0.6 ? 2 : top.p >= 0.45 ? 1 : 0);
function readGuess(top) {
  const word = shortType(top.id);
  if (top.p >= 0.75) return word;
  if (top.p >= 0.6) return `Likely ${word === 'ABC' ? word : word.toLowerCase()}`;
  return top.p >= 0.45 ? `${word}?` : 'Too early to say';
}
// The read in a review is the one the coach had at the decision; say so, and what it is now when
// it has moved on (STRAT, QA C4).
function readThen(d, r) {
  const vil = d.villain;
  if (!vil || !vil.picture || !r.startsWith(vil.nick) && !r.startsWith('By now')) return r;
  let out = r.replace(`By now ${vil.nick} plays like a `, `At the time, ${vil.nick} played like a `).replace(`${vil.nick} is most likely a `, `At the time, ${vil.nick} looked most likely a `);
  if (out === r || !sess || !sess.seats[vil.seat] || sess.replay) return out;
  const post = vil.picture.post;
  let then = 0;
  for (let t2 = 1; t2 < post.length; t2++) if (post[t2] > post[then]) then = t2;
  const nowTop = sess.readOf(vil.seat).ranked[0];
  if (nowTop.id !== TYPE_IDS[then]) {
    const guess = readGuess(nowTop);
    out = out.replace(/\.$/, '') + ` — now: ${guess === 'Too early to say' ? 'too early to say' : guess}${/[?.]$/.test(guess) ? '' : '.'}`;
  }
  return out;
}
const REF_WHY = {
  anchor: 'The best play that works against anyone; a longer bar here comes from these opponents only',
  noRaise: 'The best play that is not a raise; the coach does not hold you to the raise',
};
const refTag = (v, i) => (i === v.best && v.ref ? ` <span class="ref-tag" title="${esc(REF_WHY[v.ref] || 'The best bet the coach holds you to here; bigger sizes are not held against you')}">reference</span>` : '');
function fbCard(d, showWhere = true) {
  const v = d.verdict;
  const where = showWhere
    ? `<div class="where">Hand ${d.hand} · ${d.streetName} · ${d.position} ${cardsInline(holeOrder(d.hole))}${d.board.length ? ' on ' + cardsInline(d.board) : ''}</div>`
    : `<div class="where">${d.streetName}${d.handText ? ' · you have ' + esc(d.handText) : ''}</div>`;
  const rows = v.options
    .map((o, i) => `<tr class="${i === v.best ? 'best' : ''} ${i === v.mine ? 'mine' : ''}"><td>${esc(o.label)}${refTag(v, i)}${o.close && i !== v.best ? ' <span class="approx" title="Too close to the best option to tell apart">≈</span>' : ''}</td><td>${Math.round(o.ev) >= 0 ? '+' : '−'}$${Math.abs(Math.round(o.ev))}</td></tr>`)
    .join('');
  const best = isBest(d);
  return `<div class="fb ${v.grade}${best ? ' best' : ''}">${where}
    ${best ? `<div class="fb-best"><span class="vmark good best" aria-hidden="true">${MARK.good}</span><span class="g bp-word">Best play</span></div>` : ''}
    <div class="head">${esc(d.headline)}</div>
    ${best ? bestEdgeLine(d) : ''}
    ${anchorHtml(d)}
    ${tipLine(d)}
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
    <div class="fb ${v.grade}"><div class="where">Hand ${d.hand} · ${d.streetName} · ${d.position} ${cardsInline(holeOrder(d.hole))}${d.board.length ? ' on ' + cardsInline(d.board) : ''}</div><div class="head">${esc(d.headline)}</div></div>
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
  let html = [...h.decisions].reverse().map((d) => fbCard(d, false)).join('');
  // The best-play pop plays once, on the newest card, and only if the Coach tab is showing as it
  // lands; opening the tab later shows the final state (Addendum B). The card keeps "pop" for the
  // 1.3s it runs, and an identical re-render leaves the element alone, so the pop is not cut short.
  const d0 = h.decisions[h.decisions.length - 1];
  const key = `${sess.id}:${d0.id}`;
  if (isBest(d0)) {
    if (!CARD_POPPED.has(key)) CARD_POPPED.set(key, { t: performance.now(), live: el.getClientRects().length > 0 });
    const c = CARD_POPPED.get(key);
    if (c.live && performance.now() - c.t < 1300) html = html.replace('<div class="fb-best">', '<div class="fb-best pop">');
  }
  if (el._fbHtml === html && el._fbEl && el.firstElementChild === el._fbEl) return;
  el.innerHTML = html;
  el._fbHtml = html;
  el._fbEl = el.firstElementChild;
}
const CARD_POPPED = new Map();

// ---- table events (header design, A2): no news line on the table. Each event becomes a
// quiet line in the Hand log; a new player also gets a NEW tag on their seat for one hand; the two
// worth a glance (Quick sim done, the table reading you) take the strip once, before your first play.
let newsSeen = null;
let newsTaken = 0;
let stripEvent = null; // { hand, text, go }
let logEvents = []; // { hand, text }: what happened before that hand was dealt
const newSeats = new Map(); // seat -> the hand it is new in
function takeNews() {
  if (drill || !sess.hand) return;
  if (sess.news !== newsSeen) {
    newsSeen = sess.news;
    newsTaken = 0;
  }
  const no = sess.hand.no;
  for (const n of sess.news.slice(newsTaken)) {
    if (/^Skipped \d+ hand/.test(n)) continue; // the Hand log's "folded for you" divider says it
    const back = /^Welcome back: your session carries on at hand (\d+)/.exec(n);
    const text = back ? `Session resumed at hand ${back[1]}` : n.replace('Hover over a player to see', TOUCH.matches ? 'Tap a player to see' : 'Hover over a player to see');
    if (/^Fast-forwarded/.test(n)) stripEvent = { hand: no, text };
    if (/^The table has noticed/.test(n)) stripEvent = { hand: no, text: "Table's onto you: expect more calls", go: true };
    const seat = /leaves\. New player in seat (\d+)/.exec(n);
    if (seat) newSeats.set(+seat[1] - 1, no);
    logEvents.push({ hand: no, text });
  }
  newsTaken = sess.news.length;
}

// ---- the coach strip (header design, A1): one 44px line built from the verdict's own
// fields. The full headline, reasons and tips stay in the Coach tab and the review.
const STRIP_TIP = {
  limp: (t) => `Tip: raise to $${t.to} instead of limping`,
  wideOpen: (t) => `Tip: usually a fold from ${t.where}`,
  junk3bet: () => 'Tip: too weak to re-raise; call or fold',
};
const POPPED = new Map();
function stripHtml(show, { worst, prev }) {
  const v = show.verdict;
  const g = v.grade;
  const mine = v.options[v.mine];
  const tipping = g === 'good' && !!show.tipKind;
  const best = !prev && isBest(show); // not in the previous-hand state (Addendum B)
  const word = g === 'good' ? (notGraded(v) ? 'not graded' : best ? 'best play' : 'fine') : g; // with a tip or a note it is "fine", as the headline says (QA Z3, M4)
  // the pop plays once per decision: the strip keeps its "pop" class for the 1.3s it runs (so an
  // identical re-render leaves the element, and the animation, alone) and drops it afterwards
  const key = `${sess ? sess.id : ''}:${show.id}`;
  if (best && !POPPED.has(key)) POPPED.set(key, performance.now());
  const sheen = best && performance.now() - POPPED.get(key) < 1300;
  const cost = g === 'good' ? 0 : shownCost(v);
  const tipFn = g === 'good' && show.tipKind ? STRIP_TIP[show.tipKind] : null;
  const tip = g === 'good' && show.tipKind ? (tipFn && v.tip ? tipFn(v.tip) : 'Tip') : '';
  const note = g === 'good' && !tip && v.note ? 'note' : '';
  const cls = ['cs', g === 'mistake' ? 'warn' : g === 'blunder' ? 'bad' : '', best ? 'best' : '', sheen ? 'pop' : '', tip ? 'tip' : '', note ? 'note' : '', prev ? 'prev' : ''].filter(Boolean).join(' ');
  const st = worst ? `Worst<span class="st-x"> · ${esc(show.streetName)}</span>` : esc(show.streetName);
  const go = g !== 'good' ? 'Why ›' : tip || note ? '›' : 'Details ›';
  return `<button type="button" class="${cls}" id="toast-open"><span class="st">${st}</span><span class="vmark ${g}${best ? ' best' : ''}" aria-hidden="true">${MARK[g]}</span>
    <span class="main"><span class="act">${esc(mine.label.replace(/\s*\([^)]*\)\s*$/, ''))}</span><span class="rest"><span class="gw"> · <span class="g${best ? ' bp-word' : ''}">${word}</span></span>${cost ? ` <span class="cost">−$${cost}</span>` : ''}${tip ? ` <span class="gw2">·</span> <span class="tipx">${esc(tip)}</span>` : ''}${note ? ` · <span class="tipx">note</span>` : ''}</span></span>
    <span class="go">${go}</span></button>`;
}
function renderToast() {
  const h = sess.hand;
  const el = $('toast');
  const d = h.decisions[h.decisions.length - 1];
  if (hintOn) {
    el.innerHTML = `<div class="toast hint"><svg class="tile" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#1f5c4a"/><rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="none" stroke="#f3f0e8" stroke-opacity=".22"/><g fill="none" stroke="#f3f0e8" stroke-width="2.1"><path d="M9.51 13.56A3.8 3.8 0 1 0 10.4 16H7.3"/><path d="M12.4 12.2h7.2M16 12.2v8.65"/><circle cx="25.4" cy="16" r="3.8"/></g><path d="M3 18.2C10 13.8 19 19.6 29 14.4" fill="none" stroke="#b4e46e" stroke-width="2.1" stroke-linecap="round"/></svg>
      <span class="t-main">Play it the way you would live. The coach speaks up when a play costs you money.</span>
      <button type="button" class="t-more" id="hint-ok">Got it</button></div>`;
    $('hint-ok').onclick = () => {
      endHint();
      renderToast();
    };
    return;
  }
  if (thinking) {
    el.innerHTML = '<div class="cs quiet thinking" role="status"><span class="spin" aria-hidden="true"></span><span class="main">Checking…</span></div>';
    return;
  }
  if (!d || d.verdict.mine < 0) {
    const ev = !drill && stripEvent && stripEvent.hand === h.no ? stripEvent : null;
    if (ev) {
      el.innerHTML = `<button type="button" class="cs quiet ev" id="toast-open"><span class="main">${esc(ev.text)}</span><span class="go">›</span></button>`;
      $('toast-open').onclick = () => openSide('log');
      return;
    }
    if (drill && !h.over) {
      const t = `Drill: ${DRILLS[drill.cat].what}. ${heroStory()}`;
      el.innerHTML = `<div class="cs quiet" title="${esc(t)}"><span class="main">${esc(t)}</span></div>`;
      return;
    }
    el.innerHTML = '<div class="cs empty"><span class="main">Nothing to grade yet this hand</span></div>';
    return;
  }
  if (settings.feedback === 'after' && !h.over) {
    el.innerHTML = '<div class="cs quiet"><span class="main">Graded when the hand ends</span></div>';
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
  const html = stripHtml(show, { worst: h.over && show.verdict.grade !== 'good' && h.decisions.length > 1, prev: pending });
  // an identical strip that is still on screen is left as it is, so a running pop is not restarted
  if (!(el._stripHtml === html && el._stripEl && el.firstElementChild === el._stripEl)) {
    el.innerHTML = html;
    el._stripHtml = html;
    el._stripEl = el.firstElementChild;
  }
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
  if (RP && document.body.classList.contains('replaying')) return renderReplay();
  if (tab === 'log') {
    renderLog();
    $('log').scrollTop = $('log').scrollHeight;
  }
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
let rangeFocus = ''; // the step the opponent was last chosen for (QA X5)
let rangeStreet = 'now';
let rangeHand = -1;
let rangeMode = 'vs'; // colour by whether you beat it ('vs', the default) or by what they hold ('kind'); kept for the session
const eqCache = new Map(); // preflop equity against a range, per hand / seat / point in the hand

// Ahead-or-behind colour on one scale: red (it beats you) through amber to lime (you beat it).
const VS_RED = [240, 104, 95];
const VS_AMBER = [242, 176, 74];
const VS_LIME = [180, 228, 110];
function vsRgb(a) {
  const [x, y, t] = a < 0.5 ? [VS_RED, VS_AMBER, a / 0.5] : [VS_AMBER, VS_LIME, (a - 0.5) / 0.5];
  return x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',');
}

function renderRanges() {
  const el = $('ranges');
  if (currentTab !== 'range' || !sess || !sess.hand) return;
  const h = sess.hand;
  const s = h.state;
  if (rangeHand !== h.no) {
    rangeHand = h.no;
    rangeStreet = 'now';
    rangeSeat = -1;
    eqCache.clear();
  }
  if (!settings.rangesLive && !h.over) {
    el.innerHTML = '<div class="empty">Ranges are hidden until the hand is over (you turned this on in Settings). Make your read first, then check it here.</div>';
    return;
  }
  const live = [];
  for (let i = 1; i < s.n; i++) if (!s.folded[i]) live.push(i);
  if (!live.length) for (let i = 1; i < s.n; i++) live.push(i);
  // In the replayer an opponent who put money in and has since folded keeps a chip, "· folded",
  // showing their range as it stood when they folded (replayer design, 5.3).
  const gone = h.replay ? [...Array(s.n).keys()].filter((i) => i !== HERO && s.folded[i] && !live.includes(i) && s.history.some((e) => e.seat === i && ['call', 'bet', 'raise'].includes(e.type))) : [];
  const chipsFor = [...live, ...gone];
  const lastBy = (types) => {
    for (let k = s.history.length - 1; k >= 0; k--) {
      const e = s.history[k];
      if (types.includes(e.type) && live.includes(e.seat)) return e.seat;
    }
    return -1;
  };
  // At each of your decisions the chart starts on the player you faced (the one the Coach tab's
  // "See X's range" names); a choice made at that step stays until the next decision.
  const stepKey = `${h.no}|${s.history.length}`;
  if (rangeFocus !== stepKey) {
    let faced = -1;
    if (h.replay) {
      const f = RP && RP.frames[RP.i];
      const d = f && f.kind === 'action' && f.seat === HERO && f.decision >= 0 ? h.decisions[f.decision] : null;
      if (d && d.villain) faced = d.villain.seat;
    } else if (!h.over && s.toAct === HERO) faced = lastBy(['bet', 'raise']);
    if (faced >= 0 && chipsFor.includes(faced)) rangeSeat = faced;
    rangeFocus = stepKey;
  }
  if (!chipsFor.includes(rangeSeat)) {
    // Default to whoever bet or raised last, else whoever last made a choice (so there is a
    // range to show), else the first player still in.
    const aggressor = lastBy(['bet', 'raise']);
    const actor = lastBy(['call', 'check']);
    rangeSeat = aggressor >= 0 ? aggressor : actor >= 0 ? actor : live[0];
  }
  if (h.replay || (rangeStreet !== 'now' && !h.rangeSnaps[rangeStreet])) rangeStreet = 'now';
  const g = sess.rangeGrid(rangeSeat, rangeStreet);
  const who = chipsFor.map((i) => `<button class="chip ${i === rangeSeat ? 'on' : ''}" data-seat="${i}">${esc(sess.seats[i].nick)}${s.folded[i] && gone.includes(i) ? ' · folded' : ''}</button>`).join('');
  const steps = STREET_TABS.map((label, st) => `<button class="chip ${rangeStreet === st ? 'on' : ''}" data-street="${st}" ${h.rangeSnaps[st] ? '' : 'disabled'}>${label}</button>`).join('') +
    `<button class="chip ${rangeStreet === 'now' ? 'on' : ''}" data-street="now">${h.over ? 'End' : 'Now'}</button>`;
  if (!g) {
    el.innerHTML = `<div class="chips">${who}</div><div class="chips">${steps}</div><div class="empty">Nothing to show yet.</div>`;
  } else {
    const post = g.street > 0;
    const mine = classOf(s.hole[HERO][0], s.hole[HERO][1]);
    // Before a player has made a choice of their own (blinds and straddles are forced), every
    // hand is still possible and the chart would show all of them as fully in range. Say that
    // instead. Display only: the range itself is unchanged.
    const upTo = rangeStreet === 'now' ? 99 : rangeStreet;
    const acted = s.history.some((e) => e.seat === rangeSeat && e.street <= upTo && !['sb', 'bb', 'straddle'].includes(e.type));
    // Before the flop there is no board to compare hands on, so the measure is equity: how often
    // your two cards win against this range if all five board cards are dealt. Computed once per
    // range (cached), weighted by how likely each hand is.
    let eq = null;
    if (!post && acted) {
      const key = `${rangeSeat}|${rangeStreet === 'now' ? 'now' + s.history.length : rangeStreet}`;
      if (!eqCache.has(key)) eqCache.set(key, equityVsRange(s.hole[HERO], g.cells.map((c) => c.share), 64, 1000 + h.no));
      eq = eqCache.get(key);
    }
    const vsOf = (k) => (post ? g.cells[k].ahead : eq && !Number.isNaN(eq.cls[k]) ? eq.cls[k] : null);
    const canVs = post ? g.beats !== null : !!eq;
    const showVs = rangeMode === 'vs' && canVs;
    let cells = '';
    for (let i = 0; i < 13; i++) {
      for (let j = 0; j < 13; j++) {
        const c = g.cells[GRID[i][j].k];
        const on = c.fill > 0.015;
        const a = vsOf(GRID[i][j].k);
        const vs = showVs && a !== null;
        // Three tiers by how much of the hand is still in range (brand S2); in the ahead-or-behind
        // view one continuous scale, red (it beats you) to lime (you beat it), brighter = more likely.
        const tier = c.fill >= 0.45 ? 'in' : c.fill >= 0.12 ? 'some' : on ? 'trace' : 'off';
        const likely = c.fill >= 0.99 ? 'as likely as any hand in their range' : `about ${Math.max(1, Math.round(c.fill * 100))}% as likely as their likeliest hand`;
        const vsTip = a === null ? '' : post ? `; you beat ${Math.round(a * 100)}% of these` : `; you win about ${Math.round(a * 100)}% against these`;
        const tip = on ? `${GRID[i][j].name}: ${likely}${post && c.kind >= 0 ? ', mostly ' + KINDS[c.kind][0].toLowerCase() : ''}${vsTip}` : `${GRID[i][j].name}: not in range`;
        const me = (GRID[i][j].k === mine ? ' me' : '') + (h.replay && h.showAll && s.hole[rangeSeat] && GRID[i][j].k === classOf(s.hole[rangeSeat][0], s.hole[rangeSeat][1]) ? ' real' : '');
        if (!acted) {
          cells += `<div class="rc off${me}" title="${GRID[i][j].name}: possible, like every hand, until they act">${GRID[i][j].name}</div>`;
          continue;
        }
        cells += vs && on
          ? `<div class="rc vs${me}" style="background:rgba(${vsRgb(a)},${(0.25 + 0.75 * c.fill).toFixed(2)})" title="${tip}">${GRID[i][j].name}</div>`
          : `<div class="rc ${tier}${me}" title="${tip}">${GRID[i][j].name}</div>`;
      }
    }
    const tierLegend = '<div class="legend"><span><i class="lg-in"></i>In their range</span><span><i class="lg-some"></i>Sometimes</span><span><i class="lg-off"></i>Out</span><span><i class="lg-me"></i>Your hand</span></div>';
    const read = sess.readOf(rangeSeat).ranked[0];
    const sure = read.p >= 0.75 ? 'is almost certainly' : read.p >= 0.6 ? 'is probably' : read.p >= 0.45 ? 'might be' : null;
    const basis = sure ? `Based on a read that ${esc(sess.seats[rangeSeat].nick)} ${sure} a ${esc(read.name.toLowerCase())}.` : `No firm read on ${esc(sess.seats[rangeSeat].nick)} yet, so this blends what every type of player would hold: expect it to be wide.`;
    const mix = g.mix ? `<div class="mixbar">${g.mix.map((m, b) => (m > 0.005 ? `<i style="width:${(m * 100).toFixed(1)}%;background:rgb(${KINDS[b][1]})" title="${KINDS[b][0]} ${Math.round(m * 100)}%"></i>` : '')).join('')}</div>
      <div class="legend">${g.mix.map((m, b) => `<span><i style="background:rgb(${KINDS[b][1]})"></i>${KINDS[b][0]} <b>${Math.round(m * 100)}%</b></span>`).join('')}</div>${tierLegend}` : tierLegend;
    // Headline: where you stand against this range, and how that has moved street by street.
    let beats = '';
    const weighting = '<span class="st-weight">Hands they would only sometimes play count for less.</span>';
    const nick = esc(sess.seats[rangeSeat].nick);
    if (g.beats !== null) {
      const b = g.beats;
      const word = b >= 0.8 ? 'You are ahead of almost all of it' : b >= 0.6 ? 'You are ahead of most of it' : b > 0.4 ? 'It is close to a coin flip' : b > 0.2 ? 'You are behind most of it' : 'You are behind almost all of it';
      const trend = [1, 2, 3]
        .filter((st) => h.rangeSnaps[st] && h.rangeSnaps[st][rangeSeat] && h.rangeSnaps[st][rangeSeat].beats !== null)
        .map((st) => `${STREET_TABS[st]} ${Math.round(h.rangeSnaps[st][rangeSeat].beats * 100)}%`);
      if (!h.over && rangeStreet === 'now') trend.push(`Now ${Math.round(b * 100)}%`);
      beats = `<div class="standing ${b >= 0.6 ? 'up' : b > 0.4 ? 'even' : 'down'}">
        <div class="st-num">${Math.round(b * 100)}%</div>
        <div><b>${word}.</b><br>Your hand beats ${Math.round(b * 100)}% of the hands ${nick} can have${trend.length > 1 ? `. Street by street: ${trend.join(' → ')}` : ''}.${weighting}</div>
      </div>`;
    } else if (eq && !Number.isNaN(eq.equity)) {
      const e = eq.equity;
      const word = e >= 0.65 ? 'You are a big favourite' : e >= 0.55 ? 'You are ahead' : e > 0.45 ? 'It is close to a coin flip' : e > 0.35 ? 'You are behind' : 'You are well behind';
      beats = `<div class="standing ${e >= 0.55 ? 'up' : e > 0.45 ? 'even' : 'down'}">
        <div class="st-num">${Math.round(e * 100)}%</div>
        <div><b>${word}.</b><br>Against this range your hand wins about ${Math.round(e * 100)}% (equity: how often it wins if all five board cards are dealt).${weighting}</div>
      </div>`;
    }
    const modes = canVs ? `<div class="chips modes"><span class="label">Colour</span><button class="chip ${showVs ? 'on' : ''}" data-mode="vs">Ahead or behind you</button><button class="chip ${showVs ? '' : 'on'}" data-mode="kind">What they have</button></div>` : '';
    const grad = `background:linear-gradient(90deg, rgb(${vsRgb(0)}), rgb(${vsRgb(0.5)}), rgb(${vsRgb(1)}))`;
    const vsLegend = `<div class="legend vs-legend"><span>${post ? 'It beats you' : 'You win less'}</span><i class="lg-grad" style="${grad}"></i><span>${post ? 'You beat it' : 'You win more'}</span><span>Brighter = more likely</span><span><i class="lg-me"></i>Your hand</span></div>`;
    const label = rangeStreet === 'now' ? (h.over ? 'at the end of the hand' : h.replay ? 'at this point in the hand' : 'right now') : `after the ${STREET_TABS[rangeStreet].toLowerCase()} betting`;
    // "Show all cards" in the replayer: the hand they really held, outlined, never a re-grade
    const real = h.replay && h.showAll && s.hole[rangeSeat] ? classOf(s.hole[rangeSeat][0], s.hole[rangeSeat][1]) : -1;
    const realBox = real >= 0 ? (() => {
      const c = g.cells[real];
      const where = c.fill >= 0.45 ? 'one of the hands the coach had as likely' : c.fill >= 0.12 ? 'a hand the coach gave them only some of the time' : c.fill > 0.015 ? 'a long shot in the range the coach drew' : 'outside the range the coach drew';
      return `<div class="what-had"><b>What ${esc(sess.seats[rangeSeat].nick)} had: ${cardsInline(holeOrder(s.hole[rangeSeat]))}</b><p>That was ${where}. One hand proves little. Judge the decision by the range, not the card.</p></div>`;
    })() : '';
    el.innerHTML = `
      ${h.replay && PHONE.matches ? `<label class="trow rp-all-phone"><span>Show all cards</span><input type="checkbox" class="toggle" data-showall ${h.showAll ? 'checked' : ''}></label>` : ''}
      <div class="chips">${who}</div>
      ${acted ? beats : ''}
      <div class="chips">${steps}</div>
      <p class="range-title">What ${esc(sess.seats[rangeSeat].nick)} can hold ${label}</p>
      ${acted ? modes : `<div class="unacted-note"><b>${esc(sess.seats[rangeSeat].nick)} hasn't acted yet${s.history.some((e) => e.seat === rangeSeat) ? ' (only the forced blind so far)' : ''}.</b> Any two cards are still possible, so there is no range to show. It fills in as soon as they ${s.history.some((e) => e.seat === rangeSeat) ? 'make a choice' : 'act'}.</div>`}
      <div class="rgrid${acted ? '' : ' unacted'}">${cells}</div>
      ${acted ? (showVs ? vsLegend : mix) : ''}
      ${realBox}
      ${h.replay ? '<p class="hint" style="text-align:left">Drawn from the read the coach had at the time, not from what they turned out to hold.</p>' : ''}
      <p class="hint" style="text-align:left">${basis} Suited hands are above the diagonal, offsuit below, pairs on it. This is the coach's estimate from how they have played, not their actual cards.</p>`;
  }
  const again = () => (RP && document.body.classList.contains('replaying') ? renderReplay() : renderRanges());
  el.querySelectorAll('[data-showall]').forEach((b) => (b.onchange = () => { if (RP) { RP.showAll = b.checked; renderReplay(); } }));
  el.querySelectorAll('[data-seat]').forEach((b) => (b.onclick = () => { rangeSeat = +b.dataset.seat; again(); }));
  el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { rangeMode = b.dataset.mode; again(); }));
  el.querySelectorAll('[data-street]').forEach((b) => (b.onclick = () => { rangeStreet = b.dataset.street === 'now' ? 'now' : +b.dataset.street; renderRanges(); }));
}

let logFrames = null; // { rec, frames } for links from the last hand into the replayer
function renderLog() {
  const el = $('log');
  if (!sess) return; // no table in this tab (open in another one)
  const h = sess.hand;
  if (!h) return;
  const s = h.state;
  const over = h.over;
  const rec = over && !drill && lastRecord && lastRecord.session === sess.id && lastRecord.no === h.no ? lastRecord : null;
  if (rec && (!logFrames || logFrames.rec !== rec)) logFrames = { rec, frames: framesOf(rec) };
  const links = rec
    ? (idx) => {
        const j = logFrames.frames.findIndex((f) => f.state.history.length > idx);
        return j >= 0 ? j : null;
      }
    : null;
  const shows = over ? h.log.filter((l) => l.kind === 'show' || l.kind === 'win').map((l) => l.text) : [];
  const card = handCardHtml({
    s, seats: sess.seats, decisions: h.decisions, bb: s.bbAmt, no: h.no, position: positionName(s, HERO), over, net: over && h.summary ? h.summary.net : 0,
    shows, showdown: over && s.result && s.result.showdown, live: !over, pending: thinking ? pendingAction : null, links, why: true,
    actions: rec ? `<div class="hl-acts"><button type="button" data-hl="summary">Summary</button><button type="button" class="primary" data-hl="replay">Replay hand ${h.no}</button></div>` : '',
  });
  el.innerHTML = `<p class="label hl-label">${over ? 'Last hand' : 'This hand'}</p>${card}${drill ? '' : earlierHtml()}`;
  el.querySelectorAll('[data-frame]').forEach((b) => (b.onclick = () => openReplay(rec, { from: 'table', frame: +b.dataset.frame, list: tonightHands() })));
  el.querySelectorAll('[data-why]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    showTab('coach');
    // the Coach tab lists this hand's verdicts newest first
    const cards = $('feedback').querySelectorAll(':scope > .fb');
    const card = cards[cards.length - 1 - +b.dataset.why];
    if (card) {
      card.scrollIntoView({ block: 'start' });
      card.classList.remove('flash');
      void card.offsetWidth;
      card.classList.add('flash');
    }
  }));
  el.querySelectorAll('[data-hl]').forEach((b) => (b.onclick = () => (b.dataset.hl === 'summary' ? openReview() : openReplay(rec, { from: 'table', list: tonightHands() }))));
  el.querySelectorAll('[data-key]').forEach((b) => (b.onclick = () => openReplay((tonight || []).find((r) => r.key === +b.dataset.key), { from: 'table', list: tonightHands() })));
  el.querySelectorAll('[data-lf]').forEach((b) => (b.onclick = () => { logFilter = b.dataset.lf; renderLog(); }));
  el.querySelectorAll('[data-allhands]').forEach((b) => (b.onclick = () => openHistory()));
}
const tonightHands = () => (tonight || []).filter((r) => r.kind === 'hand');

function render() {
  if (RP && document.body.classList.contains('replaying')) return renderReplay();
  takeNews();
  renderTable();
  renderActions();
  renderStats(); // after the seats and the dock: the placard measures itself against the seats
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
// Best play (header design, Addendum B): a ringed check and "best play" in caps, only when
// bestPlayEdge (trainer/best.js, STRAT's rule) says the play was clearly the best. Display only.
const isBest = (d) => !!d && !!bestPlayEdge(d.verdict, d);
const markHtml = (d, cls = 'vmark') => {
  const g = d.verdict.grade;
  return `<span class="${cls} ${g}${isBest(d) ? ' best' : ''}" aria-hidden="true">${MARK[g]}</span>`;
};
const gradeWord = (d) => (notGraded(d.verdict) ? 'not graded' : isBest(d) ? 'best play' : GRADE_WORD[d.verdict.grade]);
const bestEdgeLine = (d) => {
  const e = bestPlayEdge(d.verdict, d);
  return e ? `<p class="best-edge">Clearly ahead of ${esc(e.label.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase())}, the best alternative, by about <b>$${Math.max(1, Math.round(e.gap))}</b>.</p>` : '';
};
const STREET_LABEL = ['Preflop', 'Flop', 'Turn', 'River'];

function actionNoun(o) {
  if (!o) return 'play';
  if (o.type === 'raise') return /^bet/i.test(o.label) ? 'bet' : /^all-in/i.test(o.label) ? 'all-in' : 'raise';
  return o.type;
}

function openReview(stored = false) {
  const h = sess.hand;
  if (!h || !h.over || (drill && !stored)) return;
  // the record this review is of (a kept hand, or the hand just played at the table)
  const rec = stored ? RP.rec : lastRecord && lastRecord.no === (h.label || h.no) && lastRecord.session === sess.id ? lastRecord : null;
  const s = h.state;
  const ds = h.decisions;
  const flagged = ds.filter((d) => d.verdict.grade !== 'good');
  const cost = flagged.reduce((a, d) => a + d.cost, 0);
  const net = h.summary.net;
  const result = net > 0 ? `You won ${money(net)}.` : net < 0 ? `You lost ${money(-net)}.` : 'You broke even.';
  const costLine = !flagged.length
    ? ds.length ? `<span class="ok">${(() => {
        const nb = ds.filter(isBest).length;
        if (!nb) return 'Every decision was fine.';
        return ds.length === 1 ? 'Your decision was the best play.' : `Every decision fine, ${nb} of them the best play.`;
      })()}</span>` : ''
    : flagged.length === 1
      ? `<span class="neg">One ${actionNoun(flagged[0].verdict.options[flagged[0].verdict.mine])} cost you about ${money(flagged[0].cost)}.</span>`
      : `<span class="neg">${flagged.length} plays cost you about ${money(cost)}.</span>`;
  const shown = [];
  if (s.result && s.result.showdown) for (let i = 1; i < s.n; i++) if (!s.folded[i]) shown.push(i);
  const wins = h.log.filter((e) => e.kind === 'win').map((e) => e.text);
  const runout = `<div class="rv-runout">
    <div><span class="label">Your hand</span>${cardsInline(holeOrder(s.hole[HERO]))}</div>
    ${s.board.length ? `<div><span class="label">Board</span>${cardsInline(s.board)}</div>` : ''}
    ${shown.map((i) => `<div><span class="label">${esc(sess.seats[i].nick)} showed</span>${cardsInline(holeOrder(s.hole[i]))}</div>`).join('')}
    ${wins.length ? `<p class="rv-vs">${esc(wins.join('. '))}.</p>` : ''}
  </div>`;
  const firstFlag = ds.find((d) => d.verdict.grade !== 'good');
  const rows = ds.map((d) => {
    const v = d.verdict;
    const mine = v.options[v.mine];
    const head = `<span class="label">${STREET_LABEL[d.street] || d.streetName}</span>${markHtml(d)}<span class="what">${esc(mine ? mine.label : '')}</span><span class="grade ${v.grade}${isBest(d) ? ' best' : ''}">${gradeWord(d)}</span>`;
    const link = rec ? `<button type="button" class="link-btn rv-replay" data-replay-dec="${ds.indexOf(d)}">▶ replay</button>` : '';
    if (v.grade === 'good') return `<div class="rv-step${isBest(d) ? ' best' : ''}">${head}${link}</div>${tipLine(d, 'tip-line rv-tip')}${noteLine(d, 'tip-line rv-tip rv-note')}${anchorHtml(d)}`;
    const evs = v.options.map((o) => o.ev);
    const lo = Math.min(...evs, 0);
    const hi = Math.max(...evs, 0);
    const width = (ev) => Math.max(4, Math.round(((ev - lo) / Math.max(1e-9, hi - lo)) * 100));
    const bars = v.options.map((o, i) => `<div class="bar ${i === v.best ? 'best' : ''} ${i === v.mine ? 'yours' : ''}"><span>${esc(o.label)}${refTag(v, i)}</span><span class="track"><i style="--w:${width(o.ev)}%"></i></span><span class="mono">${Math.round(o.ev) >= 0 ? '+' : '−'}$${Math.abs(Math.round(o.ev))}</span></div>`).join('');
    const eq = d.villain && d.villain.picture && d.villain.picture.equity !== null && d.villain.picture.equity !== undefined ? d.villain.picture.equity : null;
    const duo = eq !== null && d.toCall > 0 ? `<div class="duo"><div class="stat"><span class="label">You beat</span><b>${Math.round(eq * 100)}%</b></div><div class="stat"><span class="label">You needed</span><b>${Math.round(d.odds * 100)}%</b></div></div>` : '';
    return `<details class="rv-flag ${v.grade}" ${d === firstFlag ? 'open' : ''}><summary class="rv-step">${head}${link}</summary>
      <div class="rv-body">
        <h2>${esc(d.headline)}</h2>
        ${anchorHtml(d)}
        ${d.reasons.map((r) => `<p class="why">${esc(readThen(d, r))}</p>`).join('')}
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
    const guess = readGuess(top);
    const lvl = readLevel(top);
    card = `<article class="pc" style="--h:${p.hue ?? 160}"><div class="pc-head"><div class="big-avatar" style="--h:${p.hue ?? 160}">${avatarArt(p)}</div><div><div class="pc-name">${esc(p.nick)}</div><div class="pc-sub"><span class="label">${r.notes.hands} hands watched</span></div></div></div>
      <p class="pc-look">${esc(p.look)}.</p>
      <div class="pc-read"><span class="label">Coach's read</span><div class="pc-guess">${esc(guess)}<span class="conf">${[1, 2, 3].map((k) => `<i class="${k <= lvl ? 'on' : ''}"></i>`).join('')}</span></div>
      <p>${r.notes.hands ? `Puts money in ${Math.round((100 * r.notes.vpip) / r.notes.hands)}% of hands, raises ${Math.round((100 * r.notes.pfr) / r.notes.hands)}% before the flop.` : ''}</p></div></article>`;
  }
  const el = $('review');
  el.innerHTML = `<div class="rv-wrap">
    <div class="rv-head">${rec ? '<div class="seg rh-switch" role="radiogroup" aria-label="View"><button type="button" role="radio" aria-checked="true" class="on">Summary</button><button type="button" role="radio" aria-checked="false" id="rv-to-replay">Replay</button></div>' : ''}<p class="label signal">Hand ${h.label || h.no || sess.handNo} · the coach's review</p><h1>${result} ${costLine}</h1></div>
    ${runout}
    <div class="rv-cols"><div class="rv-steps">${rows || '<p class="sub">You made no decisions this hand.</p>'}</div>
      <aside>${card}<div class="rv-tiles"><div class="stat"><span class="label">This hand</span><b class="${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${signed(net)}</b></div><div class="stat"><span class="label">Mistakes cost</span><b>${money(cost)}</b></div></div></aside></div>
  </div>
  <div class="rv-bar"><div>${stored
    ? `<p>Hand ${h.label} from your history.</p><button type="button" id="rv-replay"><span class="d-only">Replay this hand</span><span class="m-only">Replay</span></button><button type="button" class="primary" id="rv-back">${RP.from === 'history' ? 'Back to history' : 'Back to the table'}</button>`
    : `<p>The table stops on a flagged play so you can read why.</p>${rec ? '<button type="button" id="rv-replay"><span class="d-only">Replay this hand</span><span class="m-only">Replay</span></button>' : ''}<button type="button" id="rv-leaks">Leak review</button><button type="button" class="primary" id="rv-next">${drill ? 'Next spot' : 'Next hand'}<kbd>Space</kbd></button>`}</div></div>`;
  el.classList.remove('hidden');
  el.scrollTop = 0;
  document.body.classList.add('reviewing');
  const from = stored ? RP.from : 'review';
  if (stored) {
    $('rv-back').onclick = () => closeReview();
  } else {
    $('rv-next').onclick = () => nextHand();
    $('rv-leaks').onclick = () => reviewModal();
  }
  if (rec) {
    const replayAt = (dec) => openReplay(rec, { from, decision: dec, list: stored ? RP.list : null });
    if ($('rv-replay')) $('rv-replay').onclick = () => replayAt(undefined);
    if ($('rv-to-replay')) $('rv-to-replay').onclick = () => replayAt(undefined);
    el.querySelectorAll('[data-replay-dec]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); replayAt(+b.dataset.replayDec); }));
  }
  el.querySelectorAll('[data-range]').forEach((b) => (b.onclick = () => {
    if (stored) {
      const dec = ds.findIndex((d) => d.villain && d.villain.seat === +b.dataset.range);
      openReplay(rec, { from, decision: dec, list: RP.list });
      rangeSeat = +b.dataset.range;
      return showTab('range');
    }
    closeReview();
    rangeSeat = +b.dataset.range;
    openSide('range');
  }));
  el.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => { closeReview(); startDrill(b.dataset.drill); }));
  el.querySelectorAll('[data-dispute]').forEach((b) => (b.onclick = () => { const d = (stored ? rec.decisions : liveSessOr().decisions).find((x) => x.id === +b.dataset.dispute); if (d) disputeModal(d); }));
}
const liveSessOr = () => liveSess || sess;
function hideReview() {
  $('review').classList.add('hidden');
  document.body.classList.remove('reviewing');
}
function closeReview() {
  hideReview();
  if (RP && RP.summary) {
    const from = RP.from;
    RP = null;
    liveSess = null;
    document.body.classList.remove('replaying');
    if (from === 'history') return openHistory();
    render();
    if (sess.status() === 'bot') advance();
    else if (sess.status() === 'over') scheduleAuto();
  }
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

let thinking = false; // a decision is being graded in the worker
let gradeTurn = 0; // bumped whenever the table changes under a pending grade (W1)
function dropPendingGrade() {
  gradeTurn++;
  pendingAction = null;
  if (!thinking) return;
  thinking = false;
  $('actions')?.classList.remove('busy');
}
async function act(action) {
  if (RP || sess.status() !== 'hero' || thinking) return;
  endHint();
  let d;
  if (judge.ready) {
    const here = sess;
    const hand = sess.hand;
    const step = hand.state.history.length;
    const turn = ++gradeTurn;
    thinking = true;
    pendingAction = action;
    renderToast();
    renderActions();
    if (currentTab === 'log') renderLog();
    let verdict = null;
    try {
      verdict = await judge.grade(sess.gradeJob(action));
    } catch {
      verdict = null; // graded here instead, below
    }
    // A new session, hand or drill started meanwhile: this decision no longer applies.
    if (turn !== gradeTurn) return;
    thinking = false;
    pendingAction = null;
    if (sess !== here || sess.hand !== hand || hand.state.history.length !== step) return render();
    d = verdict ? sess.heroCommit(action, verdict) : sess.heroAct(action);
  } else d = sess.heroAct(action);
  noteLeak(d);
  noteHabit(d);
  raiseTo = 0;
  if (drill) {
    drill.tried++;
    if (d.verdict.grade === 'good') drill.clean++;
    else drill.cost += d.cost;
    sess.finishAuto(); // the rest of the hand plays itself; on to the next spot
    render();
    scheduleAuto();
    return;
  }
  // QA X2: the table stays paused while you look back; closing the history or the replayer
  // carries on from here.
  if (RP || document.body.classList.contains('in-history')) return;
  advance();
}

function nextHand() {
  dropPendingGrade();
  if (RP || document.body.classList.contains('in-history')) return;
  if (sess.status() !== 'over') return;
  closeReview();
  if (drill) return nextSpot();
  const tapHint = tapHintPending;
  tapHintPending = false; // shown once, as the second hand starts
  pastLog = [...pastLog, ...sess.hand.log].slice(-120);
  sess.startPlayable();
  if (tapHint) stripEvent = { hand: sess.hand.no, text: `${TOUCH.matches || PHONE.matches ? 'Tap' : 'Click'} any player to see what you've noticed about them.` };
  raiseTo = 0;
  advance();
}

// Fast-forwards the table: plays hands in an instant (yours are played for you and do not
// count toward your results) so you sit down with something observed about everyone.
function quickSim(hands = 40) {
  dropPendingGrade();
  if (!sess || drill) return;
  clearTimeout(timer);
  sess.quickSim(hands);
  pastLog = [];
  shownBoard = 0;
  raiseTo = 0;
  advance();
}

function startDrill(cat) {
  dropPendingGrade();
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
  dropPendingGrade();
  drill = null;
  sess = mainSess;
  mainSess = null;
  pastLog = [];
  shownBoard = 0;
  advance();
}

// Every hand you play is kept for the hand history, and the session is saved as each hand ends,
// so a reload carries on from the next hand.
let kept = true; // did the last save work? (if not, leaving asks first)
let saving = null;
// Only one tab plays the table and writes the save and the hand store (R1). Another tab says so
// and offers to take over; the tab it was taken from stops writing and says so too.
let owner = !('locks' in navigator); // without Web Locks, every tab is its own owner, as before
function holdTable(steal = false) {
  return new Promise((resolve) => {
    navigator.locks
      .request('gto-table', steal ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (!lock) return resolve(false);
        owner = true;
        resolve(true);
        return new Promise(() => {}); // held for as long as this page is open
      })
      .catch(() => {
        // another tab took the table
        owner = false;
        elsewhere('taken');
      });
  });
}
let blockKeys = null;
function elsewhere(why) {
  clearTimeout(timer);
  dropPendingGrade();
  let el = $('elsewhere');
  if (!el) {
    el = document.createElement('div');
    el.id = 'elsewhere';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.append(el);
  }
  el.innerHTML = `<div class="ew-box"><h1>${why === 'taken' ? 'This table is now open in another tab' : 'This table is open in another tab'}</h1>
    <p class="sub">${why === 'taken' ? 'Nothing more is saved from this tab.' : 'Play it there, or carry on here: the other tab stops saving.'}</p>
    <button type="button" class="primary" id="ew-here">Use it here</button></div>`;
  el.classList.remove('hidden');
  // Modal for real (QA X3): everything behind it is inert, so no click, focus or key reaches the
  // table, the replayer or the history, and focus moves to the one thing you can do here.
  for (const c of document.body.children) if (c !== el) c.inert = true;
  if (!blockKeys) {
    blockKeys = (e) => {
      if (!$('elsewhere') || $('elsewhere').classList.contains('hidden')) return;
      if ($('elsewhere').contains(e.target) && (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab')) {
        if (e.key === 'Tab') {
          e.preventDefault();
          $('ew-here').focus();
        }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockKeys, true);
  }
  $('ew-here').focus();
  $('ew-here').onclick = async () => {
    await holdTable(true);
    location.reload();
  };
}

function keepPlaying(s) {
  s.onHandEnd = (rec) => {
    if (!owner) return;
    if (rec.kind === 'hand') lastRecord = rec;
    keepHand(rec).then((key) => {
      if (key && rec === lastRecord) lastRecord = { ...rec, key };
      refreshTonight();
    });
    if (saving) return;
    saving = setTimeout(async () => {
      saving = null;
      if (owner) kept = await saveSession(s.toSaved());
    }, 0);
  };
}

function newSession() {
  dropPendingGrade();
  clearTimeout(timer);
  drill = null;
  mainSess = null;
  sess = new Session(sessionOpts());
  keepPlaying(sess);
  if (owner) clearSession();
  pastLog = [];
  tonight = [];
  logEvents = [];
  newSeats.clear();
  stripEvent = null;
  sess.startPlayable();
  advance();
}

// After a reload: the saved session if there is one, from the next hand; otherwise a new one.
async function resumeOrNew() {
  dropPendingGrade();
  if (!owner && !(await holdTable())) return elsewhere('open');
  const saved = await loadSession();
  if (!saved) return newSession();
  try {
    sess = Session.fromSaved(saved);
  } catch {
    return newSession();
  }
  const o = sessionOpts();
  sess.heroRanges = o.heroRanges;
  sess.heroRangesRaised = o.heroRangesRaised;
  keepPlaying(sess);
  pastLog = [];
  sess.startPlayable();
  sess.news.unshift(`Welcome back: your session carries on at hand ${sess.handNo}.`);
  refreshTonight();
  advance();
}

let focusByKey = false; // was focus last moved with Tab (true) or with the pointer (false)?
document.addEventListener('pointerdown', () => (focusByKey = false), true);
document.addEventListener('keydown', (e) => {
  if (!$('modal').classList.contains('hidden')) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (e.key === 'Escape' && !$('review').classList.contains('hidden')) {
    closeReview();
    return;
  }
  if (e.key === 'Escape' && SIDE_OVER.matches && !document.body.classList.contains('side-closed') && !RP) {
    document.body.classList.add('side-closed');
    return;
  }
  if (document.body.classList.contains('in-history')) {
    if (e.key === 'Escape') closeHistory();
    return;
  }
  if (RP && document.body.classList.contains('replaying')) return replayKey(e);
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  // A focused button, link or seat (other than the action buttons) keeps its own keys: Enter and
  // Space always, and the letter shortcuts too when it was reached with Tab. A button that merely
  // kept focus after a mouse click does not block the letters.
  if (e.key === 'Tab') focusByKey = true;
  const control = e.target.closest?.('button, a[href], [role="button"], [role="separator"], summary, [tabindex]:not([tabindex="-1"])');
  if (control && !control.closest('#actions') && (e.key === 'Enter' || e.key === ' ' || focusByKey)) return;
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

// The dialog: named by its heading, focus moves into it, Tab stays inside it, and closing it
// gives focus back to whatever opened it.
let modalOpener = null;
function openModal(html) {
  const box = $('modal-box');
  const fresh = $('modal').classList.contains('hidden');
  if (fresh) modalOpener = document.activeElement;
  box.innerHTML = html;
  box.classList.remove('game-modal', 'on-ranges');
  const h = box.querySelector('h1, h2');
  if (h) {
    h.id = 'modal-title';
    box.setAttribute('aria-labelledby', 'modal-title');
  } else box.removeAttribute('aria-labelledby');
  $('modal').classList.remove('hidden');
  if (fresh || !box.contains(document.activeElement)) box.focus({ preventScroll: true });
}
$('modal-box').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const items = [...$('modal-box').querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === $('modal-box'))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
function closeModal() {
  $('modal').classList.add('hidden');
  if (modalOpener && modalOpener.isConnected && modalOpener !== document.body) modalOpener.focus({ preventScroll: true });
  modalOpener = null;
}
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal') && sess) closeModal();
});

// "Your game": two tabs, Game (stakes and table; changing them starts a new session) and My ranges
// (the hands you play from each seat; applies from the next hand).
// openGameModal({ tab: 'ranges', group }) opens My ranges on that seat group.
function settingsModal(opts = {}) {
  return openGameModal(opts);
}
function openGameModal({ tab = 'game', group = null } = {}) {
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const seg = (id, items, cur) => `<div class="seg" role="radiogroup" data-for="${id}">${items.map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div><input type="hidden" id="${id}" value="${cur}">`;
  const toggle = (id, on, label) => `<label class="trow" for="${id}"><span>${label}</span><input id="${id}" type="checkbox" class="toggle" ${on ? 'checked' : ''}></label>`;
  openModal(`
    <button type="button" class="sheet-x" id="gm-x" aria-label="Close">✕</button>
    <h1>Your game</h1>
    <div class="mtabs" role="tablist" aria-label="Your game">
      <button type="button" role="tab" id="gm-tab-game" aria-controls="gm-game">Game</button>
      <button type="button" role="tab" id="gm-tab-ranges" aria-controls="gm-ranges">My ranges <span class="mt-badge" id="gm-badge"></span></button>
    </div>
    <div id="gm-game" role="tabpanel" aria-labelledby="gm-tab-game">
    <div class="field"><span>Where do you play?</span>${seg('s-mode', [['casino', 'Casino'], ['home', 'Home game']], settings.mode)}</div>
    <div id="casino-fields">
      <div class="field"><span>Stakes</span>${seg('s-game', Object.keys(GAMES).map((g) => [g, '$' + g.replace('/', '/$')]), settings.game)}</div>
    </div>
    <div id="home-fields">
      <div class="form-row"><label for="h-sb">Blinds ($)</label><input id="h-sb" type="number" inputmode="numeric" min="1" step="1" aria-label="Small blind in dollars" value="${settings.home.sb}"><span>/</span><input id="h-bb" type="number" inputmode="numeric" min="1" step="1" aria-label="Big blind in dollars" value="${settings.home.bb}"></div>
      <div class="form-row"><label for="h-buy">Buy-in ($)</label><input id="h-buy" type="number" inputmode="numeric" min="20" step="10" value="${settings.home.buy}"></div>
      <div class="form-row" style="align-items:flex-start"><label>Players<br><small id="h-total"></small></label>
        <div class="home-grid">${HOME_TYPES.map(([t, label]) => `<label for="h-n-${t}">${label}</label><input class="h-count" id="h-n-${t}" data-type="${t}" type="number" inputmode="numeric" min="0" max="8" step="1" value="${settings.home.counts[t] || 0}">`).join('')}</div>
      </div>
      <p class="form-err" id="h-err" role="alert"></p>
      <p class="sub">No rake. Everyone rebuys and nobody leaves. You know who is coming, but not which seat is which.</p>
    </div>
    <details class="more-options"><summary>More options</summary>
      <div id="casino-more">
        <label class="field"><span>Buy-in ($)</span><input id="s-buy" class="input" type="number" inputmode="numeric" min="60" step="20" value="${settings.maxBuy}"></label>
        <p class="form-err" id="s-err" role="alert"></p>
        <label class="field"><span>House cut</span><select id="s-rake" class="input">${Object.entries(RAKES).map(([k, r]) => opt(k, r.label, settings.rake)).join('')}</select></label>
        <label class="field"><span>Who's at the table</span><select id="s-table" class="input">${Object.entries(TABLES).map(([k, t]) => opt(k, t.label, settings.table)).join('')}</select></label>
      </div>
      <label class="field"><span>Feedback</span><select id="s-fb" class="input">${opt('now', 'Right after each decision', settings.feedback)}${opt('after', 'When the hand is over', settings.feedback)}</select></label>
      ${toggle('s-ranges', settings.rangesLive, 'Show ranges during the hand')}
      ${toggle('s-reads', settings.reads, "Show the coach's reads on seats")}
      <label class="field"><span>Opponent speed</span><select id="s-speed" class="input">${opt('800', 'Slow', String(settings.speed))}${opt('450', 'Normal', String(settings.speed))}${opt('150', 'Fast', String(settings.speed))}</select></label>
    </details>
    <div class="modal-actions settings-foot">
      <small>Changing these starts a new session.</small>
      <button id="s-close" class="quiet">Close</button>
      <button class="primary" id="s-start">Start new session</button>
    </div>
    </div>
    <div id="gm-ranges" role="tabpanel" aria-labelledby="gm-tab-ranges" class="hidden"></div>`);
  $('modal-box').classList.add('game-modal');
  const ranges = rangesPane(group);
  const showTab2 = (which) => {
    for (const [k, pane] of [['game', 'gm-game'], ['ranges', 'gm-ranges']]) {
      const on = k === which;
      $('gm-tab-' + k).classList.toggle('on', on);
      $('gm-tab-' + k).setAttribute('aria-selected', on);
      $(pane).classList.toggle('hidden', !on);
    }
    $('modal-box').classList.toggle('on-ranges', which === 'ranges');
  };
  $('gm-tab-game').onclick = () => showTab2('game');
  $('gm-tab-ranges').onclick = () => showTab2('ranges');
  $('gm-x').onclick = () => closeModal(); // discards an unsaved range draft, as Cancel does
  showTab2(tab);
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
    settings.speed = +$('s-speed').value;
  };
  const homeTotal = () => [...document.querySelectorAll('.h-count')].reduce((a, el) => a + Math.max(0, Math.floor(+el.value || 0)), 0);
  // What is wrong with the numbers typed in, as [field, message] pairs; nothing is corrected silently.
  const whole = (el) => el.value.trim() !== '' && Number.isInteger(+el.value);
  const problems = () => {
    const out = [];
    if ($('s-mode').value === 'home') {
      const sb = +$('h-sb').value;
      const bb = +$('h-bb').value;
      if (!whole($('h-sb')) || sb < 1) out.push(['h-sb', 'The small blind must be a whole number of dollars, at least $1.']);
      if (!whole($('h-bb')) || bb < 1) out.push(['h-bb', 'The big blind must be a whole number of dollars, at least $1.']);
      else if (whole($('h-sb')) && bb < sb) out.push(['h-bb', `The big blind ($${bb}) cannot be smaller than the small blind ($${sb}).`]);
      const minBuy = 20 * (whole($('h-bb')) && bb >= 1 ? bb : 1);
      if (!whole($('h-buy')) || +$('h-buy').value < minBuy) out.push(['h-buy', `The buy-in must be at least $${minBuy} (20 big blinds).`]);
      document.querySelectorAll('.h-count').forEach((el) => {
        if (el.value.trim() !== '' && (!Number.isInteger(+el.value) || +el.value < 0)) out.push([el.id, 'Player counts must be whole numbers, 0 or more.']);
      });
      const n = homeTotal();
      if (n < 1 || n > 8) out.push(['h-n-' + HOME_TYPES[0][0], `Seat 1 to 8 opponents; you have ${n}.`]);
    } else {
      const minBuy = GAMES[$('s-game').value].bb * 20;
      if (!whole($('s-buy')) || +$('s-buy').value < minBuy) out.push(['s-buy', `The buy-in must be at least $${minBuy} (20 big blinds).`]);
    }
    return out;
  };
  const showProblems = (list) => {
    document.querySelectorAll('#modal-box input[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    for (const [id] of list) $(id)?.setAttribute('aria-invalid', 'true');
    const text = list.map(([, m]) => m).filter((m, i, a) => a.indexOf(m) === i).join(' ');
    $('h-err').textContent = $('s-mode').value === 'home' ? text : '';
    $('s-err').textContent = $('s-mode').value === 'home' ? '' : text;
    if (list.length && $('s-mode').value !== 'home') document.querySelector('#modal-box .more-options').open = true;
  };
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
  // Once a problem is showing, it updates as the numbers are fixed.
  document.querySelectorAll('#home-fields input, #s-buy').forEach((el) => el.addEventListener('input', () => {
    if ($('h-err').textContent || $('s-err').textContent) showProblems(problems());
  }));
  syncMode();
  $('s-game').onchange = () => {
    $('s-buy').value = defaultBuy($('s-game').value);
  };
  $('s-start').onclick = () => {
    const bad = problems();
    showProblems(bad);
    if (bad.length) {
      $(bad[0][0])?.focus();
      return;
    }
    if ($('s-mode').value === 'home') {
      const sb = +$('h-sb').value;
      const bb = +$('h-bb').value;
      const counts = {};
      document.querySelectorAll('.h-count').forEach((el) => {
        const k = Math.max(0, Math.floor(+el.value || 0));
        if (k) counts[el.dataset.type] = k;
      });
      settings.home = { sb, bb, buy: +$('h-buy').value, counts };
    }
    settings.mode = $('s-mode').value;
    read();
    settings.game = $('s-game').value;
    // (checked above for a casino session; in a home game an unusable casino buy-in is left as it was)
    if (Number.isInteger(+$('s-buy').value) && +$('s-buy').value >= GAMES[settings.game].bb * 20) settings.maxBuy = +$('s-buy').value;
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
}

// My ranges: your own starting-hand ranges, one per seat group, first in and facing a raise. Tap or
// drag across the chart to add or remove hands. Hands outside your range for the seat are folded for
// you when the toggle is on. A draft until Done; Cancel, the close button or Escape discard it.
function rangesPane(startGroup) {
  const draft = { first: JSON.parse(JSON.stringify(settings.ranges)), raised: JSON.parse(JSON.stringify(settings.rangesRaised)), only: settings.onlyRange };
  let group = startGroup && RANGE_GROUPS.some(([g]) => g === startGroup) ? startGroup : 'early';
  let mode = 'first';
  const stdOf = (m) => (m === 'first' ? presetRanges : presetRaised)('standard');
  const looser = (m, g) => draft[m][g].filter((n) => !stdOf(m)[g].includes(n)).length;
  const badge = () => {
    let n = 0;
    for (const [g] of RANGE_GROUPS) n += looser('first', g) + looser('raised', g);
    $('gm-badge').textContent = n ? `+${n}` : '';
    $('gm-badge').classList.toggle('hidden', !n);
  };
  const pane = $('gm-ranges');
  const draw = () => {
    const cur = draft[mode];
    const std = stdOf(mode)[group];
    const sel = new Set(cur[group]);
    const cells = GRID.map((row) => row.map(({ name }) => `<button type="button" class="rg-cell${sel.has(name) ? ' on' : ''}${sel.has(name) && !std.includes(name) ? ' x' : ''}" data-name="${name}" aria-pressed="${sel.has(name)}">${name}</button>`).join('')).join('');
    pane.innerHTML = `
      <div class="gm-body">
        <label class="row-toggle" for="rg-only"><span class="rt-text"><b>Fold hands outside my ranges</b>${draft.only ? '<span class="rt-sub">Those hands are skipped and the next one is dealt.</span>' : '<span class="rt-off">Your ranges are saved, but nothing is folded for you until this is on.</span>'}</span><input id="rg-only" type="checkbox" class="toggle" ${draft.only ? 'checked' : ''}></label>
        <div class="rg-groups2" role="tablist" aria-label="Seat">${RANGE_GROUPS.map(([g, label, seats]) => {
          const x = looser(mode, g);
          return `<button type="button" role="tab" aria-selected="${g === group}" class="${g === group ? 'on' : ''}" data-group="${g}" title="${seats}">${label}<small>${Math.round(shareOf(cur[g]) * 100)}%${x ? ` <i>+${x}</i>` : ''}</small></button>`;
        }).join('')}</div>
        <div class="rg-modebar"><div class="seg rg-mode" role="radiogroup" aria-label="When"><button type="button" role="radio" data-mode="first" aria-checked="${mode === 'first'}" class="${mode === 'first' ? 'on' : ''}">First in</button><button type="button" role="radio" data-mode="raised" aria-checked="${mode === 'raised'}" class="${mode === 'raised' ? 'on' : ''}">Facing a raise</button></div>
          <p class="hint rg-mode-note">${mode === 'first' ? 'When it is folded or limped to you.' : 'When someone has already raised before it gets to you.'}</p></div>
        <div class="rg-bar"><span class="rg-share" id="rg-share"></span>
          <span class="rg-presets">${['tight', 'standard', 'loose'].map((pr) => `<button type="button" class="chip" data-preset="${pr}">${pr[0].toUpperCase() + pr.slice(1)}</button>`).join('')}</span></div>
        <div class="rg-grid" id="rg-grid">${cells}</div>
        <p class="rg-legend"><span><i class="lg-on"></i>You play it</span><span><i class="lg-off"></i>You fold it</span><span><i class="lg-x"></i>Standard folds it</span></p>
        <p class="hint rg-hint">Suited hands above the diagonal, offsuit below, pairs on it. Tap a hand, or drag across several.</p>
      </div>
      <div class="modal-actions rg-foot">
        <small><b>Applies from the next hand.</b> Your session carries on.</small>
        <button id="rg-reset" class="quiet">Reset all to Standard</button>
        <button id="rg-cancel" class="quiet">Cancel</button>
        <button class="primary" id="rg-done">Done</button>
      </div>`;
    const share = () => {
      const extra = cur[group].filter((n) => !std.includes(n)).length;
      $('rg-share').innerHTML = `<b>${Math.round(shareOf(cur[group]) * 100)}%</b> of hands${extra ? ` · <span class="rg-extra">${extra} hand${extra === 1 ? '' : 's'} looser than Standard</span>` : ''}`;
      const btn = pane.querySelector(`[data-group="${group}"] small`);
      if (btn) btn.innerHTML = `${Math.round(shareOf(cur[group]) * 100)}%${extra ? ` <i>+${extra}</i>` : ''}`;
      badge();
    };
    share();
    const grid = $('rg-grid');
    const setCell = (el, on) => {
      el.classList.toggle('on', on);
      el.classList.toggle('x', on && !std.includes(el.dataset.name));
      el.setAttribute('aria-pressed', on);
      const set = new Set(cur[group]);
      if (on) set.add(el.dataset.name);
      else set.delete(el.dataset.name);
      cur[group] = [...set];
      share();
    };
    // Drag to paint: the first cell decides whether the drag adds or removes hands.
    let paint = null;
    grid.addEventListener('pointerdown', (ev) => {
      const el = ev.target.closest('.rg-cell');
      if (!el) return;
      ev.preventDefault();
      paint = !el.classList.contains('on');
      setCell(el, paint);
    });
    grid.addEventListener('pointermove', (ev) => {
      if (paint === null) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.rg-cell');
      if (el && el.classList.contains('on') !== paint) setCell(el, paint);
    });
    const stop = () => (paint = null);
    window.addEventListener('pointerup', stop, { once: true });
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);
    $('rg-only').onchange = () => {
      draft.only = $('rg-only').checked;
      draw();
    };
    pane.querySelectorAll('[data-group]').forEach((b) => (b.onclick = () => { group = b.dataset.group; draw(); }));
    pane.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; draw(); }));
    pane.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => {
      cur[group] = (mode === 'first' ? presetRanges : presetRaised)(b.dataset.preset)[group];
      draw();
    }));
    $('rg-reset').onclick = () => {
      draft.first = presetRanges('standard');
      draft.raised = presetRaised('standard');
      draw();
    };
    $('rg-cancel').onclick = () => closeModal();
    $('rg-done').onclick = () => {
      // from the next hand; the session carries on (the hand in progress is not affected)
      settings.ranges = draft.first;
      settings.rangesRaised = draft.raised;
      settings.onlyRange = draft.only;
      saveSettings();
      if (sess) {
        sess.heroRanges = settings.onlyRange ? settings.ranges : null;
        sess.heroRangesRaised = settings.onlyRange ? settings.rangesRaised : null;
      }
      closeModal();
    };
  };
  draw();
  return { draw };
}
// (kept for older links)
function rangesModal() {
  openGameModal({ tab: 'ranges' });
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
        .map((sd) => `<div class="sd"><div class="sd-top"><span class="sd-hand">${sd.hand > 0 ? `Hand ${sd.hand}` : 'Before you sat in'}</span>${cardsInline(holeOrder(sd.cards))}<span class="sd-on">on</span>${cardsInline(sd.board)}<span class="sd-res ${sd.won ? 'pos' : 'neg'}">${sd.won ? 'Won' : 'Lost'}</span></div><div class="line">${esc(sd.line)}</div></div>`)
        .join('')
    : '<div class="empty">No showdowns seen yet.</div>';
  const top = r.ranked[0];
  const guess = readGuess(top);
  const lvl = readLevel(top);
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
      <div class="stat"><small>Put money in</small><b>${n.hands ? Math.round((100 * n.vpip) / n.hands) + '%' : '–'}</b>${n.hands ? `<p class="stat-note">${n.vpip} of ${n.hands} hands. ${vpipVerdict(Math.round((100 * n.vpip) / n.hands))}</p>` : ''}</div>
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
    // Sliders that must stay in order: a type cannot raise more hands than it plays.
    const ORDER = [['raised', 'played']]; // [smaller, larger]
    const rowsBy = {};
    $('modal-box').querySelectorAll('.tune').forEach((row) => {
      const c = CONTROLS.find((x) => x.key === row.dataset.key);
      const def = c.get(base);
      const input = row.querySelector('input');
      const set = (v, moved) => {
        draft[t] = draft[t] || {};
        if (Math.abs(v - def) < c.step / 2) delete draft[t][c.key];
        else draft[t][c.key] = v;
        input.value = v;
        row.classList.toggle('changed', draft[t][c.key] !== undefined);
        row.querySelector('.tune-val').textContent = c.fmt(v);
        let note = row.querySelector('.tune-linked');
        if (moved) {
          if (!note) {
            note = document.createElement('div');
            note.className = 'tune-linked';
            note.setAttribute('role', 'status');
            row.append(note);
          }
          note.textContent = moved;
        } else if (note) note.remove();
        refresh();
      };
      rowsBy[c.key] = { c, set, input };
      input.oninput = (e) => {
        const v = +e.target.value;
        set(v);
        for (const [lo, hi] of ORDER) {
          const other = c.key === lo ? rowsBy[hi] : c.key === hi ? rowsBy[lo] : null;
          if (!other) continue;
          const ov = +other.input.value;
          const fix = c.key === lo ? (ov < v ? v : null) : ov > v ? v : null;
          if (fix !== null) other.set(fix, `Moved to ${other.c.fmt(fix)} with ${c.label.toLowerCase()}: a player cannot raise more hands than they play.`);
        }
      };
      row.querySelector('.tune-reset').onclick = () => {
        input.value = def;
        input.oninput({ target: input });
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
      <div class="stat best-tile"><small>Best plays</small><b class="pos">${sess.decisions.filter(isBest).length}</b><small class="of">of ${rev.judged} judged</small></div>
      <div class="stat"><small>Cost of mistakes</small><b>${money(rev.lost)}</b></div>
    </div>
    ${(() => {
      const here = {};
      for (const d of sess.decisions) if (d.tipKind) here[d.tipKind] = (here[d.tipKind] || 0) + 1;
      const rows = Object.keys(HABITS).filter((k) => habits[k] || here[k]);
      // Multiway notes this session, once a kind reaches 3 (MULTIWAY_COACH_SPEC R9): without this a
      // player who never bets top pair into a crowd would see nothing.
      const noted = (note) => sess.decisions.filter((d) => d.verdict.note === note);
      const mwRows = [];
      const times = (n) => `${n} time${n === 1 ? '' : 's'} this session`;
      // every one-pair check note with two or more opponents in counts, whichever rule gave it (STRAT)
      const chk = sess.decisions.filter((d) => d.opponents >= 2 && ['mwCheck', 'thinValue', 'checkOOP'].includes(d.verdict.note));
      if (chk.length >= 3) {
        const gains = chk.map((d) => (d.verdict.mw && d.verdict.mw.gain) || (d.verdict.thin && d.verdict.thin.gain) || 0).filter((g) => g > 0);
        const avg = gains.length ? Math.round(gains.reduce((a, g) => a + g, 0) / gains.length) : 0;
        mwRows.push([`Checked one pair in a multiway pot (a bet rated higher ${gains.length} time${gains.length === 1 ? '' : 's'}${avg ? `, about $${avg} each` : ''})`, times(chk.length)]);
      }
      const drw = noted('mwDraw');
      if (drw.length >= 3) mwRows.push(['Checked or called a draw in a multiway pot where a bet or raise rated higher', times(drw.length)]);
      const hab = noted('mwHabit');
      if (hab.length >= 3) mwRows.push(['Made a play that scores about as high or higher here, but is not a habit to build', times(hab.length)]);
      if (!rows.length && !mwRows.length) return '';
      return `<h3>Habits the coach noted</h3><p class="sub">Not mistakes: plays that are fine here but usually give a little away. The tip under each verdict says why.</p>
        <div class="leak-list">${rows.map((k) => `<div class="leak-row"><div class="lr-main"><span class="lr-name">${esc(HABITS[k])}</span><span class="lr-count">${habits[k] || 0} time${habits[k] === 1 ? '' : 's'} in all${here[k] ? `, ${here[k]} this session` : ''}</span></div></div>`).join('')}${mwRows.map(([name, count]) => `<div class="leak-row"><div class="lr-main"><span class="lr-name">${esc(name)}</span><span class="lr-count">${count}</span></div></div>`).join('')}</div>`;
    })()}
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
// Hover boxes are centred on their seat or pill; near the window's edge, slide them back inside.
function keepInWindow(box) {
  if (!box) return;
  box.style.setProperty('--dx', '0px');
  if (getComputedStyle(box).display === 'none') return;
  const b = box.getBoundingClientRect();
  const pad = 8;
  const dx = b.left < pad ? pad - b.left : b.right > innerWidth - pad ? innerWidth - pad - b.right : 0;
  box.style.setProperty('--dx', `${Math.round(dx)}px`);
}
$('seats').addEventListener('mouseover', (e) => {
  const seat = e.target.closest('.seat');
  if (!seat) return;
  keepInWindow(seat.querySelector('.tip'));
  keepInWindow(seat.querySelector('.vpip-tip'));
});
$('seats').addEventListener('focusin', (e) => {
  const seat = e.target.closest('.seat');
  if (seat) keepInWindow(seat.querySelector('.tip'));
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
// The placard: a click opens Leak review; in a drill its way out sits beside it; before the first
// hand it holds Quick sim.
$('placard-wrap').addEventListener('click', (e) => {
  if (e.target.closest('#drill-exit')) return drill && exitDrill();
  if (e.target.closest('#btn-sim')) return quickSim();
  if (e.target.closest('button#placard') && sess) reviewModal();
});
// The panel toggle shows as pressed while the panel is open.
{
  const sync = () => {
    const open = !document.body.classList.contains('side-closed');
    $('btn-side').setAttribute('aria-pressed', open);
    $('btn-side').classList.toggle('pressed', open);
  };
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();
}
// "More" (desktop): Quick sim and FAQ. Closes on Escape, a click outside, or a choice.
{
  const btn = $('btn-more');
  const menu = $('more-menu');
  const show = (on) => {
    menu.classList.toggle('hidden', !on);
    btn.setAttribute('aria-expanded', on);
    btn.classList.toggle('pressed', on);
  };
  btn.onclick = () => show(menu.classList.contains('hidden'));
  menu.addEventListener('click', () => show(false));
  $('btn-sim-more').onclick = () => quickSim();
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !btn.contains(e.target) && !menu.contains(e.target)) show(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
      show(false);
      btn.focus();
      e.stopImmediatePropagation();
    }
  }, true);
}
$('btn-side').onclick = () => (document.body.classList.contains('side-closed') ? openSide() : document.body.classList.add('side-closed'));
PHONE.addEventListener('change', () => sess && render());
// The header menu: on a phone a sheet behind "Menu" that closes after any choice or a tap
// elsewhere; from 601px always open, so the buttons sit in the header row as before.
const menuEl = $('menu');
const syncMenu = () => (menuEl.open = !NARROW.matches);
syncMenu();
NARROW.addEventListener('change', syncMenu);
menuEl.querySelector('.top-actions').addEventListener('click', () => {
  if (NARROW.matches) menuEl.open = false;
});
document.addEventListener('click', (e) => {
  if (NARROW.matches && menuEl.open && !menuEl.contains(e.target)) menuEl.open = false;
});
$('btn-sim-menu').onclick = () => quickSim();
$('side-close').onclick = () => document.body.classList.add('side-closed');
$('tab-coach').onclick = () => showTab('coach');
$('tab-log').onclick = () => showTab('log');
$('tab-range').onclick = () => showTab('range');
// Up to 1180px wide the panel slides over the table (table.css, max-width: 1180px), so it starts
// closed there, and closes when the window is narrowed into that range; it opens again on request.
const SIDE_OVER = matchMedia('(max-width: 1180px)');
if (SIDE_OVER.matches) document.body.classList.add('side-closed');
// N5: where the panel covers the table, a click on the table (outside the panel) closes it.
document.addEventListener('pointerdown', (e) => {
  if (!SIDE_OVER.matches || document.body.classList.contains('side-closed') || RP) return;
  if ($('side').contains(e.target) || $('btn-side').contains(e.target) || !$('stage').contains(e.target)) return;
  document.body.classList.add('side-closed');
});
SIDE_OVER.addEventListener('change', () => {
  if (SIDE_OVER.matches) document.body.classList.add('side-closed');
});

// ---- desktop: the table takes the height the action dock leaves, so Fold, Call and Raise always fit.
// The dock's height varies (coach strip, welcome tip, a two-line news line), so the space kept for it
// only grows while the table area stays the same size: the table shrinks once, then holds still.
const FIT = matchMedia('(min-width: 901px)');
let fitKey = '';
let fitDock = 0;
function fitTable() {
  const stage = $('stage');
  if (!FIT.matches) {
    stage.style.removeProperty('--fit-h');
    return;
  }
  const key = stage.offsetWidth + 'x' + stage.offsetHeight; // outer size: a scrollbar coming and going does not reset it
  if (key !== fitKey) {
    fitKey = key;
    fitDock = 0;
  }
  const bottom = $('bottom');
  fitDock = Math.max(fitDock, bottom.offsetHeight + parseFloat(getComputedStyle(bottom).marginTop));
  const cs = getComputedStyle(stage);
  const avail = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(getComputedStyle($('table')).marginTop) - fitDock - 2;
  stage.style.setProperty('--fit-h', Math.max(0, Math.floor(avail)) + 'px');
}
{
  const ro = new ResizeObserver(() => {
    fitTable();
    fitPlacard();
  });
  ro.observe($('stage'));
  ro.observe($('bottom'));
  FIT.addEventListener('change', fitTable);
}

// ---- the side panel's width: drag its left edge, arrow keys on the grip, double-click to reset.
// Only where the panel sits beside the table (from 1181px; narrower, it slides over the table).
// The chosen width is saved with the settings; a window too small for it shows it clamped.
const SIDE_BESIDE = matchMedia('(min-width: 1181px)');
const STAGE_MIN = 760; // the narrowest table area that stays playable (checked at 1280 and 1440)
const sideDefault = () => (innerWidth > 1400 ? 380 : 330); // as #side's width in table.css
const sideMax = () => Math.max(sideDefault(), Math.min(Math.round(innerWidth / 2), innerWidth - STAGE_MIN));
const clampSide = (w) => Math.round(Math.max(sideDefault(), Math.min(sideMax(), w)));
function applySide() {
  const w = settings.sideW ? clampSide(settings.sideW) : sideDefault();
  const sized = SIDE_BESIDE.matches && w > sideDefault();
  $('side').classList.toggle('sized', sized);
  $('side').style.setProperty('--side-w', w + 'px');
  const grip = $('side-grip');
  grip.setAttribute('aria-valuemin', sideDefault());
  grip.setAttribute('aria-valuemax', sideMax());
  grip.setAttribute('aria-valuenow', sized ? w : sideDefault());
}
function setSide(w) {
  settings.sideW = w == null ? null : clampSide(w);
  if (settings.sideW === sideDefault()) settings.sideW = null;
  applySide();
}
{
  const grip = $('side-grip');
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = $('side').getBoundingClientRect().width;
    document.body.classList.add('side-dragging');
    const move = (ev) => setSide(w0 + x0 - ev.clientX);
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      document.body.classList.remove('side-dragging');
      saveSettings();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => {
    setSide(null);
    saveSettings();
  });
  grip.addEventListener('keydown', (e) => {
    const now = settings.sideW ? clampSide(settings.sideW) : sideDefault();
    const step = e.shiftKey ? 80 : 20;
    let w;
    if (e.key === 'ArrowLeft') w = now + step; // the grip is on the panel's left edge
    else if (e.key === 'ArrowRight') w = now - step;
    else if (e.key === 'Home') w = sideDefault();
    else if (e.key === 'End') w = sideMax();
    else return;
    e.preventDefault();
    e.stopPropagation();
    setSide(w);
    saveSettings();
  });
  addEventListener('resize', applySide);
  applySide();
}
$('btn-players').onclick = () => playersModal();
$('btn-review').onclick = () => sess && reviewModal();
$('btn-history').onclick = () => openHistory();
$('btn-settings').onclick = () => settingsModal();
// "Edit my ranges ›" (Hand log) and "Edit ranges for CO ›" (the outside-Standard tip): My ranges on that seat
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit-ranges]');
  if (!b || !sess) return;
  e.preventDefault();
  e.stopPropagation();
  openGameModal({ tab: 'ranges', group: b.dataset.editRanges });
});


// =====================================================================================
// Hand history and replayer. The replayer is a mode of this
// page: the live session pauses, and the table, the Ranges tab and the review draw a recorded
// hand instead. They do it through a stand-in for the session (`replaySession`) that answers
// the same questions from the record and the current step. Verdicts are the stored ones, never
// recomputed.
// =====================================================================================
const NUM_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
const SD_LABEL = ['Preflop', 'Flop', 'Turn', 'River', 'Showdown'];
let RP = null; // { rec, frames, i, from, showAll, list }
let lastRecord = null; // the hand just finished at the table, for "Replay this hand"
let liveSess = null; // the live session while the replayer stands in for it

// card names in running text: "K♠ 7♣ 2♣"
const frameText = () => (cs) => cs.map((c) => RANKS[c >> 2] + SUIT_SYM[c & 3]).join(' ');

function replaySession(rec, i) {
  const f = RP.frames[i];
  const over = f.kind === 'end';
  const seats = rec.seats.map((p) => ({ nick: p.nick, hero: p.hero, hue: p.hue, lookId: p.lookId, look: p.look, steaming: p.steaming, notes: { hands: 0, vpip: 0, pfr: 0, ...(p.notes || {}), showdowns: [] } }));
  // end-of-street ranges up to this step (the Ranges tab's "street by street" line)
  const snaps = {};
  for (let k = 0; k < i; k++) {
    const g = RP.frames[k];
    const nx = RP.frames[k + 1];
    if (nx && nx.kind === 'street' && g.kind !== 'street') snaps[g.street] = g.ranges;
  }
  if (over && rec.board.length >= 3) snaps[3] = f.ranges;
  // who raised last before the flop, while still in (the RAISER tag, from the flop on)
  let raiser = -1;
  if (f.street >= 1) {
    for (const e of f.state.history) if (e.street === 0 && e.type === 'raise') raiser = e.seat;
    if (raiser >= 0 && f.state.folded[raiser]) raiser = -1;
  }
  const readOf = (seat) => {
    const p = f.reads[seat];
    if (!p) return null;
    const ranked = TYPE_IDS.map((id, t) => ({ id, name: PROFILES[id].name, p: p[t] })).sort((a, b) => b.p - a.p);
    return { ranked, notes: seats[seat].notes, look: seats[seat].look, steaming: seats[seat].steaming };
  };
  return {
    replay: true,
    seats,
    handNo: rec.no,
    news: [],
    decisions: rec.decisions,
    game: { sb: rec.sb, bb: rec.bb },
    lineup: rec.sitting && rec.sitting.home ? [] : null,
    hand: {
      no: `r${rec.session}-${rec.no}`,
      label: rec.no,
      replay: true,
      state: f.state,
      over,
      log: rec.log,
      decisions: rec.decisions,
      rangeSnaps: snaps,
      summary: { net: rec.result.net[HERO], showdown: rec.result.showdown },
      actor: f.kind === 'action' || (f.kind === 'folds' && f.count === 1) ? f.seat : -1,
      raiser,
      showAll: RP.showAll,
    },
    status: () => 'replay',
    heroInHand: () => false,
    readOf,
    rangeGrid: (seat, street = 'now') => {
      if (street !== 'now') return snaps[street] ? snaps[street][seat] || null : null;
      if (!f.state.folded[seat]) return f.ranges[seat] || null;
      for (let k = i; k >= 0; k--) if (!RP.frames[k].state.folded[seat]) return RP.frames[k].ranges[seat] || null;
      return null;
    },
    review: () => ({ judged: 0, flagged: 0, lost: 0, list: [], hands: rec.no, net: 0 }),
  };
}

// Run a live drawing function against the replayed hand.
function asReplay(fn) {
  const live = sess;
  sess = replaySession(RP.rec, RP.i);
  try {
    return fn();
  } finally {
    sess = live;
  }
}

function openReplay(rec, opts = {}) {
  if (!rec) return;
  if (!RP) liveSess = sess;
  clearTimeout(timer);
  hideReview();
  const frames = framesOf(rec);
  let i = 0;
  if (opts.frame !== undefined) i = Math.max(0, Math.min(frames.length - 1, opts.frame));
  else if (opts.decision !== undefined && opts.decision >= 0) i = Math.max(0, frames.findIndex((f) => f.decision === opts.decision));
  else {
    const flagged = rec.decisions.findIndex((d) => d.verdict.grade !== 'good');
    if (flagged >= 0) i = Math.max(0, frames.findIndex((f) => f.decision === flagged));
  }
  RP = { rec, frames, i, from: opts.from || (RP && RP.from) || 'table', showAll: false, list: opts.list || (RP && RP.list) || null };
  document.body.classList.add('replaying');
  $('history').classList.add('hidden');
  document.body.classList.remove('in-history');
  shownBoard = 99; // no deal animation while stepping
  document.body.classList.remove('side-closed');
  renderReplay();
  $('rp-fwd')?.focus({ preventScroll: true });
}

function closeReplay(to) {
  if (!RP) return;
  const from = to || RP.from;
  RP = null;
  liveSess = null;
  document.body.classList.remove('replaying');
  shownBoard = 0;
  rangeHand = null;
  if (from === 'history') return openHistory();
  render();
  if (from === 'review' && sess.hand && sess.hand.over) openReview();
  else if (sess.status() === 'bot') advance();
  else if (sess.status() === 'over') scheduleAuto();
}

function go(i) {
  if (!RP) return;
  RP.i = Math.max(0, Math.min(RP.frames.length - 1, i));
  renderReplay();
}
const decisionFrames = () => RP.frames.map((f, k) => (f.decision >= 0 ? k : -1)).filter((k) => k >= 0);
function goDecision(dir) {
  const ds = decisionFrames();
  const k = dir > 0 ? ds.find((x) => x > RP.i) : [...ds].reverse().find((x) => x < RP.i);
  if (k !== undefined) go(k);
}
function goStreet(dir) {
  const fs = RP.frames;
  const cur = fs[RP.i].street;
  if (dir > 0) {
    const k = fs.findIndex((f, j) => j > RP.i && f.street > cur);
    go(k >= 0 ? k : fs.length - 1);
  } else {
    const start = fs.findIndex((f) => f.street === cur);
    if (start < RP.i) return go(start);
    const prev = fs.findIndex((f) => f.street === cur - 1);
    go(prev >= 0 ? prev : 0);
  }
}

function renderReplay() {
  if (!RP) return;
  asReplay(() => {
    renderTable();
    if (currentTab === 'range') renderRanges();
  });
  renderReplayHead();
  renderReplayDock();
  renderReplayCoach();
  renderReplayLog();
}

function actorName(rec, seat) {
  return seat === HERO ? 'You' : rec.seats[seat].nick;
}

// The action in words: "You call $125 more.", "Ball Cap raises to $185."
function actionWords(rec, f) {
  const cards = frameText(f);
  if (f.kind === 'blinds') return 'Blinds are in.';
  if (f.kind === 'folds') {
    if (f.count === 1) return `${actorName(rec, f.seat)} folds.`;
    const toYou = f.state.toAct === HERO;
    return `${NUM_WORDS[f.count] || f.count} folds${toYou ? ' to you' : ''}.`;
  }
  if (f.kind === 'street') {
    const b = f.state.board;
    const fresh = b.length === 3 ? b : b.slice(-1);
    return `${SD_LABEL[f.street]}: ${cards(fresh)}.`;
  }
  if (f.kind === 'end') {
    const wins = rec.log.filter((e) => e.kind === 'win').map((e) => e.text);
    return rec.result.showdown ? 'Showdown.' : `${wins[0] || 'The hand is over'}.`;
  }
  const e = f.action;
  const who = actorName(rec, f.seat);
  const me = f.seat === HERO;
  const allIn = e.allIn || f.state.allIn[f.seat] ? ' (all-in)' : '';
  if (e.type === 'fold') return `${who} fold${me ? '' : 's'}.`;
  if (e.type === 'check') return `${who} check${me ? '' : 's'}.`;
  if (e.type === 'call') return `${who} call${me ? '' : 's'} $${e.amount}${e.to > e.amount ? ' more' : ''}${allIn}.`;
  if (e.type === 'bet') return `${who} bet${me ? '' : 's'} $${e.to}${allIn}.`;
  return `${who} raise${me ? '' : 's'} to $${e.to}${allIn}.`;
}

// One line under it: at your decision the spot as you faced it; at a street, who is in; else what comes next.
function actionSub(rec, f, k) {
  const s = f.state;
  const live = () => s.folded.filter((x) => !x).length;
  if (f.kind === 'street') return `${NUM_WORDS[live()] || live()} players.`;
  if (f.kind === 'blinds') return s.straddleAmt ? `${actorName(rec, s.straddleSeat)} straddles to $${s.straddleAmt}.` : `${NUM_WORDS[s.n] || s.n} players at the table.`;
  if (f.kind === 'end') {
    const shows = rec.log.filter((e) => e.kind === 'show' || e.kind === 'win').map((e) => e.text);
    return shows.join('. ') + (shows.length ? '.' : '');
  }
  if (f.decision >= 0 && f.before) {
    const b = f.before;
    if (b.currentBet > b.bet[HERO]) {
      // the last bet or raise you faced
      for (let j = b.history.length - 1; j >= 0; j--) {
        const e = b.history[j];
        if (e.street !== b.street) break;
        if (e.type === 'raise' || e.type === 'bet') {
          const mine = b.bet[HERO] > 0 && e.seat !== HERO ? ` your $${b.bet[HERO]}` : '';
          return `${actorName(rec, e.seat)} ${e.type === 'bet' ? 'bet' : `raised${mine} to`} $${e.to}.`;
        }
        if (e.type === 'bb' || e.type === 'straddle') return `$${b.currentBet} to call${b.street === 0 ? ', nobody has raised' : ''}.`;
      }
      return `$${b.currentBet - b.bet[HERO]} to call.`;
    }
    return b.street === 0 ? 'Nobody has raised.' : 'Checked to you.';
  }
  const nx = RP.frames[k + 1];
  if (nx && nx.kind === 'street') return f.street === 0 ? 'That closes the betting before the flop.' : `That closes the action on the ${SD_LABEL[f.street].toLowerCase()}.`;
  if (s.toAct >= 0) return `${actorName(rec, s.toAct)} to act.`;
  return '';
}

function figures(rec, f) {
  const at = f.decision >= 0 && f.before ? f.before : f.state;
  const bb = rec.bb;
  const pot = f.kind === 'end' ? (f.state.result ? f.state.result.pot : potSize(f.state)) : potSize(at);
  const out = [['Pot', money(pot), '']];
  if (f.kind === 'end') return out;
  const toCall = at.currentBet - at.bet[HERO];
  if (f.decision >= 0 && toCall > 0 && !at.folded[HERO]) {
    const call = Math.min(toCall, at.stacks[HERO]);
    out.push(['To call', money(call), `win 1 in ${((pot + call) / call).toFixed(1)}`]);
  }
  if (!at.folded[HERO]) {
    let other = 0;
    for (let j = 0; j < at.n; j++) if (j !== HERO && !at.folded[j]) other = Math.max(other, at.stacks[j] + at.bet[j]);
    const eff = Math.min(at.stacks[HERO] + at.bet[HERO], other);
    out.push(['Effective', `${Math.round(eff / bb)} bb`, money(eff)]);
    if (at.board.length >= 3) out.push([PHONE.matches ? 'Stack:pot' : 'Stack to pot', (eff / Math.max(1, pot)).toFixed(1), '']);
  }
  return out;
}

function renderReplayHead() {
  const rec = RP.rec;
  const net = rec.result.net[HERO];
  const when = new Date(rec.at);
  const list = RP.list || [];
  const at = list.findIndex((r) => r.key === rec.key);
  const prev = at > 0 ? list[at - 1] : null;
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null;
  $('replay-head').innerHTML = `
    <button type="button" class="rh-back m-only" data-rh="history">‹ History</button>
    <span class="rh-pill">Hand <b>${rec.no}</b></span>
    <span class="rh-pill d-only">${signed(net)}</span>
    <span class="rh-pill rh-date d-only">$${rec.sb}/$${rec.bb}${rec.sitting && rec.sitting.home ? ' home game' : ''} · ${when.toLocaleDateString([], { weekday: 'short' })} ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
    <div class="seg rh-switch" role="radiogroup" aria-label="View"><button type="button" role="radio" aria-checked="false" data-rh="summary">Summary</button><button type="button" role="radio" aria-checked="true" class="on" data-rh="replay">Replay</button></div>
    <label class="rh-all d-only"><input type="checkbox" id="rh-all" class="toggle" ${RP.showAll ? 'checked' : ''}> Show all cards</label>
    <span class="rh-nav d-only">${prev ? `<button type="button" class="link-btn" data-rh="prev">‹ Hand ${prev.no}</button>` : ''}${next ? `<button type="button" class="link-btn" data-rh="next">Hand ${next.no} ›</button>` : ''}</span>
    <button type="button" class="d-only" data-rh="history">All hands</button>
    <button type="button" class="d-only" data-rh="table">Back to the table</button>`;
  $('replay-head').querySelectorAll('[data-rh]').forEach((b) => (b.onclick = () => {
    const w = b.dataset.rh;
    if (w === 'summary') return openSummary(rec);
    if (w === 'history') return closeReplay('history');
    if (w === 'table') return closeReplay('table');
    if (w === 'prev' && prev) return openReplay(prev);
    if (w === 'next' && next) return openReplay(next);
  }));
  const all = $('rh-all');
  if (all) all.onchange = () => {
    RP.showAll = all.checked;
    renderReplay();
  };
}

function renderReplayDock() {
  const rec = RP.rec;
  const f = RP.frames[RP.i];
  const k = RP.i;
  const d = f.decision >= 0 ? rec.decisions[f.decision] : null;
  const mark = d ? markHtml(d) : '';
  const total = RP.frames.length;
  const figs = figures(rec, f).map(([l, v, sub]) => `<div class="fig"><span class="label">${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('');
  // timeline: one segment per street, a dot per step
  const segs = [0, 1, 2, 3, 4].map((st) => {
    const dots = RP.frames.map((g, j) => [g, j]).filter(([g]) => (g.kind === 'end' ? 4 : g.street) === st);
    if (!dots.length && st > 0) return '';
    const html = dots.map(([g, j]) => {
      const dd = g.decision >= 0 ? rec.decisions[g.decision] : null;
      const facing = g.kind === 'action' && g.seat !== HERO && (g.action.type === 'bet' || g.action.type === 'raise') && !g.state.folded[HERO];
      const cls = ['dot', dd ? `me ${dd.verdict.grade}${dd.tipKind ? ' tip' : ''}${isBest(dd) ? ' best' : ''}` : '', facing ? 'facing' : '', j < k ? 'past' : '', j === k ? 'now' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-go="${j}" aria-label="${esc(actionWords(rec, g))}" title="${esc(actionWords(rec, g))}"></button>`;
    }).join('');
    const first = dots.length ? dots[0][1] : -1;
    return `<div class="seg-st${st === (f.kind === 'end' ? 4 : f.street) ? ' cur' : ''}"><div class="dots">${html}</div><button type="button" class="st-name" data-go="${first}">${PHONE.matches ? ['Pre', 'Flop', 'Turn', 'River', 'SD'][st] : SD_LABEL[st]}</button></div>`;
  }).join('');
  const ds = decisionFrames();
  const hasPrev = ds.some((x) => x < k);
  const hasNext = ds.some((x) => x > k);
  $('replay-dock').innerHTML = `
    <div class="rd-what">
      <p class="label">${SD_LABEL[f.kind === 'end' ? 4 : f.street]} · step ${k + 1} of ${total}</p>
      <p class="rd-action">${mark}${esc(actionWords(rec, f))}</p>
      <p class="rd-sub">${esc(actionSub(rec, f, k))}</p>
    </div>
    <div class="rd-figs">${figs}</div>
    <div class="rd-controls">
      <button type="button" class="rd-btn" id="rp-first" title="Your previous decision (Shift+←)" aria-label="Your previous decision" ${hasPrev ? '' : 'disabled'}>⏮</button>
      <button type="button" class="rd-btn" id="rp-back" title="Back one action (←)" ${k > 0 ? '' : 'disabled'}>◀ Back</button>
      <button type="button" class="rd-btn primary" id="rp-fwd" title="Forward one action (→)" ${k < total - 1 ? '' : 'disabled'}>Forward ▶</button>
      <button type="button" class="rd-btn" id="rp-last" title="Your next decision (Shift+→)" aria-label="Your next decision" ${hasNext ? '' : 'disabled'}>⏭</button>
    </div>
    <div class="rd-timeline">${segs}</div>
    <p class="rd-keys d-only"><kbd>←</kbd><kbd>→</kbd> action · <kbd>↑</kbd><kbd>↓</kbd> street · <kbd>Shift</kbd>+<kbd>→</kbd> your next decision</p>`;
  $('rp-back').onclick = () => go(k - 1);
  $('rp-fwd').onclick = () => go(k + 1);
  $('rp-first').onclick = () => goDecision(-1);
  $('rp-last').onclick = () => goDecision(1);
  $('replay-dock').querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => +b.dataset.go >= 0 && go(+b.dataset.go)));
}

// The flagged-verdict block, as in the review (shared with the review rows).
function flagBlock(d) {
  const v = d.verdict;
  const evs = v.options.map((o) => o.ev);
  const lo = Math.min(...evs, 0);
  const hi = Math.max(...evs, 0);
  const width = (ev) => Math.max(4, Math.round(((ev - lo) / Math.max(1e-9, hi - lo)) * 100));
  const bars = v.options.map((o, i) => `<div class="bar ${i === v.best ? 'best' : ''} ${i === v.mine ? 'yours' : ''}"><span>${esc(o.label)}</span><span class="track"><i style="--w:${width(o.ev)}%"></i></span><span class="mono">${Math.round(o.ev) >= 0 ? '+' : '−'}$${Math.abs(Math.round(o.ev))}</span></div>`).join('');
  const eq = d.villain && d.villain.picture && d.villain.picture.equity !== null && d.villain.picture.equity !== undefined ? d.villain.picture.equity : null;
  const duo = eq !== null && d.toCall > 0 ? `<div class="duo"><div class="stat"><span class="label">You beat</span><b>${Math.round(eq * 100)}%</b></div><div class="stat"><span class="label">You needed</span><b>${Math.round(d.odds * 100)}%</b></div></div>` : '';
  return `<h2>${esc(d.headline)}</h2>
    ${anchorHtml(d)}
    ${d.reasons.map((r) => `<p class="why">${esc(r)}</p>`).join('')}
    <p class="label">What each option is worth, on average</p>
    <div class="bars">${bars}</div>
    ${duo}
    ${d.theory ? `<details class="rv-theory"><summary>Why theory disagrees ›</summary><p>${esc(d.theory)}</p></details>` : ''}`;
}

function renderReplayCoach() {
  const rec = RP.rec;
  const f = RP.frames[RP.i];
  const el = $('feedback');
  let html = '';
  const ds = decisionFrames();
  const ahead = ds.find((x) => x > RP.i);
  if (f.decision >= 0) {
    const d = rec.decisions[f.decision];
    const v = d.verdict;
    const mine = v.options[v.mine];
    const head = `<div class="rp-card-head">${markHtml(d)}<div><b>${esc(mine ? mine.label : '')}</b><small>${esc(actionSub(rec, f, RP.i))}</small></div><span class="grade ${v.grade}${isBest(d) ? ' best' : ''}">${gradeWord(d)}</span></div>`;
    if (v.grade !== 'good') {
      html = `<div class="rp-card ${v.grade}">${head}<div class="rv-body">${flagBlock(d)}
        <div class="rv-acts">${d.villain ? `<button type="button" class="btn small" data-rseat="${d.villain.seat}">See ${esc(d.villain.nick)}'s range</button>` : ''}${d.category && DRILLS[d.category] ? `<button type="button" class="btn small" data-drill="${d.category}">Drill this leak</button>` : ''}${d.snapshot ? '<button type="button" class="btn small quiet" data-rdispute="1">Disagree?</button>' : ''}</div></div></div>`;
    } else if (d.tip) {
      html = `<div class="rp-card tip">${head}<div class="rv-body"><h2>${esc(d.headline)}</h2>${tipLine(d)}</div></div>`;
    } else {
      html = `<div class="rp-card${isBest(d) ? ' best' : ''}">${head}<div class="rv-body">${fbCard(d, false).replace(/<div class="fb good( best)?">/, '<div class="fb good rp-fine">').replace(/<div class="fb-best">.*?<\/div>/s, '')}</div></div>`;
    }
  } else if ((f.kind === 'action' || (f.kind === 'folds' && f.count === 1)) && f.seat !== HERO) {
    const p = rec.seats[f.seat];
    const r = asReplay(() => sess.readOf(f.seat));
    const top = r ? r.ranked[0] : null;
    const sure = top && top.p >= 0.75 ? 'almost certainly' : top && top.p >= 0.6 ? 'probably' : top && top.p >= 0.45 ? 'might be' : null;
    const moved = f.kind === 'action' && (f.action.type === 'bet' || f.action.type === 'raise');
    html = `<div class="rp-opp"><div class="big-avatar" style="--h:${p.hue ?? 160}">${avatarArt(p)}</div><div><b>${esc(p.nick)}</b> <span class="badge pos">${positionName(f.state, f.seat)}</span>
      <p>${sure ? `Coach's read then: ${sure} a ${esc(top.name.toLowerCase())}.` : "Coach's read then: none yet."}</p>
      ${moved ? `<button type="button" class="link-btn" data-rseat="${f.seat}">How ${esc(p.nick)}'s range changed with this ›</button>` : ''}</div></div>`;
  } else {
    html = `<p class="sub">${esc(actionWords(rec, f))} ${esc(actionSub(rec, f, RP.i))}</p>`;
  }
  if (ahead !== undefined) {
    const nd = rec.decisions[RP.frames[ahead].decision];
    const lbl = nd && nd.verdict.options[nd.verdict.mine] ? nd.verdict.options[nd.verdict.mine].label.toLowerCase() : 'your next decision';
    html += `<button type="button" class="link-btn rp-skip" data-go="${ahead}">Skip to your next decision: ${esc(lbl)} ›</button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(+b.dataset.go)));
  el.querySelectorAll('[data-rseat]').forEach((b) => (b.onclick = () => { rangeSeat = +b.dataset.rseat; showTab('range'); }));
  el.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => { closeReplay('table'); startDrill(b.dataset.drill); }));
  el.querySelectorAll('[data-rdispute]').forEach((b) => (b.onclick = () => disputeModal(rec.decisions[f.decision])));
}

// The hand log up to this step, the current line marked; each action line goes to its step.
function renderReplayLog() {
  const rec = RP.rec;
  const f = RP.frames[RP.i];
  const fs = f.state;
  const end = f.kind === 'end';
  const html = handCardHtml({
    s: fs, seats: rec.seats, decisions: rec.decisions, bb: rec.bb, no: rec.no, position: rec.position, over: end, net: rec.result.net[HERO],
    shows: end ? rec.log.filter((l) => l.kind === 'show' || l.kind === 'win').map((l) => l.text) : [], showdown: rec.result.showdown, live: false,
    links: (idx) => {
      const j = RP.frames.findIndex((g) => g.state.history.length > idx);
      return j >= 0 ? j : null;
    },
    current: fs.history.length - 1,
  });
  const later = rec.history.length - fs.history.length;
  $('log').innerHTML = html + (later > 0 && !end ? `<p class="hint">${later} more action${later === 1 ? '' : 's'} after this point.</p>` : '');
  $('log').querySelectorAll('[data-frame]').forEach((b) => (b.onclick = () => go(+b.dataset.frame)));
  return;
  const acts = f.state.history.filter((e) => !['sb', 'bb', 'straddle'].includes(e.type)).length;
  const boards = f.state.board.length === 0 ? 0 : f.state.board.length === 3 ? 1 : f.state.board.length === 4 ? 2 : 3;
  const actFrame = []; // act index -> frame
  RP.frames.forEach((g, j) => {
    const n = g.state.history.filter((e) => !['sb', 'bb', 'straddle'].includes(e.type)).length;
    if (actFrame[n - 1] === undefined && n > 0) actFrame[n - 1] = j;
  });
  let a = 0;
  let b = 0;
  const lines = [];
  let after = 0;
  for (const l of rec.log) {
    let show = true;
    let me = false;
    let jump = -1;
    if (l.kind === 'act') {
      show = a < acts;
      me = show && a === acts - 1 && (f.kind === 'action' || f.kind === 'folds');
      jump = actFrame[a] ?? -1;
      if (!show) after++;
      a++;
    } else if (l.kind === 'board') {
      show = b < boards || f.kind === 'end';
      b++;
    } else if (l.kind === 'show' || l.kind === 'win' || l.kind === 'note') show = f.kind === 'end';
    if (!show) continue;
    const mark = l.kind === 'act' && l.seat === HERO ? (() => {
      const nth = rec.log.filter((x, xi) => x.kind === 'act' && x.seat === HERO && xi <= rec.log.indexOf(l)).length - 1;
      const d = rec.decisions[nth];
      return d ? markHtml(d) : '';
    })() : '';
    lines.push(`<div class="ln ${l.kind}${l.seat === HERO && l.kind === 'act' ? ' me' : ''}${me ? ' cur' : ''}"${jump >= 0 ? ` data-go="${jump}" role="button" tabindex="0"` : ''}>${mark}${esc(l.text)}</div>`);
  }
  if (after) lines.push(`<p class="hint">${after} more action${after === 1 ? '' : 's'} after this point.</p>`);
  $('log').innerHTML = lines.join('');
  $('log').querySelectorAll('[data-go]').forEach((el) => (el.onclick = () => go(+el.dataset.go)));
}

function replayKey(e) {
  const k = e.key;
  if (k === 'Escape') return closeReplay();
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') return;
  if (k === 'ArrowRight' || k === 'ArrowLeft') {
    e.preventDefault();
    if (e.shiftKey) goDecision(k === 'ArrowRight' ? 1 : -1);
    else go(RP.i + (k === 'ArrowRight' ? 1 : -1));
  } else if (k === 'ArrowUp' || k === 'ArrowDown') {
    e.preventDefault();
    goStreet(k === 'ArrowDown' ? 1 : -1);
  } else if (k === 'Home') {
    e.preventDefault();
    go(0);
  } else if (k === 'End') {
    e.preventDefault();
    go(RP.frames.length - 1);
  }
}

// ---- the hand's Summary view: today's review, for any kept hand ----
function openSummary(rec) {
  if (!rec) return;
  const from = RP ? RP.from : 'history';
  const list = RP ? RP.list : null;
  // draw the review against the end of the recorded hand
  RP = RP || { rec, frames: framesOf(rec), i: 0, from, showAll: false, list };
  RP.rec = rec;
  RP.frames = framesOf(rec);
  RP.i = RP.frames.length - 1;
  RP.summary = true;
  document.body.classList.remove('replaying');
  asReplay(() => openReview(true));
}

// ---- hand history list ----
// "Played": you put money in voluntarily, on any street (QA X7: a BB check that bets the river counts).
const playedHand = (r) => r.history.some((e) => e.seat === HERO && (e.type === 'call' || e.type === 'raise' || e.type === 'bet'));
// Folded-for-you dividers, one per run of consecutive hands (QA X6): a hand a reload dropped is
// not stored, so it breaks the run rather than being counted inside it.
function foldedRuns(skips, dash, tail = '', link = false) {
  const nos = skips.map((x) => x.no).sort((a, b) => a - b);
  const posOf = new Map(skips.map((x) => [x.no, x.position]));
  const out = [];
  let start = 0;
  for (let k = 1; k <= nos.length; k++) {
    if (k < nos.length && nos[k] === nos[k - 1] + 1) continue;
    const a = nos[start];
    const b = nos[k - 1];
    const pos = posOf.get(b); // the most recent hand of the run
    const go = link && pos ? ` · <button type="button" class="link-btn edit-ranges" data-edit-ranges="${groupOf(pos)}">Edit my ranges ›</button>` : '';
    out.push(`<div class="hdiv"><span>${a === b ? `Hand ${a} folded for you` : `Hands ${a}${dash}${b} folded for you`}${tail}${go}</span></div>`);
    start = k;
  }
  return out.reverse(); // the lists run newest first
}
const histFilters = [
  ['all', 'All', () => true],
  ['flagged', 'Flagged', (r) => r.decisions.some((d) => d.verdict.grade !== 'good')],
  ['tips', 'Tips', (r) => r.decisions.some((d) => d.tipKind) && !r.decisions.some((d) => d.verdict.grade !== 'good')],
  ['played', 'Played', playedHand],
  ['folded', 'Folded before the flop', (r) => r.result.folded[HERO] && !r.history.some((e) => e.seat === HERO && e.street > 0)],
];
let histFilter = 'all';
let histCache = null;

async function openHistory() {
  RP = null;
  liveSess = null;
  document.body.classList.remove('replaying');
  render();
  hideReview();
  RP = null;
  clearTimeout(timer);
  const el = $('history');
  el.classList.remove('hidden');
  document.body.classList.add('in-history');
  el.innerHTML = '<div class="hist-wrap"><p class="sub">Loading…</p></div>';
  const all = await listHands();
  histCache = all;
  drawHistory();
}

function closeHistory() {
  $('history').classList.add('hidden');
  document.body.classList.remove('in-history');
  render();
  if (sess.status() === 'bot') advance();
  else if (sess.status() === 'over') scheduleAuto();
}

function handMarker(r) {
  const flagged = r.decisions.filter((d) => d.verdict.grade !== 'good');
  if (flagged.length) {
    const worst = flagged.some((d) => d.verdict.grade === 'blunder') ? 'blunder' : 'mistake';
    const cost = flagged.reduce((a, d) => a + (d.cost || 0), 0);
    const word = flagged.length > 1 ? `${flagged.length} flagged` : worst === 'blunder' ? 'Blunder' : 'Mistake';
    return `<span class="hm ${worst}"><span class="vmark ${worst}">${MARK[worst]}</span>${word} · ${money(cost)}</span>`;
  }
  if (r.decisions.some((d) => d.tipKind)) return '<span class="hm tip">Tip</span>';
  const nb = r.decisions.filter(isBest).length;
  if (nb) return `<span class="hm best"><span class="vmark good best">${MARK.good}</span>${nb} best</span>`;
  return `<span class="hm good"><span class="vmark good">${MARK.good}</span>${r.decisions.length > 1 ? 'All fine' : 'Fine'}</span>`;
}

function handStory(r) {
  const heroFolded = r.result.folded[HERO];
  const net = r.result.net[HERO];
  if (r.result.showdown && !heroFolded) {
    const others = r.seats.map((p, i) => i).filter((i) => i !== HERO && !r.result.folded[i]);
    return `Showdown against ${others.map((i) => r.seats[i].nick).join(', ')}`;
  }
  if (heroFolded) {
    const st = r.history.filter((e) => e.seat === HERO && e.type === 'fold').map((e) => e.street)[0];
    if (st === 0) return r.history.some((e) => e.seat === HERO && e.street === 0 && e.type !== 'fold' && !['sb', 'bb', 'straddle'].includes(e.type)) ? 'Played, then folded before the flop' : 'You folded';
    return `Folded on the ${SD_LABEL[st].toLowerCase()}`;
  }
  return net > 0 ? `Won when the others folded${r.board.length ? ` on the ${SD_LABEL[r.board.length >= 5 ? 3 : r.board.length === 4 ? 2 : 1].toLowerCase()}` : ''}` : 'Hand over';
}

function drawHistory() {
  const el = $('history');
  const all = histCache;
  if (!all) {
    el.innerHTML = `<div class="hist-wrap"><h1>Hand history</h1><p class="sub">Hands could not be kept on this device (storage is unavailable).</p><button type="button" id="h-close">Back to the table</button></div>`;
    $('h-close').onclick = closeHistory;
    return;
  }
  const hands = all.filter((r) => r.kind === 'hand');
  const counts = Object.fromEntries(histFilters.map(([k, , fn]) => [k, hands.filter(fn).length]));
  const fn = histFilters.find(([k]) => k === histFilter)[2];
  // newest first, grouped by sitting
  const items = [...all].reverse();
  const groups = [];
  for (const r of items) {
    let g = groups[groups.length - 1];
    if (!g || g.session !== r.session) groups.push((g = { session: r.session, rows: [], kept: 0, folded: 0, sitting: null }));
    if (r.kind === 'hand') {
      g.kept++;
      g.sitting = g.sitting || r.sitting;
    } else g.folded++;
    g.rows.push(r);
  }
  const today = new Date().toDateString();
  const rowHtml = (r) => {
    const net = r.result.net[HERO];
    const pos = positionOf(r);
    return `<button type="button" class="hrow${r.decisions.length === 0 || (r.result.folded[HERO] && r.decisions.length <= 1 && !r.decisions.some((d) => d.verdict.grade !== 'good')) ? ' quiet' : ''}" data-key="${r.key}">
      <span class="hr-no" data-pos="${pos ? ` · ${pos}` : ''}">Hand <b>${r.no}</b></span><span class="hr-cards">${cardsInline(holeOrder(r.hole[HERO]))}</span><span class="badge pos">${pos}</span>
      <span class="hr-board">${r.board.length ? cardsInline(r.board) : '<i>no flop</i>'}</span>
      <span class="hr-story">${esc(handStory(r))}</span>${handMarker(r)}<span class="hr-net">${net === 0 ? '$0' : signed(net)}</span><span class="hr-go" aria-hidden="true">›</span></button>`;
  };
  const body = groups.map((g) => {
    const when = g.sitting ? new Date(g.sitting.at) : null;
    const label = when ? `${when.toDateString() === today ? 'Today' : when.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })} · $${g.sitting.sb}/$${g.sitting.bb}${g.sitting.home ? ' home game' : ''}` : 'Earlier';
    const rows = [];
    let skipRun = [];
    const flush = () => {
      if (!skipRun.length) return;
      rows.push(...foldedRuns(skipRun, ' to ', ' (outside your ranges)'));
      skipRun = [];
    };
    for (const r of g.rows) {
      if (r.kind === 'skip') {
        if (histFilter === 'all') skipRun.push(r);
        continue;
      }
      if (!fn(r)) continue;
      flush();
      rows.push(rowHtml(r));
    }
    flush();
    if (!rows.length) return '';
    return `<section class="hgroup"><div class="hg-head"><span class="label">${esc(label)}</span><span class="label">${g.kept} kept${g.folded ? ` · ${g.folded} folded for you` : ''}</span></div>${rows.join('')}</section>`;
  }).join('');
  el.innerHTML = `<div class="hist-wrap">
    <div class="hist-top"><h1>Hand history</h1><button type="button" class="quiet" id="h-close">Back to the table</button></div>
    <p class="sub">Your last 100 hands, kept on this device. Open one to step through it.</p>
    <div class="chips hist-filters" role="tablist">${histFilters.map(([k, label]) => `<button type="button" class="chip${k === histFilter ? ' on' : ''}" role="tab" aria-selected="${k === histFilter}" data-f="${k}">${label} <span class="num">${counts[k]}</span></button>`).join('')}</div>
    ${hands.length ? body || '<p class="empty-line">No hands match.</p>' : '<p class="empty-line">No hands yet. Every hand you play is kept here.</p>'}
    <p class="hist-foot">Hands folded for you are counted, not kept. Older hands drop off as new ones come in. <button type="button" class="link-btn" id="h-clear">Clear history</button></p>
  </div>`;
  $('h-close').onclick = closeHistory;
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { histFilter = b.dataset.f; drawHistory(); }));
  const ordered = hands; // oldest first, for Hand N-1 / N+1
  el.querySelectorAll('[data-key]').forEach((b) => (b.onclick = () => {
    const rec = hands.find((r) => r.key === +b.dataset.key);
    openReplay(rec, { from: 'history', list: ordered });
  }));
  $('h-clear').onclick = async () => {
    if (!confirm('Clear your hand history on this device? This cannot be undone.')) return;
    await clearHands();
    histCache = await listHands();
    drawHistory();
  };
  el.scrollTop = 0;
}

function positionOf(rec) {
  return rec.position || '';
}


// ---- the Hand log tab: "This hand" as a readable story with your
// verdicts on it, then "Earlier tonight", one row per hand, each a way into the replayer. The
// replayer's own log tab uses the same card, so a hand reads the same live and in replay.
let pendingAction = null; // your action while the coach grades it (shown as "coach is checking…")
let tonight = null; // kept hands and folded-for-you markers of this sitting, newest last
let logFilter = 'all';

function refreshTonight() {
  const id = sess && sess.id;
  if (!id || drill) return;
  listHands().then((all) => {
    tonight = (all || []).filter((r) => r.session === id);
    if (!RP) renderLog(); // drawn now even if the tab is closed (QA Z4)
  });
}

const POSTS = new Set(['sb', 'bb', 'straddle']);
const bbOf = (x, bb) => {
  const v = x / bb;
  return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
};
// "Ad Qh" in the engine's showdown lines, with suit symbols as everywhere else
const SUIT_OF = { s: '♠', h: '♥', d: '♦', c: '♣' };
const suitText = (t) => t.replace(/\b([2-9TJQKA])([shdc])\b/g, (m, r, su) => r + SUIT_OF[su]);

// p: { s, seats, decisions, bb, no, position, over, net, shows, live, pending, links, current }
function handCardHtml(p) {
  const { s, seats, decisions, bb } = p;
  const H = s.history;
  const nameOf = (i) => (i === HERO ? 'You' : seats[i].nick);
  // the pot as each street began, and which bets you then faced
  let running = 0;
  const potAt = [];
  const facing = new Set();
  for (let k = 0; k < H.length; k++) {
    const e = H[k];
    // the pot as each street began (before the flop: once the blinds are in)
    if (potAt[e.street] === undefined && !POSTS.has(e.type)) potAt[e.street] = running;
    running += e.amount || 0;
    if (e.seat !== HERO && (e.type === 'bet' || e.type === 'raise')) {
      if (H.slice(k + 1).some((x) => x.seat === HERO && x.street === e.street)) facing.add(k);
    }
  }
  const verdictOf = (d) => {
    if (!d) return '';
    const g = d.verdict.grade;
    if (g === 'good') return `<span class="hl-v good${isBest(d) ? ' best' : ''}">${markHtml(d)}${notGraded(d.verdict) ? 'not graded' : d.tipKind ? 'fine · tip' : isBest(d) ? 'best play' : 'fine'}</span>`;
    return `<span class="hl-v ${g}">${g === 'blunder' ? 'Blunder' : 'Mistake'} · ${money(d.cost)}${p.why ? ` <button type="button" class="link-btn hl-why" data-why="${decisions.indexOf(d)}">Why ›</button>` : ''}</span>`;
  };
  let heroN = 0;
  const lines = { 0: [], 1: [], 2: [], 3: [] };
  // blinds, and the folds before anyone puts money in, as one quiet line
  let k = 0;
  const posts = [];
  while (k < H.length && POSTS.has(H[k].type)) posts.push(H[k++]);
  const folds = [];
  while (k < H.length && H[k].street === 0 && H[k].type === 'fold' && H[k].seat !== HERO) folds.push(H[k++]);
  const sb = posts.find((e) => e.type === 'sb');
  const big = posts.find((e) => e.type === 'bb');
  const strad = posts.find((e) => e.type === 'straddle');
  let blind = `Blinds $${sb ? sb.amount : s.sbAmt} / $${big ? big.amount : bb}${strad ? `, straddle $${strad.amount}` : ''}`;
  if (folds.length) blind += ` · ${folds.length === 1 ? `${nameOf(folds[0].seat)} folds` : `${folds.length} folds, ${positionName(s, folds[0].seat)} to ${positionName(s, folds[folds.length - 1].seat)}`}`;
  lines[0].push({ html: `<span class="hl-t">${esc(blind)}</span>`, quiet: true, idx: k - 1 });
  for (; k < H.length; k++) {
    const e = H[k];
    if (POSTS.has(e.type)) continue;
    const me = e.seat === HERO;
    const who = esc(nameOf(e.seat));
    let text = '';
    if (e.type === 'fold') text = `${who} fold${me ? '' : 's'}`;
    else if (e.type === 'check') text = `${who} check${me ? '' : 's'}`;
    else if (e.type === 'call') {
      const more = e.to > e.amount ? ' more' : '';
      text = `${who} call${me ? '' : 's'} <b>$${e.amount}</b>${more}${e.street === 0 || facing.has(k) ? ` <small>${bbOf(e.to, bb)} bb</small>` : ''}`;
    } else {
      const verb = e.type === 'bet' ? 'bet' : 'raise';
      const pot = H.slice(0, k).reduce((a, x) => a + (x.amount || 0), 0);
      const size = me && e.street > 0 && e.type === 'bet' ? ` <small>${Math.round((100 * e.to) / Math.max(1, pot))}% pot</small>` : e.street === 0 || facing.has(k) ? ` <small>${bbOf(e.to, bb)} bb</small>` : '';
      text = `${who} ${verb}${me ? '' : 's'}${e.type === 'raise' ? ' to' : ''} <b>$${e.to}</b>${size}`;
    }
    if (e.allIn || (s.allIn && s.allIn[e.seat] && !H.slice(k + 1).some((x) => x.seat === e.seat))) text += ' <small>all-in</small>';
    const d = me ? decisions[heroN++] : null;
    lines[e.street].push({ html: `<span class="hl-t">${text}</span>`, vhtml: me ? verdictOf(d) : '', me, grade: d ? `${d.verdict.grade}${isBest(d) ? ' best' : ''}` : null, quiet: e.type === 'fold' && !me, facing: facing.has(k), idx: k });
  }
  // your action while the coach is checking it
  if (p.pending && p.live) {
    const a = p.pending;
    const words = a.type === 'raise' ? (s.currentBet ? `raise to <b>$${a.to}</b>` : `bet <b>$${a.to}</b>`) : a.type === 'call' ? `call <b>$${s.currentBet - s.bet[HERO]}</b>` : a.type;
    lines[s.street].push({ html: `<span class="hl-t">You ${words}</span><span class="hl-v checking" aria-live="polite"><i class="spin"></i>coach is checking…</span>`, me: true, pending: true });
  } else if (p.live && s.toAct >= 0 && s.toAct !== HERO) {
    lines[s.street].push({ html: `<span class="hl-t">${esc(nameOf(s.toAct))} to act…</span>`, next: true });
  }
  const streetCards = (st) => (st === 1 ? s.board.slice(0, 3) : st === 2 ? s.board.slice(3, 4) : st === 3 ? s.board.slice(4, 5) : []);
  const lineHtml = (l) => {
    const link = p.links && l.idx !== undefined && !l.pending && !l.next ? p.links(l.idx) : null;
    const cls = ['hl-ln', l.quiet ? 'quiet' : '', l.me ? `me ${l.grade || ''}` : '', l.facing ? 'facing' : '', l.next ? 'next' : '', l.pending ? 'pending' : '', p.current !== undefined && l.idx === p.current ? 'cur' : ''].filter(Boolean).join(' ');
    const v = l.vhtml || '';
    if (link === null || link === undefined) return `<div class="${cls}"><i class="hl-dot"></i>${l.html}${v}</div>`;
    if (!v.includes('data-why')) return `<button type="button" class="${cls}" data-frame="${link}"><i class="hl-dot"></i>${l.html}${v}</button>`;
    return `<div class="${cls} split"><button type="button" class="hl-go" data-frame="${link}"><i class="hl-dot"></i>${l.html}</button>${v}</div>`;
  };
  const streets = [0, 1, 2, 3]
    .filter((st) => st === 0 || s.board.length >= [0, 3, 4, 5][st])
    .map((st) => `<div class="hl-st"><div class="hl-head"><span class="label">${SD_LABEL[st]}</span>${st ? cardsInline(streetCards(st)) : ''}<span class="hl-pot">pot $${potAt[st] ?? running}</span></div>${lines[st].map(lineHtml).join('')}</div>`)
    .join('');
  const show = p.over && p.shows && p.shows.length ? `<div class="hl-st"><div class="hl-head"><span class="label">${p.showdown ? 'Showdown' : 'Result'}</span></div>${p.shows.map((t) => `<div class="hl-ln quiet"><i class="hl-dot"></i><span class="hl-t">${esc(suitText(t))}</span></div>`).join('')}<div class="hl-ln result"><span class="hl-t">Your result</span><b class="mono">${p.net === 0 ? '$0' : signed(p.net).replace('-', '−')}</b></div></div>` : '';
  const flagged = decisions.filter((d) => d.verdict.grade !== 'good');
  const sub = p.live || !p.over
    ? `$${s.sbAmt}/$${bb} · you ${p.live ? 'have' : 'had'} ${money(s.stacks[HERO])}`
    : `Hand over · ${flagged.length ? `${flagged.length} flagged · ${money(flagged.reduce((a, d) => a + d.cost, 0))}` : decisions.length ? 'every decision fine' : 'no decisions'}`;
  return `<div class="hl-card"><div class="hl-top">${cardsInline(holeOrder(s.hole[HERO]))}<div><b>Hand ${p.no}${p.position ? ` · ${p.position}` : ''}</b><small>${sub}</small></div>${p.live ? '<span class="hl-live">Live</span>' : ''}</div>${streets}${show}${p.actions || ''}</div>`;
}

function earlierHtml() {
  if (!tonight) return '<p class="hint">Loading earlier hands…</p>';
  // the hand just finished is the card above until the next deal
  const shown = (r) => !(sess.hand && sess.hand.over && r.no === sess.hand.no);
  const hands = tonight.filter((r) => r.kind === 'hand' && shown(r));
  const flaggedFn = (r) => r.decisions.some((d) => d.verdict.grade !== 'good');
  const playedFn = playedHand;
  const fn = logFilter === 'flagged' ? flaggedFn : logFilter === 'played' ? playedFn : () => true;
  const rows = [];
  let skips = [];
  const evs = logFilter === 'all' ? logEvents.map((e, k) => ({ ...e, k })).sort((a, b) => b.hand - a.hand || a.k - b.k) : [];
  let ei = 0;
  const eventsAfter = (no) => {
    while (ei < evs.length && evs[ei].hand > no) rows.push(`<div class="hl-ev">${esc(evs[ei++].text)}</div>`);
  };
  const flush = () => {
    if (!skips.length) return;
    rows.push(...foldedRuns(skips, '–', '', true));
    skips = [];
  };
  for (const r of [...tonight].reverse()) {
    if (r.kind === 'skip') {
      if (logFilter === 'all') {
        if (ei < evs.length && evs[ei].hand > r.no) {
          // an event came after these folded hands: it goes above them
          flush();
          eventsAfter(r.no);
        }
        skips.push(r);
      }
      continue;
    }
    if (!fn(r) || !shown(r)) continue;
    flush();
    eventsAfter(r.no);
    const net = r.result.net[HERO];
    rows.push(`<button type="button" class="hl-row" data-key="${r.key}">${cardsInline(holeOrder(r.hole[HERO]))}<span class="hr-a"><span>Hand <b>${r.no}</b> · ${esc(r.position || '')}</span><b class="mono">${net === 0 ? '$0' : signed(net)}</b></span><span class="hr-b">${r.board.length ? cardsInline(r.board) : '<i>no flop</i>'}${handMarker(r)}</span></button>`);
  }
  flush();
  eventsAfter(-1);
  const counts = { all: hands.length, flagged: hands.filter(flaggedFn).length, played: hands.filter(playedFn).length };
  return `<div class="hl-earlier"><div class="hl-ehead"><span class="label">Earlier tonight</span><button type="button" class="link-btn" data-allhands>All hands ›</button></div>
    <div class="chips">${[['all', 'All'], ['flagged', 'Flagged'], ['played', 'Played']].map(([k, l]) => `<button type="button" class="chip${logFilter === k ? ' on' : ''}" data-lf="${k}">${l} <span class="num">${counts[k]}</span></button>`).join('')}</div>
    ${rows.join('') || '<p class="hint">No earlier hands yet.</p>'}
    <p class="hint">Tap a hand to step through it. Your last 100 hands are in Hand history.</p></div>`;
}

// Handle for debugging from the browser console.
window.trainer = { get session() { return sess; }, settings, act, nextHand, get workerReady() { return judge.ready; } };

// http://localhost:5173/play.html?demo=7 jumps to a mid-session decision
// with coach feedback showing (used for screenshots). The number picks the session.
function demo(seed) {
  // Always the standard casino table, whatever is saved in Settings.
  Object.assign(settings, DEFAULTS, { home: settings.home, sideW: settings.sideW });
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
// The session is kept on this device between hands, so leaving costs at most the hand in play.
// Only when that could not be kept, or a hand you have acted in is still going, ask first.
addEventListener('beforeunload', (e) => {
  const s = mainSess || sess;
  if (demoSeed !== null || !s || !s.decisions.length) return;
  const midHand = s.hand && !s.hand.over && s.hand.decisions.length > 0;
  if (kept && !midHand) return;
  e.preventDefault();
  e.returnValue = '';
});
if (demoSeed !== null) demo(+demoSeed || 7);
else {
  // No setup screen: deal straight in on the saved settings, or the defaults on a first visit
  // (saved now, so the next visit counts as returning).
  if (firstVisit) {
    saveSettings();
    startHints();
  }
  resumeOrNew();
}
