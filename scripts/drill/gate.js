// Drill bank: the robustness gate (DRILL_CURRICULUM_SPEC 2.2, MATH's reference notes/scripts/drill_gate.js).
// A spot is kept only if every answer family is exactly best, fine or wrong, in every scenario on three seeds,
// and the table coach agrees: a wrong family is one play would flag (or, before the flop, show a tip naming
// the answer), and a play the coach passes by design scores fine, never wrong.

import { judgeDecision, pairedGap, tiltedEvs } from '../../src/trainer/judge.js';
import { gradeVerdict } from '../../src/trainer/grade.js';
import { HERO_PROFILE } from '../../src/bots/profiles.js';
import { verdictFor, envFor } from '../gradeall.js';
import { live } from './skills.js';

const THIN_HERO = { ...HERO_PROFILE, valueBet: HERO_PROFILE.valueBet.map((x) => x - 0.08), slowplay: 0 };
// the never-flag passes: a play the coach passes this way scores fine (STRAT's G4 ruling)
const DESIGNED = new Set(['thinValue', 'mwCheck', 'checkOOP', 'foldsBetter', 'preBluff', 'passedBluff', 'bluffRaise']);
// guardrails that decide a grade rather than measure it (G5)
const GUARDRAIL_RULES = new Set(['R5b', 'R6']);
// the answer family each preflop tip names (a tip naming the drill's answer counts as a flag, G4)
const TIP_NAMES = { limp: ['raise'], wideOpen: ['fold'], wideLimp: ['fold'], isoLimp: ['raise'], junk3bet: ['fold', 'call'] };

export const DEFAULTS = { N: 6000, Npre: 8000, NpreMax: 16000, screen: 1200, wrongBars: 2, screenBars: 1, preBase: 1, preShift: 0.5, preFoldLimp: 0.4, isoG4: true, seeds: [1, 2, 3], screenSeed: 901, screenPre: null };
// seeds: the bank seeds (the first also grades G4); MATH's sign-off re-judge passes others. screenPre: the
// preflop screen margin in bb (default preShift) // isoG4: the L2 tip counts under G4 (STRAT and CURR, 17 Nov)

export const family = (o) => (o.type === 'raise' ? 'raise' : o.type);
// family values on one scenario row: the best option of each family
function famVals(options, evs) {
  const out = {};
  options.forEach((o, i) => {
    const k = family(o);
    if (!(k in out) || evs[i] > out[k].ev) out[k] = { ev: evs[i], i };
  });
  return out;
}
const actionOf = (o) => (o.type === 'raise' ? { type: 'raise', to: o.to } : { type: o.type });

// The bank-strength scenario rows: three seeds, each with the base run, calls -5% and +5%, the thin-value
// stand-in (postflop under six players) and, postflop, ranges x2 and x1/2 (re-weightings of the base run).
function bankRows(s, belief, pre, n, want, seeds) {
  const rows = [];
  const bases = [];
  const opp = live(s).length;
  for (const seed of seeds) {
    const base = { heat: 0, samples: n, seed };
    const vb = judgeDecision(s, 0, belief, null, base);
    bases.push(vb);
    const runs = [['base', vb]];
    for (const shift of [-0.05, 0.05]) runs.push([`calls${shift > 0 ? '+' : '-'}5`, judgeDecision(s, 0, belief, null, { ...base, shift })]);
    if (!pre && opp + 1 < 6) runs.push(['thin', judgeDecision(s, 0, belief, null, { ...base, heroProfile: THIN_HERO })]);
    for (const [name, v] of runs) {
      const vals = famVals(v.options, v.options.map((o) => o.ev));
      const gapSe = {};
      for (const k of Object.keys(vals)) if (k !== want && vals[want]) gapSe[k] = pairedGap(v, vals[want].i, vals[k].i);
      rows.push({ seed, name, vals, gapSe });
    }
    if (!pre) for (const k of [2, 0.5]) rows.push({ seed, name: `ranges x${k}`, vals: famVals(vb.options, tiltedEvs(vb, k)), gapSe: null });
  }
  return { rows, bases };
}

