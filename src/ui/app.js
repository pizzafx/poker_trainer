import { Session, GAMES, RAKES } from '../trainer/session.js';
import { RANKS } from '../engine/cards.js';
import { potSize, positionName, STREET } from '../engine/game.js';
import { PROFILES, TYPE_IDS, baseDef, currentDef, applyOverrides } from '../bots/profiles.js';
import { CONTROLS } from '../trainer/tuning.js';
import { CATEGORIES } from '../trainer/explain.js';
import { DRILLS } from '../trainer/drills.js';
import { TABLES } from '../trainer/players.js';

const $ = (id) => document.getElementById(id);
const HERO = 0;
const SUIT_SYM = ['♣', '♦', '♥', '♠'];
const SUIT_CLS = ['c', 'd', 'h', 's'];

const DEFAULTS = { v: 2, game: '2/3', maxBuy: 500, rake: 'tsr', table: 'typical', skipJunk: true, mode: 'casino', home: { sb: 1, bb: 2, buy: 200, counts: { station: 2, nit: 1, maniac: 1, abc: 1, beginner: 1, tag: 1 } }, feedback: 'now', reads: true, speed: 450 };
let settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem('trainer-settings') || '{}');
  if (saved.v === DEFAULTS.v) Object.assign(settings, saved); // older saved settings are dropped
} catch {
  /* storage unavailable: use defaults */
}
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
  const base = { skipBelow: settings.skipJunk ? 0.15 : 0, samples: 600 };
  if (settings.mode === 'home') {
    const h = settings.home;
    const lineup = [];
    for (const [t] of HOME_TYPES) for (let i = 0; i < (h.counts[t] || 0); i++) lineup.push(t);
    return { ...base, custom: { sb: h.sb, bb: h.bb, minBuy: Math.max(h.bb * 10, Math.round(h.buy / 2)), maxBuy: h.buy }, heroBuy: h.buy, lineup };
  }
  return { ...base, game: settings.game, maxBuy: settings.maxBuy, heroBuy: settings.maxBuy, rake: settings.rake, table: settings.table };
}

let drill = null; // { cat, tried, clean, cost } while drilling one leak
let mainSess = null; // the regular session, parked during a drill
let sess = null;
let timer = null;
let pastLog = []; // log lines from earlier hands
let raiseTo = 0;
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
    <span>Session<b class="${net >= 0 ? 'pos' : 'neg'}">${signed(net)}</b></span>
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

function renderTable() {
  const h = sess.hand;
  const s = h.state;
  const n = s.n;
  const over = h.over;
  let seatsHtml = '';
  for (let i = 0; i < n; i++) {
    const ang = ((90 + (i * 360) / n) * Math.PI) / 180;
    const x = 50 + 44 * Math.cos(ang);
    const y = 49 + 38 * Math.sin(ang);
    const p = sess.seats[i];
    const pos = positionName(s, i);
    const cls = ['seat'];
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
        const label = lvl === 3 ? word : lvl === 2 ? `Likely ${word.toLowerCase()}` : `${word}?`;
        read = `<div class="read ${lvl >= 2 ? 'firm' : ''}"><i class="conf c${lvl}"></i>${esc(label)}</div>`;
      } else read = `<div class="read">–</div>`;
    }
    const stack = over ? s.stacks[i] : s.stacks[i];
    const isBtn = pos === 'BTN' || pos === 'BTN/SB';
    const badge = `<span class="badge pos${isBtn ? ' btn' : ''}">${pos}</span>`;
    seatsHtml += `<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%" data-seat="${i}"${i === HERO ? '' : ' role="button" tabindex="0"'}>
      <div class="cards">${cards}</div>
      <div class="avatar" style="--h:${(i * 43) % 360}">${i === HERO ? '' : p.icon}${badge}${p.steaming ? '<span class="steam-dot" title="On tilt">🔥</span>' : ''}</div>
      <div class="plate"><div class="nick">${esc(p.nick)}${i === HERO ? badge : ''}</div>
      <div class="stack">${money(stack)}</div>${read}</div>${i === HERO ? '' : `<div class="tip ${y < 45 ? 'below' : ''}">${tendencies(p).map((t) => `<div>${esc(t)}</div>`).join('')}<div>${esc(readLine(i))}</div><div class="tip-more">Click for details</div></div>`}</div>`;
    if (isBtn) {
      const dx = 50 + 34 * Math.cos(ang + 0.2);
      const dy = 49 + 26.5 * Math.sin(ang + 0.2);
      seatsHtml += `<div class="dealer" style="left:${dx}%;top:${dy}%">D</div>`;
    }
    // Chips / last action, drawn between the seat and the middle.
    const bx = 50 + 27 * Math.cos(ang);
    const by = 49 + 20 * Math.sin(ang);
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
  $('news').textContent = drill ? (sess.hand.over ? '' : `Drill: ${DRILLS[drill.cat].what}. ${heroStory()}`) : sess.news.join('  ');
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

