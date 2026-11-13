// Versions the site's asset URLs so a push is fetched as a whole: every file gets ?v=<hash of its
// contents>, written into the HTML (stylesheets, font preloads, the module script), into fonts.css
// (the font files) and into an import map in play.html that covers every module under src/, so a
// browser never mixes cached old modules with new ones. No build step: run it before committing.
//   node scripts/stamp.js          update the files
//   node scripts/stamp.js --check  exit 1 if anything is out of date (the tests run this)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hash = (p) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex').slice(0, 10);
const changed = [];
const put = (p, text) => {
  let old = null;
  try {
    old = read(p);
  } catch {
    /* new file */
  }
  if (old === text) return;
  changed.push(p);
  if (!check) writeFileSync(join(root, p), text);
};

// 0. src/trainer/version.js: one build id over every module, so the judge worker (where import
//    maps do not apply) can tell the page whether its modules are the same version.
{
  const all = [];
  const list = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) list(p);
      else if (e.name.endsWith('.js') && p !== 'src/trainer/version.js') all.push(p);
    }
  };
  list('src');
  all.sort();
  const h = createHash('sha256');
  for (const f of all) h.update(f).update(readFileSync(join(root, f)));
  const map = Object.fromEntries(all.map((f) => [f, hash(f)]));
  put('src/trainer/version.js', `// Written by scripts/stamp.js: a build id over every module under src/, and each module's hash\n// (the judge worker checks the modules it loaded against these).\nexport const BUILD = '${h.digest('hex').slice(0, 12)}';\nexport const HASHES = ${JSON.stringify(map, null, 1)};\n`);
}

// 1. fonts.css points at the font files with their versions.
const FONTS = ['assets/fonts/space-grotesk-var.woff2', 'assets/fonts/IBMPlexMono-Medium-Latin1.woff2'];
let fontsCss = read('src/ui/fonts.css');
for (const f of FONTS) {
  const name = f.split('/').pop().replace(/\./g, '\\.');
  fontsCss = fontsCss.replace(new RegExp(`(url\\("\\.\\./\\.\\./assets/fonts/${name})(\\?v=[0-9a-f]+)?"\\)`), `$1?v=${hash(f)}")`);
}
put('src/ui/fonts.css', fontsCss);

// 2. Every module under src/, by its URL relative to the pages.
const modules = [];
const walk = (dir) => {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) modules.push(p);
  }
};
walk('src');
modules.sort();

// 3. The pages: stylesheet and preload links, the module script and the import map.
const version = (p) => (check && changed.includes(p) ? null : hash(p));
for (const page of ['index.html', 'faq.html', 'play.html']) {
  let html = read(page);
  html = html.replace(/(<link rel="stylesheet" href=")(src\/ui\/[a-z]+\.css)(\?v=[0-9a-f]+)?(">)/g, (m, a, p, _v, b) => `${a}${p}?v=${p === 'src/ui/fonts.css' ? createHash('sha256').update(fontsCss).digest('hex').slice(0, 10) : hash(p)}${b}`);
  html = html.replace(/(<link rel="preload" href=")(assets\/fonts\/[^"?]+)(\?v=[0-9a-f]+)?(")/g, (m, a, p, _v, b) => `${a}${p}?v=${hash(p)}${b}`);
  if (page === 'play.html') {
    const map = { imports: Object.fromEntries(modules.filter((m) => m !== 'src/ui/app.js').map((m) => [`./${m}`, `./${m}?v=${hash(m)}`])) };
    const tag = `<script type="importmap">\n${JSON.stringify(map, null, 1)}\n</script>`;
    if (/<script type="importmap">[\s\S]*?<\/script>/.test(html)) html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, tag);
    else html = html.replace('<script type="module" src="src/ui/app.js', `${tag}\n<script type="module" src="src/ui/app.js`);
    html = html.replace(/<script type="module" src="src\/ui\/app\.js(\?v=[0-9a-f]+)?"><\/script>/, `<script type="module" src="src/ui/app.js?v=${hash('src/ui/app.js')}"></script>`);
  }
  put(page, html);
}
void version;
void relative;

if (check) {
  if (changed.length) {
    console.error(`Asset versions are out of date in: ${changed.join(', ')}. Run: node scripts/stamp.js`);
    process.exit(1);
  }
  console.log('Asset versions are up to date.');
} else console.log(changed.length ? `Updated: ${changed.join(', ')}` : 'Already up to date.');
