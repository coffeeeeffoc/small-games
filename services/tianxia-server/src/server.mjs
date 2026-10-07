import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, objectBody } from './errors.mjs';
import { MatchService } from './matches.mjs';
import { ResultStore } from './results.mjs';

const BODY_LIMIT = 2048;
const MEDIA = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

export function allowedOrigins(value = '') {
  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => {
        const url = new URL(origin);
        if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin) {
          throw new Error('TIANXIA_ALLOWED_ORIGINS 必须是逗号分隔的完整 HTTP(S) origin，不含路径');
        }
        return origin;
      }),
  );
}

function checkOrigin(origin, allowed) {
  if (!origin) return true; // Native clients and command line tools have no browser Origin.
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      ['https:', 'http:'].includes(url.protocol) &&
      (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || allowed.has(origin))
    );
  } catch {
    return false;
  }
}

function json(response, status, data) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

async function body(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError(415, 'json-required', '请使用 application/json');
  }
  if (Number(request.headers['content-length'] || 0) > BODY_LIMIT) {
    request.resume();
    throw new ApiError(413, 'body-too-large', '请求体过大');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new ApiError(413, 'body-too-large', '请求体过大');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'invalid-json', 'JSON 格式无效');
  }
}

class RequestLimits {
  constructor() {
    this.clients = new Map();
  }
  check(ip, creating, current) {
    for (const [key, value] of this.clients)
      if (current - value.start >= 60_000) this.clients.delete(key);
    let entry = this.clients.get(ip);
    if (!entry) {
      if (this.clients.size >= 2048)
        throw new ApiError(503, 'rate-capacity', '服务繁忙，请稍后重试');
      entry = { start: current, requests: 0, creates: 0 };
      this.clients.set(ip, entry);
    }
    if (++entry.requests > 600 || (creating && ++entry.creates > 12)) {
      throw new ApiError(429, 'rate-limit', '请求过于频繁，请稍后重试');
    }
  }
}

async function serveStatic(request, response, pathname, root) {
  if (!root) throw new ApiError(404, 'game-not-built', '请先构建天下岔路客户端');
  let suffix;
  try {
    suffix = decodeURIComponent(pathname.slice('/play/'.length));
  } catch {
    throw new ApiError(400, 'invalid-path', '路径无效');
  }
  if (suffix.includes('\0') || suffix.split(/[\\/]/).includes('..'))
    throw new ApiError(404, 'not-found', '文件不存在');
  const candidate = path.resolve(root, suffix || 'index.html');
  if (!candidate.startsWith(`${root}${path.sep}`))
    throw new ApiError(404, 'not-found', '文件不存在');
  let filename, info;
  try {
    filename = await realpath(candidate);
    info = await stat(filename);
  } catch {
    throw new ApiError(404, 'not-found', '文件不存在');
  }
  if (
    !filename.startsWith(`${root}${path.sep}`) ||
    !info.isFile() ||
    info.size > 20 * 1024 * 1024
  ) {
    throw new ApiError(404, 'not-found', '文件不存在');
  }
  response.writeHead(200, {
    'content-type': MEDIA[path.extname(filename)] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(filename);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

export async function createTianxiaServer({
  dataDir = fileURLToPath(new URL('../.data/results/', import.meta.url)),
  origins = new Set(),
  staticDir,
  maxMatches = 64,
  autoTick = true,
  now = Date.now,
  onError = console.error,
  matchOptions = {},
  resultOptions = {},
} = {}) {
  const results = new ResultStore(dataDir, resultOptions);
  await results.initialize(now());
  const matches = new MatchService({ results, now, maxMatches, onError, ...matchOptions });
  const limits = new RequestLimits();
  let staticRoot = null;
  try {
    staticRoot = await realpath(
      staticDir ||
        path.dirname(
          fileURLToPath(import.meta.resolve('@coffeeeeffoc/tianxia-chalu/dist/index.html')),
        ),
    );
  } catch {
    /* API remains usable before the independent H5 application is built. */
  }

  const server = createServer({ maxHeaderSize: 8192 }, async (request, response) => {
    try {
      const origin = request.headers.origin;
      response.setHeader('Vary', 'Origin');
      if (!checkOrigin(origin, origins))
        throw new ApiError(403, 'origin-denied', '未允许此网页来源');
      if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
      const url = new URL(request.url, 'http://server.invalid');
      if (url.pathname.startsWith('/api/') && url.search)
        throw new ApiError(400, 'query-not-supported', 'API 凭证应放在 Authorization 请求头');
      const creating = request.method === 'POST' && url.pathname === '/api/matches';
      limits.check(request.socket.remoteAddress || 'unknown', creating, now());
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600',
        });
        response.end();
        return;
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, { status: 'ok', service: 'tianxia-server', protocol: 1 });
        return;
      }
      if (['GET', 'HEAD'].includes(request.method) && url.pathname.startsWith('/play/')) {
        await serveStatic(request, response, url.pathname, staticRoot);
        return;
      }
      if (['/', '/play'].includes(url.pathname) && request.method === 'GET') {
        response.writeHead(302, { location: '/play/' });
        response.end();
        return;
      }
      if (creating) {
        json(response, 201, matches.create(await body(request)));
        return;
      }
      const route =
        /^\/api\/matches\/([a-f0-9-]{36})(?:\/(commands|pause|resume|abandon|result))?$/.exec(
          url.pathname,
        );
      if (!route) throw new ApiError(404, 'not-found', '接口不存在');
      const [, id, action] = route;
      const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.authorization || '')?.[1];
      if (request.method === 'GET' && !action) {
        json(response, 200, matches.get(id, token));
        return;
      }
      if (request.method === 'GET' && action === 'result') {
        json(response, 200, await matches.result(id, token));
        return;
      }
      if (request.method === 'POST' && action === 'commands') {
        json(response, 200, matches.command(id, token, await body(request)));
        return;
      }
      if (request.method === 'POST' && ['pause', 'resume', 'abandon'].includes(action)) {
        const payload = await body(request);
        objectBody(payload, []);
        json(response, 200, matches.control(id, token, action));
        return;
      }
      throw new ApiError(405, 'method-not-allowed', '不支持此请求方法');
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      if (!(error instanceof ApiError)) onError('天下岔路 API 请求失败', error.message);
      json(response, error.status || 500, {
        error: {
          code: error.code || 'internal-error',
          message: error instanceof ApiError ? error.message : '服务暂时不可用，请稍后重试',
        },
      });
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.setTimeout(5000, (socket) => socket.destroy());
  server.maxRequestsPerSocket = 1000;
  server.maxConnections = 256;
  const ticker = autoTick ? setInterval(() => matches.advance(), 100) : null;
  ticker?.unref();
  const sweeper = autoTick
    ? setInterval(() => {
        results.sweep(now()).catch((error) => onError('天下岔路过期战报清理失败', error.message));
      }, 60_000)
    : null;
  sweeper?.unref();
  return {
    server,
    matches,
    results,
    async listen(port = 43004, host = '127.0.0.1') {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
      return server.address();
    },
    async close() {
      if (ticker) clearInterval(ticker);
      if (sweeper) clearInterval(sweeper);
      if (server.listening)
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeIdleConnections();
        });
      await results.close();
    },
  };
}
