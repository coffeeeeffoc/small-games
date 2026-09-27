import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const port = Number(option('--port', process.env.PORT || 4404));
const host = option('--host', '127.0.0.1');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.png':'image/png', '.md':'text/plain; charset=utf-8', '.json':'application/json' };
http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/rescue-team') { res.writeHead(302, { Location:'/rescue-team/' }).end(); return; }
    pathname = pathname.replace(/^\/rescue-team\//, '/');
    const file = path.resolve(root, '.' + pathname);
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403).end(); return; }
    const target = (await stat(file)).isDirectory() ? path.join(file, 'index.html') : file;
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type':mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store' }).end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, host, () => console.log(`小城救援队 http://${host}:${port}/`));
