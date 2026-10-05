import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(
  new URL(process.argv.includes('--dist') ? './dist/' : './', import.meta.url),
);
const port = Number(process.env.PORT || 4420);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, `.${pathname}`);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res
      .writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.on('error', (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => console.log(`收兵再冲 http://localhost:${port}`));
