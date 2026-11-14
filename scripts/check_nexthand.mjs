// Browser check for QA's NH1 ("Next hand" clicks acting in the next hand). Replays QA's steps with real
// input events through Chrome's DevTools protocol: fold, let the table deal on its own, then click or
// tap where "Next hand" was. No action may be taken in the new hand.
//
//   1. start the dev server (npm start, port 5174 by default)
//   2. start Chrome with remote debugging:  chrome --headless=new --remote-debugging-port=9333
//   3. node scripts/check_nexthand.mjs [--cdp 127.0.0.1:9333] [--url http://localhost:5174/play.html]
//
// Exits 1 if any check fails. Not part of npm test (it needs a browser).
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const CDP = arg('--cdp', '127.0.0.1:9333');
const URL0 = arg('--url', 'http://localhost:5174/play.html');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(width, height, mobile) {
  const t = await (await fetch(`http://${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (pend.has(d.id)) (pend.get(d.id)(d), pend.delete(d.id));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL0 });
  await wait(1000);
  await ev(`(async () => { localStorage.clear(); localStorage.setItem('trainer-hint-seen','1'); await new Promise(r => { const q = indexedDB.deleteDatabase('gto-trainer'); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`);
  await send('Page.navigate', { url: URL0 });
  await wait(3000);
  const close = () => fetch(`http://${CDP}/json/close/${t.id}`);
  return { send, ev, close };
}

const S = 'window.trainer.session';
const center = (P, sel) => P.ev(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const click = async (P, p) => {
  await P.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await P.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await P.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
};
// a real tap (it produces the click a phone would); `ms` is how long the finger stays down
const tap = (P, p, ms = 50) => P.send('Input.synthesizeTapGesture', { x: p.x, y: p.y, duration: ms, tapCount: 1, gestureSourceType: 'touch' });

// to a hero decision, then fold with a real click or tap, and wait for an unflagged finished hand
async function foldUnflagged(P, touch) {
  for (let tries = 0; tries < 12; tries++) {
    await P.ev(`window.trainer.settings.speed = 0; 1`);
    await P.ev(`(async () => { const T = window.trainer; const w = (ms) => new Promise(r => setTimeout(r, ms));
      for (let k = 0; k < 6000; k++) { const s = T.session; const st = s.status();
        if (st === 'hero' && !document.getElementById('actions').classList.contains('busy')) {
          if (!s.heroOptions().canCheck) return 1; // facing a bet: the fold is real
          await T.act({ type: 'check' });
        }
        if (st === 'over') { document.getElementById('review').classList.add('hidden'); document.body.classList.remove('reviewing'); T.nextHand(); }
        await w(10); } return 0; })()`);
    await P.ev(`window.trainer.settings.speed = 450; 1`);
    await wait(1300); // past any guard from the last deal
    const f = await center(P, '#a-fold');
    if (touch) await tap(P, f);
    else {
      await click(P, f);
      await P.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 200 }); // back to the felt
    }
    for (let k = 0; k < 300 && (await P.ev(`${S}.status()`)) !== 'over'; k++) await wait(10);
    const flagged = await P.ev(`${S}.hand.decisions.some((d) => d.verdict.grade !== 'good')`);
    if (!flagged && !(await P.ev(`!!document.getElementById('a-dealing') || !!document.getElementById('a-next')`))) console.log('   (dock:', JSON.stringify(await P.ev(`({ status: ${S}.status(), hand: ${S}.handNo, dock: document.getElementById('actions').innerText.slice(0, 80) })`)) + ')');
    if (!flagged) return { nextButton: await P.ev(`!!document.getElementById('a-next')`), dealing: await P.ev(`!!document.getElementById('a-dealing')`), where: (await center(P, '#a-dealing')) || (await center(P, '#a-next')) };
    await P.ev(`window.trainer.nextHand(); 1`);
  }
  return null;
}
// time the next automatic deal inside the page
async function awaitDeal(P) {
  await P.ev(`(() => { const h0 = ${S}.handNo; window.__dealT = null; const tick = () => { if (${S}.handNo !== h0) window.__dealT = performance.now(); else requestAnimationFrame(tick); }; tick(); return 1; })()`);
  for (let k = 0; k < 400 && !(await P.ev(`window.__dealT`)); k++) await wait(5);
}
const sinceDeal = (P) => P.ev(`performance.now() - window.__dealT`);
const decisions = (P) => P.ev(`${S}.decisions.length`);

let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`);
  if (!ok) failed++;
};

for (const [w, h] of [[800, 600], [1440, 900]]) {
  const P = await page(w, h, false);
  const st = await foldUnflagged(P, false);
  check(st && !st.nextButton && st.dealing, `${w}x${h} mouse: while the table is about to deal, no "Next hand" button ("Dealing…" instead)`);
  await awaitDeal(P);
  await wait(Math.max(0, 900 - (await sinceDeal(P))));
  const d0 = await decisions(P);
  await click(P, st.where);
  await wait(400);
  check((await decisions(P)) === d0, `${w}x${h} mouse: a click where "Next hand" was, 0.9s after the auto-deal, takes no action`);
  await wait(Math.max(0, 1300 - (await sinceDeal(P))));
  if ((await P.ev(`${S}.status()`)) === 'hero') {
    const e0 = await decisions(P);
    await click(P, await center(P, '#a-call'));
    await wait(1500);
    check((await decisions(P)) > e0, `${w}x${h} mouse: a click 1.3s after the deal acts`);
  }
  await P.close();
}

{
  const P = await page(375, 812, true);
  const st = await foldUnflagged(P, true);
  check(st && !st.nextButton && st.dealing, '375 touch: while the table is about to deal, no "Next hand" button');
  // a finger that comes down about 0.4s before the auto-deal and lifts after it (the deal comes 0.7s after a fold)
  await P.ev(`(() => { const h0 = ${S}.handNo; window.__dealT = null; const tick = () => { if (${S}.handNo !== h0) window.__dealT = performance.now(); else requestAnimationFrame(tick); }; tick(); return 1; })()`);
  const d0 = await decisions(P);
  await tap(P, st.where, 700);
  await wait(300);
  check(!!(await P.ev(`window.__dealT`)) && (await decisions(P)) === d0, '375 touch: a tap that started before the deal takes no action');
  // a fresh tap inside the 600ms minimum after a deal
  await foldUnflagged(P, true);
  await awaitDeal(P);
  await wait(Math.max(0, 250 - (await sinceDeal(P))));
  const d1 = await decisions(P);
  await tap(P, (await center(P, '#a-call')) || st.where);
  await wait(300);
  check((await sinceDeal(P)) < 1200 && (await decisions(P)) === d1, '375 touch: a fresh tap within 600ms of the deal takes no action');
  // and a tap 0.8s after the deal acts
  await foldUnflagged(P, true);
  await awaitDeal(P);
  await wait(Math.max(0, 800 - (await sinceDeal(P))));
  if ((await P.ev(`${S}.status()`)) === 'hero') {
    const d2 = await decisions(P);
    await tap(P, await center(P, '#a-call'));
    await wait(1500);
    check((await decisions(P)) > d2, '375 touch: a tap 0.8s after the deal acts');
  }
  await P.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
