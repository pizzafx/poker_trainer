// The Bag (Learn): what a range is, and how one bet changes it (GAME, UX-SIMPLE, STRAT, CEO). Real cards only. The four
// Basics screens (r3d), then the rounds (the-bag-v2 r2final): strong, medium or weak; a caller's two calls; the same calls
// from a careful player; the caller's big river bet; what if they'd checked; the result. Every hand and count is read from
// src/bag/bags.json (scripts/bagbuild.js); nothing is typed in by hand. No judge work here.
// Opened from More → Learn (bag.html) or the Ranges panel's "What is this?" (bag.html?from=ranges).
const q = new URLSearchParams(location.search);
const FROM_RANGES = q.get('from') === 'ranges';
const $ = (s) => document.querySelector(s);
const main = $('#main');
const dock = $('#dock');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

// ---------- the record: stars, plays and the last sets, on this device only ----------
const KEY = 'trainer-ranges-game';
function readRec() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r && r.v === 1 && r.levels) return r;
  } catch {}
  return { v: 1, levels: {}, basicsSeen: false };
}
function writeRec(r) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {}
}
const level = (r) => (r.levels.L1 = r.levels.L1 || { plays: 0, best: 0, last: [] });

// ---------- cards ----------
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const card = (c) => `<span class="card ${c[1]}"><b class="${c[0] === 'T' ? 'ten' : ''}">${c[0] === 'T' ? '10' : c[0]}</b><i>${SUIT[c[1]]}</i></span>`;
const back = () => '<span class="card back"></span>';
const txt = (c) => (c[0] === 'T' ? '10' : c[0]) + SUIT[c[1]];
// ladder row -> the three words a beginner gets. 0 two pair or better, 1 top pair or overpair, 2 weaker pair, 3 draw, 4 nothing
const TIER = (row) => (row === 0 ? 'strong' : row === 1 ? 'medium' : 'weak');
const RANK = { A: 'aces', K: 'kings', Q: 'queens', J: 'jacks', T: 'tens', 9: 'nines', 8: 'eights', 7: 'sevens', 6: 'sixes', 5: 'fives', 4: 'fours', 3: 'threes', 2: 'twos' };

// ---------- data ----------
let DATA = null;
let S = null;
const count = (bag, t) => bag.filter((h) => TIER(h.row) === t).length;
const beats = (bag) => bag.filter((h) => h.beatsYou === 1).length;
const loses = (bag) => bag.filter((h) => h.beatsYou === 0).length;
const hero = () => S.hero.split(' ');
const heroTxt = () => hero().map(txt).join('');
// a first play is always T1; replays rotate the rest, never one of the last three (GAME)
function pickSet() {
  const r = readRec();
  const L = level(r);
  const ids = DATA.sets.map((s) => s.id);
  if (!L.plays) return DATA.sets.find((s) => s.id === DATA.firstPlay) || DATA.sets[0];
  const fresh = ids.filter((i) => i !== DATA.firstPlay && !(L.last || []).includes(i));
  const from = fresh.length ? fresh : ids.filter((i) => i !== (L.last || [])[0]);
  const id = from[Math.floor(Math.random() * from.length)] || ids[0];
  return DATA.sets.find((s) => s.id === id);
}

// ---------- pieces ----------
const STEPS = ['intro', 'q1', 'q2', 'q3', 'end'];
function progress(id) {
  $('#prog').innerHTML = STEPS.includes(id) ? STEPS.map((s, i) => `<i class="${i <= STEPS.indexOf(id) ? 'on' : ''}"></i>`).join('') : '';
}
const tableHtml = () => `<div class="table">
  <div class="board"><span class="lab">THE BOARD</span><span class="cards">${S.board.map(card).join('')}</span></div>
  <div class="you"><span class="lab">YOU</span><span class="cards">${hero().map(card).join('')}</span></div></div>`;