// Gate one spot. `skill.want` is the family (or families) the skill's rule names. `pinnedReads` are the reads
// the belief was built from (for the coach's grading). Returns { ok: false, reason, log } or
// { ok: true, log, result } with the families, option values, margins, cost buckets and the graded verdicts.
export function gateSpot(s, belief, pinnedReads, skill, o = {}) {
  const opts = { ...DEFAULTS, ...o };
  const pre = s.street === 0;
  const bb = s.bbAmt;
  const log = {};
  const reject = (reason) => ({ ok: false, reason, log });
  const wants = [].concat(skill.want);

  // screen: one cheap run; reject when the rule's family is not on top or the best family the rule calls
  // wrong is within a bar
  const v0 = judgeDecision(s, 0, belief, null, { heat: 0, samples: opts.screen, seed: opts.screenSeed });
  const bar = pre ? bb : Math.max(3 * bb, 0.1 * v0.pot);
  const f0 = famVals(v0.options, v0.options.map((x) => x.ev));
  const fams = Object.keys(f0);
  const top0 = fams.reduce((a, b) => (f0[a].ev >= f0[b].ev ? a : b));
  log.pot = v0.pot;
  log.bar = bar;
  log.screen = Object.fromEntries(fams.map((k) => [k, +(f0[k].ev / bb).toFixed(2)]));
  if (!wants.includes(top0)) return reject('screen: G6 the best family is not the rule');
  const want = top0;
  const rest = fams.filter((k) => !wants.includes(k)).map((k) => f0[k].ev);
  if (rest.length && f0[want].ev - Math.max(...rest) < (pre ? (opts.screenPre ?? opts.preShift) * bb : opts.screenBars * bar)) return reject('screen: margin under a bar');

  // bank strength; before the flop raise the samples once when the 4 SE test fails
  const others = fams.filter((k) => k !== want);
  let n = pre ? opts.Npre : opts.N;
  let rows;
  let bases;
  let cls;
  let gaps;
  for (;;) {
    ({ rows, bases } = bankRows(s, belief, pre, n, want, opts.seeds));
    if (!rows.every((r) => r.vals[want])) return reject('bank: the rule family is missing in a run');
    gaps = Object.fromEntries(others.map((k) => [k, rows.map((r) => (r.vals[want].ev - r.vals[k].ev) / bar)]));
    cls = {};
    for (const k of others) {
      if (pre) {
        // raise-or-limp keeps 1bb base, 0.5bb under calls +-5%; fold-or-limp 0.4bb on every row (MATH)
        const foldLimp = want === 'fold' && k === 'call';
        const baseMin = foldLimp ? opts.preFoldLimp : opts.preBase;
        const shiftMin = foldLimp ? opts.preFoldLimp : opts.preShift;
        const baseRows = rows.filter((r) => r.name === 'base').map((r) => (r.vals[want].ev - r.vals[k].ev) / bb);
        const shiftRows = rows.filter((r) => r.name !== 'base').map((r) => (r.vals[want].ev - r.vals[k].ev) / bb);
        cls[k] = Math.min(...baseRows) >= baseMin && Math.min(...shiftRows) >= shiftMin ? 'wrong' : Math.max(...baseRows.map(Math.abs), ...shiftRows.map(Math.abs)) <= 0.5 ? 'fine' : 'between';
      } else cls[k] = Math.min(...gaps[k]) >= opts.wrongBars ? 'wrong' : Math.max(...gaps[k].map(Math.abs)) <= 1 ? 'fine' : 'between';
    }
    const g3 = rows.some((r) => r.gapSe && others.some((k) => cls[k] === 'wrong' && !(r.gapSe[k].mean > 4 * r.gapSe[k].se)));
    if (!g3 || !pre || n >= opts.NpreMax) {
      if (g3) {
        const r = rows.find((x) => x.gapSe && others.some((k) => cls[k] === 'wrong' && !(x.gapSe[k].mean > 4 * x.gapSe[k].se)));
        const k = others.find((y) => cls[y] === 'wrong' && !(r.gapSe[y].mean > 4 * r.gapSe[y].se));
        return reject(`G3 ${k} ${r.name} seed ${r.seed}: ${(r.gapSe[k].mean / (r.gapSe[k].se || 1)).toFixed(1)} SE`);
      }
      break;
    }
    n = Math.min(opts.NpreMax, n * 2);
  }
  log.samples = n;
  log.want = want;
  log.options = v0.options.map((x) => x.label);
  log.rows = rows.map((r) => ({ seed: r.seed, name: r.name, vals: Object.fromEntries(Object.entries(r.vals).map(([k, x]) => [k, +(x.ev / bb).toFixed(3)])) }));
  log.minGap = Object.fromEntries(others.map((k) => [k, +Math.min(...gaps[k]).toFixed(2)]));
  log.maxGap = Object.fromEntries(others.map((k) => [k, +Math.max(...gaps[k]).toFixed(2)]));
  const ratios = rows.filter((r) => r.gapSe).flatMap((r) => others.filter((k) => cls[k] === 'wrong').map((k) => r.gapSe[k].mean / (r.gapSe[k].se || 1e-9)));
  log.minSe = ratios.length ? +Math.min(...ratios).toFixed(1) : null;
  log.cls = { ...cls };
  const between = others.filter((k) => cls[k] === 'between');
  if (between.length) return reject(between.some((k) => Math.min(...gaps[k]) < 0) ? `G1 ${between.join(',')} on top in some scenario` : `G2 ${between.join(',')} between fine and wrong`);
  if (others.filter((k) => cls[k] === 'fine').length > 1) return reject('fine: two or more fine families');

  // G4 and G5: the coach's own grade of each wrong family's best option, from the bank-strength values (the
  // first seed's base run), and of the best option itself
  const vb = bases[0];
  const fb = famVals(vb.options, vb.options.map((x) => x.ev));
  const env = envFor(belief, pinnedReads);
  const gOpts = { heat: 0, samples: n, seed: opts.seeds[0] };
  const gradeOf = (i) => gradeVerdict(verdictFor(vb, i, s), s, actionOf(vb.options[i]), gOpts, env);
  const graded = {};
  const bestG = gradeOf(fb[want].i);
  graded[want] = bestG;
  if (bestG.grade !== 'good' || GUARDRAIL_RULES.has(bestG.rule)) return reject(`G5 the best option is graded ${bestG.grade}${bestG.rule ? ' rule ' + bestG.rule : ''}`);
  const costBucket = {};
  for (const k of others) {
    const g = gradeOf(fb[k].i);
    graded[k] = g;
    log.g4 = { ...(log.g4 || {}), [k]: `${g.grade}${g.note ? ' note ' + g.note : ''}${g.rule ? ' rule ' + g.rule : ''}${g.tip ? ' tip ' + g.tip.kind : ''}` };
    if (GUARDRAIL_RULES.has(g.rule)) return reject(`G5 ${k} is decided by guardrail ${g.rule}`);
    // the coach must name an answer in the drill's best family (a habit play or robustness pick would not)
    if (g.grade !== 'good' && family(g.options[g.best]) !== want) return reject(`G5 the coach names ${family(g.options[g.best])} against ${k}`);
    const tipNames = g.tip && (g.tip.kind !== 'isoLimp' || opts.isoG4) ? TIP_NAMES[g.tip.kind] || [] : [];
    if (!pre && cls[k] === 'fine') {
      // within a bar, yet the coach flags it (money in, the price anchors): keep it out of the bank (MATH)
      if (g.grade !== 'good' && !g.note) return reject(`G4 ${k} is within a bar but play flags it ${g.grade}`);
      costBucket[k] = 'small';
      continue;
    }
    if (pre && cls[k] === 'fine') {
      // close on the margins, yet play flags it or shows a tip naming the answer: keep it out of the bank
      // rather than score fine what the coach calls out (STRAT and CURR, 17 Nov)
      if ((g.grade !== 'good' && !g.note) || tipNames.includes(want)) return reject(`G4 ${k} is within the margin but play ${g.grade !== 'good' ? 'flags it' : 'tips ' + g.tip.kind}`);
      costBucket[k] = 'small';
      continue;
    }
    if (pre) {
      if (g.grade !== 'good' && !g.note) costBucket[k] = g.grade === 'blunder' ? 'large' : 'medium';
      else if (tipNames.includes(want)) costBucket[k] = 'small';
      else {
        cls[k] = 'fine'; // a silent pass before the flop scores fine (CURR, the owner's "keep consistent")
        costBucket[k] = 'small';
      }
      continue;
    }
    if (DESIGNED.has(g.note) || g.rule === 'R5') {
      cls[k] = 'fine';
      costBucket[k] = 'small';
      continue;
    }
    if (g.grade === 'good' || g.note) return reject(`G4 ${k} graded ${g.grade}${g.note ? ' (' + g.note + ')' : ''}`);
    costBucket[k] = g.grade === 'blunder' ? 'large' : 'medium';
  }
  const fine = others.filter((k) => cls[k] === 'fine');
  if (fine.length > 1) return reject('fine: two or more fine families (with the coach’s passes)');
  if (!others.some((k) => cls[k] === 'wrong') && !fine.length) return reject('no other family');

  // per family: its value in bb on the first seed's base run, and the least margin over all rows
  const families = { [want]: 'best', ...Object.fromEntries(others.map((k) => [k, cls[k]])) };
  const optionsOut = Object.keys(f0).map((k) => {
    const op = vb.options[fb[k].i];
    return { family: k, label: op.label, type: op.type, ...(op.type === 'raise' ? { to: op.to } : {}), evBb: +(op.ev / bb).toFixed(2) };
  });
  const wrongs = others.filter((k) => cls[k] === 'wrong');
  const marginBars = wrongs.length ? Math.min(...wrongs.map((k) => Math.min(...gaps[k]))) : 0;
  const marginBb = wrongs.length ? Math.min(...wrongs.map((k) => Math.min(...rows.map((r) => (r.vals[want].ev - r.vals[k].ev) / bb)))) : 0;
  const costBb = Object.fromEntries(others.map((k) => [k, +((fb[want] ? vb.options[fb[want].i].ev - vb.options[fb[k].i].ev : 0) / bb).toFixed(1)]));
  return { ok: true, log, result: { want, families, options: optionsOut, marginBars: +marginBars.toFixed(2), marginBb: +marginBb.toFixed(2), costBb, costBucket, graded, base: vb, samples: n } };
}
