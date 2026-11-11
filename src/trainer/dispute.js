// "Disagree?" reports: everything needed to look again at one judged decision, in a form a
// player can copy or save and send us. No network, no personal data: cards, actions, the
// coach's reads and the judge's numbers.
import { cardStr } from '../engine/cards.js';
import { positionName, potSize, STREET_NAMES } from '../engine/game.js';

// Bump when the report's shape changes, so old reports can still be read.
export const REPORT_VERSION = 1;

const HERO = 0;
const cards = (cs) => (cs || []).map(cardStr).join(' ');
const pct = (x) => Math.round(x * 100);
// Typed arrays (the range picture keeps some) become plain, rounded arrays so the report
// survives a JSON round trip unchanged.
const plain = (x) => (x == null ? null : JSON.parse(JSON.stringify(x, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v, (n) => +n.toFixed(4)) : v))));

// What the table looked like at the moment of the decision. Called by Session.heroAct before
// the trainee's action is applied. Holds only what the trainee could see, plus the reads.
export function snapshotDecision(sess, s, judgeOpts) {
  const seats = [];
  for (let i = 0; i < s.n; i++) {
    const p = sess.seats[i];
    const row = {
      seat: i,
      name: i === HERO ? 'You' : p.nick,
      pos: positionName(s, i),
      startStack: s.startStacks[i],
      stack: s.stacks[i],
      inPot: s.total[i],
      folded: s.folded[i],
    };
    if (i !== HERO) {
      const r = sess.readOf(i);
      row.read = r.ranked.slice(0, 3).map((t) => ({ type: t.id, p: +t.p.toFixed(3) }));
      row.observed = { hands: r.notes.hands, vpip: r.notes.vpip, pfr: r.notes.pfr, showdowns: r.notes.showdowns.length };
      if (r.steaming) row.steaming = true;
    }
    seats.push(row);
  }
  return {
    game: sess.lineup ? 'home' : 'casino',
    blinds: [s.sbAmt, s.bbAmt],
    straddle: s.straddleAmt || 0,
    rake: sess.rake && sess.rake.label,
    handNo: sess.handNo,
    seats,
    actions: s.history.map((e) => ({ street: STREET_NAMES[e.street], seat: e.seat, who: e.seat === HERO ? 'You' : sess.seats[e.seat].nick, type: e.type, to: e.to, amount: e.amount })),
    pot: potSize(s),
    heat: +sess.heat.toFixed(3),
    judge: { seed: judgeOpts.seed, samples: judgeOpts.samples },
  };
}

// The hidden part (opponents' real styles and cards), added to a hand's decisions only once the
// hand is over, so a report never gives away a hand still being played.
export function handTruth(sess, s) {
  const out = [];
  for (let i = 0; i < s.n; i++) {
    if (i === HERO) continue;
    const p = sess.seats[i];
    out.push({ seat: i, name: p.nick, type: p.type, tilt: !!p.tilt, cards: cards(s.hole[i]) });
  }
  return { board: cards(s.board), players: out, won: s.result ? s.result.won.slice() : null };
}

// The full report for one decision record (from Session.heroAct). `player` is what the trainee
// typed in the form: { preferred: option label or text, why: text }.
export function disputeReport(record, player = {}) {
  const v = record.verdict;
  return {
    kind: 'trainer-dispute',
    version: REPORT_VERSION,
    created: new Date().toISOString(),
    player: { preferred: player.preferred || '', why: player.why || '' },
    decision: {
      hand: record.hand,
      street: record.streetName,
      position: record.position,
      hole: cards(record.hole),
      board: cards(record.board),
      pot: record.pot,
      toCall: record.toCall,
      handText: record.handText,
    },
    verdict: {
      grade: v.grade,
      headline: record.headline,
      category: record.category || null,
      took: v.mine >= 0 ? v.options[v.mine].label : null,
      best: v.options[v.best].label,
      loss: Math.round(v.loss),
      se: Math.round(v.se * 10) / 10,
      samples: v.samples,
      options: v.options.map((o, i) => ({ label: o.label, ev: Math.round(o.ev * 10) / 10, close: !!o.close, best: i === v.best, took: i === v.mine })),
      reasons: record.reasons || [],
      theory: record.theory || null,
    },
    villain: record.villain ? { seat: record.villain.seat, name: record.villain.nick, picture: plain(record.villain.picture) } : null,
    table: record.snapshot || null,
    truth: record.truth || null,
  };
}

// The same report as plain text, for pasting into a message. The JSON goes underneath so we
// can load it back exactly.
export function disputeText(report) {
  const d = report.decision;
  const v = report.verdict;
  const t = report.table;
  const L = [];
  L.push(`Trainer dispute (report v${report.version})`);
  if (report.player.preferred) L.push(`I would: ${report.player.preferred}`);
  if (report.player.why) L.push(`Why: ${report.player.why}`);
  L.push('');
  L.push(`Hand ${d.hand}, ${d.street}, ${d.position}. You: ${d.hole}${d.board ? `  Board: ${d.board}` : ''}. Pot $${d.pot}${d.toCall ? `, $${d.toCall} to call` : ''}.`);
  if (t) {
    L.push(`Game: ${t.game}, blinds $${t.blinds[0]}/$${t.blinds[1]}${t.straddle ? `, straddle $${t.straddle}` : ''}.`);
    const acts = t.actions.filter((a) => a.type !== 'sb' && a.type !== 'bb').map((a) => `${a.street} ${a.who} ${a.type}${a.amount ? ' $' + a.to : ''}`);
    if (acts.length) L.push(`Action: ${acts.join(', ')}.`);
    for (const p of t.seats) {
      if (p.seat === HERO || p.folded) continue;
      const read = p.read.map((r) => `${r.type} ${pct(r.p)}%`).join(', ');
      L.push(`  ${p.name} (${p.pos}, $${p.stack}): read ${read}; watched ${p.observed.hands} hands${p.steaming ? '; on tilt' : ''}.`);
    }
  }
  L.push(`Verdict: ${v.grade} - ${v.headline}`);
  for (const o of v.options) L.push(`  ${o.best ? '*' : ' '} ${o.label}: ${o.ev >= 0 ? '+' : '-'}$${Math.abs(Math.round(o.ev))}${o.took ? '  <- you' : ''}${o.close && !o.best ? '  (too close to call)' : ''}`);
  L.push(`  over ${v.samples} run-outs; cost $${v.loss} +/- $${Math.round(2 * v.se)}`);
  if (report.truth) L.push(`After the hand: ${report.truth.players.filter((p) => p.cards).map((p) => `${p.name} was ${p.type}${p.tilt ? ' (tilted)' : ''} with ${p.cards}`).join('; ')}.`);
  L.push('');
  L.push('--- data ---');
  L.push(JSON.stringify(report));
  return L.join('\n');
}

export function disputeFileName(report) {
  return `trainer-dispute-hand${report.decision.hand}-${report.decision.street}.json`;
}
