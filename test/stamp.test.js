// The asset versions in the pages match the files (run `node scripts/stamp.js` after a change),
// so a push is fetched as a whole and old and new modules never mix in a browser cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('asset versions are up to date', () => {
  const script = fileURLToPath(new URL('../scripts/stamp.js', import.meta.url));
  try {
    execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' });
  } catch (e) {
    assert.fail(String(e.stderr || e.message));
  }
});
