// The judge's stand-in (the steady player whose later decisions the coach simulates) against the pool
// on the raw engine, in the app's own conditions by default: the app's default game and rake,
// opponents buying in across the table's range, each one a personalised version of its type, and the
// stand-in told nothing about who is who. One of the two calibration yardsticks (README, "Checking
// the model"); the other is harder_session.js. A live winner makes about 15 to 30 bb/100.
//
//   node scripts/harder.js                       the app's conditions, 1,000,000 hands (about 2 minutes)
//   node scripts/harder.js '<json config>' ...   one row per config
//
// Config keys (all optional):
//   name        label for the row
//   hands       default 1000000
//   seed        default 99
//   game        stakes, e.g. '1/2' (default: the app's default game); sets blinds, buy-ins and rake
//   hero        'hero' (the judge's stand-in, default) or a type id ('tag', 'gto', ...) or 'baseline'
//   heroOv      overrides on the hero profile's raw numbers, e.g. {"exploit": false}
//   know        'none' (default): told nothing about the opponents (no exploit adjustments)
//               'true': told each opponent's real type
//               'noisy:0.6': each opponent's type is right with that chance, else a pool draw
//               'pool': told every opponent is the average pool player
//   lineup      'pool' (default: types drawn by share, redrawn every `tableHands`), or 'station', 'tag,tag,nit,...'
//   tableHands  default 100
//   n           players, default 8
//   personal    true (default): every opponent is personalise()d, as in the app
//   stacks      [lo, hi] (default: the game's buy-in range) or a number: opponents' buy-ins
//   heroStack   default: the app's default buy-in for the game (100 big blinds)
//   bb, sb      override the game's blinds
//   rake        a key of RAKES in session.js or an object (default: the game's rake)
//   policy      path of a policy module to use for everyone (default the product's)
//   env         {KEY: value} set on process.env before the policy module loads (for policy variants)
//   heat        table's reaction to the hero's bets, as Session.heat (0..1 lighter calls; negative = more folds)
//   ov          overrides file or object: { type: { parameter: value } } (applyOverrides)
//   out         a file to write the full breakdown to (JSON)
// Prints one summary line per config.
import fs from 'fs';
import { makeRng } from '../src/engine/cards.js';
import { newHand, applyAction, STREET } from '../src/engine/game.js';
import { handFeatures, boardTexture, TIER } from '../src/engine/features.js';
import { classOf } from '../src/engine/hands.js';
import { PROFILES, TYPE_IDS, HERO_PROFILE, BASELINE_PROFILE, applyOverrides, personalise, baseDef } from '../src/bots/profiles.js';

import { GAMES, RAKES, APP_GAME, gameKey } from '../src/trainer/session.js';

