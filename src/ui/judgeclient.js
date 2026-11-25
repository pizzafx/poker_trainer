// The page's client for the judge worker (CEO, owner, 23 Nov; QA AG3-AG6): grades go to the worker one at a time and
// come back in order; only the oldest unanswered job has a clock; a timeout restarts the worker and resends every
// unanswered job once; a worker that can't start (or still runs other modules after one refresh, or never says hello)
// fails, and every decision is then not graded. The page never grades on its own thread. Pure enough to test with a
// fake worker (test/asyncgrade.test.js).
// typed arrays (the read tracker's weights) cannot be frozen; they are this job's private copy, held by nothing else
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !ArrayBuffer.isView(o) && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
};
export function createJudge({ makeWorker, hashes = {}, refresh = () => Promise.resolve(), getOverrides = () => ({}), onFail = () => {}, timeoutMs = 20000, helloMs = 20000 }) {
  const judge = {
  worker: null,
  ready: false,
  next: 1,
  waiting: new Map(),
  start() {
    try {
      this.worker = makeWorker();
    } catch {
      const dead = this.onDead;
      this.onReady = this.onDead = null;
      if (dead) dead();
      return this.fail();
    }
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'hello') {
        clearTimeout(this.helloClock);
        // ready only when the modules the worker loaded are byte for byte the page's (W2). Its own
        // copy of version.js is not compared: that file changes on every push and is only a label.
        this.ready = Array.isArray(m.stale) && !m.stale.length;
        if (this.ready) {
          this.tune();
          const go = this.onReady;
          this.onReady = this.onDead = null;
          if (go) go();
          const held = this.held.splice(0);
          for (const j of held) this.send(j);
        } else if (!this.refreshed && Array.isArray(m.stale) && !m.stale.includes('unreadable')) {
          // a deploy paired this page with older cached modules: fetch them fresh once and start the worker again (CEO)
          this.refreshed = true;
          const stale = m.stale;
          this.worker.terminate();
          this.worker = null;
          Promise.resolve(refresh(stale)).then(() => this.start());
        } else this.fail();
        return;
      }
      const w = this.waiting.get(m.id);
      if (!w) return;
      this.waiting.delete(m.id);
      this.answered(m.id);
      if (m.type === 'graded') w.resolve(m.verdict);
      else w.reject(new Error(m.error));
    };
    this.worker.onerror = () => (this.ready ? this.stop() : this.fail());
    clearTimeout(this.helloClock);
    this.helloClock = setTimeout(() => {
      if (!this.ready) this.fail();
    }, helloMs);
    this.worker.postMessage({ type: 'hello', hashes });
  },
  // the worker cannot start, or its modules still differ from the page's: every held and later decision is not graded,
  // and one quiet banner asks for a reload (CEO, 23 Nov: the page never grades on its own thread)
  failed: false,
  refreshed: false,
  held: [],
  fail() {
    this.failed = true;
    const held = this.held.splice(0);
    this.stop();
    for (const j of held) j.reject(new Error('load'));
    onFail();
  },
  stop() {
    this.ready = false;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    clearTimeout(this.clock);
    for (const w of this.waiting.values()) w.reject(new Error('judge worker stopped'));
    this.waiting.clear();
    this.queue = [];
    const dead = this.onDead;
    this.onReady = this.onDead = null;
    if (dead) dead();
  },
  tune() {
    if (this.worker && this.ready) this.worker.postMessage({ type: 'tuning', overrides: getOverrides() });
  },
  // The worker grades one job at a time, in order. Only the oldest unanswered job has a 20 second clock (a later one
  // waits behind it). If it runs out, the worker is restarted and every unanswered job is sent again once; a job that
  // runs out a second time is rejected, and the page shows that decision as not graded. The page never grades on its
  // own thread (CEO, 23 Nov: QA saw a 70 second freeze).
  queue: [],
  clock: null,
  restarting: false,
  arm() {
    clearTimeout(this.clock);
    const head = this.queue[0];
    if (!head) return;
    this.clock = setTimeout(() => this.timedOut(head), timeoutMs);
  },
  timedOut(head) {
    if (this.queue[0] !== head) return;
    console.warn('The judge worker took more than 20 s; restarting it.');
    const jobs = this.queue.splice(0);
    for (const j of jobs) j.tries++;
    const again = jobs.filter((j) => j.tries <= 1);
    for (const j of jobs) if (j.tries > 1) j.reject(new Error('timeout'));
    this.restart(again);
  },
  restart(jobs) {
    this.ready = false;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.waiting.clear();
    this.onReady = () => {
      for (const j of jobs) this.send(j);
    };
    this.onDead = () => {
      for (const j of jobs) j.reject(new Error('judge worker stopped'));
    };
    this.start();
  },
  send(j) {
    this.queue.push(j);
    this.waiting.set(j.id, j);
    this.worker.postMessage({ type: 'grade', id: j.id, job: j.job });
    if (this.queue.length === 1) this.arm();
  },
  answered(id) {
    const i = this.queue.findIndex((j) => j.id === id);
    if (i >= 0) this.queue.splice(i, 1);
    if (i === 0) this.arm();
  },
  // `job` is snapshotted here, deep-copied and frozen: a job held for the hello or resent after a timeout is graded on
  // the decision exactly as it was made (QA AG6, CEO)
  grade(job0) {
    const id = this.next++;
    const job = deepFreeze(structuredClone(job0));
    return new Promise((resolve, reject) => {
      const j = { id, job, tries: 0, resolve, reject };
      if (this.failed) reject(new Error('load'));
      else if (!this.ready || !this.worker) this.held.push(j); // sent when the worker says hello
      else this.send(j);
    });
  },
};
  judge.start();
  return judge;
}

// RV2-B (QA, DESIGN, CEO): on a phone the "coach couldn't load" notice sits in the coach strip above the action dock,
// which shows whether the sheet is open or closed; it wins over everything else the strip would say until a reload.
// The desktop keeps its fixed banner.
export const showCoachDown = ({ failed, phone }) => !!(failed && phone);
export const COACH_DOWN_HTML = '<div class="cs down" role="status"><span class="main">The coach couldn\'t load.</span><button type="button" class="reload" data-reload>Reload</button></div>';
