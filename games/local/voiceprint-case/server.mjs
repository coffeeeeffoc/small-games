import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(
  new URL(process.argv.includes('--dist') ? './dist/' : './', import.meta.url),
);
const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
const port = Number(
  process.argv.includes('--port') ? argument('--port') : process.env.PORT || 4178,
);
const host = process.argv.includes('--host') ? argument('--host') : '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const filename = path.resolve(
      root,
      '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname),
    );
    const relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative) || pathname.includes('\0')) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (!(await stat(filename)).isFile()) throw new Error('Not a file');
    const data = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(data);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, host, () =>
  console.log(`声纹疑案 http://${host}:${server.address().port} (Ctrl+C 停止)`),
);
