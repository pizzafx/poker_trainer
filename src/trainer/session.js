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
  // $2/$3 and $3/$5: buy-in ranges as listed for Talking Stick Resort (PokerAtlas).
  // $1/$3 and $2/$5: common US card-room ranges ($100-$300 at $1/$3; $200-$1,000 at $2/$5),
  // not taken from one room. Rooms vary: some cap $1/$3 at $500 or $2/$5 at $500.
  // The opponents play in big blinds, so the same player pool sits at every stake.
  '1/3': { sb: 1, bb: 3, minBuy: 100, maxBuy: 300 },
  '2/3': { sb: 2, bb: 3, minBuy: 100, maxBuy: 500 },
  '2/5': { sb: 2, bb: 5, minBuy: 200, maxBuy: 1000 },
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
      rangeSnaps: {}, // street -> { seat: range grid } as each street's betting ended
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
      // Keep each opponent's range as it stood when this street's betting ended.
      h.rangeSnaps[h.boardSeen === 0 ? 0 : h.boardSeen - 2] = this.captureRanges();
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
    {
      const n = s.board.length;
      const last = n === 0 ? 0 : n - 2;
      if (!h.rangeSnaps[last]) h.rangeSnaps[last] = this.captureRanges();
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

  // Guardrails on a verdict, so the trainer does not teach habits that only work on bots
  // and does not flag plays a competent player would defend.
  temper(v, s, ctx, action, judgeOpts) {
    if (v.grade === 'good' || v.mine < 0) return;
    const pre = s.street === STREET.PRE;
    const hf = pre ? null : handFeatures(s.hole[HERO], s.board);
    const weak = hf && hf.tier <= TIER.MIDDLE_PAIR;
    const bb = s.bbAmt;
    const small = Math.max(3 * bb, 0.1 * v.pot);
    const big = Math.max(8 * bb, 0.2 * v.pot);
    const mine = v.options[v.mine];
    const isRaise = (o) => o.type === 'raise';
    const best = () => v.options[v.best];
    // Re-grade against the best option among those `allow` accepts (your own play always counts).
    const regrade = (allow, note) => {
      let alt = -1;
      v.options.forEach((o, i) => {
        if ((i === v.mine || allow(o)) && (alt < 0 || o.ev > v.options[alt].ev)) alt = i;
      });
      v.best = alt;
      v.loss = v.options[alt].ev - mine.ev;
      v.sameKind = v.options[alt].type === mine.type;
      const k = v.sameKind ? 1.6 : 1;
      v.grade = alt === v.mine || v.loss < small * k ? 'good' : v.loss >= big * k ? 'blunder' : 'mistake';
      if (v.grade === 'good') v.note = note;
      return v.grade === 'good';
    };
    const pass = (note) => {
      v.grade = 'good';
      v.note = note;
    };
    // Is a live opponent read as someone who does not fold?
    const stickyRead = () => {
      for (let i = 0; i < s.n; i++) {
        if (i === HERO || s.folded[i]) continue;
        const top = this.readOf(i).ranked[0];
        if (top.p >= 0.5 && ['station', 'whale', 'maniac', 'beginner'].includes(top.id)) return true;
      }
      return false;
    };

    if (pre) {
      const cls = classOf(s.hole[HERO][0], s.hole[HERO][1]);
      const playable = HERO_PROFILE.playPct[cls]; // 1 = best hand to play
      const premium = HERO_PROFILE.raisePct[cls]; // 1 = best hand to raise
      // A re-raise with a hand outside the top few percent is a bluff: compare with the best
      // option that is not a raise.
      if (ctx.raises >= 1 && isRaise(best()) && premium < 0.94 && regrade((o) => !isRaise(o), 'preBluff')) return;
      // Folds: only flagged with a hand in the top 35%, and never worse than a mistake.
      if (mine.type === 'fold') {
        if (playable < 0.65) return pass('preFold');
        if (v.grade === 'blunder') v.grade = 'mistake';
      }
      // Re-raising queens or better or ace-king is never a blunder, except into a nit.
      if (isRaise(mine) && premium >= 0.96 && v.grade === 'blunder') {
        const agg = ctx.aggressor >= 0 && ctx.aggressor !== HERO ? this.readOf(ctx.aggressor).ranked[0] : null;
        if (!(agg && agg.id === 'nit' && agg.p >= 0.5)) v.grade = 'mistake';
      }
    } else {
      // 1. Declining to bluff-raise is never a mistake: compare with the best non-raise.
      if (ctx.toCall > 0 && isRaise(best()) && !isRaise(mine) && weak && regrade((o) => !isRaise(o), 'bluffRaise')) return;
      // 2. Nobody is held to an overbet: compare with the best option up to a pot-sized bet.
      const over = (o) => isRaise(o) && o.to - s.currentBet > v.pot * 1.05;
      if (over(best()) && regrade((o) => !over(o), 'overbet')) return;
      // Sizing: a bet of 60% of the pot or more is never "too small", and sizing is never red.
      if (isRaise(mine) && isRaise(best())) {
        if (best().to > mine.to && mine.to - s.currentBet >= 0.6 * v.pot) return pass('sizeOk');
        if (v.grade === 'blunder') v.grade = 'mistake';
      }
      // 3. Passing up a bluff: not flagged against players read as unable to fold, and it
      //    needs a wide margin (wider on the river) against everyone else. Never red.
      if (ctx.toCall === 0 && isRaise(best()) && mine.type === 'check' && weak) {
        const margin = (s.street === STREET.RIVER ? 3 : 2) * small;
        if (v.loss < margin || stickyRead()) return pass('passedBluff');
        v.grade = 'mistake';
      }
    }
    // The flag must survive opponents being a little looser and a little tighter than assumed.
    for (const shift of [-0.05, 0.05]) {
      const v2 = judgeDecision(s, HERO, this.hand.belief, action, { ...judgeOpts, samples: Math.round(judgeOpts.samples / 2), shift });
      if (v2.options[v.best].ev - v2.options[v.mine].ev < small * 0.5) return pass('fragile');
    }
  }

  // ---- ranges ---------------------------------------------------------------------

  // The coach's estimate of every opponent's range right now, on the hand grid.
  captureRanges() {
    const h = this.hand;
    const s = h.state;
    const heroScore = s.board.length >= 3 && h.belief.board.length === s.board.length ? handFeatures(s.hole[HERO], s.board).score : null;
    const out = {};
    for (let i = 0; i < s.n; i++) {
      if (i === HERO) continue;
      out[i] = h.belief.grid(i, h.belief.board.length >= 3 ? handFeatures(s.hole[HERO], h.belief.board).score : heroScore);
    }
    return out;
  }

  // Range grid for one opponent: `street` 0-3 for how it stood at the end of that street,
  // or 'now' for the current moment.
  rangeGrid(seat, street = 'now') {
    const h = this.hand;
    if (street !== 'now') return h.rangeSnaps[street] ? h.rangeSnaps[street][seat] : null;
    if (h.over) {
      const keys = Object.keys(h.rangeSnaps).map(Number).sort((a, b) => b - a);
      return keys.length ? h.rangeSnaps[keys[0]][seat] : null;
    }
    const bd = h.belief.board;
    return h.belief.grid(seat, bd.length >= 3 ? handFeatures(h.state.hole[HERO], bd).score : null);
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

  // Fast-forward: play `hands` hands unattended to build up observations of the table, then
  // deal a fresh hand. The trainee's results in those hands are not counted.
  quickSim(hands) {
    const net = this.heroNet();
    if (this.hand && !this.hand.over) this.foldOut();
    this.warmUp(hands);
    const me = this.seats[HERO];
    me.stack = this.heroBuy;
    this.invested = me.stack - net;
    this.startPlayable();
    this.news.unshift(`Fast-forwarded ${hands} hands. Hover over a player to see what you picked up.`);
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
