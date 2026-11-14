// Snapshot replay: any judged decision with a table snapshot becomes a set piece. The table is rebuilt
// from the snapshot (seats, stacks, blinds, straddle, rake, every action), the trainee's reads are
// restored as they stood at the decision, and the decision is judged again with the recorded judge
// seed and sample count.
//
// Reads: a QA hand record (scripts/verdictcheck.js, the QA audit harness) or a "Disagree?" report
// (src/trainer/dispute.js, kind 'trainer-dispute').
//
//   node scripts/replay_snapshot.js <record.json> [--samples N]   re-judge and compare with the record
//   node scripts/replay_snapshot.js <record.json> --fixture <name> also save it as a set piece in
//                                                                  test/fixtures/snapshots/<name>.json,
//                                                                  expecting today's verdict
//
// A fixture is checked by test/snapshot_replay.test.js: edit its "expect" block to pin what the
// verdict must be (grade, best, ref, a headline fragment), then the test keeps it that way.
//
// What is rebuilt exactly: the cards the trainee saw, the stacks, the action, the judge seed. What is
// approximate, for snapshots made before 14 Nov 2026 only: other players' type reads keep the three
// likeliest types (the rest of the weight spread evenly) unless the record carries the villain's full
// posterior, and the table's "heat" is the decision's value for the whole hand. Newer snapshots store
// each read itself and the heat at each action, and replay exactly. Opponents' hidden cards do
// not matter: the judge never sees them.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCards, makeRng, cardStr } from '../src/engine/cards.js';
import { newHand, applyAction, legal, potSize, STREET } from '../src/engine/game.js';
import { buildContext } from '../src/bots/policy.js';
import { TYPE_IDS, PROFILES } from '../src/bots/profiles.js';
import { HandBelief, newRead, posterior } from '../src/trainer/belief.js';
import { RAKES } from '../src/trainer/session.js';
import { gradeDecision } from '../src/trainer/grade.js';
import { judgeDecision } from '../src/trainer/judge.js';

const HERO = 0;
const T = TYPE_IDS.length;

// The parts of either record kind that a replay needs, in one shape.
export function normalise(rec) {
  if (rec.record && rec.invariant) rec = rec.record; // a case saved by scripts/verdictcheck.js
  if (rec.kind === 'trainer-dispute') {
    const v = rec.verdict;
    return {
      hole: rec.decision.hole,
      board: rec.decision.board || '',
      pot: rec.decision.pot,
      table: rec.table,
      took: v.took, // an option label
      action: null,
      samples: v.samples,
      seed: rec.table && rec.table.judge && rec.table.judge.seed,
      recorded: { grade: v.grade, best: v.best, took: v.took, loss: v.loss, headline: v.headline },
      villainPost: null,
    };
  }
  const v = rec.verdict || {};
  const label = (i) => (v.options && v.options[i] ? v.options[i].label : null);
  return {
    hole: rec.hole,
    board: rec.board || '',
    pot: rec.pot,
    table: rec.snapshot,
    took: label(v.mine),
    action: rec.action || null,
    samples: v.samples || (rec.snapshot && rec.snapshot.judge && rec.snapshot.judge.samples),
    seed: rec.judgeSeed ?? (rec.snapshot && rec.snapshot.judge && rec.snapshot.judge.seed),
    recorded: { grade: v.grade, best: label(v.best), took: label(v.mine), loss: v.loss, headline: rec.bestHeadline || rec.headline },
    villainPost: rec.villain && rec.villain.post ? { seat: rec.villain.seat, post: TYPE_IDS.map((_, t) => +rec.villain.post[t] || 0) } : null,
  };
}

// A type prior from the snapshot's read: the three likeliest types as stored, the rest spread evenly.
function priorOf(row, villainPost) {
  if (villainPost && villainPost.seat === row.seat) return villainPost.post;
  const p = new Array(T).fill(0);
  let left = 1;
  for (const r of row.read || []) {
    const t = TYPE_IDS.indexOf(r.type);
    if (t >= 0) {
      p[t] = r.p;
      left -= r.p;
    }
  }
  const rest = p.filter((x) => x === 0).length;
  for (let t = 0; t < T; t++) if (p[t] === 0) p[t] = Math.max(0, left) / Math.max(1, rest);
  return p;
}

