import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import {
  adminUiPaths,
  adminBaseCsp,
  checkedAdminNonce,
  injectAdminTemplate,
  renderAdminDocument,
  adminCspPlugin,
} from './admin-csp.mjs';

test('trusted admin document uses a fresh canonical nonce without relaxing scripts or styles', () => {
  const template = injectAdminTemplate(
    '<!doctype html><html><head></head><body>admin</body></html>',
  );
  const a = renderAdminDocument(template),
    b = renderAdminDocument(template);
  assert.notEqual(a.nonce, b.nonce);
  assert.equal(Buffer.from(a.nonce, 'base64').length, 32);
  assert(a.html.startsWith('<!---->\n<!doctype html>'));
  assert(a.html.includes('content="' + a.nonce + '"'));
  assert(!a.html.includes('{{'));
  assert.equal(a.csp.match(/nonce-/g).length, 1);
  assert(a.csp.includes("script-src 'self'; style-src 'self' 'nonce-" + a.nonce + "';"));
  assert(!a.csp.includes('unsafe-inline'));
  assert.equal(adminBaseCsp.includes('nonce-'), false);
  assert.equal(checkedAdminNonce(a.nonce), a.nonce);
  for (const value of [
    null,
    '',
    'fixed-nonce',
    a.nonce.replace(/=$/, ''),
    randomBytes(31).toString('base64'),
    a.nonce + ' ',
  ])
    assert.throws(() => checkedAdminNonce(value));
  for (const value of [
    '',
    '<head></head>',
    template,
    '<!doctype html><head></head><head></head>',
    '<!doctype html><head>{{env "EXAMPLE"}}</head>',
  ])
    assert.throws(() => injectAdminTemplate(value));
  assert.throws(() => renderAdminDocument(template + '{{unexpected}}'));
  assert.deepEqual(adminUiPaths, [
    '/',
    '/login',
    '/forbidden',
    '/config',
    '/games',
    '/members',
    '/roles',
    '/audit',
  ]);
});
test('Vite development and production use the same validated nonce metadata contract', () => {
  const plugin = adminCspPlugin(),
    html = '<!doctype html><head></head>';
  plugin.configResolved({ command: 'serve' });
  const dev = plugin.transformIndexHtml.handler(html);
  assert(!dev.includes('{{'));
  checkedAdminNonce(dev.match(/content="([^"]+)"/)[1]);
  plugin.configResolved({ command: 'build' });
  assert.equal(plugin.transformIndexHtml.handler(html), injectAdminTemplate(html));
});
