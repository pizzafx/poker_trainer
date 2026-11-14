// The seat-0 win rate inside the real app Session (personalised opponents, tilt, table heat, mixed
// buy-ins, players coming and going, looks and reads), so the raw-engine numbers of harder.js can be
// tied to what a trainee meets. The second calibration yardstick: in 'judge' mode it measures a
// player who always takes the coach's top-rated option (slow: about 22,000 hands for +/-15 bb/100,
// so it is not part of npm test). A live winner makes about 15 to 30 bb/100.
//
//   node scripts/harder_session.js '{"mode":"judge","hands":2000}'   the judge follower
//   node scripts/harder_session.js '{"mode":"auto"}'                 the stand-in, told nothing
//   node scripts/harder_session.js '<json>' ...
// keys: name, hands (default 100000), seed (5), table ('typical'), seats (8)
//   mode  'auto'   the stand-in with no opponent knowledge (what the app's own auto-play does)
//         'truth'  the stand-in told each opponent's real type
//         'read'   the stand-in told the type the coach's read ranks first (pool average below `minP`)
//         'judge'  always takes the judge's best option (`samples` play-outs, default 300); slow
//   minP  for 'read': least probability of the top type to act on it (default 0.5)
//   noPersonal / noTilt / noHeat: switch that part of the app off (decomposition)
//   forceHeat: hold the table's heat at this level (0..1) for every decision; the judge is told
//   standinOn: 'pre' or 'post': in 'judge' mode, the stand-in (no knowledge) plays that part of the hand
//   ov: overrides file; maxFrac: in 'judge' mode, never bet or raise more than this multiple of the pot after the flop
//   keepStack: do not reset the hero to a full buy-in every hand
import fs from 'fs';
import { classOf } from '../src/engine/hands.js';
import { STREET, applyAction } from '../src/engine/game.js';
import { handFeatures } from '../src/engine/features.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction } from '../src/bots/policy.js';
import { HERO_PROFILE, PROFILES, TYPE_IDS, applyOverrides } from '../src/bots/profiles.js';
import { judgeDecision } from '../src/trainer/judge.js';
import { Session, APP_GAME } from '../src/trainer/session.js';