// The table rebuilt to the trainee's decision: { s, belief, env, opts, action }.
export function rebuild(recIn, { samples } = {}) {
  const r = normalise(recIn);
  const t = r.table;
  if (!t || !t.seats || !t.actions) throw new Error('the record has no table snapshot');
  const n = t.seats.length;
  const stacks = t.seats.map((x) => x.startStack);
  let button = t.seats.findIndex((x) => x.pos === 'BTN');
  if (button < 0 && n === 2) button = t.seats.findIndex((x) => x.pos === 'SB');
  if (button < 0) throw new Error('no button in the snapshot');
  const rakeKey = Object.keys(RAKES).find((k) => RAKES[k].label === t.rake) || (t.game === 'home' ? 'none' : 'pct5');
  const hero = parseCards(r.hole);
  const board = r.board ? parseCards(r.board) : [];
  const s = newHand({ stacks, button, sb: t.blinds[0], bb: t.blinds[1], straddle: t.straddle || 0, rake: RAKES[rakeKey], rng: makeRng(42), hole: [hero, ...new Array(n - 1).fill(null)] });
  // no opponent holds a board card
  for (let i = 1; i < n; i++)
    for (let j = 0; j < 2; j++)
      if (board.includes(s.hole[i][j])) {
        const c = s.remaining.find((x) => !board.includes(x));
        s.remaining.splice(s.remaining.indexOf(c), 1, s.hole[i][j]);
        s.hole[i][j] = c;
      }
  let dealt = 0;
  const fixed = () => {
    const idx = s.remaining.indexOf(board[dealt++]);
    if (idx < 0) throw new Error('a board card is not in the deck');
    return (idx + 0.5) / s.remaining.length;
  };
  const reads = [null];
  const shown = [null];
  for (let i = 1; i < n; i++) {
    const row = t.seats[i];
    const prior = priorOf(row, r.villainPost);
    reads.push(newRead(prior));
    shown.push(prior);
  }
  const belief = new HandBelief(reads, hero);
  let seen = 0;
  for (const [k, a] of t.actions.entries()) {
    if (a.type === 'sb' || a.type === 'bb' || a.type === 'straddle') continue;
    if (s.toAct !== a.seat) throw new Error(`replay: ${a.street} ${a.who} ${a.type} but seat ${s.toAct} is to act`);
    const act = a.type === 'bet' || a.type === 'raise' ? { type: 'raise', to: a.to } : { type: a.type };
    const ctx = buildContext(s);
    if (a.seat !== HERO) {
      if (ctx.aggressor === HERO && ctx.toCall > 0) ctx.heat = t.heatAt && k in t.heatAt ? t.heatAt[k] : t.heat;
      belief.observe(a.seat, ctx, act);
    }
    applyAction(s, act, fixed);
    if (s.board.length > seen) {
      seen = s.board.length;
      belief.setBoard(s.board);
    }
  }
  if (s.toAct !== HERO) throw new Error(`replay: the trainee is not to act at the end (seat ${s.toAct})`);
  if (s.board.map(cardStr).join(' ') !== board.map(cardStr).join(' ')) throw new Error(`replay: board ${s.board.map(cardStr).join(' ')}, the record says ${r.board}`);
  if (r.pot != null && Math.abs(potSize(s) - r.pot) > 0.5) throw new Error(`replay: pot $${potSize(s)}, the record says $${r.pot}`);
  // The reads as they stood at the decision. A newer snapshot stores them: restore them exactly. Otherwise
  // the replay started from the decision's read, so this hand's evidence is in twice: keep the decision's
  // read and move the hand's start back by that evidence.
  for (let i = 1; i < n; i++) {
    const row = t.seats[i];
    if (Array.isArray(row.logP) && row.logP.length === T && Array.isArray(row.handStart)) {
      reads[i].logP.set(row.logP);
      reads[i].handStart.set(row.handStart);
      continue;
    }
    for (let k = 0; k < T; k++) {
      const ev = reads[i].logP[k] - reads[i].handStart[k];
      reads[i].logP[k] = Math.log(Math.max(shown[i][k], 1e-4));
      reads[i].handStart[k] = reads[i].logP[k] - ev;
    }
  }
  const env = {
    belief,
    readOf: (i) => {
      const post = posterior(reads[i]);
      return { ranked: TYPE_IDS.map((id, k) => ({ id, name: PROFILES[id].name, p: post[k] })).sort((a, b) => b.p - a.p), notes: t.seats[i].observed || null, steaming: !!t.seats[i].steaming };
    },
    name: (i) => t.seats[i].name,
  };
  const opts = { samples: samples || r.samples || 3000, seed: r.seed ?? 1, heat: t.heat || 0 };
  return { s, belief, env, opts, rec: r };
}

// The hero's action from the record: its own action, else the option it took, by label.
function actionOf(r, v0) {
  if (r.action) return r.action.type === 'bet' ? { type: 'raise', to: r.action.to } : r.action;
  const o = v0 && v0.options.find((x) => x.label === r.took);
  return o ? { type: o.type, to: o.to } : null;
}

