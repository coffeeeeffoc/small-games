import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const desktop = process.argv.includes('--desktop');
const root = fileURLToPath(
  new URL(desktop ? '../build/web-desktop/' : '../dist/', import.meta.url),
);
const port = Number(process.env.PORT || (desktop ? 4319 : 4318));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.wav': 'audio/wav',
};
createServer(async (req, res) => {
  try {
    const file = resolve(
      root,
      '.' +
        decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
          /\/$/,
          '/index.html',
        ),
    );
    if (!file.startsWith(resolve(root) + sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res
      .writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(data);
  } catch {
    res.writeHead(404).end('Build the game first: pnpm build');
  }
}).listen(port, '0.0.0.0', () => console.log(`Night Overwatch: http://localhost:${port}`));
