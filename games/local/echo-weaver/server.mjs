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
const root = path.resolve(fileURLToPath(new URL(values.dist ? './dist/' : './', import.meta.url)));
const port = Number(values.port ?? process.env.PORT ?? 4411);
const host = values.host;
if (!Number.isInteger(port) || port < 1 || port > 65535 || !host.trim()) {
  throw new Error('Port must be an integer from 1 to 65535 and host must not be empty.');
}
const mime = {
  '.html': 'text/html; charset=utf-8',
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
    if (pathname === '/echo-weaver') {
      response.writeHead(308, { Location: '/echo-weaver/' }).end();
      return;
    }
    if (pathname.startsWith('/echo-weaver/')) pathname = pathname.slice('/echo-weaver'.length);
    if (pathname.includes('\\') || pathname.includes('\0')) {
      response.writeHead(400).end('Invalid path');
      return;
    }
    let filename = path.resolve(root, `.${pathname}`);
    if (filename !== root && !filename.startsWith(root + path.sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const body = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream',
      'Content-Length': body.byteLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
  }
});
server.on('error', (error) => {
  console.error(`Echo Weaver: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  const hostname = host === '0.0.0.0' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
  console.log(`Echo Weaver: http://${hostname}:${port}/`);
});
