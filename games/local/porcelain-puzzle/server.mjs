import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { Rooms, RoomError } from './src/rooms.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
};
export function createGameServer({ directory = root, rooms = new Rooms() } = {}) {
  const limits = new Map();
  const sweep = setInterval(() => {
    rooms.sweep();
    const now = Date.now();
    for (const [ip, b] of limits) if (now - b.at > 60000) limits.delete(ip);
  }, 5000);
  sweep.unref();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/porcelain/')) {
        const origin = req.headers.origin;
        const allowed =
          origin &&
          (new URL(origin).host === req.headers.host ||
            (process.env.PORCELAIN_ALLOWED_ORIGINS || '').split(',').includes(origin));
        if (origin && !allowed) throw new RoomError('来源不受支持', 403);
        if (allowed) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          });
          res.end();
          return;
        }
        const parts = url.pathname.split('/').filter(Boolean),
          code = parts[3],
          operation = parts[4],
          token = req.headers.authorization?.replace(/^Bearer /, '');
        let limitKey = `anonymous:${req.socket.remoteAddress}`;
        // Only a verified room session earns its own bucket; arbitrary bearer values do not.
        if (code && token) {
          try {
            const { player } = rooms.auth(code, token);
            limitKey = `player:${player.id}`;
          } catch {}
        }
        const bucket = limits.get(limitKey) || { at: Date.now(), n: 0 };
        if (Date.now() - bucket.at > 60000) {
          bucket.at = Date.now();
          bucket.n = 0;
        }
        bucket.n++;
        limits.set(limitKey, bucket);
        if (bucket.n > 600) throw new RoomError('操作太快，请稍等', 429);
        let body = {};
        if (req.method === 'POST') {
          let text = '';
          for await (const chunk of req) {
            text += chunk;
            if (text.length > 8192) throw new RoomError('请求过大', 413);
          }
          try {
            body = JSON.parse(text || '{}');
          } catch {
            throw new RoomError('请求格式无效', 400);
          }
          if (!body || typeof body !== 'object' || Array.isArray(body))
            throw new RoomError('请求格式无效', 400);
        }
        let result;
        if (url.pathname === '/api/porcelain/health' && req.method === 'GET')
          result = { game: 'porcelain-puzzle', ready: true };
        else if (parts.length === 3 && req.method === 'POST') result = rooms.create(body);
        else if (code && operation === 'join' && req.method === 'POST')
          result = rooms.join(code, body);
        else if (code && !operation && req.method === 'GET') result = rooms.poll(code, token);
        else if (code && operation === 'actions' && req.method === 'POST')
          result = rooms.action(code, token, body);
        else throw new RoomError('入口不存在', 404);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result));
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end();
        return;
      }
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      const file = path.resolve(directory, '.' + pathname);
      if (!file.startsWith(path.resolve(directory) + path.sep) || pathname.includes('/.')) {
        res.writeHead(403);
        res.end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) throw Error('not-file');
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) {
      res.writeHead(error instanceof RoomError ? error.status : 404, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({ error: error instanceof RoomError ? error.message : '内容暂时不可用' }),
      );
    }
  });
  server.on('close', () => clearInterval(sweep));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4198),
    directory = process.argv.includes('--dist') ? path.join(root, 'dist') : root;
  createGameServer({ directory }).listen(port, '0.0.0.0', () =>
    console.log(`青花拾光 · http://localhost:${port}`),
  );
}
