// Local server: serves public/ and POST /api/plan. Run: npm run dev  (needs .env.local)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePlan } from './lib/handler.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/plan') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end('POST only'); }
    const ip = req.socket.remoteAddress;
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 10000) { res.writeHead(413); return res.end('Request too large'); } }
    let body = {};
    try { body = JSON.parse(raw); } catch {}
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
    return handlePlan({ body, ip, write: (o) => res.write(JSON.stringify(o) + '\n'), end: () => res.end() });
  }
  const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, host, () => console.log(`Saturday for Two → http://${host}:${port}`));
