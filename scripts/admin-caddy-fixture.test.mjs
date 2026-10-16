import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startAdminCaddy } from './admin-caddy-fixture.mjs';
import {
  adminUiPaths,
  adminBaseCsp,
  checkedAdminNonce,
  injectAdminTemplate,
  renderAdminDocument,
} from './admin-csp.mjs';

test(
  'actual Caddy renders finite trusted admin documents with fresh CSP nonces and strips conditional/range requests',
  { timeout: 180000 },
  async () => {
    const parent = await realpath(tmpdir());
    const directory = await mkdtemp(path.join(parent, 'small-games-csp-contract-'));
    let server;
    const sourceFiles = [
      'scripts/admin-csp.mjs',
      'scripts/admin-caddy-fixture.mjs',
      'scripts/admin-caddy-fixture.test.mjs',
      'scripts/competition-ingress.mjs',
    ];
    const hash = async (file) =>
      createHash('sha256')
        .update(await readFile(new URL('../' + file, import.meta.url)))
        .digest('hex');
    const sourceHashes = Object.fromEntries(
      await Promise.all(sourceFiles.map(async (file) => [file, await hash(file)])),
    );
    try {
      const template = injectAdminTemplate(
        '<!doctype html><html><head><title>Admin</title></head><body>trusted admin document</body></html>',
      );
      await writeFile(path.join(directory, 'index.html'), template);
      await mkdir(path.join(directory, 'assets'));
      const asset = 'export const literal = "{{ never execute templates on assets }}";';
      await writeFile(path.join(directory, 'assets/app.js'), asset);
      const api = '<!doctype html><p>{{ never execute templates on API responses }}</p>';
      server = await startAdminCaddy(directory, {
        apiHandler: (_request, response) => {
          response.writeHead(200, { 'Content-Type': 'text/html' });
          response.end(api);
        },
      });
      const fetchPage = async (route = '/', options) => {
        const response = await fetch(server.url + route, options);
        const body = await response.text();
        assert.equal(response.status, route === '/forbidden' ? 403 : 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const nonce = body.match(/<meta name="sg-csp-nonce" content="([^"]+)">/)?.[1];
        checkedAdminNonce(nonce);
        const rendered = renderAdminDocument(template, nonce);
        assert.equal(body, rendered.html);
        assert.equal(response.headers.get('content-security-policy'), rendered.csp);
        assert.equal(response.headers.get('etag'), null);
        assert.equal(response.headers.get('last-modified'), null);
        assert.equal(response.headers.get('content-range'), null);
        return nonce;
      };
      const nonces = await Promise.all(adminUiPaths.map((route) => fetchPage(route)));
      assert.equal(new Set(nonces).size, adminUiPaths.length);
      const headers = {
        'If-None-Match': '*',
        'If-Modified-Since': 'Fri, 01 Jan 2100 00:00:00 GMT',
        'If-Match': '"absent"',
        'If-Unmodified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
        Range: 'bytes=0-10',
        'If-Range': '"absent"',
      };
      for (const [name, value] of Object.entries(headers))
        nonces.push(await fetchPage('/config', { headers: { [name]: value } }));
      nonces.push(await fetchPage('/forbidden', { headers }));
      assert.equal(new Set(nonces).size, nonces.length);
      for (const route of adminUiPaths) {
        const head = await fetch(server.url + route, { method: 'HEAD', headers });
        assert.equal(head.status, route === '/forbidden' ? 403 : 200);
        assert.equal(await head.text(), '');
        const post = await fetch(server.url + route, { method: 'POST' });
        assert.equal(post.status, 405);
        assert(!(await post.text()).includes('{{'));
      }
      for (const [route, expected] of [
        ['/assets/app.js', asset],
        ['/api/session', api],
      ]) {
        const response = await fetch(server.url + route);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), expected);
        assert.equal(response.headers.get('content-security-policy'), adminBaseCsp);
      }
      for (const route of ['/index.html', '/unknown', '/assets/index.html']) {
        const response = await fetch(server.url + route);
        assert.equal(response.status, 404);
        assert(!(await response.text()).includes('{{'));
      }
      await unlink(path.join(directory, 'index.html'));
      for (const route of ['/', '/config', '/forbidden']) {
        const response = await fetch(server.url + route);
        assert.equal(response.status, 404);
        assert(!(await response.text()).includes('{{'));
      }
      assert.equal(await readFile(path.join(directory, 'assets/app.js'), 'utf8'), asset);
      for (const [file, digest] of Object.entries(sourceHashes))
        assert.equal(await hash(file), digest, 'Source changed during CSP proof');
      const evidence = new URL('../docs/admin-console/qa/csp-caddy-current.json', import.meta.url);
      await mkdir(new URL('.', evidence), { recursive: true });
      await writeFile(
        evidence,
        JSON.stringify(
          {
            testedAt: new Date().toISOString(),
            node: process.version,
            platform: process.platform,
            caddy: server.runtime,
            fixtureResponses: true,
            productionAccess: false,
            realGithubLoginVerified: false,
            realDeviceVerified: false,
            sourceHashes,
            checks: [
              'eight-finite-documents-and-403',
              'fresh-canonical-32-byte-nonce-per-response',
              'all-six-conditionals-and-range-stripped-before-file-server',
              'HEAD-and-write-methods',
              'assets-and-API-never-template',
              'unknown-raw-index-and-missing-index-fail-closed',
            ],
          },
          null,
          2,
        ) + '\n',
      );
      console.log('CADDY_CSP_PROOF ' + JSON.stringify(server.runtime));
    } finally {
      await server?.close();
      assert.equal(await realpath(directory), directory);
      assert.equal(path.dirname(directory), parent);
      assert(path.basename(directory).startsWith('small-games-csp-contract-'));
      await rm(directory, { recursive: true, force: false });
    }
  },
);
