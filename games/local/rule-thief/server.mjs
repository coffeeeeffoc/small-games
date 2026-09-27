import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const value = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const port = Number(value('--port', 4408)), host = value('--host', '127.0.0.1');
if (!Number.isInteger(port) || port < 1 || port > 65535 || !host) throw new Error('Invalid host or port');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/rule-thief') { res.writeHead(302, { Location: '/rule-thief/' }).end(); return; }
    if (pathname.startsWith('/rule-thief/')) pathname = pathname.slice('/rule-thief'.length);
    let filename = path.resolve(root, '.' + pathname);
    if (filename !== root && !filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const body = await readFile(filename);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) { res.writeHead(error instanceof URIError ? 400 : 404).end('Not found'); }
});
server.on('error', error => { console.error(`Cannot start Rule Thief: ${error.message}`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Rule Thief: http://${host}:${port}/`));