// Judge the decision again: { verdict, took, best, recorded }.
export function rejudge(rec, opt = {}) {
  const { s, belief, env, opts, rec: r } = rebuild(rec, opt);
  let action = actionOf(r, null);
  if (!action) {
    // a dispute report names the option by its label: judge once to find it
    const probe = judgeDecision(s, HERO, belief, null, opts);
    action = actionOf(r, probe);
  }
  if (!action) throw new Error('cannot tell which play the trainee made');
  if (action.type === 'check' && !legal(s).canCheck) throw new Error('the record checks where checking is not allowed');
  const v = gradeDecision(s, belief, action, opts, env);
  return {
    verdict: v,
    grade: v.grade,
    took: v.mine >= 0 ? v.options[v.mine].label : null,
    best: v.options[v.best].label,
    ref: v.ref || null,
    loss: v.loss,
    street: Object.keys(STREET).find((k) => STREET[k] === s.street).toLowerCase(),
    recorded: r.recorded,
  };
}

// The smallest record that replays: what a fixture keeps (no notes, no paths, no judge internals).
export function fixtureOf(rec, name, out) {
  const r = normalise(rec);
  const keep = ({ seat, name: nm, pos, startStack, stack, inPot, folded, read, observed, steaming }) => ({ seat, name: nm, pos, startStack, stack, inPot, folded, ...(read ? { read } : {}), ...(observed ? { observed } : {}), ...(steaming ? { steaming } : {}) });
  return {
    kind: 'snapshot-fixture',
    name,
    hole: r.hole,
    board: r.board,
    pot: r.pot,
    action: r.action,
    took: r.took,
    samples: r.samples,
    judgeSeed: r.seed,
    table: { ...r.table, seats: r.table.seats.map(keep) },
    villainPost: r.villainPost,
    recorded: r.recorded,
    expect: { grade: out.grade, best: out.best, ...(out.ref ? { ref: out.ref } : {}) },
  };
}

// A fixture replays like the records it came from.
export function fromFixture(f) {
  return {
    hole: f.hole,
    board: f.board,
    pot: f.pot,
    action: f.action,
    snapshot: f.table,
    judgeSeed: f.judgeSeed,
    verdict: { samples: f.samples },
    villain: f.villainPost ? { seat: f.villainPost.seat, post: Object.fromEntries(f.villainPost.post.map((p, k) => [k, p])) } : null,
    _took: f.took,
  };
}
export function rejudgeFixture(f, opt) {
  const rec = fromFixture(f);
  const out = !rec.action ? fromLabel(f, opt) : rejudge(rec, opt);
  out.recorded = f.recorded;
  return out;
}
function fromLabel(f, opt) {
  {
    // a fixture without the action itself: the option it took, by label
    return rejudge({ kind: 'trainer-dispute', decision: { hole: f.hole, board: f.board, pot: f.pot }, table: { ...f.table, judge: { seed: f.judgeSeed } }, verdict: { took: f.took, samples: f.samples } }, opt);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--fixture' && args[args.indexOf(a) - 1] !== '--samples');
  if (!file) {
    console.log('usage: node scripts/replay_snapshot.js <record.json> [--samples N] [--fixture name]');
    process.exit(2);
  }
  const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  let rec = JSON.parse(readFileSync(file, 'utf8'));
  // the plain-text dispute report keeps its JSON under "--- data ---"
  if (typeof rec === 'string') rec = JSON.parse(rec);
  const out = rec.kind === 'snapshot-fixture' ? rejudgeFixture(rec, { samples: +arg('--samples') || 0 }) : rejudge(rec, { samples: +arg('--samples') || 0 });
  const v = out.verdict;
  console.log(`${out.street}: ${v.options.map((o, i) => `${i === v.best ? '*' : ' '}${o.label} ${o.ev.toFixed(1)}`).join(' |')}`);
  console.log(`now:      ${out.grade}, took ${out.took}, best ${out.best}${out.ref ? `, ref ${out.ref}` : ''}${v.note ? `, note ${v.note}` : ''}${v.rule ? `, rule ${v.rule}` : ''}, loss ${Math.round(out.loss)}`);
  const rr = out.recorded || {};
  console.log(`recorded: ${rr.grade}, took ${rr.took}, best ${rr.best}, loss ${Math.round(rr.loss || 0)}${rr.headline ? `\n          "${rr.headline}"` : ''}`);
  const name = arg('--fixture');
  if (name) {
    if (!/^[\w-]+$/.test(name)) throw new Error('fixture names are letters, digits, - and _');
    const dir = fileURLToPath(new URL('../test/fixtures/snapshots/', import.meta.url));
    mkdirSync(dir, { recursive: true });
    const src = rec.kind === 'snapshot-fixture' ? fromFixture(rec) : rec;
    writeFileSync(dir + name + '.json', JSON.stringify(fixtureOf(src, name, out), null, 1) + '\n');
    console.log(`saved test/fixtures/snapshots/${name}.json`);
  }
}
