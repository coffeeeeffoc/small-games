import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(path.join(root, 'index.html')))
  throw Error('先使用 Creator 3.8.8 执行 build，再预览真实 Cocos 产物。');
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'),
        file = path.resolve(
          root,
          '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
        );
      if (!file.startsWith(root)) return res.writeHead(403).end();
      const data = await readFile(file),
        ext = path.extname(file);
      res
        .writeHead(200, {
          'Content-Type':
            {
              '.html': 'text/html; charset=utf-8',
              '.js': 'text/javascript',
              '.json': 'application/json',
              '.css': 'text/css',
              '.png': 'image/png',
              '.wasm': 'application/wasm',
              '.wav': 'audio/wav',
            }[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(Number(process.env.PORT) || 4326, '0.0.0.0', () =>
    console.log('归途站 Creator 预览：http://localhost:4326/ （?dev=1&level=100 自由选关）'),
  );
