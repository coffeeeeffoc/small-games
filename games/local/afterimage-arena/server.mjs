import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const port = Number(option('--port', '4406'));
const host = option('--host', '127.0.0.1');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json', '.png':'image/png', '.md':'text/plain; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = raw.replace(/^\/afterimage-arena(?=\/|$)/, '').replace(/^\/+/, '');
    let target = path.resolve(root, relative || 'index.html');
    if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if ((await stat(target)).isDirectory()) {
      if (!raw.endsWith('/')) { res.writeHead(301, { Location: raw + '/' }).end(); return; }
      target = path.join(target, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(await readFile(target));
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, host, () => console.log(`Afterimage Arena: http://${host}:${port}`)).on('error', e => { console.error(e.message); process.exitCode = 1; });