function run(cfg) {
  applyOverrides(cfg.ov ? JSON.parse(fs.readFileSync(cfg.ov, 'utf8')) : {});
  const HANDS = cfg.hands || 100000;
  const sess = new Session({ game: APP_GAME.game, rake: APP_GAME.rake, heroBuy: APP_GAME.heroBuy, seed: cfg.seed || 5, samples: 60, table: cfg.table || 'typical', seats: cfg.seats || 8 });
  const bb = sess.game.bb;
  const mode = cfg.mode || 'auto';
  const minP = cfg.minP ?? 0.5;
  const shares = TYPE_IDS.map((id) => PROFILES[id].share);
  const ss = shares.reduce((a, b) => a + b, 0);
  const poolAvg = { foldy: 0, aggro: 0 };
  TYPE_IDS.forEach((id, i) => {
    poolAvg.foldy += (shares[i] / ss) * PROFILES[id].foldy;
    poolAvg.aggro += (shares[i] / ss) * PROFILES[id].aggro;
  });
  let k = 0;
  let net = 0;
  let net2 = 0;
  let readRight = 0;
  let readSeen = 0;
  let readSure = 0;
  const kinds = {};
  let capped = 0;
  let decisionsJ = 0;
  for (let h = 0; h < HANDS; h++) {
    if (!cfg.keepStack) sess.freshStack();
    if (cfg.noPersonal) for (const p of sess.seats) if (!p.hero) p.profile = null;
    if (cfg.noTilt) for (const p of sess.seats) if (!p.hero) {
      p.tilt = 0;
      p.tiltHands = 0;
    }
    if (cfg.noHeat) sess.heat = 0;
    const before = sess.seats[0].stack;
    sess.startHand();
    if (h % 50 === 0) {
      for (let i = 1; i < sess.n; i++) {
        const r = sess.readOf(i).ranked[0];
        readSeen++;
        if (r.p >= minP) {
          readSure++;
          if (r.id === sess.seats[i].type) readRight++;
        }
      }
    }
    let guard = 0;
    while (sess.status() !== 'over' && guard++ < 500) {
      if (sess.status() === 'bot') {
        if (cfg.forceHeat !== undefined) sess.heat = cfg.forceHeat;
        sess.stepBot();
        continue;
      }
      const s = sess.hand.state;
      const useJudge = mode === 'judge' && !(cfg.standinOn === 'pre' && s.street === STREET.PRE) && !(cfg.standinOn === 'post' && s.street !== STREET.PRE);
      if (useJudge) {
        if (cfg.forceHeat !== undefined) sess.heat = cfg.forceHeat;
        const v = judgeDecision(s, 0, sess.hand.belief, null, { samples: cfg.samples || 300, seed: ++k, ...(cfg.forceHeat !== undefined ? { heat: sess.heat } : {}) });
        let pick = v.options[v.best];
        if (cfg.maxFrac) {
          // the best option that is not a bet or raise of more than maxFrac times the pot (calls, checks, folds always allowed)
          const potNow = v.pot;
          let b = -1;
          v.options.forEach((o, i) => {
            const big = o.type === 'raise' && s.street > 0 && (o.to - s.bet[0]) > cfg.maxFrac * potNow + 0.5;
            if (!big && (b < 0 || o.ev > v.options[b].ev)) b = i;
          });
          if (b >= 0) pick = v.options[b];
          if (pick !== v.options[v.best]) capped++;
        }
        decisionsJ++;
        const kind = ['pre', 'flop', 'turn', 'river'][s.street] + ':' + (pick.type === 'raise' ? (s.currentBet === 0 ? 'bet' : 'raise') + (s.street > 0 ? (pick.to - s.bet[0] > 1.05 * v.pot ? '>pot' : '') : '') : pick.type);
        kinds[kind] = (kinds[kind] || 0) + 1;
        sess.heroAct(pick);
        continue;
      }
      const ctx = buildContext(s);
      if (mode !== 'auto') {
        const believed = (i) => {
          if (mode === 'truth') return PROFILES[sess.seats[i].type];
          const r = sess.readOf(i).ranked[0];
          return r.p >= minP ? PROFILES[r.id] : poolAvg;
        };
        let v = null;
        for (let i = 1; i < s.n; i++) {
          if (s.folded[i]) continue;
          const b = believed(i);
          if (!v || b.foldy < v.foldy) v = b;
        }
        if (ctx.toCall > 0 && ctx.aggressor > 0) v = believed(ctx.aggressor);
        ctx.villain = v;
      }
      const pol = s.street === STREET.PRE ? preflopPolicy(ctx, HERO_PROFILE, classOf(s.hole[0][0], s.hole[0][1])) : postflopPolicy(ctx, HERO_PROFILE, handFeatures(s.hole[0], s.board));
      const action = sampleAction(pol, sess.rng);
      if (mode === 'judge') {
        sess.heroAct(action); // mixed mode: keep the app's own path (heat, records)
        continue;
      }
      const snap = { ...s, button: s.button };
      applyAction(s, action, sess.rng);
      sess.logAction(0, snap, action, ctx);
    }
    const x = (sess.results[sess.results.length - 1] ?? sess.seats[0].stack - before) / bb;
    net += x;
    net2 += x * x;
  }
  const m = net / HANDS;
  const se = Math.sqrt((net2 / HANDS - m * m) / HANDS);
  return { name: cfg.name, cfg, bb100: +(100 * m).toFixed(1), se: +(100 * se).toFixed(1), readsActedOn: +(readSure / Math.max(1, readSeen)).toFixed(3), readsRight: +(readRight / Math.max(1, readSure)).toFixed(3), kinds, capped, decisionsJ };
}

for (const arg of process.argv.slice(2)) {
  const cfg = JSON.parse(arg);
  const t0 = Date.now();
  const r = run(cfg);
  console.log(`${(r.name || '?').padEnd(30)} ${String(r.bb100).padStart(6)} bb/100 (+/-${r.se}) | reads acted on ${r.readsActedOn}, right ${r.readsRight} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (cfg.out) fs.appendFileSync(cfg.out, JSON.stringify(r) + '\n');
}
