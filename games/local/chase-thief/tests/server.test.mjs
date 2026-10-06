import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { assetFor, createStaticServer } from '../server.mjs';

test('static asset lookup rejects private files and all traversal forms', () => {
  assert.equal(assetFor('/'), 'index.html');
  assert.equal(assetFor('/engine.mjs?v=1'), 'engine.mjs');
  for (const path of [
    '/package.json',
    '/server.mjs',
    '/build.mjs',
    '/tests/server.test.mjs',
    '/../engine.mjs',
    '/%2e%2e/engine.mjs',
    '/%2e%2e%2fengine.mjs',
    '//engine.mjs',
    '/C:/engine.mjs',
    '/C:\\engine.mjs',
    'engine.mjs',
  ]) {
    assert.equal(assetFor(path), null, path);
  }
  assert.throws(() => assetFor('/%zz'), URIError);
});

test('HTTP server serves runtime JavaScript with MIME, HEAD and safe error responses', async (t) => {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const call = (path, method = 'GET') =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port: server.address().port, path, method },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () =>
            resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
          );
        },
      );
      req.on('error', reject);
      req.end();
    });
  const script = await call('/dev-mode.js');
  assert.equal(script.status, 200);
  assert.equal(script.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(script.headers['x-content-type-options'], 'nosniff');
  assert(script.body.length > 0);
  const head = await call('/dev-mode.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-length'], String(script.body.length));
  assert.equal(head.body.length, 0);
  assert.equal((await call('/%zz')).status, 400);
  assert.equal((await call('/../package.json')).status, 404);
  assert.equal((await call('/server.mjs')).status, 404);
  const post = await call('/dev-mode.js', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});
