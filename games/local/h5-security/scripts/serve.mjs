import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const production = process.argv.includes('--production');
const root = resolve(production ? 'dist' : '.');
const portArg = process.argv.indexOf('--port');
const hostArg = process.argv.indexOf('--host');
const port = Number(portArg < 0 ? process.env.PORT || 4173 : process.argv[portArg + 1]);
const host = hostArg < 0 ? '127.0.0.1' : process.argv[hostArg + 1];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const relative = path === '/' ? 'index.html' : path.slice(1);
    const file = resolve(root, !production && relative.startsWith('audio/') ? `public/${relative}` : relative);
    if (!file.startsWith(root + sep) || relative.includes('\\') || relative.split('/').some(part => part.startsWith('.')) || (!production && !/^(index\.html|src\/|audio\/)/.test(relative))) {
      res.writeHead(404); return res.end('Not found');
    }
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, host, () => console.log(`来电之间 · ${production ? 'production' : 'development'} · http://${host}:${port}`));
