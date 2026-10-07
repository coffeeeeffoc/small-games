import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(
  new URL(process.argv.includes('--dist') ? './dist/' : './', import.meta.url),
);
const port = Number(process.env.PORT || 4451);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(
      root,
      '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname),
    );
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const bytes = await readFile(target);
    response.writeHead(200, {
      'Content-Type': `${mime[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`打破笼子接住人 http://localhost:${port}/`),
);
