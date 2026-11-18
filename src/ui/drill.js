// Drill: home, a spot, the reveal and lesson, the summary (the approved Drill spec and DESIGN's mock-up).
// Spots come from the offline bank (src/drill/bank.json), every answer judged in advance, so the verdict is
// instant and the same for everyone. The page never re-judges a spot. Opened full-screen over the table,
// which stays parked underneath.

import { spotCard } from '../drill/card.js';
import { points, band, streakAfter, buildRun, runTotals, honestLine, dailyLine, dailySeed, isoDay, recordRun, loadGame, saveGame, runBadges, MAX_SCORE, RUN_LEN, DOT } from '../drill/game.js';
import { loadLearn, saveLearn, answer as learnAnswer, level, openTiers, nextPractice, newSession, isDue, place, MASTER_TYPES } from '../drill/learn.js';

const LOOKS = ['cap', 'golf', 'hoodie', 'loud', 'party', 'button', 'shades', 'cardigan', 'jersey', 'newbie', 'watch', 'plain'];
const STATE_LABEL = { Frontier: 'Frontier', Learning: 'Learning', Solid: 'Solid', Mastered: 'Mastered', Rusty: 'Rusty', Locked: 'Locked', New: 'New' };
const NEXT_LINE = {
  New: 'Six answers to get started.',
  Frontier: 'Six answers, then 60% right, to reach Learning.',
  Learning: 'Six of the last eight right, with a harder spot among them, for Solid.',
  Solid: 'Nine of ten right, three tricky ones, on two different days, for Mastered.',
  Mastered: 'Kept fresh with a review every few weeks.',
  Rusty: 'A review is overdue: one right answer brings it back.',
};
const BOARD_NAMES = { t1: 'Tier 1', t12: 'Tiers 1–2', t13: 'Tiers 1–3' };
const VERB = { fold: 'folding', call: 'calling', check: 'checking', limp: 'limping', raise: 'raising', bet: 'betting' };
const BADGE_NAMES = { firstRun: 'First run', cleanRun: 'Clean run', noBigLeaks: 'No big leaks', solidRun: 'Solid run', sharpRun: 'Sharp run', hardOnes: 'Hard ones right', tier1: 'Tier 1 cleared', tier2: 'Tier 2 cleared', tier3: 'Tier 3 cleared' };

