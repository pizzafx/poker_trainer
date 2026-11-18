// Drill bank version: a hash of everything a bank verdict rests on (the engine, the opponent model, the judge,
// the grading and the drill gate). When it changes, scripts/drillcheck.js re-gates the bank.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const VERSION_FILES = [
  'src/engine/game.js', 'src/engine/hands.js', 'src/engine/features.js', 'src/engine/cards.js',
  'src/bots/policy.js', 'src/bots/profiles.js',
  'src/trainer/judge.js', 'src/trainer/grade.js', 'src/trainer/belief.js', 'src/trainer/ranges.js', 'src/trainer/explain.js',
  'scripts/drill/gate.js', 'scripts/drill/skills.js', 'scripts/drill/spot.js',
];

export function bankVersion() {
  const h = crypto.createHash('sha256');
  for (const f of VERSION_FILES) h.update(fs.readFileSync(path.join(ROOT, f)));
  return h.digest('hex').slice(0, 12);
}
