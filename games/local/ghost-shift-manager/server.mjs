import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4407);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer(async (req, res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/ghost-shift-manager') { res.writeHead(302, {Location:'/ghost-shift-manager/'}).end(); return; }
    name = name.replace(/^\/ghost-shift-manager\//, '/');
    const target = await realpath(path.resolve(root, '.' + (name.endsWith('/') ? name + 'index.html' : name)));
    if (!target.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(target);
    res.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) { res.writeHead(error instanceof URIError ? 400 : 404).end('Not found'); }
});
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Ghost Shift Manager: http://127.0.0.1:${port}/`));