const fmtBb = (x) => `${(Math.round(x * 10) / 10).toString().replace(/\.0$/, '')}bb`;
const num = (n) => n.toLocaleString('en-US');
const lookFor = (nick) => {
  let h = 0;
  for (const ch of String(nick)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LOOKS[h % LOOKS.length];
};

export function createDrill(env) {
  // env: { el, cardHtml, esc, toast, onExit, onDispute, storage }
  const { el, cardHtml, esc } = env;
  const mini = (ids) => (env.cardsInline ? env.cardsInline(ids) : ids.map((x) => cardHtml(x)).join(''));
  const storage = env.storage;
  let bank = null;
  let byId = {};
  let G = loadGame(storage);
  let LS = loadLearn(storage);
  let R = null; // the stretch in play
  let view = 'home';
  let sessionStarted = false;

  // another tab saved Drill progress: re-read it, so two tabs never overwrite each other's review boxes (DESIGN)
  try {
    window.addEventListener('storage', (ev) => {
      if (ev.key === 'trainer-drill-learn') LS = loadLearn(storage);
      if (ev.key === 'trainer-drill-game') G = loadGame(storage);
    });
  } catch {
    // no window (tests)
  }
  const save = () => {
    saveGame(G, storage);
    saveLearn(LS, storage);
  };
  const skills = () => (bank ? bank.skills : {});
  const shippedTier1 = () => Object.keys(skills()).filter((c) => skills()[c].tier === 1);
  const openSkills = () => {
    const t = openTiers(LS, skills());
    return Object.keys(skills()).filter((c) => t.has(skills()[c].tier));
  };
  const today = () => isoDay();
  const todayStats = () => (G.today && G.today.date === today() ? G.today : { date: today(), right: 0, answered: 0, bb: 0 });

  async function load() {
    if (bank) return bank;
    // ?drillbank=dev loads a local development bank (never shipped)
    const dev = new URLSearchParams(location.search).get('drillbank') === 'dev';
    const res = await fetch(new URL(dev ? '../drill/bank.dev.json' : '../drill/bank.json', import.meta.url));
    if (!res.ok) throw new Error('no bank');
    bank = await res.json();
    byId = Object.fromEntries(bank.spots.map((s) => [s.id, s]));
    return bank;
  }

  // ---------------- home ----------------
  function home() {
    view = 'home';
    R = null;
    const first = !LS.placedAt && !Object.keys(LS.skills).length && !G.runs;
    const cur = G.current && G.current.bankVersion === bank.version ? G.current : null;
    const d = G.daily[today()];
    const dailyBody = d
      ? `<div class="kv"><span><b>${num(d.score)}</b>Today’s score</span></div><span class="dots" aria-label="Today’s ten: ${esc(d.dots)}">${[...d.dots].map((c) => `<i class="dot ${c === DOT.best ? 'best' : c === DOT.fine ? 'fine' : 'wrong'}"></i>`).join('')}</span><div class="row"><button type="button" class="small" id="dh-copy">Copy result</button><button type="button" class="small quiet" id="dh-daily">Play again (practice)</button></div>`
      : `<div class="kv"><span><b>10</b>spots</span><span><b>Tier 1</b>for everyone</span></div><div class="row"><button type="button" class="primary" id="dh-daily">Play today’s 10</button></div>`;
    const pb = G.boards.t1;
    const due = openSkills().filter((c) => LS.skills[c] && isDue(LS.skills[c], LS, Date.now())).length;
    const ts = todayStats();
    const canDaily = !!buildRun(dailySeed(today(), bank.version), bank.spots, shippedTier1());
    const canRun = !!buildRun('probe', bank.spots, openSkills());
    el.innerHTML = `<div class="dr-wrap">
      <div class="dr-top"><span class="dr-crumb">Drill</span><span class="grow"></span><button type="button" class="small quiet" id="dh-table">Back to table</button></div>
      <div class="dr-head"><h1>Drill</h1><p>One decision at a time, from a bank of spots with clear answers. Practise at your own pace, or play a scored run of ten.</p></div>
      ${cur ? `<div class="dr-resume"><p><b>Resume run · ${cur.answers.length}/${RUN_LEN}</b><small>${cur.kind === 'daily' ? 'Daily 10' : `Scored run · ${BOARD_NAMES[cur.board] || 'Tier 1'}`} · ${num(cur.answers.reduce((a, x) => a + points(x.family, x.difficulty), 0))} points so far</small></p><button type="button" class="primary small" id="dh-resume">Resume</button><button type="button" class="quiet small" id="dh-discard">Discard</button></div>` : ''}
      ${first ? `<div class="dr-place"><div><p class="dr-label signal">First visit</p><h2>Find where you start</h2><p>${placeCount() === 12 ? 'Twelve' : placeCount()} spots from the Tier 1 skills, no points, about ${Math.max(2, Math.round(placeCount() / 2.5))} minutes. Your answers set each skill’s starting level.</p></div><div class="dr-place-acts"><button type="button" class="primary" id="dh-place">Start placement</button><button type="button" class="quiet" id="dh-skip">Skip: start at the beginning</button></div></div>` : ''}
      <div class="dr-modes">
        <div class="dr-mode daily"><p class="dr-label signal">Daily 10 · ${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</p><h2>The same ten for everyone</h2><p>One set a day. Your first finish is the day’s score; replays are practice. Miss a day and nothing changes.</p>${canDaily ? dailyBody : '<p class="dr-thin">Not enough spots yet for today’s ten.</p>'}</div>
        <div class="dr-mode"><p class="dr-label">Scored run</p><h2>Ten spots, scored</h2><p>Three easy, four standard, three tricky. Best answer 100, plus 25 or 50 on harder spots; a close second earns 50.</p>
          <span class="seg" role="group" aria-label="Board"><button type="button" class="on">Tier 1</button><button type="button" disabled title="Opens with Tier 2">Tiers 1–2</button><button type="button" disabled title="Opens with Tier 3">Tiers 1–3</button></span>
          <div class="kv"><span><b>${pb ? num(pb.best) : '—'}</b>Your best</span><span><b>${num(MAX_SCORE)}</b>Maximum</span></div><div class="row"><button type="button" class="primary" id="dh-run"${canRun ? '' : ' disabled'}>Start a run</button></div></div>
        <div class="dr-mode"><p class="dr-label">Practice</p><h2>At your own pace</h2><p>Your due reviews first, then the skills you’re learning. No points: a streak and what you gave up today.</p>
          <div class="kv"><span><b>${due}</b>Reviews due</span><span><b>${ts.answered ? `${ts.right}/${ts.answered}` : '—'}</b>Today</span></div><div class="row"><button type="button" class="primary" id="dh-prac">Practise</button></div></div>
      </div>
      ${treeHtml()}
    </div>`;
    const on = (id, f) => el.querySelector('#' + id) && (el.querySelector('#' + id).onclick = f);
    on('dh-table', () => env.onExit());
    on('dh-daily', () => start(d ? 'replay' : 'daily'));
    on('dh-run', () => start('run'));
    on('dh-prac', () => start('practice'));
    on('dh-place', () => start('placement'));
    on('dh-skip', () => {
      LS.placedAt = Date.now();
      save();
      env.toast('Every Tier 1 skill starts at the beginning.');
      home();
    });
    on('dh-copy', () => copy(dailyLine(today(), { score: d.score, dots: d.dots })));
    on('dh-resume', () => resume(cur));
    on('dh-discard', () => {
      G.current = null;
      save();
      env.toast('Run discarded. It isn’t recorded.');
      home();
    });
    el.querySelectorAll('[data-skill]').forEach((b) => (b.onclick = () => skillSheet(b.dataset.skill)));
    el.scrollTop = 0;
  }

  function treeHtml() {
    const t = openTiers(LS, skills());
    const tiers = [...new Set(Object.values(skills()).map((s) => s.tier))].sort();
    return `<div class="dr-tree"><h2>Skills</h2><p>Ordered by how much they cost at a live table. Tap a skill for its rule and to practise it.</p>${tiers
      .map((n) => {
        const open = t.has(n);
        const codes = Object.keys(skills()).filter((c) => skills()[c].tier === n);
        const head = n === 4 ? 'Extra · practice only' : n === 1 ? 'Tier 1 · The big four' : `Tier ${n}`;
        const sub = n === 1 ? 'Open from the start' : open ? 'Open' : n === 2 ? 'Opens when two Tier 1 skills are Solid' : n === 3 ? 'Opens when three Tier 2 skills are Solid' : 'Not in scored runs until the model is re-checked';
        return `<div class="dr-tier${open ? '' : ' locked'}"><div class="dr-tier-h"><h3>${head}</h3><span>${sub}</span></div><div class="dr-nodes">${codes
          .map((c) => {
            const lv = open ? (LS.skills[c] ? level(LS, c) : 'New') : n === 4 ? 'Practice only' : 'Locked';
            const sk = LS.skills[c];
            const box = sk ? sk.box : 0;
            const due = sk && isDue(sk, LS, Date.now());
            return `<button type="button" class="dr-node s-${lv.toLowerCase().replace(' ', '-')}" data-skill="${c}"${open ? '' : ' disabled'}><span class="code">${c}</span><span class="nm">${esc(skills()[c].name)}</span><span class="st">${STATE_LABEL[lv] || lv}${open ? ` <span class="boxes" aria-label="Review box ${box} of 5">${[1, 2, 3, 4, 5].map((b) => `<i class="${b <= box ? 'on' : ''}"></i>`).join('')}</span>` : ''}${due ? ' <span class="due">Review due</span>' : ''}</span></button>`;
          })
          .join('')}</div></div>`;
      })
      .join('')}<p class="dr-more-skills">More skills open as their spots are checked.</p></div>`;
  }

  // what the next level needs, as learn.js counts it (DESIGN review 2)
  function nextLine(code, lv) {
    const n = LS.skills[code] ? LS.skills[code].answers.length : 0;
    if (lv === 'New') return 'Six answers to get started.';
    if (lv === 'Frontier') return n < 6 ? `${6 - n} more answer${6 - n === 1 ? '' : 's'}, then 5 of your last 8 right, for Learning.` : '5 of your last 8 right, with no miss in your last 3, for Learning.';
    if (lv === 'Learning') return '6 of your last 8 right, including a harder spot, against 2 kinds of player, with no miss in your last 3, for Solid.';
    if (lv === 'Solid') return `9 of your last 10 right, three tricky ones, ${MASTER_TYPES[code] ? 'against every kind of player in these spots' : 'against 3 kinds of player'}, on two different days, for Mastered.`;
    return NEXT_LINE[lv] || '';
  }

  function skillSheet(code) {
    const sk = LS.skills[code];
    const lv = sk ? level(LS, code) : 'New';
    const recent = sk ? sk.answers.slice(-10) : [];
    const box = document.createElement('div');
    box.className = 'dr-sheet-bg';
    box.innerHTML = `<div class="dr-sheet" role="dialog" aria-modal="true" aria-label="${esc(skills()[code].name)}"><p class="dr-label">${code} · ${STATE_LABEL[lv] || lv}</p><h3>${esc(skills()[code].name)}</h3><p class="rule">${esc(skills()[code].rule)}</p>
      <div class="meta"><span><b>${recent.length ? `<span class="dots">${recent.map((x) => `<i class="dot ${x.family}"></i>`).join('')}</span>` : '<span class="dr-none">Not played yet</span>'}</b>Recent answers</span></div>
      <p class="dr-next">${nextLine(code, lv)}</p>
      <div class="acts"><button type="button" class="quiet" id="ds-close">Close</button><button type="button" class="primary" id="ds-prac">Practise this skill</button></div></div>`;
    el.appendChild(box);
    const close = () => box.remove();
    box.onclick = (e) => e.target === box && close();
    box.querySelector('#ds-close').onclick = close;
    box.querySelector('#ds-prac').onclick = () => {
      close();
      start('practice', code);
    };
    box.querySelector('#ds-prac').focus();
  }

  // ---------------- a stretch ----------------
  const scored = () => R && (R.kind === 'daily' || R.kind === 'run' || R.kind === 'replay');
  function start(kind, pin = null) {
    if (!sessionStarted) {
      newSession(LS);
      sessionStarted = true;
    }
    R = { kind, pin, i: 0, answers: [], streak: 0, bestStreak: 0, bb: 0, score: 0, wrongRow: 0, nudged: false, revealed: false, date: today(), board: 't1' };
    if (kind === 'daily' || kind === 'replay') {
      R.seed = dailySeed(today(), bank.version);
      R.ids = buildRun(R.seed, bank.spots, shippedTier1());
      R.slots = R.ids && R.ids.slots ? [...R.ids.slots] : null;
    } else if (kind === 'run') {
      R.seed = `run|${Date.now()}|${Math.random()}`;
      R.ids = buildRun(R.seed, bank.spots, openSkills());
      R.slots = R.ids && R.ids.slots ? [...R.ids.slots] : null;
    } else if (kind === 'placement') {
      R.ids = placementIds();
    }
    if ((R.ids === null || (R.ids && !R.ids.length)) && kind !== 'practice') {
      env.toast('Not enough spots in the bank for that yet.');
      return home();
    }
    if (kind === 'practice') R.cur = nextPractice(LS, bank.spots, skills(), { pin });
    if (kind === 'practice' && !R.cur) {
      env.toast('No spots to practise yet.');
      return home();
    }
    view = 'play';
    renderSpot();
  }
  function resume(cur) {
    R = { kind: cur.kind, i: cur.answers.length, ids: cur.ids, slots: cur.slots || null, seed: cur.seed, answers: cur.answers.slice(), date: cur.date, board: cur.board, streak: 0, bestStreak: 0, bb: 0, score: 0, wrongRow: 0, nudged: false, revealed: false };
    for (const a of R.answers) {
      R.streak = streakAfter(R.streak, a.family);
      R.bestStreak = Math.max(R.bestStreak, R.streak);
      R.bb += a.family === 'best' ? 0 : a.costBb;
      R.score += points(a.family, a.difficulty);
    }
    view = 'play';
    renderSpot();
  }
  const placeCount = () => placementIds().length;
  // 12 spots, 3 from each Tier 1 skill at difficulty 1-2
  function placementIds() {
    const out = [];
    let k = 0;
    for (const c of shippedTier1()) {
      const pool = bank.spots.filter((s) => s.skill === c && s.difficulty <= 2);
      for (let j = 0; j < 3 && pool.length; j++) out.push(pool.splice((k++ * 7919) % pool.length, 1)[0].id);
    }
    return out;
  }
  const curSpot = () => (R.kind === 'practice' ? R.cur.spot : byId[R.ids[R.i]]);

  function hudHtml(tick) {
    if (scored()) {
      const dots = R.ids.map((_, i) => {
        const a = R.answers[i];
        return `<i class="dot${a ? ' ' + a.family : ''}${i === R.i && !R.revealed ? ' now' : ''}"></i>`;
      }).join('');
      return `<span class="lbl">${R.kind === 'run' ? 'Scored run' : R.kind === 'replay' ? 'Daily 10 · practice' : 'Daily 10'}<b>${Math.min(R.i + 1, RUN_LEN)} / ${RUN_LEN}</b></span><span class="grow"><span class="dots" aria-hidden="true">${dots}</span></span>
        <span class="fig">Score<b id="dr-score">${num(R.score)}${tick != null ? `<span class="tick${tick ? '' : ' zero'}">+${tick}</span>` : ''}</b></span><span class="fig">Streak<b>${R.streak}</b></span><span class="fig">Gave up<b class="${R.bb > 0 ? 'neg' : ''}">${fmtBb(R.bb)}</b></span>`;
    }
    if (R.kind === 'placement') return `<span class="lbl">Placement<b>${Math.min(R.i + 1, R.ids.length)} / ${R.ids.length}</b></span><span class="grow"></span><span class="fig">No points<b class="quiet">finding your level</b></span>`;
    const ts = todayStats();
    return `<span class="lbl">Practice<b>${R.pin ? esc(skills()[R.pin].name) : 'Your reviews and skills'}</b></span><span class="grow"></span><span class="fig">Streak<b>${R.streak}</b></span><span class="fig">Today<b>${ts.right}/${ts.answered}</b></span><span class="fig">Gave up today<b class="${ts.bb > 0 ? 'neg' : ''}">${fmtBb(ts.bb)}</b></span>`;
  }
  const hud = (tick) => {
    el.querySelector('#dr-hud').innerHTML = hudHtml(tick) + '<button type="button" class="small quiet" id="dr-exit">Exit</button>';
    el.querySelector('#dr-exit').onclick = exitStretch;
  };
  const crumb = () => ({ daily: 'Daily 10', replay: 'Daily 10 · practice', run: `Scored run · ${BOARD_NAMES[R.board]}`, practice: 'Practice', placement: 'Placement' })[R.kind];

  function optionLabel(o, c) {
    if (o.type === 'fold') return ['Fold', ''];
    if (o.type === 'check') return ['Check', ''];
    if (o.type === 'call') return [c.street === 'Preflop' && !c.lines[0].text.match(/raise/) ? 'Limp' : 'Call', `$${c.toCall}`];
    if (c.toCall > 0) return ['Raise', `to $${o.to}`];
    return ['Bet', `$${o.to}`];
  }

  function renderSpot() {
    R.revealed = false;
    const e = curSpot();
    const c = spotCard(e.spot, e.reads);
    const why = R.kind === 'practice' ? { twin: 'Twin of a miss', pair: 'Look-alike', review: 'Review due', learning: LS.skills[e.skill] ? 'Learning' : 'New', upkeep: 'Keeping it fresh' }[R.cur.why] : '';
    // on a phone every earlier street folds behind "Show the whole hand" on a postflop spot (DESIGN must-fix 1)
    const fold = c.lines.length > 1 && c.street !== 'Preflop';
    el.innerHTML = `<div class="dr-wrap">
      <div class="dr-top"><span class="dr-crumb">Drill <small>· ${crumb()}</small></span><span class="grow"></span></div>
      <div class="dr-hud" id="dr-hud"></div>
      <div class="dr-spot">
        <div class="dr-story-wrap">
          <div class="dr-felt${c.boardIds.length ? '' : ' noboard'}"><span class="street">${c.street}</span>${why ? `<span class="why"><span class="pill">${why}</span></span>` : ''}
            <div class="board">${c.boardIds.length ? c.boardIds.map((x) => cardHtml(x)).join('') : '<span class="none">No board yet</span>'}</div>
            <div class="money"><span class="pot"><small>Pot</small>$${c.pot}</span>${c.toCall ? `<span class="pot call"><small>To call</small>$${c.toCall}</span>` : ''}</div>
            <div class="me"><span class="cards">${c.holeIds.map((x) => cardHtml(x)).join('')}</span><span class="who"><b>You · ${esc(c.position)}</b><span class="mono">$${c.stack} · ${c.stackBb}bb</span><span>$${c.sb}/$${c.bb}</span></span></div>
          </div>
          <div class="dr-story${fold ? ' fold' : ''}" id="dr-story">${fold ? `<div class="more"><button type="button" id="dr-more">Show the whole hand (${c.lines.length - 1} earlier street${c.lines.length - 1 === 1 ? '' : 's'}) ▾</button></div>` : ''}${c.lines.map((l, i) => `<div class="${i === c.lines.length - 1 ? 'last' : ''}"><span>${l.street}</span><p>${l.boardIds.length ? `<em>${mini(l.boardIds)}</em> ` : ''}${esc(l.text)}</p></div>`).join('')}</div>
        </div>
        <div class="dr-side">
          <div class="dr-opps${c.street === 'Preflop' && c.opponents.length >= 3 ? ' compact' : c.opponents.length >= 3 ? ' multi' : ''}">${c.opponents.map((o) => (c.street === 'Preflop' && c.opponents.length >= 3
            ? `<div class="dr-opp row"><svg class="av" viewBox="0 0 48 48" aria-hidden="true"><use href="#av-${lookFor(e.spot.nicks ? e.spot.nicks[o.seat] : o.seat)}"/></svg><span class="rd">${esc(o.label)}</span><span class="sub">${esc(o.pos)}</span><span class="ost">${esc(o.line)}</span></div>`
            : `<div class="dr-opp"><svg class="av" viewBox="0 0 48 48" aria-hidden="true"><use href="#av-${lookFor(e.spot.nicks ? e.spot.nicks[o.seat] : o.seat)}"/></svg><span class="rd">${esc(o.label)} <span class="dr-conf" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="on"></i></span></span><span class="sub">${esc(o.pos)}<span class="str"> · ${o.strength}</span></span><span class="ost">${esc(o.line)}</span></div>`)).join('')}${c.street === 'Preflop' && !c.lines[0].text.match(/limp|raise|call/) ? `<div class="dr-behind">${c.behind} player${c.behind === 1 ? '' : 's'} to act behind you.</div>` : ''}</div>
          <p class="dr-ask">${c.toCall ? `Your decision · $${c.toCall} to call` : 'Checked to you'}</p>
          <div class="dr-opts" id="dr-opts">${e.options.map((o, i) => { const [a, b] = optionLabel(o, c); return `<button type="button" class="dr-opt" data-i="${i}"><kbd>${i + 1}</kbd>${a}${b ? `<small>${b}</small>` : ''}<span class="tag"></span></button>`; }).join('')}</div>
          <div class="dr-lesson" id="dr-lesson" aria-live="polite"></div>
        </div>
      </div></div>`;
    hud();
    if (el.querySelector('#dr-more')) el.querySelector('#dr-more').onclick = () => el.querySelector('#dr-story').classList.remove('fold');
    el.querySelectorAll('.dr-opt').forEach((b) => (b.onclick = () => choose(+b.dataset.i)));
    el.scrollTop = 0;
  }

  function choose(i, review = false) {
    if (R.revealed) return;
    R.revealed = true;
    const e = curSpot();
    const c = spotCard(e.spot, e.reads);
    const o = e.options[i];
    const fam = e.families[o.family];
    const bestFam = Object.keys(e.families).find((k) => e.families[k] === 'best');
    const best = e.options.find((x) => x.family === bestFam);
    const cost = fam === 'best' ? 0 : e.costBb[o.family] || 0;
    const slotD = scored() && R.slots ? R.slots[R.i] : e.difficulty; // a fill-in scores its slot's bonus (GAME)
    const p = scored() ? points(fam, slotD) : null;
    if (!review) {
      const rec = { id: e.id, choice: i, family: fam, difficulty: slotD, trueD: e.difficulty, costBb: cost, bucket: e.costBucket[o.family] || null };
      if (R.kind === 'practice') R.answers.push(rec);
      else R.answers[R.i] = rec;
      R.streak = streakAfter(R.streak, fam);
      R.bestStreak = Math.max(R.bestStreak, R.streak);
      R.wrongRow = fam === 'wrong' ? R.wrongRow + 1 : 0;
      R.bb += cost;
      if (p != null) R.score += p;
      // every answer feeds the skill levels and reviews (placement included)
      learnAnswer(LS, e, fam, Date.now(), { open: openSkills() });
      const ts = todayStats();
      G.today = { date: today(), right: ts.right + (fam === 'wrong' ? 0 : 1), answered: ts.answered + 1, bb: +(ts.bb + cost).toFixed(1) };
      if ((R.kind === 'daily' || R.kind === 'run') && R.answers.length < RUN_LEN) G.current = { kind: R.kind, ids: R.ids, slots: R.slots || null, seed: R.seed, answers: R.answers, date: R.date, board: R.board, bankVersion: bank.version };
      save();
    }
    // the buttons
    const opts = el.querySelector('#dr-opts');
    opts.classList.add('revealed');
    opts.querySelectorAll('.dr-opt').forEach((b, j) => {
      const x = e.options[j];
      const f = e.families[x.family];
      const tag = b.querySelector('.tag');
      b.disabled = true;
      if (f === 'best') {
        b.classList.add('is-best');
        tag.className = 'tag t-best';
        tag.textContent = 'Best';
      } else if (f === 'fine') {
        tag.className = 'tag t-fine';
        tag.textContent = 'Fine';
      } else {
        tag.className = `tag t-${e.costBucket[x.family] || 'medium'}`;
        tag.textContent = `−${fmtBb(e.costBb[x.family] || 0)}`;
      }
      if (j === i) b.classList.add('chosen', `f-${fam}`);
    });
    if (!review) {
      hud(p);
      if (p) el.querySelector('#dr-score').classList.add('bump');
    }
    // the lesson: what was best and what yours cost, the rule, this spot's number
    const [bestWord] = optionLabel(best, c);
    const [mineWord] = optionLabel(o, c);
    const pre = fam === 'best' ? `Right: ${mineWord.toLowerCase()}.` : fam === 'fine' ? `${cost < 3 ? 'Close' : 'Fine here'}: ${bestWord} was best, by about ${fmtBb(cost)}.` : `${bestWord} was best; ${VERB[mineWord.toLowerCase()] || mineWord.toLowerCase()} costs about ${fmtBb(cost)}.`;
    const est = e.estimate[bestFam] || e.estimate[o.family] || Object.values(e.estimate)[0] || '';
    let nudge = '';
    if (!review && scored() && R.wrongRow >= 3 && !R.nudged) {
      R.nudged = true;
      nudge = `<p class="nudge">These are tough. Practise ${esc(skills()[e.skill].name)} first, or keep going.</p>`;
    }
    const last = R.kind !== 'practice' && R.i + 1 >= R.ids.length;
    const L = el.querySelector('#dr-lesson');
    L.className = `dr-lesson on l-${fam}`;
    L.innerHTML = `<p class="pre">${esc(pre)}</p><p class="rule"><em>${e.skill} · ${esc(skills()[e.skill].name)}</em>${esc(skills()[e.skill].rule)}</p>${est ? `<p class="est">${esc(est)}</p>` : ''}${nudge}
      <div class="acts"><button type="button" class="primary" id="dr-next">${review ? 'Back to your score' : last ? 'See your score' : 'Next spot'}<kbd>Space</kbd></button><button type="button" class="quiet small" id="dr-dispute">Disagree?</button></div>`;
    el.querySelector('#dr-next').onclick = review ? () => summary(true) : next;
    el.querySelector('#dr-dispute').onclick = () => dispute(e, o);
    if (L.getBoundingClientRect().bottom > window.innerHeight) L.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function dispute(e, o) {
    const a = R.answers.find((x) => x && x.id === e.id);
    if (a) a.disputed = true;
    env.onDispute({ kind: 'trainer-drill-dispute', v: 1, id: e.id, bankVersion: e.bankVersion, skill: e.skill, chose: o.family, families: e.families, options: e.options, spot: e.spot, reads: e.reads });
  }

  function next() {
    if (R.kind === 'practice') {
      R.cur = nextPractice(LS, bank.spots, skills(), { pin: R.pin });
      save();
      return R.cur ? renderSpot() : home();
    }
    R.i++;
    if (R.i >= R.ids.length) return finish();
    renderSpot();
  }

  function exitStretch() {
    if ((R.kind === 'daily' || R.kind === 'run') && R.answers.length > 0 && R.answers.length < RUN_LEN) env.toast('Run kept. Resume it from Drill, even after a reload.');
    save();
    home();
  }

  // ---------------- the end of a run ----------------
  function finish() {
    if (R.kind === 'placement') return placementDone();
    const t = runTotals(R.answers);
    const lv = Object.fromEntries(Object.keys(skills()).map((c) => [c, LS.skills[c] ? level(LS, c) : 'Frontier']));
    const tiers = Object.fromEntries(Object.entries(skills()).map(([c, s]) => [c, s.tier]));
    let res = { pb: null, badges: [], practice: R.kind === 'replay', totals: t };
    if (R.kind !== 'replay') res = recordRun(G, { kind: R.kind, board: R.board, date: R.date, bankVersion: bank.version, answers: R.answers, earned: runBadges(R.answers, t, { skillStates: lv, tiers }) });
    G.current = null;
    save();
    R.result = res;
    summary();
  }

  function summary(again = false) {
    view = 'summary';
    const t = runTotals(R.answers);
    const res = R.result || { pb: null, badges: [] };
    const misses = R.answers.filter((x) => x.family === 'wrong').length;
    const bandName = band(t.score);
    const bcls = { Sharp: 'b1', Solid: 'b2', 'Getting there': 'b3', 'Worth another look': 'b4' }[bandName];
    const line = dailyLine(R.date, t);
    el.innerHTML = `<div class="dr-wrap">
      <div class="dr-top"><span class="dr-crumb">Drill <small>· ${crumb()}</small></span><span class="grow"></span></div>
      <div class="dr-sum"><div class="dr-score-card"><p class="dr-label">${R.kind === 'run' ? `Scored run · ${BOARD_NAMES[R.board]}` : R.kind === 'daily' ? 'Daily 10' : 'Daily 10 · practice replay'}</p>
        <div class="big" id="dr-big"><span>${again ? num(t.score) : '0'}</span><small>/ ${num(MAX_SCORE)}</small></div><span class="band ${bcls}">${bandName}</span>
        <p class="honest">${esc(honestLine(t))}</p>
        ${res.pb ? `<p class="pb${again ? ' still' : ''}">New best on ${BOARD_NAMES[R.board] || 'the Daily 10'}: <b>${num(t.score)}</b> (was ${num(res.pb.was)})</p>` : ''}
        ${res.badges.length ? `<div class="badges">${res.badges.filter((b) => BADGE_NAMES[b]).map((b) => `<span class="badge"><i>✓</i>${BADGE_NAMES[b]}</span>`).join('')}</div>` : ''}
        ${res.practice ? '<p class="dr-next">A replay is practice: it doesn’t change today’s score.</p>' : ''}</div>
      <div class="dr-side-card"><p class="dr-label">Your ten · tap one to see it again</p><div class="strip">${R.answers.map((x, i) => `<button type="button" data-rv="${i}" aria-label="Spot ${i + 1}: ${x.family}${x.disputed ? ', you disputed this' : ''}"><i class="dot ${x.family}"></i>${i + 1}${x.disputed ? '<small>disputed</small>' : ''}</button>`).join('')}</div>
        ${R.kind === 'daily' ? `<p class="dr-label">Compare with a friend</p><div class="copyline">${esc(line)}</div><div><button type="button" class="small" id="dr-copy">Copy result</button></div>` : ''}
        ${bcls === 'b4' ? '<p class="dr-next">Start with the misses: each one opens with its rule.</p>' : ''}</div></div>
      <div class="dr-sum-acts">${misses ? `<button type="button" class="primary" id="dr-miss">Practise the misses (${misses})</button>` : ''}<button type="button" class="${misses ? '' : 'primary'}" id="dr-again">${R.kind === 'run' ? 'Run again' : 'Start a scored run'}</button><button type="button" class="quiet" id="dr-home">Back to Drill</button></div></div>`;
    if (!again) {
      const target = t.score;
      const t0 = performance.now();
      const big = el.querySelector('#dr-big span');
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        big.textContent = num(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // land on the exact score even if animation frames are throttled (a background tab)
      setTimeout(() => (big.textContent = num(target)), 1000);
    }
    const done = R;
    el.querySelector('#dr-again').onclick = () => start('run');
    el.querySelector('#dr-home').onclick = () => home();
    if (el.querySelector('#dr-copy')) el.querySelector('#dr-copy').onclick = () => copy(line);
    if (el.querySelector('#dr-miss')) {
      el.querySelector('#dr-miss').onclick = () => {
        const skillsMissed = [...new Set(done.answers.filter((x) => x.family === 'wrong').map((x) => byId[x.id].skill))];
        start('practice', skillsMissed.length === 1 ? skillsMissed[0] : null);
      };
    }
    el.querySelectorAll('[data-rv]').forEach((b) => (b.onclick = () => {
      const i = +b.dataset.rv;
      R = done;
      R.i = i;
      renderSpot();
      el.querySelector('#dr-hud').innerHTML = `<span class="lbl">Spot ${i + 1} of ${RUN_LEN}<b>Looking back</b></span><span class="grow"></span><button type="button" class="small" id="dr-back">Back to your score</button>`;
      el.querySelector('#dr-back').onclick = () => summary(true);
      choose(done.answers[i].choice, true);
    }));
    el.scrollTop = 0;
  }

  function placementDone() {
    const right = {};
    for (const a of R.answers) {
      const sk = byId[a.id].skill;
      right[sk] = (right[sk] || 0) + (a.family === 'wrong' ? 0 : 1);
    }
    place(LS, right);
    save();
    el.innerHTML = `<div class="dr-wrap"><div class="dr-top"><span class="dr-crumb">Drill <small>· Placement</small></span><span class="grow"></span></div>
      <div class="dr-sum"><div class="dr-score-card"><p class="dr-label">Placement done</p><h2>Where you start</h2><p class="honest">Each Tier 1 skill starts where your answers put it. Everything can still move, up or down.</p></div>
      <div class="dr-side-card"><div class="dr-where">${shippedTier1().map((c) => { const box = LS.skills[c] ? LS.skills[c].box : 1; return `<div><span>${esc(skills()[c].name)}</span><span class="pill"><b>${right[c] === undefined ? 'New' : level(LS, c)}</b><span class="boxes" aria-label="Review box ${box} of 5">${[1, 2, 3, 4, 5].map((b) => `<i class="${b <= box ? 'on' : ''}"></i>`).join('')}</span></span></div>`; }).join('')}</div></div></div>
      <div class="dr-sum-acts"><button type="button" class="primary" id="dr-prac">Start practising</button><button type="button" class="quiet" id="dr-home">Back to Drill</button></div></div>`;
    el.querySelector('#dr-prac').onclick = () => start('practice');
    el.querySelector('#dr-home').onclick = () => home();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      env.toast('Copied. Nothing is sent anywhere.');
    } catch {
      // the clipboard is blocked: show the line to copy by hand
      const box = document.createElement('div');
      box.className = 'dr-sheet-bg';
      box.innerHTML = `<div class="dr-sheet" role="dialog" aria-modal="true" aria-label="Copy this line"><h3>Copy this line</h3><input class="dr-copyfield" readonly value="${esc(text)}"><div class="acts"><button type="button" class="primary" id="dc-close">Done</button></div></div>`;
      el.appendChild(box);
      const f = box.querySelector('.dr-copyfield');
      f.focus();
      f.select();
      box.onclick = (e) => e.target === box && box.remove();
      box.querySelector('#dc-close').onclick = () => box.remove();
    }
  }

  function key(e) {
    if (view !== 'play' || !R) return false;
    if (/^[1-4]$/.test(e.key) && !R.revealed) {
      const n = curSpot().options.length;
      if (+e.key <= n) {
        choose(+e.key - 1);
        return true;
      }
    } else if (e.key === ' ' && R.revealed && el.querySelector('#dr-next')) {
      e.preventDefault();
      el.querySelector('#dr-next').click();
      return true;
    }
    return false;
  }

  return {
    async open({ pin = null } = {}) {
      await load();
      G = loadGame(storage);
      LS = loadLearn(storage);
      if (pin && skills()[pin]) start('practice', pin);
      else home();
    },
    key,
    // the shipped skill for a leak key, or null ("Drill this leak")
    async skillForLeak(leak) {
      await load();
      return Object.keys(skills()).find((c) => skills()[c].leak === leak) || null;
    },
    hasBank: async () => {
      try {
        await load();
        return bank.spots.length > 0;
      } catch {
        return false;
      }
    },
    // the leak keys with a shipped skill (synchronous once loaded)
    leaks: () => (bank ? Object.values(bank.skills).map((s) => s.leak) : []),
    view: () => view,
  };
}
