// A session at one table: seats, hands, the trainee's decisions and the feedback on them.

import { makeRng, cardStr } from '../engine/cards.js';
import { newHand, applyAction, legal, potSize, positionName, STREET, STREET_NAMES } from '../engine/game.js';
import { handFeatures, boardTexture, describeHand, TIER } from '../engine/features.js';
import { classOf } from '../engine/hands.js';
import { CATEGORY_NAMES, categoryOf } from '../engine/evaluator.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction } from '../bots/policy.js';
import { PROFILES, TYPE_IDS, tilted, HERO_PROFILE } from '../bots/profiles.js';
import { makePlayer, tiltChance, rebuyChance, buyIn, TABLES } from './players.js';
import { HandBelief, newRead, posterior } from './belief.js';
import { judgeDecision, rangePicture } from './judge.js';
import { explain } from './explain.js';

export const GAMES = {
  // Buy-in ranges as listed for Talking Stick Resort (PokerAtlas).
  '2/3': { sb: 2, bb: 3, minBuy: 100, maxBuy: 500 },
  '3/5': { sb: 3, bb: 5, minBuy: 300, maxBuy: 1500 },
};

export const RAKES = {
  // PokerAtlas lists "staggered up to $5, plus a $2 jackpot drop"; an older review has the $5
  // cap reached at a $60 pot. Modelled as $1 per $12 of pot, capped at $5, plus $2 when there is a flop.
  tsr: { label: 'Talking Stick Resort: stepped to $5 (at a $60 pot) + $2 jackpot drop', pct: 1 / 12, cap: 5, promo: 2, noFlopNoDrop: true },
  pct: { label: '10% capped at $6, + $1 promo, no flop no drop', pct: 0.1, cap: 6, promo: 1, noFlopNoDrop: true },
  drop: { label: 'Flat drop (California style): $6 + $1 jackpot on every flop', fixed: 6, promo: 1, noFlopNoDrop: true },
  none: { label: 'No rake (time game)', pct: 0, cap: 0, promo: 0, noFlopNoDrop: true },
};

const HERO = 0;

