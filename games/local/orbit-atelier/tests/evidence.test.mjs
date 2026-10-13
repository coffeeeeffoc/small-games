import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertMatchingBuild,
  coverageSummary,
  errorEvidence,
  readCoverage,
  sanitize,
  textDigest,
  failureSignature,
} from './evidence.mjs';

test('coverage requires execution receipts, valid dimensions and executable assertions', async () => {
  const spec = await readCoverage();
  const source = await readFile(new URL('./browser.mjs', import.meta.url), 'utf8');
  const empty = coverageSummary(spec, [], source);
  assert.equal(empty.covered.length, 0);
  assert.equal(empty.missing.length, spec.cases.length);
  const receipts = spec.cases.map((entry) => ({ ...entry, status: 'passed' }));
  assert.equal(coverageSummary(spec, receipts, source).missing.length, 0);
  assert.throws(
    () => coverageSummary(spec, [{ ...receipts[0], container: 'sandbox-iframe' }], source),
    /mismatch/,
  );
  assert.throws(() => coverageSummary(spec, [{ ...receipts[0], id: 'fake' }], source), /Unknown/);
  assert.throws(() => coverageSummary(spec, receipts, ''), /executable assertion/);
  assert.throws(
    () => coverageSummary({ ...spec, cases: [...spec.cases, spec.cases[0]] }, [], source),
    /unique/,
  );
});
test('bounded errors retain stack frames and remove URL credentials, queries and local paths', () => {
  const error = new Error('token=private https://user:pass@example.test/app?secret=x#y');
  error.stack =
    'Error: token=private\n at run (https://user:pass@example.test/assets/a.js?token=x:1:2)\n at C:\\Users\\Alice\\evidence.mjs:3:4';
  const result = errorEvidence(error);
  assert(result.stack.includes('/assets/a.js'));
  assert(!JSON.stringify(result).match(/Alice|user:pass|private|secret=x|token=x/));
  assert(result.stack.includes('evidence.mjs:3:4'));
  assert.equal(sanitize('x'.repeat(20000)).length, 16000);
  assert.equal(
    sanitize(
      'Authorization: Bearer abc-def\nCookie: session=abc-def\nBearer abc-def\naccess_token=abc-def',
    ),
    'Authorization=[redacted]\nCookie=[redacted]\nBearer [redacted]\naccess_token=[redacted]',
  );
});
test('source and driver fingerprints normalize checkout line endings, not code changes', () => {
  assert.equal(textDigest('const x = 1;\r\n'), textDigest('const x = 1;\n'));
  assert.notEqual(textDigest('const x = 1;\n'), textDigest('const x = 2;\n'));
});
test('failure signatures tolerate local ephemeral ports but distinguish resources and status', () => {
  const resource = {
    kind: 'resource',
    resource: 'http://127.0.0.1:1234/assets/missing.js',
    status: 404,
    container: 'sandbox-iframe',
  };
  assert.equal(
    failureSignature(resource),
    failureSignature({
      ...resource,
      resource: 'http://127.0.0.1:5678/assets/missing.js?token=private',
    }),
  );
  assert.notEqual(failureSignature(resource), failureSignature({ ...resource, status: 500 }));
  assert.notEqual(
    failureSignature(resource),
    failureSignature({ ...resource, container: 'standalone' }),
  );
  assert.notEqual(
    failureSignature(resource),
    failureSignature({ ...resource, resource: 'http://127.0.0.1:1234/other.js' }),
  );
  const runner = { kind: 'runner', name: 'Error', message: 'failed http://127.0.0.1:1234/app.js' };
  assert.equal(
    failureSignature(runner),
    failureSignature({ ...runner, message: 'failed http://127.0.0.1:5678/app.js' }),
  );
});
test('reproduction rejects different revision, source, asset fingerprint and dirty source', () => {
  const build = {
    revision: 'a'.repeat(40),
    sourceSha256: 'b'.repeat(64),
    id: 'c'.repeat(64),
    dirty: false,
  };
  assertMatchingBuild(build, { ...build });
  for (const key of ['revision', 'sourceSha256', 'id'])
    assert.throws(() => assertMatchingBuild(build, { ...build, [key]: 'other' }), /mismatch/);
  assert.throws(() => assertMatchingBuild(build, { ...build, dirty: true }), /committed/);
});