const acts = (list) => `<div class="acts">${list.map(([t, cls]) => `<span class="act ${cls || ''}">${t}</span>`).join('')}</div>`;
const handHtml = (h, down) => `<div class="hand ${down ? 'hidden' : ''}" data-row="${h.row}"><span class="pair flip">${down ? back() + back() : h.cards.map(card).join('')}</span><span class="sb ${TIER(h.row)}"></span></div>`;
const bagHtml = (bag, cap, down) => `<div class="bagwrap"><div class="bagcap">${cap}</div><div class="bag" id="bag">${bag.map((h) => handHtml(h, down)).join('')}</div>
  <div class="key"><span><i class="sb strong"></i>Strong</span><span><i class="sb medium"></i>Medium</span><span><i class="sb weak"></i>Weak</span></div></div>`;
const mixTxt = (bag) => `${count(bag, 'strong')} strong · ${count(bag, 'medium')} medium · ${count(bag, 'weak')} weak`;
// turn a face-down bag face up, strongest first
async function flipUp(bag) {
  const els = [...document.querySelectorAll('#bag .hand')];
  for (let i = 0; i < els.length; i++) {
    const p = els[i].querySelector('.pair');
    p.innerHTML = bag[i].cards.map(card).join('');
    p.classList.add('down');
    void p.offsetWidth;
    p.classList.remove('down');
    els[i].classList.remove('hidden');
    await wait(45);
  }
}
// a screen's buttons wake after 300 ms, so a double tap can't skip a screen, and each answers once
function arm(buttons, onPick) {
  const t0 = performance.now();
  let done = false;
  buttons.forEach((b) => {
    b.onclick = () => {
      if (done || performance.now() - t0 < 300) return;
      done = true;
      onPick(b);
    };
  });
}
const ask = (question, a, b, onPick) => {
  if (Math.random() < 0.5) [a, b] = [b, a]; // shuffled answers (GAME): the order never gives the answer away
  dock.innerHTML = `<div class="q">${question}</div><div class="two"><button class="btn" id="a">${a}</button><button class="btn" id="b">${b}</button></div>`;
  arm([$('#a'), $('#b')], (btn) => onPick(btn.textContent));
};
const say = (html, next, label = 'Next') => {
  dock.innerHTML = `<div class="say fade-in" role="status">${html}</div><button class="btn primary" id="nx">${label}</button>`;
  arm([$('#nx')], next);
  $('#nx').focus({ preventScroll: true });
};
const buttons = (list) => {
  dock.innerHTML = `<div class="${list.length === 2 ? 'two' : 'one'}">${list.map(([label, , cls], i) => `<button class="btn ${cls || 'primary'}" id="d${i}">${label}</button>`).join('')}</div>`;
  list.forEach(([, fn], i) => arm([$(`#d${i}`)], fn));
};
const verdict = (right) => (right ? '<span class="ok">Right.</span> ' : '<span class="no">Not quite.</span> ');
const score = {};
const focusHead = () => {
  const h = main.querySelector('h1');
  if (h) {
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }
};

// ---------- Basics (r3d, version A): four screens, eight real hands ----------
const HC = ['#f2b45a', '#ec8a5e', '#e07a72', '#d8728e', '#9a8fe0', '#6f8fd0', '#8aa1b5', '#7d8c95'];
const handRow = (onlyKept) => `<div class="bhands">${DATA.basics.map((h, k) => ({ h, k })).filter(({ h }) => !onlyKept || h.stays).map(({ h, k }) => `<span class="bhand" style="--hc:${HC[k]}">${h.cards.map(card).join('')}</span>`).join('')}</div>`;
const strongWeak = () => '<p class="ends"><span>Strong</span><span>Weak</span></p>';
const skip = () => {
  const b = document.createElement('button');
  b.className = 'skipb';
  b.textContent = 'I know what a range is →';
  b.onclick = () => {
    const r = readRec();
    r.basicsSeen = true;
    writeRec(r);
    startRound();
  };
  dock.appendChild(b);
};

