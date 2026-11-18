// The "Next hand" countdown (DESIGN, NEXT_HAND_HANDOFF; CEO 18 Nov 2026): after a hand with nothing flagged the
// table waits 3s, then deals on its own. One clock drives both the fill and the deal.
// - It pauses while blocked() says so (a pop-up, the hand history, the replayer, a hidden tab, Drill), and resumes
//   from where it stopped with at least 1s left. A gap between ticks longer than GAP_MS (the tab was hidden, the
//   machine slept) counts as a pause too, so it can never deal the moment the player comes back.
// - freeze() stops it for good (a pointerdown on the button, Esc, Top up, Exit drill): the deal is the player's.
// No DOM here: the caller passes the clock, the scheduler and the callbacks, so tests run it on a fake clock.

export const NEXT_MS = 3000;
export const MIN_LEFT_MS = 1000;
export const GAP_MS = 250;

// QA NH1: how long Fold, Call and Raise ignore a pointer after a deal. A touch: 600ms (and a touch that began before
// the buttons appeared never counts, checked by the caller). A mouse: 1.2s after a deal the table made on its own,
// 400ms after one the player asked for (a click, tap or key on the countdown button counts as asked).
export const armWindow = (pointerType, auto) => (pointerType === 'touch' || pointerType === 'pen' ? 600 : auto ? 1200 : 400);

// The countdown runs only after a hand with nothing flagged, and not with a low stack (then the table waits, with
// Top up on offer); otherwise the plain "Next hand" button waits for the player
export const countdownDue = (decisions, lowStack) => !decisions.some((d) => d.verdict && d.verdict.grade !== 'good') && !lowStack;

export function createCountdown({ ms = NEXT_MS, now, schedule, cancel, blocked = () => false, onTick = () => {}, onDone = () => {} }) {
  let elapsed = 0;
  let last = null;
  let handle = null;
  let paused = false;
  let state = 'idle'; // idle, running, frozen, done, stopped
  const p = () => Math.min(1, elapsed / ms);
  const info = () => ({ p: p(), left: Math.max(0, ms - elapsed), paused, state });
  const resumeRule = () => {
    elapsed = Math.min(elapsed, ms - MIN_LEFT_MS);
  };
  function tick() {
    handle = null;
    if (state !== 'running') return;
    const t = now();
    const dt = last == null ? 0 : t - last;
    last = t;
    if (blocked()) {
      paused = true;
    } else if (paused || dt > GAP_MS) {
      paused = false;
      resumeRule();
    } else elapsed += dt;
    onTick(info());
    if (!paused && elapsed >= ms) {
      state = 'done';
      onDone();
      return;
    }
    handle = schedule(tick);
  }
  return {
    start() {
      if (state !== 'idle') return;
      state = 'running';
      last = null;
      tick();
    },
    // a state change the caller saw (a pop-up opened or closed, the tab came back): apply it now, not next frame
    check() {
      if (state !== 'running') return;
      if (handle != null) cancel(handle);
      tick();
    },
    freeze() {
      if (state !== 'running') return;
      state = 'frozen';
      if (handle != null) cancel(handle);
      handle = null;
    },
    stop() {
      if (handle != null) cancel(handle);
      handle = null;
      if (state !== 'done') state = 'stopped';
    },
    info,
  };
}
