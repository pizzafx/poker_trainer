// Drill bank generator (offline): deals session hands, picks candidate spots for one skill, gates them at bank
// strength and writes every accepted spot as a full bank entry, plus a log line per candidate.
//
//   node scripts/drillbank.js '<json>'
// keys: skill (D1|V1|P2|P1), seed (session seed), table (typical|tight|loose|aggressive|tough), lineup (fixed
//       opponent types, optional), seats (8), target (accepted spots to stop at), maxHands, maxCands,
//       out (directory for <skill>-<tag>.jsonl and .log.jsonl), tag, warmup (hands played before any candidate,
//       60, so the reads on the card rest on a realistic number of hands), and gate options (N, Npre, screen, isoG4, ...)
//
// Entries are merged into the shipped bank by scripts/drillmerge.js.

import fs from 'node:fs';
import path from 'node:path';
import { STREET, positionName } from '../src/engine/game.js';
import { handFeatures } from '../src/engine/features.js';
import { classOf, classNames } from '../src/engine/hands.js';
import { buildContext } from '../src/bots/policy.js';
import { HandBelief } from '../src/trainer/belief.js';
import { Session, APP_GAME } from '../src/trainer/session.js';
import { envFor } from './gradeall.js';
import { SKILLS, live, difficultyOf, d1DrawStatus, d1DrawRejects } from './drill/skills.js';
import { gateSpot } from './drill/gate.js';
import { captureSpot, pinnedReads } from './drill/spot.js';
import { bankVersion } from './drill/version.js';

const cfg = JSON.parse(process.argv[2] || '{}');
const skill = SKILLS[cfg.skill];
if (!skill) throw new Error(`unknown skill ${cfg.skill}`);
const tag = cfg.tag || `${cfg.table || 'typical'}-${cfg.seed || 1}`;
const outDir = cfg.out || 'notes/drill_runs';
fs.mkdirSync(outDir, { recursive: true });
const OUT = path.join(outDir, `${cfg.skill}-${tag}.jsonl`);
const LOG = path.join(outDir, `${cfg.skill}-${tag}.log.jsonl`);
fs.writeFileSync(OUT, '');
fs.writeFileSync(LOG, '');
const version = bankVersion();

const sess = new Session({ game: APP_GAME.game, rake: APP_GAME.rake, heroBuy: APP_GAME.heroBuy, seed: cfg.seed || 1, samples: 60, table: cfg.table || 'typical', seats: cfg.seats || 8, ...(cfg.lineup ? { lineup: cfg.lineup } : {}) });
const bb = sess.game.bb;
let hands = 0;
let cands = 0;
let kept = 0;
const t0 = Date.now();
const tally = {};

function entryFor(s, ctx, f, pinned, reads, types, g) {
  const r = g.result;
  const spot = captureSpot(s, { types, nicks: sess.seats.map((p) => p.nick), game: APP_GAME.game });
  // the coach's estimate line for each family, as the table would show it for that play (pinned read)
  const env = envFor(pinned, reads);
  const estimate = {};
  for (const [k, v] of Object.entries(r.graded)) {
    try {
      const rec = sess.decisionRecord(v, { belief: pinned, readOf: env.readOf });
      if (rec.anchor || rec.tip) estimate[k] = rec.anchor || rec.tip; // before the flop the coach's tip is the line
    } catch {
      // no line for this family
    }
  }
  // D1 with a pair and a real draw: the call's own combined-test status (19b); a draw that covers the price is
  // not a D1 spot (CURR, STRAT 18 Nov), a draw that falls short makes it tricky
  const drawSt = cfg.skill === 'D1' ? d1DrawStatus(f, r.graded.call, live(s).length) : null;
  if (d1DrawRejects(drawSt)) return null;
  const tricky = skill.tricky(s, ctx, f, types, drawSt);
  const pre = s.street === STREET.PRE;
  const difficulty = difficultyOf(skill, tricky, pre, r);
  return {
    id: `${cfg.skill}-${version.slice(0, 6)}-${tag}-${sess.handNo}`,
    skill: cfg.skill,
    tier: skill.tier,
    difficulty,
    bankVersion: version,
    street: s.street,
    position: positionName(s, 0),
    hand: classNames[classOf(s.hole[0][0], s.hole[0][1])],
    spot,
    reads: Object.fromEntries(live(s).map((i) => { const nt = sess.seats[i].notes || {}; return [i, { type: types[i], hands: nt.hands ?? null, vpip: nt.hands ? +(nt.vpip / nt.hands).toFixed(2) : null, pfr: nt.hands ? +(nt.pfr / nt.hands).toFixed(2) : null }]; })),
    families: r.families,
    options: r.options,
    marginBars: r.marginBars,
    marginBb: r.marginBb,
    costBb: r.costBb,
    costBucket: r.costBucket,
    estimate,
    gate: { seeds: 3, samples: r.samples, tricky, proChecked: false, source: { table: cfg.table || 'typical', seed: cfg.seed || 1, hand: sess.handNo, lineup: cfg.lineup || null } },
  };
}

