import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    host: { type: 'string', default: '0.0.0.0' },
    dist: { type: 'boolean', default: false },
  },
});
const root = fileURLToPath(new URL(values.dist ? './dist/' : './', import.meta.url));
const port = Number(values.port ?? process.env.PORT ?? 4428);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !values.host.trim()) {
  throw new Error('Invalid preview host or port');
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
};
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/carrom-club') {
      response.writeHead(308, { Location: '/carrom-club/' }).end();
      return;
    }
    if (pathname.startsWith('/carrom-club/')) pathname = pathname.slice('/carrom-club'.length);
    if (pathname.includes('\\') || pathname.includes('\0')) {
      response.writeHead(400).end('Invalid path');
      return;
    }
    let filename = path.resolve(root, `.${pathname}`);
    if (filename !== path.resolve(root) && !filename.startsWith(path.resolve(root) + path.sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const body = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream',
      'Content-Length': body.byteLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
  }
});
server.listen(port, values.host, () => console.log(`克朗棋: http://localhost:${port}/`));
