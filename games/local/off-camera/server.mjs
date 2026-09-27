import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const port = Number(opt('--port', process.env.PORT || 4403));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const host = opt('--host', '127.0.0.1');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/off-camera') { res.writeHead(308, { Location: '/off-camera/' }); res.end(); return; }
    if (pathname.startsWith('/off-camera/')) pathname = pathname.slice('/off-camera'.length);
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`off-camera http://${host}:${port}/`));
