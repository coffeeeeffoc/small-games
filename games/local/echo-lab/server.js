import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep) || pathname.includes('\0')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (!(await stat(filename)).isFile()) throw new Error('Not a file');
    const data = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is busy. Close the other server or set PORT to another number.`
      : error,
  );
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${server.address().port}`;
  console.log(
    `\n  ECHO LAB / 回声实验室\n  ${url}\n\n  Press Ctrl+C to stop. No install or build step needed.\n`,
  );
  if (process.argv.includes('--open')) {
    const command =
      process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : process.platform === 'darwin'
          ? ['open', [url]]
          : ['xdg-open', [url]];
    const child = spawn(command[0], command[1], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  }
});
