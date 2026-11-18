// Drill bank: PRO's blind check. Draws 20 accepted spots per skill at random and writes two files: the
// questions (the card as the player sees it, no skill name and no grades) and the answer key by id.
//
//   node scripts/drillpro.js <run dir> <out dir> [per skill, 20] [seed]

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spotCard } from '../src/drill/card.js';
import { bankVersion } from './drill/version.js';

const [dir, out, per = '20', seedArg = '1'] = process.argv.slice(2);
if (!dir || !out) throw new Error('usage: node scripts/drillpro.js <run dir> <out dir> [per skill] [seed]');
const version = bankVersion();
let r = +seedArg;
const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const bySkill = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl') && !x.endsWith('.log.jsonl'))) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(line);
    if (e.bankVersion === version) (bySkill[e.skill] ||= []).push(e);
  }
}
const picked = [];
for (const es of Object.values(bySkill)) {
  const pool = es.slice();
  for (let k = 0; k < +per && pool.length; k++) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
}
// shuffle across skills, so the order gives nothing away
for (let i = picked.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [picked[i], picked[j]] = [picked[j], picked[i]];
}

const button = (o, c) => {
  if (o.type === 'fold') return 'Fold';
  if (o.type === 'check') return 'Check';
  if (o.type === 'call') return c.street === 'Preflop' && !c.lines[0].text.includes('raise') ? `Limp $${c.toCall}` : `Call $${c.toCall}`;
  return `${c.toCall > 0 ? 'Raise to' : 'Bet'} $${o.to}`;
};
const q = [`# Drill blind check: questions (${picked.length} spots)`, '', `Bank version ${version}. Stakes $1/$2, 10% rake to $5. Every opponent's read is exact: it is the type they really are.`, 'Answer each with one option and a confidence (sure / leaning / unsure). The answer key is a separate file.', ''];
const key = [`# Drill blind check: answer key`, '', `Bank version ${version}.`, '', '| # | question id | bank id | skill | best | fine | each option (bb behind best) |', '|---|---|---|---|---|---|---|'];
// an opaque id per spot, so the questions give no skill away (the key maps it back)
const blind = (id) => `q${crypto.createHash('sha1').update(id).digest('hex').slice(0, 8)}`;
picked.forEach((e, n) => {
  const c = spotCard(e.spot, e.reads);
  q.push(`## ${n + 1}. ${blind(e.id)}`);
  q.push(`- You: ${c.position}, ${c.hole.join(' ')}, ${c.stackBb}bb behind ($${c.stack}); effective ${c.effectiveBb}bb.`);
  q.push(`- ${c.street}${c.board.length ? `, board ${c.board.join(' ')}` : ''}. Pot $${c.pot} (${c.potBb}bb)${c.toCall ? `, $${c.toCall} (${c.toCallBb}bb) to call` : ', nothing to call'}.`);
  for (const l of c.lines) q.push(`- ${l.street}${l.board.length ? ` [${l.board.join(' ')}]` : ''}: ${l.text}`);
  for (const o of c.opponents) q.push(`- Read: ${o.pos}, ${o.label} · ${o.strength} · ${o.line}`);
  q.push(`- Options: ${e.options.map((o) => button(o, c)).join(' / ')}`);
  q.push('- Your answer:', '');
  const best = Object.entries(e.families).find(([, v]) => v === 'best')[0];
  const fine = Object.entries(e.families).filter(([, v]) => v === 'fine').map(([k]) => k);
  const bestEv = e.options.find((o) => o.family === best).evBb;
  key.push(`| ${n + 1} | ${blind(e.id)} | ${e.id} | ${e.skill} | ${best} | ${fine.join(', ') || '—'} | ${e.options.map((o) => `${o.family} ${(bestEv - o.evBb).toFixed(1)}`).join(', ')} |`);
});
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'DRILL_PRO_QUESTIONS.md'), q.join('\n') + '\n');
fs.writeFileSync(path.join(out, 'DRILL_PRO_ANSWERS.md'), key.join('\n') + '\n');
console.log(`${picked.length} spots: ${Object.entries(bySkill).map(([k, v]) => `${k} ${Math.min(+per, v.length)} of ${v.length}`).join(', ')}`);
