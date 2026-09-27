import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 4405;
const host = args.includes('--host') ? args[args.indexOf('--host') + 1] : '0.0.0.0';
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain' };
createServer(async (req, res) => {
  try {
    let requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (requestPath === '/precision-demolition') { res.writeHead(302, { Location: '/precision-demolition/' }); res.end(); return; }
    requestPath = requestPath.replace(/^\/precision-demolition\//, '/');
    let target = path.resolve(root, '.' + requestPath);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403); res.end('Forbidden'); return; }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': `${types[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, host, () => console.log(`一分钟拆对墙 http://localhost:${port}/`));
