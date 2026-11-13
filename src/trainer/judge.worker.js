// The page's judge worker: grades a decision off the main thread, so the table stays responsive
// while thousands of run-outs are played. It answers 'hello' with its build, so the page can tell
// whether a cached copy of these modules is out of date (then the page grades on its own thread).
import { gradeDecision } from './grade.js';
import { HandBelief } from './belief.js';
import { applyOverrides } from '../bots/profiles.js';
import { BUILD } from './version.js';

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'hello') {
    self.postMessage({ type: 'hello', build: BUILD });
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
