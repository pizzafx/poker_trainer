// A session at one table: seats, hands, the trainee's decisions and the feedback on them.

import { makeRng, cardStr, holeOrder } from '../engine/cards.js';
import { newHand, applyAction, legal, potSize, positionName, STREET, STREET_NAMES } from '../engine/game.js';
import { handFeatures, boardTexture, describeHand, TIER } from '../engine/features.js';
import { classOf, classNames } from '../engine/hands.js';
import { CATEGORY_NAMES, categoryOf } from '../engine/evaluator.js';
import { buildContext, preflopPolicy, postflopPolicy, sampleAction, POS } from '../bots/policy.js';
import { PROFILES, TYPE_IDS, tilted, HERO_PROFILE } from '../bots/profiles.js';
import { makePlayer, tiltChance, rebuyChance, buyIn, TABLES } from './players.js';
import { HandBelief, newRead, posterior } from './belief.js';
import { judgeDecision, rangePicture } from './judge.js';
import { gradeDecision, temper } from './grade.js';
export { limpTipFor, openTipFor, junk3betTipFor } from './grade.js';
import { snapshotDecision, handTruth } from './dispute.js';
import { groupOf, expandRange, LIMPER_OFFSUIT, TIGHTER_ROW } from './ranges.js';
import { explain } from './explain.js';

export const GAMES = {
  // $2/$3: the buy-in range as listed by one Arizona card room.
  // $1/$3 and $2/$5: common US card-room ranges ($100-$300 at $1/$3; $200-$1,000 at $2/$5),
  // not taken from one room. Rooms vary: some cap $1/$3 at $500 or $2/$5 at $500.
  // The opponents play in big blinds, so the same player pool sits at every stake.
  '1/3': { sb: 1, bb: 3, minBuy: 100, maxBuy: 300 },
  '2/3': { sb: 2, bb: 3, minBuy: 100, maxBuy: 500 },
  '2/5': { sb: 2, bb: 5, minBuy: 200, maxBuy: 1000 },
};
// $3/$5 was removed (owner, Nov 2026: it plays the same as $2/$5). A saved '3/5' reads as '2/5'.
export const RETIRED_GAMES = { '3/5': '2/5' };
export const gameKey = (k) => (GAMES[k] ? k : RETIRED_GAMES[k] || '2/3');

export const RAKES = {
  // Labels say what each structure is; no venue names. Keys are stored in players' saved
  // settings, so they stay as they are ('tsr' is the stepped structure). Listed in the order
  // the Settings menu shows them.
  // The default for new players.
  pct: { label: 'Typical casino rake: 10% up to $6, + $1 jackpot, no flop no drop', pct: 0.1, cap: 6, promo: 1, noFlopNoDrop: true },
  // Stepped: one card room's listed "staggered up to $5, plus a $2 jackpot drop", with the $5 cap
  // reached at a $60 pot. Modelled as $1 per $12 of pot, capped at $5, plus $2 when there is a flop.
  tsr: { label: 'Stepped to $5 (reached at a $60 pot) + $2 jackpot drop', pct: 1 / 12, cap: 5, promo: 2, noFlopNoDrop: true },
  drop: { label: 'Flat drop (California style): $6 + $1 jackpot on every flop', fixed: 6, promo: 1, noFlopNoDrop: true },
  none: { label: 'No rake (time game)', pct: 0, cap: 0, promo: 0, noFlopNoDrop: true },
};

// The game a new player is dealt into: the app's defaults, and what scripts/ checks by default.
// How many run-outs the judge plays at a decision. Early streets have more left to happen, so they
// need more to pin down. With six players or more in the hand, 70%: there most close one-pair and draw
// decisions are notes, so what is left to flag is large, and each run-out costs the most (QA timed up
// to 5.4 s per flagged decision; Nov 2026: about 3 s at most).
export function samplesFor(base, s) {
  let players = 0;
  for (let i = 0; i < s.n; i++) if (!s.folded[i]) players++;
  return Math.round(base * (s.street <= STREET.FLOP ? 5 : s.street === STREET.TURN ? 2.5 : 1.3) * (players >= 6 ? 0.7 : 1));
}