export class Session {
  constructor(opts = {}) {
    // Home game: custom stakes ({ sb, bb, minBuy, maxBuy }), a chosen line-up of player
    // types, and no rake.
    const g = opts.custom || GAMES[opts.game || '2/3'];
    this.game = { ...g, maxBuy: opts.maxBuy || g.maxBuy };
    this.rake = RAKES[opts.custom ? 'none' : opts.rake || 'tsr'];
    this.rng = makeRng(opts.seed || (Date.now() & 0x7fffffff));
    this.samples = opts.samples || 500;
    this.lineup = opts.lineup && opts.lineup.length ? opts.lineup.slice() : null;
    if (this.lineup) {
      for (let i = this.lineup.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.lineup[i], this.lineup[j]] = [this.lineup[j], this.lineup[i]];
      }
      this.shares = TYPE_IDS.map((id) => this.lineup.filter((t) => t === id).length / this.lineup.length);
    }
    this.n = this.lineup ? this.lineup.length + 1 : opts.seats || 8;
    this.mix = (TABLES[opts.table] || TABLES.typical).mix;
    this.heat = 0; // how much the table has noticed the trainee raising and bluffing (0..1)
    this.skipBelow = opts.skipBelow || 0; // skip hands where the trainee's cards are in this bottom share
    this.seats = [];
    const nicks = new Set();
    for (let i = 0; i < this.n; i++) {
      if (i === HERO) {
        this.seats.push({ hero: true, nick: 'You', stack: opts.heroBuy || this.game.maxBuy });
      } else {
        this.seats.push(this.arrive(nicks, this.lineup ? this.lineup[i - 1] : null));
      }
    }
    this.heroBuy = opts.heroBuy || this.game.maxBuy;
    this.invested = this.heroBuy;
    this.button = Math.floor(this.rng() * this.n);
    this.handNo = 0;
    this.hand = null;
    this.news = []; // table happenings between hands
    this.decisions = []; // every judged decision this session
    this.results = []; // per-hand hero net
  }

  arrive(nicks, type) {
    const fixed = type ? { type, shares: this.shares } : null;
    const p = makePlayer(this.rng, nicks, this.game.minBuy, this.game.maxBuy, this.mix, fixed);
    nicks.add(p.nick);
    p.read = newRead(p.prior);
    return p;
  }

  nickSet() {
    return new Set(this.seats.filter((s) => !s.hero).map((s) => s.nick));
  }

  get heroStack() {
    return this.seats[HERO].stack;
  }

  heroNet() {
    return this.seats[HERO].stack - this.invested;
  }

  topUp() {
    const s = this.seats[HERO];
    if (this.hand && !this.hand.over) return;
    if (s.stack < this.heroBuy) {
      this.invested += this.heroBuy - s.stack;
      s.stack = this.heroBuy;
    }
  }

  // Seat changes between hands: busted players rebuy or leave, a few wander off.
  shuffleSeats() {
    const news = [];
    const { minBuy, maxBuy, bb } = this.game;
    for (let i = 0; i < this.n; i++) {
      const p = this.seats[i];
      if (p.hero) {
        if (p.stack < bb) {
          this.invested += this.heroBuy;
          p.stack += this.heroBuy;
          news.push(`You rebuy for $${this.heroBuy}.`);
        }
        continue;
      }
      let leaves = false;
      if (p.stack < 2 * bb) {
        if (this.lineup || this.rng() < rebuyChance(p.type)) {
          p.stack += buyIn(p.type, minBuy, maxBuy, this.rng);
          news.push(`${p.nick} rebuys.`);
        } else leaves = true;
      } else if (!this.lineup && p.stack > 2.5 * maxBuy && this.rng() < 0.12) {
        leaves = true; // racks up a big win and goes home
      } else if (!this.lineup && p.notes.hands > 25 && this.rng() < 0.012) {
        leaves = true;
      }
      if (leaves) {
        const nicks = this.nickSet();
        nicks.delete(p.nick);
        const q = this.arrive(nicks);
        this.seats[i] = q;
        news.push(`${p.nick} leaves. New player in seat ${i + 1}: ${q.look.toLowerCase()} ("${q.nick}").`);
      } else if (p.tiltHands > 0 && --p.tiltHands === 0) {
        p.tilt = 0;
        if (p.steaming) news.push(`${p.nick} seems to have calmed down.`);
        p.steaming = false;
      }
    }
    return news;
  }

  startHand() {
    this.news = this.handNo === 0 ? [] : this.shuffleSeats();
    if (this.heat > 0.5) this.news.push('The table has noticed how often you are betting and raising: expect lighter calls.');
    this.handNo++;
    this.button = (this.button + 1) % this.n;
    const utg = (this.button + 3) % this.n;
    let straddle = 0;
    const up = this.seats[utg];
    if (!up.hero && this.n >= 5) {
      const f = { maniac: 0.3, whale: 0.25, lag: 0.1 }[up.type] || 0;
      if (this.rng() < f && up.stack > 20 * this.game.bb) straddle = this.game.bb * 2;
    }
    const state = newHand({
      stacks: this.seats.map((s) => s.stack),
      button: this.button,
      sb: this.game.sb,
      bb: this.game.bb,
      straddle,
      rake: this.rake,
      rng: this.rng,
    });
    const reads = this.seats.map((s) => (s.hero ? null : s.read));
    this.hand = {
      no: this.handNo,
      state,
      belief: new HandBelief(reads, state.hole[HERO]),
      log: [],
      decisions: [],
      over: false,
      did: this.seats.map(() => ({ vpip: false, pfr: false })),
      boardSeen: 0,
      summary: null,
    };
    const h = this.hand;
    h.log.push({ kind: 'head', text: `Hand ${this.handNo}` });
    for (const e of state.history) {
      h.log.push({ kind: 'post', seat: e.seat, text: `${this.name(e.seat)} posts ${e.type === 'straddle' ? 'a straddle' : e.type === 'sb' ? 'the small blind' : 'the big blind'} $${e.amount}` });
    }
    if (state.done) this.finishHand();
    return h;
  }

  name(seat) {
    return this.seats[seat].nick;
  }

  pos(seat) {
    return positionName(this.hand.state, seat);
  }

  status() {
    const h = this.hand;
    if (!h || h.over) return 'over';
    return h.state.toAct === HERO ? 'hero' : 'bot';
  }

  heroInHand() {
    return this.hand && !this.hand.state.folded[HERO];
  }

  logAction(seat, before, action, ctx) {
    const h = this.hand;
    const s = h.state;
    const last = s.history[s.history.length - 1];
    const who = `${this.name(seat)} (${positionName(before, seat)})`;
    let text;
    if (last.type === 'fold') text = `${who} folds`;
    else if (last.type === 'check') text = `${who} checks`;
    else if (last.type === 'call') text = `${who} calls $${last.amount}${last.amount < ctx.toCall || s.allIn[seat] ? ' (all-in)' : ''}`;
    else if (last.type === 'bet') text = `${who} bets $${last.to}${last.allIn ? ' (all-in)' : ''}`;
    else text = `${who} raises to $${last.to}${last.allIn ? ' (all-in)' : ''}`;
    h.log.push({ kind: 'act', seat, type: last.type, text });
    if (before.street === STREET.PRE) {
      if (last.type === 'call' || last.type === 'raise') h.did[seat].vpip = true;
      if (last.type === 'raise') h.did[seat].pfr = true;
    }
    this.afterAction();
  }

  afterAction() {
    const h = this.hand;
    const s = h.state;
    if (s.board.length > h.boardSeen) {
      const fresh = s.board.slice(h.boardSeen);
      const label = s.board.length === 3 ? 'Flop' : s.board.length === 4 ? 'Turn' : 'River';
      if (h.boardSeen === 0 && s.board.length > 3) {
        h.log.push({ kind: 'board', text: `Board: ${s.board.map(cardStr).join(' ')}` });
      } else {
        h.log.push({ kind: 'board', text: `${label}: ${fresh.map(cardStr).join(' ')}  (pot $${potSize(s)})` });
      }
      h.boardSeen = s.board.length;
      h.belief.setBoard(s.board);
    }
    if (s.done) this.finishHand();
  }

  // One opponent action.
  stepBot() {
    const h = this.hand;
    const s = h.state;
    const seat = s.toAct;
    const p = this.seats[seat];
    const P = tilted(p.profile || PROFILES[p.type], p.tilt);
    const ctx = buildContext(s);
    if (ctx.aggressor === HERO && ctx.toCall > 0) ctx.heat = this.heat;
    let pol;
    if (s.street === STREET.PRE) pol = preflopPolicy(ctx, P, classOf(s.hole[seat][0], s.hole[seat][1]));
    else pol = postflopPolicy(ctx, P, handFeatures(s.hole[seat], s.board, boardTexture(s.board)));
    const action = sampleAction(pol, this.rng);
    h.belief.observe(seat, ctx, action);
    const before = { ...s, button: s.button };
    applyAction(s, action, this.rng);
    this.logAction(seat, before, action, ctx);
  }

  heroOptions() {
    return legal(this.hand.state);
  }

  // The trainee acts: judge first (on what was knowable), then play it.
  heroAct(action) {
    const h = this.hand;
    const s = h.state;
    const ctx = buildContext(s);
    const judgeOpts = {
      // Early streets have more left to happen, so they need more run-outs to pin down.
      samples: Math.round(this.samples * (s.street <= STREET.FLOP ? 5 : s.street === STREET.TURN ? 2.5 : 1.3)),
      seed: (this.handNo * 131 + s.history.length) | 0,
      heat: this.heat,
    };
    const verdict = judgeDecision(s, HERO, h.belief, action, judgeOpts);
    this.temper(verdict, s, ctx, action, judgeOpts);
    // The opponent whose range matters most: whoever bet, else the last aggressor, else anyone left.
    let villain = -1;
    if (ctx.toCall > 0 && ctx.aggressor >= 0 && ctx.aggressor !== HERO && !s.folded[ctx.aggressor]) villain = ctx.aggressor;
    if (villain < 0) {
      for (let k = s.history.length - 1; k >= 0 && villain < 0; k--) {
        const e = s.history[k];
        if ((e.type === 'bet' || e.type === 'raise') && e.seat !== HERO && !s.folded[e.seat]) villain = e.seat;
      }
    }
    if (villain < 0) {
      for (let i = 1; i < s.n && villain < 0; i++) {
        const j = (HERO + i) % s.n;
        if (!s.folded[j]) villain = j;
      }
    }
    const picture = villain >= 0 ? rangePicture(h.belief, villain, s, HERO) : null;
    const feats = s.street === STREET.PRE ? null : handFeatures(s.hole[HERO], s.board);
    const live = [];
    for (let i = 0; i < s.n; i++) if (i !== HERO && !s.folded[i]) live.push(i);
    const record = {
      hand: this.handNo,
      street: s.street,
      streetName: STREET_NAMES[s.street],
      position: positionName(s, HERO),
      hole: s.hole[HERO].slice(),
      board: s.board.slice(),
      pot: potSize(s),
      toCall: ctx.toCall,
      odds: ctx.odds,
      raises: ctx.raises,
      opponents: live.length,
      verdict,
      villain: villain >= 0 ? { seat: villain, nick: this.name(villain), picture, steaming: this.seats[villain].steaming } : null,
      handText: feats ? describeHand(feats, s.board) : null,
      tier: feats ? feats.tier : null,
      drawEquity: feats ? feats.drawEquity : 0,
      ctx,
    };
    Object.assign(record, explain(record));
    h.decisions.push(record);
    this.decisions.push(record);
    // The table notices raises and big bets after the flop.
    if (s.street !== STREET.PRE && (action.type === 'raise' || action.type === 'bet')) {
      this.heat = Math.min(1, this.heat + (ctx.toCall > 0 ? 0.15 : action.to >= ctx.pot ? 0.1 : 0.03));
    }
    const before = { ...s, button: s.button };
    applyAction(s, action, this.rng);
    this.logAction(HERO, before, action, ctx);
    return record;
  }

  finishHand() {
    const h = this.hand;
    if (h.over) return;
    const s = h.state;
    h.over = true;
    const r = s.result;
    const bb = this.game.bb;
    // Getting caught bluffing at showdown is remembered; otherwise the table slowly forgets.
    this.heat *= 0.92;
    if (r.showdown && !s.folded[HERO] && r.won[HERO] === 0) {
      const fired = s.history.some((e) => e.seat === HERO && e.street === STREET.RIVER && (e.type === 'bet' || e.type === 'raise'));
      if (fired && handFeatures(s.hole[HERO], s.board).tier <= TIER.MIDDLE_PAIR) this.heat = Math.min(1, this.heat + 0.25);
    }
    if (r.showdown) {
      h.log.push({ kind: 'board', text: `Showdown. Board: ${s.board.map(cardStr).join(' ')}` });
      for (let i = 0; i < s.n; i++) {
        if (s.folded[i]) continue;
        const cat = CATEGORY_NAMES[categoryOf(r.scores[i])];
        h.log.push({ kind: 'show', seat: i, text: `${this.name(i)} shows ${s.hole[i].map(cardStr).join(' ')} (${cat})` });
        if (i !== HERO) {
          h.belief.reveal(i, s.hole[i]);
          const p = this.seats[i];
          p.notes.showdowns.unshift({ hand: this.handNo, cards: s.hole[i].slice(), board: s.board.slice(), line: this.lineOf(i), won: r.won[i] > 0 });
          if (p.notes.showdowns.length > 6) p.notes.showdowns.pop();
        }
      }
    }
    for (let i = 0; i < s.n; i++) {
      if (r.won[i] > 0) h.log.push({ kind: 'win', seat: i, text: `${this.name(i)} wins $${r.won[i]}` });
    }
    if (r.rake > 0) h.log.push({ kind: 'note', text: `Rake $${r.rake}` });
    for (let i = 0; i < s.n; i++) {
      const p = this.seats[i];
      p.stack = s.stacks[i];
      if (p.hero) continue;
      p.notes.hands++;
      if (h.did[i].vpip) p.notes.vpip++;
      if (h.did[i].pfr) p.notes.pfr++;
      if (r.net[i] <= -35 * bb && !p.tilt && this.rng() < tiltChance(p.type)) {
        p.tilt = 1;
        p.tiltHands = 8 + Math.floor(this.rng() * 14);
        if (this.rng() < 0.7) {
          p.steaming = true;
          h.log.push({ kind: 'note', text: `${p.nick} is visibly steaming after that one.` });
        }
      }
    }
    h.summary = { net: r.net[HERO], showdown: r.showdown };
    this.results.push(r.net[HERO]);
  }

  // Short description of how a player played the hand, for showdown notes.
  lineOf(seat) {
    const parts = [];
    let street = -1;
    for (const e of this.hand.state.history) {
      if (e.seat !== seat || e.type === 'sb' || e.type === 'bb' || e.type === 'straddle') continue;
      if (e.street !== street) {
        street = e.street;
        parts.push(`${STREET_NAMES[street]}:`);
      }
      parts.push(e.type === 'bet' || e.type === 'raise' ? `${e.type} $${e.to}` : e.type);
    }
    return parts.join(' ');
  }

  // What the trainee is entitled to know about an opponent.
  readOf(seat) {
    const p = this.seats[seat];
    if (p.hero) return null;
    const post = posterior(p.read);
    const ranked = TYPE_IDS.map((id, i) => ({ id, name: PROFILES[id].name, p: post[i] })).sort((a, b) => b.p - a.p);
    return { ranked, notes: p.notes, look: p.look, steaming: p.steaming };
  }

  // Guardrails on a verdict, so the trainer does not teach habits that only work on bots.
  temper(v, s, ctx, action, judgeOpts) {
    if (v.grade === 'good' || v.mine < 0) return;
    const pre = s.street === STREET.PRE;
    const hf = pre ? null : handFeatures(s.hole[HERO], s.board);
    const weak = hf && hf.tier <= TIER.MIDDLE_PAIR;
    const bb = s.bbAmt;
    const small = Math.max(1.5 * bb, 0.06 * v.pot);
    const big = Math.max(4 * bb, 0.14 * v.pot);
    const kind = (o) => o.type;
    let mine = v.options[v.mine];
    let best = v.options[v.best];

    // 1. Declining to bluff-raise is never a mistake.
    if (!pre && ctx.toCall > 0 && kind(best) === 'raise' && kind(mine) !== 'raise' && weak) {
      v.grade = 'good';
      v.note = 'bluffRaise';
      return;
    }
    // 2. With less than two pair, do not hold the trainee to an overbet: compare with the
    //    best option that is at most a pot-sized bet or raise.
    if (!pre && kind(best) === 'raise' && hf.tier < TIER.TWO_PAIR && best.to - s.currentBet > v.pot * 1.05) {
      let alt = -1;
      v.options.forEach((o, i) => {
        if (o.type === 'raise' && o.to - s.currentBet > v.pot * 1.05) return;
        if (alt < 0 || o.ev > v.options[alt].ev) alt = i;
      });
      v.best = alt;
      best = v.options[alt];
      v.loss = best.ev - mine.ev;
      v.sameKind = kind(best) === kind(mine);
      const k = v.sameKind ? 1.6 : 1;
      v.grade = alt === v.mine || v.loss < small * k ? 'good' : v.loss >= big * k ? 'blunder' : 'mistake';
      if (v.grade === 'good') {
        v.note = 'overbet';
        return;
      }
    }
    // 3. A river bluff has to clear a double margin before passing it up counts.
    if (!pre && s.street === STREET.RIVER && ctx.toCall === 0 && kind(best) === 'raise' && kind(mine) === 'check' && weak) {
      v.grade = v.loss >= 2 * big ? 'mistake' : 'good';
      if (v.grade === 'good') {
        v.note = 'riverBluff';
        return;
      }
    }
    // 4. Preflop folds rest on assumptions about later streets: never worse than a mistake.
    if (pre && kind(mine) === 'fold' && v.grade === 'blunder') v.grade = 'mistake';
    // 5. The flag must survive opponents being a little looser and a little tighter than assumed.
    for (const shift of [-0.05, 0.05]) {
      const v2 = judgeDecision(s, HERO, this.hand.belief, action, { ...judgeOpts, samples: Math.round(judgeOpts.samples / 2), shift });
      if (v2.options[v.best].ev - v2.options[v.mine].ev < small * 0.5) {
        v.grade = 'good';
        v.note = 'fragile';
        return;
      }
    }
  }

  // ---- skipping junk hands ------------------------------------------------------

  isJunk() {
    const h = this.hand.state.hole[HERO];
    return HERO_PROFILE.playPct[classOf(h[0], h[1])] < this.skipBelow;
  }

  // Plays the hand out with the trainee checking when free and folding otherwise.
  foldOut() {
    let guard = 0;
    while (this.status() !== 'over' && guard++ < 500) {
      if (this.status() === 'bot') {
        this.stepBot();
        continue;
      }
      const s = this.hand.state;
      const ctx = buildContext(s);
      const action = { type: ctx.canCheck ? 'check' : 'fold' };
      const before = { ...s, button: s.button };
      applyAction(s, action, this.rng);
      this.logAction(HERO, before, action, ctx);
    }
  }

  // Starts the next hand worth playing: junk hands are folded for you and still count
  // (blinds are paid, the button moves, everyone's reads keep building).
  startPlayable() {
    const news = [];
    let skipped = 0;
    this.startHand();
    while (this.skipBelow > 0 && !this.hand.over && this.isJunk() && skipped < 60) {
      news.push(...this.news);
      this.foldOut();
      skipped++;
      this.startHand();
    }
    if (skipped) news.unshift(`Skipped ${skipped} junk hand${skipped > 1 ? 's' : ''} (folded for you).`);
    this.news = [...news, ...this.news];
    return this.hand;
  }

  // ---- drill mode ---------------------------------------------------------------

  // What the trainee faces right now, in the terms the leak categories use.
  spot() {
    const s = this.hand.state;
    const ctx = buildContext(s);
    const pre = s.street === STREET.PRE;
    const f = pre ? null : handFeatures(s.hole[HERO], s.board);
    let opponents = 0;
    for (let i = 0; i < s.n; i++) if (i !== HERO && !s.folded[i]) opponents++;
    return {
      street: s.street,
      toCall: ctx.toCall,
      raises: ctx.raises,
      canRaise: ctx.canRaise,
      tier: f ? f.tier : -1,
      drawEquity: f ? f.drawEquity : 0,
      opponents,
      pct: pre ? HERO_PROFILE.playPct[classOf(s.hole[HERO][0], s.hole[HERO][1])] : 0,
    };
  }

  // Plays one of the trainee's decisions for them, the way a solid player would. Not judged.
  autoHero() {
    const s = this.hand.state;
    const ctx = buildContext(s);
    const pol =
      s.street === STREET.PRE
        ? preflopPolicy(ctx, HERO_PROFILE, classOf(s.hole[HERO][0], s.hole[HERO][1]))
        : postflopPolicy(ctx, HERO_PROFILE, handFeatures(s.hole[HERO], s.board));
    const action = sampleAction(pol, this.rng);
    const before = { ...s, button: s.button };
    applyAction(s, action, this.rng);
    this.logAction(HERO, before, action, ctx);
  }

  // Plays the current hand to the end with no further input.
  finishAuto() {
    let guard = 0;
    while (this.status() !== 'over' && guard++ < 500) {
      if (this.status() === 'bot') this.stepBot();
      else this.autoHero();
    }
  }

  freshStack() {
    const me = this.seats[HERO];
    this.invested += this.heroBuy - me.stack;
    me.stack = this.heroBuy;
  }

  // Plays some hands unattended so the table has history and reads before a drill starts.
  warmUp(hands) {
    for (let h = 0; h < hands; h++) {
      this.freshStack();
      this.startHand();
      this.finishAuto();
    }
  }

  // Deals hands until the trainee faces a decision that `match` accepts. Returns false if
  // none came up within `maxHands`.
  dealUntil(match, maxHands = 400) {
    for (let h = 0; h < maxHands; h++) {
      this.freshStack();
      this.startHand();
      let guard = 0;
      while (this.status() !== 'over' && guard++ < 500) {
        if (this.status() === 'bot') {
          this.stepBot();
          continue;
        }
        if (match(this.spot())) return true;
        this.autoHero();
      }
    }
    return false;
  }

  // Leak summary across the session.
  review() {
    const cats = new Map();
    let lost = 0;
    let judged = 0;
    let flagged = 0;
    for (const d of this.decisions) {
      judged++;
      if (d.verdict.grade === 'good') continue;
      flagged++;
      lost += d.verdict.loss;
      const c = cats.get(d.category) || { category: d.category, count: 0, loss: 0, examples: [] };
      c.count++;
      c.loss += d.verdict.loss;
      c.examples.push(d);
      cats.set(d.category, c);
    }
    const list = [...cats.values()].sort((a, b) => b.loss - a.loss);
    for (const c of list) c.examples.sort((a, b) => b.verdict.loss - a.verdict.loss);
    return { judged, flagged, lost, list, hands: this.handNo, net: this.heroNet() };
  }
}