while (kept < (cfg.target || 150) && hands < (cfg.maxHands || 200000) && cands < (cfg.maxCands || Infinity)) {
  hands++;
  sess.freshStack();
  sess.heat = 0;
  sess.startHand();
  const h = sess.hand;
  const s = h.state;
  if (s.straddleAmt) {
    sess.finishAuto();
    continue; // straddled hands stay out of the bank (legibility, G8)
  }
  const types = sess.seats.map((p) => (p.hero ? null : p.type));
  const reads = pinnedReads(types);
  const pinned = new HandBelief(reads, s.hole[0]);
  const ob = h.belief.observe.bind(h.belief);
  const sb = h.belief.setBoard.bind(h.belief);
  h.belief.observe = (seat, c, a) => (ob(seat, c, a), pinned.observe(seat, c, a));
  h.belief.setBoard = (b) => (sb(b), pinned.setBoard(b));
  let guard = 0;
  let taken = false;
  while (sess.status() !== 'over' && guard++ < 500) {
    if (sess.status() === 'bot') {
      sess.heat = 0;
      sess.stepBot();
      continue;
    }
    const ctx = buildContext(s);
    const pre = s.street === STREET.PRE;
    const f = pre ? null : handFeatures(s.hole[0], s.board);
    // G7: four or more players dealt in
    if (!taken && hands > (cfg.warmup ?? 60) && s.n > 3 && skill.match(s, ctx, f, types)) {
      taken = true;
      cands++;
      const t1 = Date.now();
      let g;
      try {
        g = gateSpot(s, pinned, reads, skill, { ...(skill.gate || {}), ...cfg });
      } catch (e) {
        g = { ok: false, reason: `error: ${e.message}`, log: {} };
      }
      const line = { skill: cfg.skill, bankVersion: version, table: cfg.table || 'typical', seed: cfg.seed || 1, lineup: cfg.lineup || null, dealt: s.n, spot: captureSpot(s, { types }), hand: sess.handNo, street: s.street, pos: positionName(s, 0), hole: classNames[classOf(s.hole[0][0], s.hole[0][1])], opps: live(s).map((i) => types[i]), bettor: ctx.aggressor > 0 ? types[ctx.aggressor] : null, toCallBb: +(ctx.toCall / bb).toFixed(1), potBb: +(ctx.pot / bb).toFixed(1), result: g.ok ? 'ACCEPT' : g.reason, sec: +((Date.now() - t1) / 1000).toFixed(1), ...g.log };
      const e = g.ok ? entryFor(s, ctx, f, pinned, reads, types, g) : null;
      if (g.ok && !e) line.result = d1DrawStatus(f, g.result.graded.call, live(s).length) === 'even' ? 'D1: the draw is about even (rejected, CURR)' : 'D1: the draw covers the price (rejected, CURR)';
      if (e) {
        fs.appendFileSync(OUT, JSON.stringify(e) + '\n');
        kept++;
        line.id = e.id;
        line.difficulty = e.difficulty;
      }
      fs.appendFileSync(LOG, JSON.stringify(line) + '\n');
      const key = line.result.split(/[ :]/).slice(0, 2).join(' ');
      tally[key] = (tally[key] || 0) + 1;
    }
    sess.autoHero();
  }
}
const min = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`${cfg.skill} ${tag}: ${kept} kept of ${cands} candidates in ${hands} hands, ${min} min`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