async function run(cfg) {
  if (cfg.env) for (const [k, v] of Object.entries(cfg.env)) process.env[k] = String(v);
  const pol = await import(cfg.policy || '../src/bots/policy.js');
  const { buildContext, preflopPolicy, postflopPolicy, sampleAction } = pol;
  if (cfg.ov) applyOverrides(typeof cfg.ov === 'string' ? JSON.parse(fs.readFileSync(cfg.ov, 'utf8')) : cfg.ov);
  else applyOverrides({});
  const H = cfg.hands || 1000000;
  const N = cfg.n || 8;
  const game = GAMES[gameKey(cfg.game || APP_GAME.game)];
  const BB = cfg.bb || game.bb;
  const SB = cfg.sb || game.sb;
  const heroStack = cfg.heroStack || 100 * BB;
  const oppStacks = cfg.stacks ?? [game.minBuy, game.maxBuy];
  const rake = typeof cfg.rake === 'object' ? cfg.rake : RAKES[cfg.rake || game.rake || APP_GAME.rake];
  const personal = cfg.personal !== false;
  const rng = makeRng(cfg.seed || 99);
  const rngT = makeRng((cfg.seed || 99) * 31 + 7); // table make-up, separate stream
  let heroP = cfg.hero && cfg.hero !== 'hero' ? (cfg.hero === 'baseline' ? BASELINE_PROFILE : PROFILES[cfg.hero]) : HERO_PROFILE;
  if (cfg.heroOv) heroP = { ...heroP, ...cfg.heroOv };
  const know = cfg.know || 'none';
  const noisy = know.startsWith('noisy:') ? +know.split(':')[1] : null;
  const shares = TYPE_IDS.map((id) => PROFILES[id].share);
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const pickType = () => {
    let r = rngT() * shareSum;
    for (let i = 0; i < TYPE_IDS.length; i++) if ((r -= shares[i]) < 0) return TYPE_IDS[i];
    return 'station';
  };
  // the "average pool player" the stand-in may be told about
  const poolAvg = { foldy: 0, aggro: 0 };
  for (let i = 0; i < TYPE_IDS.length; i++) {
    poolAvg.foldy += (shares[i] / shareSum) * PROFILES[TYPE_IDS[i]].foldy;
    poolAvg.aggro += (shares[i] / shareSum) * PROFILES[TYPE_IDS[i]].aggro;
  }
  const fixedLineup = cfg.lineup && cfg.lineup !== 'pool' ? cfg.lineup.split(',') : null;
  let types = [];
  let profs = [];
  let believed = [];
  let stacks = [];
  const newTable = () => {
    types = [null];
    profs = [heroP];
    believed = [null];
    stacks = [heroStack];
    for (let i = 1; i < N; i++) {
      const t = fixedLineup ? fixedLineup[(i - 1) % fixedLineup.length] : pickType();
      types.push(t);
      profs.push(personal ? personalise(t, rngT) : PROFILES[t]);
      if (know === 'true') believed.push(PROFILES[t]);
      else if (know === 'pool') believed.push(poolAvg);
      else if (noisy !== null) believed.push(PROFILES[rngT() < noisy ? t : pickType()]);
      else believed.push(null);
      stacks.push(Array.isArray(oppStacks) ? Math.round(oppStacks[0] + rngT() * (oppStacks[1] - oppStacks[0])) : oppStacks);
    }
  };
  // accumulators, all in big blinds
  let net = 0;
  let net2 = 0;
  let rakePaid = 0; // rake taken from pots the hero won
  const add = (o, k, x) => {
    const r = (o[k] ||= { n: 0, net: 0 });
    r.n++;
    r.net += x;
  };
  const byEnd = {}; // where the hand ended
  const byPot = {}; // preflop pot type
  const byWay = {}; // players seeing the flop
  const byRole = {}; // hero's preflop role
  const byTier = {}; // hero's hand at showdown / when the hand ended
  const byLine = {}; // hero's postflop line
  const vsType = {}; // chips to / from each opponent type
  const heroStat = { hands: 0, vpip: 0, pfr: 0, sawFlop: 0, wtsd: 0, wsd: 0, cbetOpp: 0, cbet: 0, cbetWin: 0, stealOpp: 0, steal: 0, stealWin: 0, betsFlop: 0, betsTurn: 0, betsRiver: 0, bluffRiver: 0 };
  const oppStat = {}; // per type: how often they fold to the hero's bets, by street
  const respAdd = (t, st, a) => {
    const r = (oppStat[t] ||= { f: [0, 0, 0], c: [0, 0, 0], r: [0, 0, 0] });
    r[a][st]++;
  };
  for (let h = 0; h < H; h++) {
    if (h % (cfg.tableHands || 100) === 0) newTable();
    const s = newHand({ stacks: stacks.slice(), button: h % N, sb: SB, bb: BB, rake, rng });
    let heroVpip = false;
    let heroPfr = false;
    let pfRaises = 0;
    let limped = false;
    let heroBets = [false, false, false, false];
    let heroCalls = [false, false, false, false];
    let heroRaisedPost = false;
    let stealOpp = false;
    let steal = false;
    let cbetOpp = false;
    let cbet = false;
    let lastHeroBetStreet = -1;
    let heroFeat = null;
    let flopWay = 0;
    let heroFoldSt = -1;
    let heroSawFlop = false;
    let lastSt = 0;
    while (!s.done) {
      const seat = s.toAct;
      const ctx = buildContext(s);
      const P = profs[seat];
      if (seat === 0 && know !== 'none') {
        let v = null;
        for (let i = 1; i < N; i++) if (!s.folded[i] && believed[i] && (!v || believed[i].foldy < v.foldy)) v = believed[i];
        if (ctx.toCall > 0 && ctx.aggressor > 0 && believed[ctx.aggressor]) v = believed[ctx.aggressor];
        ctx.villain = v;
      }
      // cfg.heat: how the table treats the hero's bets (as Session's heat): >0 calls lighter, <0 gives the hero credit
      if (cfg.heat && seat !== 0 && ctx.aggressor === 0 && ctx.toCall > 0 && (!cfg.heatTypes || cfg.heatTypes.includes(types[seat]))) ctx.heat = cfg.heat;
      let polc;
      if (s.street === STREET.PRE) polc = preflopPolicy(ctx, P, classOf(s.hole[seat][0], s.hole[seat][1]));
      else {
        const f = handFeatures(s.hole[seat], s.board, boardTexture(s.board));
        if (seat === 0) heroFeat = f;
        polc = postflopPolicy(ctx, P, f);
      }
      const a = sampleAction(polc, rng);
      const st = s.street;
      lastSt = st;
      if (seat === 0 && a.type === 'fold') heroFoldSt = st;
      if (seat === 0 && st >= 1) heroSawFlop = true;
      if (st === STREET.PRE) {
        if (seat === 0) {
          if (a.type === 'call' || a.type === 'raise') heroVpip = true;
          if (a.type === 'raise') heroPfr = true;
          if (ctx.raises === 0 && ctx.limpers === 0 && ctx.pos === 2) {
            stealOpp = true;
            if (a.type === 'raise') steal = true;
          }
        }
        if (a.type === 'raise') pfRaises++;
        else if (a.type === 'call' && pfRaises === 0) limped = true;
      } else {
        if (flopWay === 0) for (let i = 0; i < N; i++) if (!s.folded[i]) flopWay++;
        if (seat === 0) {
          if (a.type === 'raise') {
            if (ctx.toCall > 0) heroRaisedPost = true;
            else {
              heroBets[st] = true;
              lastHeroBetStreet = st;
            }
            if (st === 1 && ctx.initiative && ctx.toCall === 0) cbet = true;
          }
          if (a.type === 'call') heroCalls[st] = true;
          if (st === 1 && ctx.initiative && ctx.toCall === 0) cbetOpp = true;
        } else if (ctx.toCall > 0 && ctx.aggressor === 0 && lastHeroBetStreet === st && ctx.raises === 1) {
          respAdd(types[seat], st - 1, a.type === 'fold' ? 'f' : a.type === 'call' ? 'c' : 'r');
        }
      }
      applyAction(s, a, rng);
    }
    const x = (s.stacks[0] - stacks[0]) / BB;
    net += x;
    net2 += x * x;
    const sd = s.result.showdown;
    const SN = ['preflop', 'flop', 'turn', 'river'];
    const heroSd = sd && heroFoldSt < 0;
    const end = heroFoldSt >= 0 ? `hero folded ${SN[heroFoldSt]}` : heroSd ? (Math.abs(x) >= 40 ? 'showdown, 40bb+' : 'showdown, under 40bb') : `won without showdown, ${SN[lastSt]}`;
    add(byEnd, end, x);
    add(byPot, pfRaises === 0 ? 'limped' : pfRaises === 1 ? 'single raised' : '3-bet+', x);
    if (s.sawFlop) add(byWay, flopWay <= 2 ? 'heads-up' : flopWay === 3 ? '3-way' : flopWay === 4 ? '4-way' : '5-way+', x);
    add(byRole, !heroVpip ? 'folded / checked blind' : heroPfr ? (pfRaises >= 2 ? 'hero in a 3-bet+ pot as raiser' : limped ? 'hero iso-raised limpers' : 'hero opened') : pfRaises ? 'hero called a raise' : 'hero limped', x);
    if (s.sawFlop && heroVpip) {
      const nb = heroBets[1] + heroBets[2] + heroBets[3];
      const line = heroRaisedPost ? 'raised postflop' : nb === 0 ? (heroCalls[1] || heroCalls[2] || heroCalls[3] ? 'never bet, called' : 'never bet, never called') : `bet ${nb} street${nb > 1 ? 's' : ''}`;
      add(byLine, line + (heroSd ? ' | showdown' : x > 0 ? ' | won, no showdown' : ' | folded'), x);
      if (heroFeat && !s.folded[0]) {
        const t = heroFeat.tier;
        const nm = t >= TIER.STRONG ? 'set or better' : t >= TIER.TWO_PAIR ? 'two pair' : t >= TIER.OVERPAIR_TPTK ? 'overpair / top pair top kicker' : t >= TIER.TOP_PAIR_WEAK ? 'top pair' : t >= TIER.WEAK_PAIR ? 'weaker pair' : 'no pair';
        add(byTier, nm + (heroSd ? ' | showdown' : ' | won, no showdown'), x);
      }
    }
    // chips to and from each opponent type
    if (x > 0) {
      let tot = 0;
      for (let i = 1; i < N; i++) tot += Math.max(0, stacks[i] - s.stacks[i]);
      for (let i = 1; i < N; i++) {
        const l = Math.max(0, stacks[i] - s.stacks[i]);
        if (l > 0) add(vsType, types[i] + ' | won from', (x * l) / tot);
      }
      rakePaid += s.result.rake / BB || 0;
    } else if (x < 0) {
      let tot = 0;
      for (let i = 1; i < N; i++) tot += Math.max(0, s.stacks[i] - stacks[i]);
      for (let i = 1; i < N; i++) {
        const g = Math.max(0, s.stacks[i] - stacks[i]);
        if (g > 0) add(vsType, types[i] + ' | lost to', (x * g) / Math.max(1, tot));
      }
    }
    heroStat.hands++;
    if (heroVpip) heroStat.vpip++;
    if (heroPfr) heroStat.pfr++;
    if (heroSawFlop || (s.sawFlop && heroFoldSt < 0)) heroStat.sawFlop++;
    if (s.sawFlop && heroSd) {
      heroStat.wtsd++;
      if (x > 0) heroStat.wsd++;
    }
    if (stealOpp) heroStat.stealOpp++;
    if (steal) {
      heroStat.steal++;
      if (!s.sawFlop && x > 0) heroStat.stealWin++;
    }
    if (cbetOpp) heroStat.cbetOpp++;
    if (cbet) {
      heroStat.cbet++;
      if (lastSt === 1 && !heroSd && x > 0) heroStat.cbetWin++;
    }
  }
  const m = net / H;
  const se = Math.sqrt((net2 / H - m * m) / H);
  const per100 = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].net - a[1].net).map(([k, v]) => [k, { bb100: +((100 * v.net) / H).toFixed(2), share: +(v.n / H).toFixed(4), perHand: +(v.net / v.n).toFixed(2) }]));
  // seats of each type per table, for the per-seat figure
  const res = { name: cfg.name || '', cfg, bb100: +(100 * m).toFixed(1), se: +(100 * se).toFixed(1), sdPerHand: +Math.sqrt(net2 / H - m * m).toFixed(1), rakeFromHeroPots: +((100 * rakePaid) / H).toFixed(1), byEnd: per100(byEnd), byPot: per100(byPot), byWay: per100(byWay), byRole: per100(byRole), byLine: per100(byLine), byTier: per100(byTier), vsType: per100(vsType), heroStat: { vpip: +(heroStat.vpip / H).toFixed(3), pfr: +(heroStat.pfr / H).toFixed(3), wtsd: +(heroStat.wtsd / Math.max(1, heroStat.sawFlop)).toFixed(3), wsd: +(heroStat.wsd / Math.max(1, heroStat.wtsd)).toFixed(3), steal: +(heroStat.steal / Math.max(1, heroStat.stealOpp)).toFixed(3), stealWins: +(heroStat.stealWin / Math.max(1, heroStat.steal)).toFixed(3), cbet: +(heroStat.cbet / Math.max(1, heroStat.cbetOpp)).toFixed(3), cbetWinsNow: +(heroStat.cbetWin / Math.max(1, heroStat.cbet)).toFixed(3) }, oppFoldToHeroBet: Object.fromEntries(Object.entries(oppStat).map(([t, r]) => [t, [0, 1, 2].map((i) => +(r.f[i] / Math.max(1, r.f[i] + r.c[i] + r.r[i])).toFixed(3))])) };
  return res;
}

const args = process.argv.slice(2);
for (const arg of args.length ? args : ['{"name":"app conditions"}']) {
  const cfg = JSON.parse(arg);
  const t0 = Date.now();
  const r = await run(cfg);
  const e = r.byEnd;
  const g = (k) => (e[k] ? e[k].bb100.toFixed(1) : '0');
  console.log(`${(r.name || '?').padEnd(34)} ${String(r.bb100).padStart(6)} bb/100 (+/-${r.se}) | folds ${(['preflop','flop','turn','river'].reduce((t,k)=>t+(e['hero folded '+k]?e['hero folded '+k].bb100:0),0)).toFixed(1)} | won no-sd pre ${g('won without showdown, preflop')} flop ${g('won without showdown, flop')} turn ${g('won without showdown, turn')} river ${g('won without showdown, river')} | sd<40 ${g('showdown, under 40bb')} sd40+ ${g('showdown, 40bb+')} | vpip ${r.heroStat.vpip} pfr ${r.heroStat.pfr} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (cfg.out) fs.writeFileSync(cfg.out, JSON.stringify(r, null, 1));
}
