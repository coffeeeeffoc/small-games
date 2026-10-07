import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const assets = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['style.css', 'text/css; charset=utf-8'],
  ...[
    'main.mjs',
    'scene.mjs',
    'engine.mjs',
    'levels.mjs',
    'progress.mjs',
    'audio.mjs',
    'dev-mode.js',
    'fullscreen.js',
  ].map((name) => [name, 'text/javascript; charset=utf-8']),
]);

export function assetFor(requestUrl) {
  const pathname = decodeURIComponent(requestUrl.split('?')[0]);
  const asset = pathname === '/' ? 'index.html' : pathname.slice(1);
  return pathname.startsWith('/') && assets.has(asset) ? asset : null;
}

export function createStaticServer({ dist = false } = {}) {
  const root = new URL(dist ? './dist/' : './', import.meta.url);
  return createServer(async (request, response) => {
    const fail = (status, message) => {
      response.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
      });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return fail(405, 'Method not allowed');
    let asset;
    try {
      asset = assetFor(request.url || '/');
    } catch {
      return fail(400, 'Invalid URL');
    }
    if (!asset) return fail(404, 'Not found');
    try {
      const content = await readFile(new URL(asset, root));
      response.writeHead(200, {
        'Content-Type': assets.get(asset),
        'Content-Length': content.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      fail(error.code === 'ENOENT' ? 404 : 500, 'Unable to read asset');
    }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { values } = parseArgs({
    options: {
      dist: { type: 'boolean', default: false },
      port: { type: 'string', default: process.env.PORT || '4417' },
      host: { type: 'string', default: '127.0.0.1' },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('--port must be an integer from 0 to 65535.');
  const server = createStaticServer({ dist: values.dist });
  server.on('error', (error) => {
    console.error(`Unable to start server: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, values.host, () => {
    console.log(`追贼别撞墙：http://${values.host}:${server.address().port}`);
  });
}