const SCREENS = {
  // Learn: the menu entry (More → Learn). The guided first hand joins this list when the tutorial is built.
  home() {
    $('#title').textContent = 'Learn';
    const L = level(readRec());
    main.innerHTML = `<div class="home"><h1>Learn</h1><p class="lead">Short, hands-on lessons. Nothing here counts toward your stats.</p>
      <div class="learn"><a href="#" id="toBag"><b>The Bag</b><span>What a range is, and how one bet changes it.</span><em id="bagMeta" class="${L.plays ? 'done' : ''}">${L.plays ? `Done ✓ · ${L.best}/3 ★` : '2–3 min'}</em></a></div></div>`;
    $('#toBag').onclick = (e) => {
      e.preventDefault();
      startGame();
    };
    dock.innerHTML = '';
    focusHead();
  },
  // a returning player: offer the skip first
  b0() {
    main.innerHTML = '<div class="simple"><h1>Skip the basics?</h1><p class="sub">You\'ve seen what a range is before.</p></div>';
    buttons([['Skip to the game', () => startRound()], ['Show me the basics again', () => go('b1'), 'quiet']]);
    focusHead();
  },
  b1() {
    main.innerHTML = '<div class="simple"><h1>Your opponent has two cards. You can\'t see them.</h1><button class="facedown" id="fd" aria-label="Their two cards, face down"><span class="card back"></span><span class="card back"></span></button></div>';
    buttons([['Next', () => go('b2')]]);
    skip();
    $('#fd').onclick = () => go('b2');
    focusHead();
  },
  b2() {
    main.innerHTML = `<div class="simple"><h1>They could be anything, like these.</h1>${handRow()}${strongWeak()}</div>`;
    buttons([['Next', () => go('b3')]]);
    skip();
    focusHead();
  },
  b3() {
    main.innerHTML = `<div class="simple"><span class="raisechip">Raise</span><h1>They raised.</h1>${handRow()}${strongWeak()}<p class="sub pulse" id="b3s">Tap to see which hands they keep</p></div>`;
    buttons([['See what they keep', async () => {
      const hs = [...main.querySelectorAll('.bhand')];
      for (let k = hs.length - 1; k >= 0; k--) {
        if (!DATA.basics[k].stays) {
          hs[k].classList.add('drop');
          await wait(220);
        }
      }
      $('#b3s').textContent = "Most people don't raise with weak hands.";
      $('#b3s').classList.remove('pulse');
      buttons([['Next', () => go('b4')]]);
      skip();
    }]]);
    skip();
    focusHead();
  },
  b4() {
    main.innerHTML = `<div class="simple"><h1>What's left is their range: think of it as a bag of the hands they could have.</h1><div class="rangebox">${handRow(true)}</div></div>`;
    const r = readRec();
    r.basicsSeen = true;
    writeRec(r);
    buttons([['Play →', () => startRound()]]);
    focusHead();
  },

  // ---------- the rounds (r2final) ----------
  // one idea: on a board, every hand in the bag is strong, medium or weak (and here, strong = beats you)
  intro() {
    const pool = [...S.cards.afterCalls, ...S.cards.start];
    const eg = (t) => pool.find((h) => TIER(h.row) === t);
    // a strong example a beginner can see: two different cards (a pocket pair that makes three of a kind reads as "a pair")
    const st = pool.find((h) => TIER(h.row) === 'strong' && h.cards[0][0] !== h.cards[1][0]) || eg('strong');
    const md = eg('medium');
    const wk = pool.find((h) => h.row === 2) || eg('weak');
    const top = [...S.board].sort((a, b) => 'AKQJT98765432'.indexOf(a[0]) - 'AKQJT98765432'.indexOf(b[0]))[0][0];
    const mdName = md && md.cards.some((c) => c[0] === top) ? `A pair of ${RANK[top]}` : 'One big pair';
    const wkName = wk.row === 2 ? 'A smaller pair, or nothing' : 'Nothing much';
    // "strong beats you" only when the data says so, hand by hand
    const all = Object.values(S.cards).filter(Array.isArray).flat();
    const clean = all.every((h) => (TIER(h.row) === 'strong') === (h.beatsYou === 1));
    main.innerHTML = `<h1>Now every hand is strong, medium or weak.</h1>${tableHtml()}
      <div class="tiers">
        <div class="tier"><span class="pair">${st.cards.map(card).join('')}</span><div><b>Strong</b><small>Two pair or better${clean ? ': beats you' : ''}</small><div class="sb strong"></div></div></div>
        <div class="tier"><span class="pair">${md.cards.map(card).join('')}</span><div><b>Medium</b><small>${mdName}</small><div class="sb medium"></div></div></div>
        <div class="tier"><span class="pair">${wk.cards.map(card).join('')}</span><div><b>Weak</b><small>${wkName}</small><div class="sb weak"></div></div></div>
      </div>`;
    buttons([['Start', () => go('q1')]]);
    focusHead();
  },
  // a caller's calls don't mean strength
  q1() {
    const bag = S.cards.afterCalls;
    const st = count(bag, 'strong');
    main.innerHTML = `${acts([['CALL'], ['CALL']])}<h1>A caller calls twice.</h1><p class="who">A caller: calls a lot, rarely raises.</p>${tableHtml()}${bagHtml(bag, 'THEIR BAG', true)}`;
    focusHead();
    const right = st > 10 ? 'Yes' : 'No';
    ask('Is their bag mostly strong hands?', 'Yes', 'No', async (pick) => {
      score.q1 = pick === right;
      dock.innerHTML = '';
      await flipUp(bag);
      say(`${verdict(score.q1)}Only ${st} of 20 are strong.<small>Your ${heroTxt()} beats ${loses(bag)} of them. Keep betting it.</small>`, () => go('q2'));
    });
  },
  // same calls, a different player, a different bag
  q2() {
    const bag = S.cards.nitAfterCalls;
    const cal = S.cards.afterCalls;
    const wkN = count(bag, 'weak');
    const wkC = count(cal, 'weak');
    main.innerHTML = `${acts([['CALL'], ['CALL']])}<h1>Same calls, from a careful player.</h1><p class="who">A careful player: plays few hands.</p>${tableHtml()}${bagHtml(bag, "If they called twice 20 times, these are hands like the ones they'd have", true)}`;
    focusHead();
    const right = wkN < wkC ? 'Fewer' : 'More';
    ask("Compared with the caller's bag: more weak hands, or fewer?", 'More', 'Fewer', async (pick) => {
      score.q2 = pick === right;
      dock.innerHTML = '';
      await flipUp(bag);
      $('.bagwrap').insertAdjacentHTML('afterend', `<div class="mini fade-in"><span>Caller: <b>${wkC} weak</b></span><span>·</span><span>Careful: <b>${wkN} weak</b></span></div>`);
      // the counts line takes the key's place here, so the screen still fits at 360 x 740 (r2final, UX-SIMPLE)
      $('.key').remove();
      say(`${verdict(score.q2)}A careful player's calls leave far fewer weak hands: ${wkN}, not ${wkC}.<small>Same calls. Different player, different bag.</small>`, () => go('q3'));
    });
  },
  // the one that matters most: the quiet caller suddenly bets big
  q3() {
    const before = S.cards.afterCalls;
    const after = S.cards.afterBigBet;
    const st = count(after, 'strong');
    main.innerHTML = `${acts([['CALL', 'dim'], ['CALL', 'dim'], ['BIG BET', 'big']])}<h1>Then, on the last card, the caller bets big.</h1>${tableHtml()}${bagHtml(before, 'THEIR BAG AFTER THE CALLS', false)}`;
    focusHead();
    const right = st > 10 ? 'Yes' : 'No';
    // over-learning guard (QA, GAME): a check is not a big bet; the bag stays weak, so good hands still bet
    const guard = async () => {
      const ck = S.cards.ifChecked;
      $('.acts').outerHTML = acts([['CALL', 'dim'], ['CALL', 'dim'], ['CHECK']]);
      $('h1').textContent = 'What if the caller had checked instead?';
      $('.bagcap').textContent = 'THEIR BAG IF THEY CHECK';
      $('#bag').innerHTML = ck.map((h) => handHtml(h, true)).join('');
      dock.innerHTML = '';
      await flipUp(ck);
      say(`Only ${count(ck, 'strong')} of 20 are strong.<small>A check keeps the bag weak. Your ${heroTxt()} beats ${loses(ck)} of them, so bet it.</small>`, () => go('end'));
    };
    ask('Is their bag mostly strong hands now?', 'Yes', 'No', async (pick) => {
      score.q3 = pick === right;
      dock.innerHTML = '';
      // the fade: keep exactly keepRows hands per ladder row (strongest first), the rest leave as ghosts
      const left = [...S.keepRows];
      const els = [...document.querySelectorAll('#bag .hand')];
      els.forEach((el) => {
        const r = +el.dataset.row;
        if (left[r] > 0) {
          left[r]--;
          el.classList.add('stay');
        }
      });
      for (const el of els.filter((e) => !e.classList.contains('stay'))) {
        el.classList.add('gone');
        await wait(35);
      }
      say(`${verdict(score.q3)}Almost every hand leaves the bag.<small>A caller with a weak hand almost never bets big. Even strong hands don't always bet big.</small>`, async () => {
        // what's left, at full size: a fresh sample of the bag after the big bet, framed as one (never "the same bag")
        $('.bagcap').textContent = "If they bet big 20 times, these are hands like the ones they'd have";
        $('#bag').innerHTML = after.map((h) => handHtml(h, true)).join('');
        dock.innerHTML = '';
        await flipUp(after);
        const b = beats(after);
        const allStrongBeat = after.every((h) => (TIER(h.row) === 'strong') === (h.beatsYou === 1));
        const head = allStrongBeat ? `${st} of 20 are strong, and every one beats your ${heroTxt()}.` : `${st} of 20 are strong.`;
        const tail = allStrongBeat ? '' : b >= 10 ? `${b} of them beat your ${heroTxt()}.` : `Your ${heroTxt()} still beats ${loses(after)} of them, so count before you call.`;
        // the guard step is required on every pool set (GAME); a set without it goes straight to the result
        say(`${head}${tail ? `<small>${tail}</small>` : ''}<strong>When a quiet player bets big, believe them.</strong>`, S.showIfChecked ? guard : () => go('end'), S.showIfChecked ? "What if they'd checked?" : 'Next');
      }, 'Show 20 big bets');
    });
  },
  end() {
    const n = ['q1', 'q2', 'q3'].filter((k) => score[k]).length;
    const c = S.cards;
    // a play counts when the result shows; the best stars and the last three sets are kept on this device
    const r = readRec();
    const L = level(r);
    L.plays = (L.plays || 0) + 1;
    L.best = Math.max(L.best || 0, n);
    L.last = [S.id, ...(L.last || []).filter((i) => i !== S.id)].slice(0, 3);
    writeRec(r);
    main.innerHTML = `<div class="stars" aria-label="${n} of 3 stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span></div><h1>Three bags, three lessons.</h1>
      <div class="learnt">
        <div><b>A caller calls</b><em>${mixTxt(c.afterCalls)}</em><span>Still mostly medium and weak. Keep betting your good hands.</span></div>
        <div><b>A careful player calls</b><em>${mixTxt(c.nitAfterCalls)}</em><span>Far fewer weak hands. Different player, different bag.</span></div>
        <div><b>A caller bets big</b><em>${mixTxt(c.afterBigBet)}</em><span>Mostly strong.</span></div>
      </div>
      <div class="pro">When a quiet player bets big, believe them.</div>`;
    focusHead();
    buttons([['Play again', () => startRound()], ['Done', () => close(), 'primary']].map(([l, f, cls], i) => [l, f, i === 0 ? 'quiet' : cls]));
  },
};
function go(id) {
  if (!SCREENS[id]) id = 'intro';
  progress(id);
  window.scrollTo(0, 0);
  SCREENS[id]();
}
function startGame() {
  $('#title').textContent = 'The Bag';
  go(readRec().basicsSeen ? 'b0' : 'b1');
}
function startRound() {
  S = pickSet();
  for (const k of Object.keys(score)) delete score[k];
  go('intro');
}
// Close: from the Ranges panel (its own tab), back to the table; from Learn, back to Learn (and from Learn's home, to the table)
function close() {
  if (FROM_RANGES) {
    // opened in its own tab from the Ranges panel, so the table and its hand are still there: close this tab, or if the
    // browser won't, go back to the table
    window.close();
    setTimeout(() => (location.href = 'play.html'), 200);
  } else if ($('#title').textContent === 'Learn') location.href = 'play.html';
  else go('home');
}
$('#close').onclick = close;

async function load() {
  const v = document.documentElement.dataset.build || '';
  DATA = await (await fetch(`src/bag/bags.json${v ? `?v=${v}` : ''}`)).json();
}
load()
  .then(() => (FROM_RANGES ? startGame() : go('home')))
  .catch(() => {
    main.innerHTML = '<p class="err">The Bag couldn\'t load. Reload to try again.</p>';
  });
