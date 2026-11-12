// Tiny static file server for the trainer. Run: npm start, then open http://localhost:5173
// (the landing page; the table itself is play.html)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = +(process.env.PORT || 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error('outside root');
    const body = await readFile(file);
    const type = types[extname(file)] || 'application/octet-stream';
    // charset only for text; images and fonts are binary
    res.writeHead(200, { 'content-type': /^(text|application\/json|image\/svg)/.test(type) ? type + '; charset=utf-8' : type, 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Poker trainer running at http://localhost:${port}`));