export const APP_GAME = { game: '1/3', rake: 'pct', heroBuy: 300 };

const HERO = 0;

const LIMPER_KEEP = { default: expandRange(LIMPER_OFFSUIT.default), button: expandRange(LIMPER_OFFSUIT.button) };

export class Session {
  constructor(opts = {}) {
    // Home game: custom stakes ({ sb, bb, minBuy, maxBuy }), a chosen line-up of player
    // types, and no rake.
    const g = opts.custom || GAMES[gameKey(opts.game || '2/3')];
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
    // Or the trainee's own ranges, { early, middle, cutoff, button, sb, bb }: lists of hand classes.
    // A hand outside the range for the seat is folded for them. Takes the place of skipBelow.
    this.heroRanges = opts.heroRanges || null;
    // Your ranges for when someone has already raised before the action reaches you (same shape).
    // Without them the first-in ranges apply whatever happens before you.
    this.heroRangesRaised = opts.heroRangesRaised || null;
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
    this.started = false; // has a hand been dealt for the trainee to play yet?
    this.id = `${Date.now().toString(36)}-${Math.floor(this.rng() * 1e9).toString(36)}`;
    this.startedAt = Date.now();
    // onHandEnd(record) is called as each hand ends (the page keeps them); `quiet` hands (quick sim,
    // hands folded before the session starts) are not reported.
    this.onHandEnd = null;
    this.quiet = false;
    this.foldingOut = false;
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
        // The newcomer takes a look nobody at the table has, including the player leaving.
        const q = this.arrive(this.nickSet());
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
    // Said once as the table's read of you crosses 0.5, and again only after it has dropped below 0.4 (QA Z1).
    if (this.heat > 0.5 && !this.heatNoted) {
      this.news.push('The table has noticed how often you are betting and raising: expect lighter calls.');
      this.heatNoted = true;
    } else if (this.heat < 0.4) this.heatNoted = false;
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
      h.log.push({ kind: 'post', seat: e.seat, text: `${this.name(e.seat)} ${this.verb(e.seat, 'post')} ${e.type === 'straddle' ? 'a straddle' : e.type === 'sb' ? 'the small blind' : 'the big blind'} $${e.amount}` });
    }
    if (state.done) this.finishHand();
    return h;
  }

  name(seat) {
    return this.seats[seat].nick;
  }
  // A verb for the log with the player as subject: "Ball Cap calls", but "You call".
  verb(seat, word) {
    return seat === HERO ? word : word + 's';
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
    if (last.type === 'fold') text = `${who} ${this.verb(seat, 'fold')}`;
    else if (last.type === 'check') text = `${who} ${this.verb(seat, 'check')}`;
    else if (last.type === 'call') text = `${who} ${this.verb(seat, 'call')} $${last.amount}${last.amount < ctx.toCall || s.allIn[seat] ? ' (all-in)' : ''}`;
    else if (last.type === 'bet') text = `${who} ${this.verb(seat, 'bet')} $${last.to}${last.allIn ? ' (all-in)' : ''}`;
    else text = `${who} ${this.verb(seat, 'raise')} to $${last.to}${last.allIn ? ' (all-in)' : ''}`;
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
    if (ctx.heat) (h.heatAt ||= {})[s.history.length] = ctx.heat; // for replaying the reads later
    h.belief.observe(seat, ctx, action);
    const before = { ...s, button: s.button };
    applyAction(s, action, this.rng);
    this.logAction(seat, before, action, ctx);
  }

  heroOptions() {
    return legal(this.hand.state);
  }

  // The trainee acts: grade first (on what was knowable), then play it. The page grades in a
  // worker and calls heroCommit with the verdict; everything else grades here.
  heroAct(action) {
    return this.heroCommit(action, gradeDecision(this.hand.state, this.hand.belief, action, this.judgeOpts(), this.gradeEnv()));
  }

  heroCommit(action, verdict) {
    const h = this.hand;
    const s = h.state;
    const ctx = buildContext(s);
    const judgeOpts = this.judgeOpts();
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
    const regularIn = live.some((i) => {
      const r = this.readOf(i).ranked[0];
      return r.p >= 0.5 && ['tag', 'lag', 'gto'].includes(r.id);
    });
    const record = {
      id: this.decisions.length + 1,
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
      regularIn,
      verdict,
      villain: villain >= 0 ? { seat: villain, nick: this.name(villain), picture, steaming: this.seats[villain].steaming } : null,
      handText: feats ? describeHand(feats, s.board) : null,
      tier: feats ? feats.tier : null,
      drawEquity: feats ? feats.drawEquity : 0,
      ctx,
      // The table as the trainee saw it, for a "Disagree?" report.
      snapshot: snapshotDecision(this, s, judgeOpts),
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
    // Now that the hand is over, reports on its decisions may show what everyone really held.
    if (h.decisions.length) {
      const truth = handTruth(this, s);
      for (const d of h.decisions) d.truth = truth;
    }
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
        h.log.push({ kind: 'show', seat: i, text: `${this.name(i)} ${this.verb(i, 'show')} ${holeOrder(s.hole[i]).map(cardStr).join(' ')} (${cat})` });
        if (i !== HERO) {
          h.belief.reveal(i, s.hole[i]);
          const p = this.seats[i];
          p.notes.showdowns.unshift({ hand: this.handNo, cards: s.hole[i].slice(), board: s.board.slice(), line: this.lineOf(i), won: r.won[i] > 0 });
          if (p.notes.showdowns.length > 6) p.notes.showdowns.pop();
        }
      }
    }
    for (let i = 0; i < s.n; i++) {
      if (r.won[i] > 0) h.log.push({ kind: 'win', seat: i, text: `${this.name(i)} ${this.verb(i, 'win')} $${r.won[i]}` });
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
    if (this.onHandEnd && !this.quiet) this.onHandEnd(this.foldingOut ? { kind: 'skip', session: this.id, no: this.handNo, position: positionName(this.hand.state, HERO) } : this.handRecord());
  }

  // Everything the hand history and the replayer need about the hand just finished, as plain data.
  // Verdicts are kept as the coach gave them; ranges are rebuilt from the reads at the start of the
  // hand by replaying the actions (see replay.js).
  handRecord() {
    const h = this.hand;
    const s = h.state;
    const r = s.result;
    const strip = (d) => {
      const { ctx, ...rest } = d;
      return { ...rest, faced: { toCall: ctx.toCall, pot: ctx.pot, raises: ctx.raises, aggressor: ctx.aggressor } };
    };
    return {
      kind: 'hand',
      v: 1,
      session: this.id,
      sitting: { at: this.startedAt, sb: this.game.sb, bb: this.game.bb, home: !!this.lineup },
      at: Date.now(),
      no: h.no,
      position: positionName(s, HERO),
      n: s.n,
      button: s.button,
      sb: s.sbAmt,
      bb: s.bbAmt,
      straddle: s.straddleAmt,
      rake: s.rake,
      startStacks: s.startStacks.slice(),
      seats: this.seats.map((p, i) => ({ nick: p.nick, hero: !!p.hero, lookId: p.lookId || null, hue: p.hue ?? null, look: p.look || null, read: p.hero ? null : Array.from(p.read.handStart), notes: p.hero ? null : { hands: p.notes.hands, vpip: p.notes.vpip, pfr: p.notes.pfr }, steaming: !!p.steaming })),
      hole: s.hole.map((c) => c.slice()),
      board: s.board.slice(),
      history: s.history.map((e) => ({ ...e })),
      log: h.log.map((e) => ({ ...e })),
      decisions: h.decisions.map(strip),
      heatAt: h.heatAt || null,
      result: { net: r.net.slice(), won: r.won.slice(), rake: r.rake, showdown: r.showdown, folded: s.folded.slice() },
    };
  }

  // ---- keeping a session across a reload ----
  // A plain copy of the session between hands (no random-number generator, no hand in progress).
  toSaved() {
    const { rng, hand, onHandEnd, ...rest } = this;
    // each profile's cache of tilted versions is rebuilt when needed
    const seats = this.seats.map((p) => (p.profile ? { ...p, profile: { ...p.profile, tiltVersions: undefined } } : p));
    // fine decisions keep what Leak review and the totals use; only flagged ones keep their report
    const decisions = this.decisions.map((d) => {
      const { ctx, snapshot, truth, ...keep } = d;
      return d.verdict.grade === 'good' ? keep : { ...keep, snapshot, truth };
    });
    return { ...rest, seats, decisions, savedAt: Date.now() };
  }

  static fromSaved(o) {
    const sess = Object.create(Session.prototype);
    Object.assign(sess, o);
    sess.rng = makeRng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) & 0x7fffffff);
    sess.hand = null;
    sess.onHandEnd = null;
    sess.quiet = false;
    sess.foldingOut = false;
    sess.news = [];
    return sess;
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

  // Guardrails on a verdict (grade.js), with this table's reads.
  temper(v, s, ctx, action, judgeOpts) {
    temper(v, s, ctx, action, judgeOpts, this.gradeEnv());
  }

  // What grading needs from the session: the hand's read tracker, each player's read and name.
  gradeEnv() {
    return { belief: this.hand.belief, readOf: (i) => this.readOf(i), name: (i) => this.name(i) };
  }

  // A plain copy of everything grading needs, for the page's judge worker.
  gradeJob(action) {
    const s = this.hand.state;
    const reads = this.seats.map((p, i) => (p.hero ? null : this.readOf(i)));
    return { state: s, belief: this.hand.belief.toPlain(), action, opts: this.judgeOpts(), reads: reads.map((r) => r && { ranked: r.ranked }), names: this.seats.map((p) => p.nick) };
  }

  judgeOpts() {
    const s = this.hand.state;
    return {
      samples: samplesFor(this.samples, s),
      // about 3 s at most per decision: 2 s for the judgement, the rest for the re-runs a flag needs
      budgetMs: 2000,
      seed: (this.handNo * 131 + s.history.length) | 0,
      heat: this.heat,
    };
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
    const s = this.hand.state;
    const h = s.hole[HERO];
    const k = classOf(h[0], h[1]);
    if (this.heroRanges) return !this.inRange(this.heroRanges);
    return HERO_PROFILE.playPct[k] < this.skipBelow;
  }
  // Is the trainee's hand in the given ranges ({ early: [...], ... }) for their seat?
  inRange(ranges) {
    const s = this.hand.state;
    const h = s.hole[HERO];
    return (ranges[groupOf(positionName(s, HERO))] || []).includes(classNames[classOf(h[0], h[1])]);
  }
  // With your own ranges: should this hand be folded for you? The first-in range applies when
  // nobody has raised before you, the facing-a-raise range when someone has. When the two agree
  // the answer is known at the deal; otherwise the players before you act first (at once, not
  // one by one on screen) and the range that fits what they did decides.
  //
  // Two rules on top of the lists: behind limpers, weak offsuit hands are folded first in (not in
  // the blinds); and facing a big (above the usual 5x plus one per limper) or early raise, the next tighter facing-a-raise row
  // applies as well (PRO review, Nov 2026).
  outOfRange() {
    const s = this.hand.state;
    const group = groupOf(positionName(s, HERO));
    const name = classNames[classOf(s.hole[HERO][0], s.hole[HERO][1])];
    const first = this.inRange(this.heroRanges);
    const raised = this.heroRangesRaised ? this.inRange(this.heroRangesRaised) : first;
    const limpFold = first && group !== 'sb' && group !== 'bb' && name.endsWith('o') && !LIMPER_KEEP[group === 'button' ? 'button' : 'default'].includes(name);
    const tighter = this.heroRangesRaised ? (this.heroRangesRaised[TIGHTER_ROW[group]] || []).includes(name) : raised;
    if (first === raised && !limpFold && raised === tighter) return !first;
    let guard = 0;
    while (this.status() === 'bot' && guard++ < 50) this.stepBot();
    if (this.status() !== 'hero') return false; // the hand ended before you (a walk): nothing to skip
    if (s.raises > 0) {
      const ctx = buildContext(s);
      const raiser = s.lastRaiser;
      // "Big" is bigger than the usual open here (5 big blinds plus one per limper).
      let limpersBefore = 0;
      for (const e of s.history) {
        if (e.type === 'raise') break;
        if (e.type === 'call') limpersBefore++;
      }
      const bigOrEarly = ctx.raiseBB > 5.5 + limpersBefore || (raiser >= 0 && raiser !== HERO && groupOf(positionName(s, raiser)) === 'early');
      return !(raised && (!bigOrEarly || tighter));
    }
    if (limpFold && buildContext(s).limpers > 0) return true;
    return !first;
  }

  // Plays the hand out with the trainee checking when free and folding otherwise.
  foldOut() {
    this.foldingOut = true;
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
    this.foldingOut = false;
  }

  // Starts the next hand worth playing: junk hands are folded for you and still count
  // (blinds are paid, the button moves, everyone's reads keep building).
  // At the start of a session, hands folded for you before the first one you play do not count:
  // your stack and result start at that hand, and it is hand 1. Later skips count as usual.
  startPlayable() {
    const news = [];
    let skipped = 0;
    const first = !this.started;
    this.started = true;
    const quiet = this.quiet;
    if (first) this.quiet = true; // hands folded before the first one you play are not counted
    const filter = !!(this.heroRanges || this.skipBelow > 0);
    const forget = () => {
      const me = this.seats[HERO];
      me.stack = this.heroBuy;
      this.invested = this.heroBuy;
      this.results = [];
    };
    this.startHand();
    while (skipped < 60) {
      if (this.hand.over) {
        // A hand that ends before the trainee acts (a walk) while the session is starting does not
        // count either; later ones are ordinary hands.
        if (!first) break;
        forget();
        skipped++;
        this.startHand();
        continue;
      }
      if (!filter || !(this.heroRanges ? this.outOfRange() : this.isJunk())) {
        if (first && this.hand.over) continue; // it ended while the players before you acted
        break;
      }
      news.push(...this.news);
      this.foldOut();
      skipped++;
      if (first) forget();
      this.startHand();
    }
    this.quiet = quiet;
    if (first && skipped) {
      // nothing that happened before the first hand you see is news (QA Z5: no seat changes or NEW tags)
      this.news = [];
      this.handNo = 1;
      this.hand.no = 1;
      const head = this.hand.log.find((e) => e.kind === 'head');
      if (head) head.text = 'Hand 1';
      // showdowns seen while waiting for that hand happened before it
      for (const s of this.seats) if (!s.hero) for (const sd of s.notes.showdowns) if (sd.hand > 0) sd.hand = 0;
      return this.hand;
    }
    if (skipped) news.unshift(this.heroRanges ? `Skipped ${skipped} hand${skipped > 1 ? 's' : ''} outside your ranges (folded for you).` : `Skipped ${skipped} junk hand${skipped > 1 ? 's' : ''} (folded for you).`);
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
    const quiet = this.quiet;
    this.quiet = true; // not hands you played
    for (let h = 0; h < hands; h++) {
      this.freshStack();
      this.startHand();
      this.finishAuto();
    }
    this.quiet = quiet;
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
      lost += d.cost;
      const c = cats.get(d.category) || { category: d.category, count: 0, loss: 0, examples: [] };
      c.count++;
      c.loss += d.cost;
      c.examples.push(d);
      cats.set(d.category, c);
    }
    const list = [...cats.values()].sort((a, b) => b.loss - a.loss);
    for (const c of list) c.examples.sort((a, b) => b.verdict.loss - a.verdict.loss);
    return { judged, flagged, lost, list, hands: this.handNo, net: this.heroNet() };
  }
}