function presets(L, s) {
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
  out.push(['All-in', L.maxTo]);
  return out.map(([l, v]) => [l, Math.max(L.minTo, Math.min(L.maxTo, Math.round(v)))]);
}

function renderActions() {
  const el = $('actions');
  const st = sess.status();
  const h = sess.hand;
  if (st === 'hero') {
    const L = sess.heroOptions();
    const s = h.state;
    if (!(raiseTo >= L.minTo && raiseTo <= L.maxTo)) raiseTo = presets(L, s)[1]?.[1] ?? L.minTo;
    const verb = s.currentBet === 0 ? 'Bet' : 'Raise to';
    const pre = L.canRaise ? presets(L, s).map(([l, v]) => `<button data-to="${v}" title="$${v}">${l}</button>`).join('') : '';
    const need = L.callAmt ? Math.round((100 * L.callAmt) / (L.pot + L.callAmt)) : 0;
    const sizeNote = (to) => (s.currentBet > 0 ? `${(to / s.currentBet).toFixed(1)}× the bet` : `${Math.round((100 * to) / Math.max(1, L.pot))}% of the pot`);
    el.innerHTML = `
      ${L.canRaise ? `<div class="act-row size presets">${pre}
        <span class="dollar">$</span><input type="number" id="a-num" aria-label="Raise amount" min="${L.minTo}" max="${L.maxTo}" value="${raiseTo}">
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
    el.innerHTML = `<div class="hint" style="padding:18px 0">${sess.heroInHand() ? 'Waiting for the other players…' : 'You folded. Playing the hand out…'}</div>`;
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
    </details></div>`;
}

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
  $('toast-open').onclick = () => openSide('coach');
}

function openSide(tab) {
  document.body.classList.remove('side-closed');
  if (tab) showTab(tab);
}
function showTab(tab) {
  $('tab-coach').classList.toggle('on', tab === 'coach');
  $('tab-log').classList.toggle('on', tab === 'log');
  $('feedback').classList.toggle('hidden', tab !== 'coach');
  $('log').classList.toggle('hidden', tab !== 'log');
  if (tab === 'log') $('log').scrollTop = $('log').scrollHeight;
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
  renderLog();
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
  if (drill) return nextSpot();
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

function settingsModal(first) {
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  openModal(`
    <h1>${first ? 'Live Low-Stakes Trainer' : 'Settings'}</h1>
    <p class="sub">${first ? 'An eight-handed casino cash game against the players you actually meet at $2/$3 and $3/$5. Every decision is scored by how much money it makes against these opponents. Plays that a solver would approve still get flagged when they lose money here.' : 'Game changes start a new session.'}</p>
    <h3>Game</h3>
    <div class="form-row"><label>Mode</label><select id="s-mode">${opt('casino', 'Casino table', settings.mode)}${opt('home', 'Home game: you pick the stakes and the players', settings.mode)}</select></div>
    <div id="home-fields">
      <div class="form-row"><label>Blinds ($)</label><input id="h-sb" type="number" min="1" step="1" value="${settings.home.sb}"><span>/</span><input id="h-bb" type="number" min="1" step="1" value="${settings.home.bb}"></div>
      <div class="form-row"><label>Buy-in ($)</label><input id="h-buy" type="number" min="20" step="10" value="${settings.home.buy}"></div>
      <div class="form-row" style="align-items:flex-start"><label>Players<br><small id="h-total"></small></label>
        <div class="home-grid">${HOME_TYPES.map(([t, label]) => `<label>${label}</label><input class="h-count" data-type="${t}" type="number" min="0" max="8" step="1" value="${settings.home.counts[t] || 0}">`).join('')}</div>
      </div>
      <p class="sub">No rake. Everyone rebuys and nobody leaves. You know who is coming, but not which seat is which.</p>
    </div>
    <div id="casino-fields">
    <div class="form-row"><label>Stakes</label><select id="s-game">${Object.keys(GAMES).map((g) => opt(g, '$' + g.replace('/', '/$'), settings.game)).join('')}</select></div>
    <div class="form-row"><label>Maximum buy-in ($)</label><input id="s-buy" type="number" min="60" step="20" value="${settings.maxBuy}"></div>
    <div class="form-row"><label>Rake</label><select id="s-rake">${Object.entries(RAKES).map(([k, r]) => opt(k, r.label, settings.rake)).join('')}</select></div>
    <div class="form-row"><label>Table</label><select id="s-table">${Object.entries(TABLES).map(([k, t]) => opt(k, t.label, settings.table)).join('')}</select></div>
    </div>
    <h3>Training</h3>
    <div class="form-row"><label>Feedback</label><select id="s-fb">${opt('now', 'Right after each decision', settings.feedback)}${opt('after', 'When the hand is over', settings.feedback)}</select></div>
    <div class="form-row"><label>Skip junk hands (bottom 15%)</label><input id="s-skip" type="checkbox" ${settings.skipJunk ? 'checked' : ''}></div>
    <div class="form-row"><label>Show coach's reads on seats</label><input id="s-reads" type="checkbox" ${settings.reads ? 'checked' : ''}></div>
    <div class="form-row"><label>Opponent speed</label><select id="s-speed">${opt('800', 'Slow', String(settings.speed))}${opt('450', 'Normal', String(settings.speed))}${opt('150', 'Fast', String(settings.speed))}</select></div>
    ${first ? '<p class="sub">Click any seat to see what you have observed about that player. Keys: F fold, C check/call, R bet/raise, Space next hand.</p>' : ''}
    <div class="modal-actions">
      ${first ? '' : '<button id="s-close">Close</button>'}
      <button class="primary" id="s-start">${first ? 'Deal me in' : 'Start new session'}</button>
    </div>`);
  const read = () => {
    settings.feedback = $('s-fb').value;
    settings.reads = $('s-reads').checked;
    settings.skipJunk = $('s-skip').checked;
    if (sess) sess.skipBelow = settings.skipJunk ? 0.15 : 0;
    settings.speed = +$('s-speed').value;
  };
  const homeTotal = () => [...document.querySelectorAll('.h-count')].reduce((a, el) => a + Math.max(0, Math.floor(+el.value || 0)), 0);
  const syncMode = () => {
    const home = $('s-mode').value === 'home';
    $('home-fields').classList.toggle('hidden', !home);
    $('casino-fields').classList.toggle('hidden', home);
    const n = homeTotal();
    $('h-total').textContent = `${n} opponent${n === 1 ? '' : 's'} (1 to 8)`;
    $('h-total').style.color = n >= 1 && n <= 8 ? '' : 'var(--bad)';
  };
  $('s-mode').onchange = syncMode;
  document.querySelectorAll('.h-count').forEach((el) => (el.oninput = syncMode));
  syncMode();
  $('s-game').onchange = () => {
    $('s-buy').value = GAMES[$('s-game').value].maxBuy;
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
  if (!first) {
    $('s-close').onclick = () => {
      read();
      saveSettings();
      closeModal();
      render();
    };
  }
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
        .map((sd) => `<div class="sd">Hand ${sd.hand}: showed ${cardsInline(sd.cards)} on ${cardsInline(sd.board)} ${sd.won ? '(won)' : '(lost)'}<div class="line">${esc(sd.line)}</div></div>`)
        .join('')
    : '<div class="empty">No showdowns seen yet.</div>';
  openModal(`
    <div class="p-head"><div class="big-avatar">${p.icon}</div><div><h1>${esc(p.nick)} ${p.steaming ? '<span class="badge steam">on tilt</span>' : ''}</h1>
    <p class="sub" style="margin:0">${esc(p.look)}. Stack ${money(p.stack)}.</p></div></div>
    <h3>What you have seen</h3>
    <div class="kv">
      <div><small>Hands watched</small><b>${n.hands}</b></div>
      <div><small>Put money in</small><b>${n.hands ? Math.round((100 * n.vpip) / n.hands) + '%' : '–'}</b></div>
      <div><small>Raised preflop</small><b>${n.hands ? Math.round((100 * n.pfr) / n.hands) + '%' : '–'}</b></div>
      <div><small>Showdowns</small><b>${n.showdowns.length}</b></div>
    </div>
    ${sds}
    <h3>Coach's read</h3>
    <p class="sub">What a sharp observer could conclude from the look, the betting and the showdowns so far. This is the read your decisions are judged against.</p>
    <div class="bars">${bars}</div>
    <p class="sub" style="margin-top:10px">${esc(r.ranked[0].name)}: ${esc(PROFILES[r.ranked[0].id].blurb)}</p>
    <div id="p-truth"></div>
    <div class="modal-actions"><button id="p-reveal">Reveal true style (spoiler)</button><button class="primary" id="p-close">Close</button></div>`);
  $('p-close').onclick = closeModal;
  $('p-reveal').onclick = () => {
    $('p-truth').innerHTML = `<p class="spoiler"><b>Actually: ${esc(PROFILES[p.type].name)}${p.tilt ? ', currently on tilt' : ''}.</b> ${esc(PROFILES[p.type].blurb)}</p>`;
  };
}

function playersModal(type = 'station') {
  const draft = JSON.parse(JSON.stringify(tuning)); // edited copy; saved only on "Save"
  const draw = (t) => {
    const base = baseDef(t);
    const vals = draft[t] || {};
    const changed = Object.keys(vals).length;
    const rows = CONTROLS.map((c) => {
      const def = c.get(base);
      const v = vals[c.key] !== undefined ? vals[c.key] : def;
      const min = Math.min(c.min, def);
      const max = Math.max(c.max, def);
      return `${c.group ? `<h3>${c.group}</h3>` : ''}
        <div class="tune ${vals[c.key] !== undefined ? 'changed' : ''}" data-key="${c.key}">
          <div class="tune-top"><label>${c.label}</label><b class="tune-val">${esc(c.fmt(v))}</b></div>
          <input type="range" min="${min}" max="${max}" step="${c.step}" value="${v}" aria-label="${c.label}">
          <div class="tune-hint">${esc(c.hint)} <span class="tune-def">Shipped: ${esc(c.fmt(def))}.</span></div>
        </div>`;
    }).join('');
    openModal(`
      <h1>Players</h1>
      <p class="sub">Change how each type of opponent plays. These are the assumptions every verdict rests on, so if a type does not match the players in your game, fix it here. Changes are saved in this browser and take effect in a new session.</p>
      <div class="form-row"><label>Player type</label><select id="t-type">${TYPE_IDS.map((id) => `<option value="${id}" ${id === t ? 'selected' : ''}>${esc(PROFILES[id].name)}${draft[id] && Object.keys(draft[id]).length ? ' (changed)' : ''}</option>`).join('')}</select></div>
      <p class="sub">${esc(PROFILES[t].blurb)}</p>
      ${rows}
      <div class="modal-actions">
        <button id="t-reset" ${changed ? '' : 'disabled'}>Reset this type</button>
        <button id="t-reset-all" ${Object.values(draft).some((x) => Object.keys(x).length) ? '' : 'disabled'}>Reset all types</button>
        <span style="flex:1"></span>
        <button id="t-cancel">Cancel</button>
        <button class="primary" id="t-save">Save and start new session</button>
      </div>`);
    $('t-type').onchange = (e) => draw(e.target.value);
    $('modal-box').querySelectorAll('.tune').forEach((row) => {
      const c = CONTROLS.find((x) => x.key === row.dataset.key);
      row.querySelector('input').oninput = (e) => {
        const v = +e.target.value;
        const def = c.get(base);
        draft[t] = draft[t] || {};
        if (Math.abs(v - def) < c.step / 2) delete draft[t][c.key];
        else draft[t][c.key] = v;
        row.classList.toggle('changed', draft[t][c.key] !== undefined);
        row.querySelector('.tune-val').textContent = c.fmt(v);
        $('t-reset').disabled = !Object.keys(draft[t]).length;
        $('t-reset-all').disabled = !Object.values(draft).some((x) => Object.keys(x).length);
      };
    });
    $('t-reset').onclick = () => {
      delete draft[t];
      draw(t);
    };
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
  const sessionLeaks = rev.list.length
    ? rev.list
        .map(
          (c, i) => `<div class="leak"><div class="leak-head" data-leak="${i}"><span>${esc(CATEGORIES[c.category] || c.category)}</span><span>${c.count}× · ${money(c.loss)}</span></div>
          <div class="leak-body hidden" id="leak-${i}" style="margin-top:8px">${c.examples.slice(0, 4).map((d) => fbCard(d)).join('')}</div></div>`,
        )
        .join('')
    : '<div class="empty">Nothing flagged yet. Play some hands.</div>';
  const all = Object.entries(leaks).sort((x, y) => y[1].loss - x[1].loss);
  const allHtml = all.length
    ? all
        .map(([cat, e]) => `<div class="leak"><div class="leak-head" style="cursor:default"><span>${esc(CATEGORIES[cat] || cat)}</span><span>${e.count}× · ${money(e.loss)} <button class="drill-btn" data-cat="${cat}">Drill this</button></span></div></div>`)
        .join('')
    : '<div class="empty">No leaks tracked yet. They build up here as you play, across sessions.</div>';
  openModal(`
    <h1>Leak review</h1>
    <p class="sub">Where your money is going, biggest leak first. The cost is the average amount each flagged play gives up compared with the best option, not what you happened to win or lose on the day.</p>
    <div class="kv">
      <div><small>Hands</small><b>${rev.hands}</b></div>
      <div><small>Result</small><b>${signed(rev.net)}</b></div>
      <div><small>Decisions judged</small><b>${rev.judged}</b></div>
      <div><small>Cost of mistakes</small><b>${money(rev.lost)}</b></div>
    </div>
    <h3>Your biggest leaks, all sessions</h3>
    <p class="sub">Pick one to drill: the trainer deals you only that kind of spot, one after another.</p>
    ${allHtml}
    <h3>This session, with examples</h3>${sessionLeaks}
    <div class="modal-actions"><button class="primary" id="r-close">Close</button></div>`);
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
$('btn-side').onclick = () => document.body.classList.toggle('side-closed');
$('side-close').onclick = () => document.body.classList.add('side-closed');
$('tab-coach').onclick = () => showTab('coach');
$('tab-log').onclick = () => showTab('log');
if (window.innerWidth < 1180) document.body.classList.add('side-closed');
$('btn-sim').onclick = () => {
  $('btn-sim').classList.remove('fresh'); // stop drawing attention once it has been used
  quickSim();
};
$('btn-players').onclick = () => playersModal();
$('btn-review').onclick = () => sess && reviewModal();
$('btn-settings').onclick = () => settingsModal(false);

// Handle for debugging from the browser console.
window.trainer = { get session() { return sess; }, settings, act, nextHand };

// http://localhost:5173/?demo=7 skips the set-up screen and jumps to a mid-session decision
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
else settingsModal(true);
