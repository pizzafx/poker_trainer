// The page's judge worker: grades a decision off the main thread, so the table stays responsive
// while thousands of run-outs are played. It answers 'hello' with its build, so the page can tell
// whether a cached copy of these modules is out of date (then the page grades on its own thread).
import { gradeDecision } from './grade.js';
import { HandBelief } from './belief.js';
import { applyOverrides } from '../bots/profiles.js';
import { BUILD } from './version.js';

async function staleModules(hashes) {
  const stale = [];
  try {
    for (const [path, want] of Object.entries(hashes)) {
      const res = await fetch(new URL(`../../${path}`, self.location.href), { cache: 'force-cache' });
      const buf = await res.arrayBuffer();
      const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
      if (hex !== want) stale.push(path);
    }
  } catch {
    stale.push('unreadable');
  }
  return stale;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'hello') {
    // Which of our modules differ from the page's? Read each from the cache it was loaded from
    // and hash it the way scripts/stamp.js does (first 10 hex of SHA-256).
    staleModules(m.hashes || {}).then((stale) => self.postMessage({ type: 'hello', build: BUILD, stale }));
  } else if (m.type === 'tuning') {
    applyOverrides(m.overrides);
  } else if (m.type === 'grade') {
    const j = m.job;
    const belief = HandBelief.fromPlain(j.belief);
    const env = { belief, readOf: (i) => j.reads[i], name: (i) => j.names[i] };
    try {
      self.postMessage({ type: 'graded', id: m.id, verdict: gradeDecision(j.state, belief, j.action, j.opts, env) });
    } catch (err) {
      self.postMessage({ type: 'failed', id: m.id, error: String(err && err.stack ? err.stack : err) });
    }
  }
};
