import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const portArg = process.argv.indexOf('--port');
const port = Number(portArg < 0 ? 4401 : process.argv[portArg + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('无效端口');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.json': 'application/json' };
http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/balloon-movers') { res.writeHead(301, { Location: '/balloon-movers/' }); return res.end(); }
    path = path.replace(/^\/balloon-movers\//, '/');
    const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end('Forbidden'); }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`气球搬家公司 http://localhost:${port}`)).on('error', e => { console.error(e.message); process.exitCode = 1; });
