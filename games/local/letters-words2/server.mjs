import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const assets = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['styles.css', 'text/css; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
  ['engine.js', 'text/javascript; charset=utf-8'],
  ['favicon.svg', 'image/svg+xml'],
]);

function assetFor(requestPath) {
  const path = decodeURIComponent(requestPath.split('?')[0]);
  const asset = path === '/' ? 'index.html' : path.slice(1);
  // Exact filenames keep traversal, absolute paths and private files outside the public surface.
  return path.startsWith('/') && assets.has(asset) ? asset : null;
}

if (process.argv.includes('--check')) {
  assert.equal(assetFor('/'), 'index.html');
  assert.equal(assetFor('/app.js?v=1'), 'app.js');
  for (const path of ['/../app.js', '/%2e%2e/app.js', '/C:/app.js', '/C:\\app.js', '//app.js', '/package.json', '/server.mjs', 'app.js']) {
    assert.equal(assetFor(path), null, path);
  }
  assert.throws(() => assetFor('/%zz'), URIError);
  console.log('Static server path checks passed.');
} else {
  const port = Number(process.env.PORT || 4175);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');

  const server = createServer(async (request, response) => {
    const sendError = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...(status === 405 ? { Allow: 'GET, HEAD' } : {}) });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendError(405, 'Method not allowed');
    let asset;
    try {
      asset = assetFor(request.url || '/');
    } catch {
      return sendError(400, 'Invalid URL');
    }
    if (!asset) return sendError(404, 'Not found');
    try {
      const content = await readFile(new URL(asset, import.meta.url));
      response.writeHead(200, {
        'Content-Type': assets.get(asset),
        'Content-Length': content.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      sendError(error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Unable to read asset');
    }
  });
  server.on('error', error => {
    console.error(`Unable to start server: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`词屿已启动：http://127.0.0.1:${server.address().port}`));
}
