import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv.includes('--dist') ? path.join(workspace, 'dist') : workspace;
const port = Number(process.env.PORT || 4177);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname) === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
    const target = path.resolve(root, name);
    const relative = path.relative(root, target);
    if (!target.startsWith(root + path.sep) || !['index.html', 'src', 'assets', 'favicon.svg'].includes(relative.split(path.sep)[0]) || name.includes('\\')) {
      res.writeHead(404).end('Not found'); return;
    }
    if (!(await stat(target)).isFile()) throw new Error('Not a file');
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`万象旅团 ${root === workspace ? 'development' : 'production'}: http://127.0.0.1:${port}`));
