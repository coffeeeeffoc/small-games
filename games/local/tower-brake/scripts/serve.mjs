import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const desktop = process.argv.includes('--desktop');
const root = fileURLToPath(
  new URL(desktop ? '../build/web-desktop/' : '../dist/', import.meta.url),
);
const option = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const port = Number(option('--port', process.env.PORT || 4452));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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
}).listen(port, option('--host', '127.0.0.1'), () =>
  console.log(`Tower Brake: http://localhost:${port}`),
);
