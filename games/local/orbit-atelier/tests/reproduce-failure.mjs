import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { sourceIdentity } from './build-evidence.mjs';
import { assertMatchingBuild } from './evidence.mjs';

// Only the recorded Orbit driver is executable; report text/commands are data.
const reportPath = path.resolve(process.argv[2]);
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const root = fileURLToPath(new URL('../', import.meta.url));
assert.equal(report.status, 'failed', 'Expected a failure report');
assert(report.build && !report.build.dirty, 'Need a committed, locally attested production build');
assert([null, 'pageerror'].includes(report.reproduction.probe));
assert(['A', 'B'].includes(report.reproduction.variant));
assert(report.reproduction.variant === 'A' || report.reproduction.probe === 'pageerror');
const source = await sourceIdentity(root);
assert.equal(
  source.revision,
  report.build.revision,
  `Check out report SHA ${report.build.revision} before reproduction`,
);
assert.equal(
  source.sourceSha256,
  report.build.sourceSha256,
  'Checkout inputs do not match the report',
);
assert.equal(source.dirty, false, 'Commit or preserve current edits in another worktree first');
const output = path.join(
  path.dirname(reportPath),
  `reproduced-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
let result;
try {
  await promisify(execFile)(process.execPath, [path.join(root, 'tests/browser.mjs')], {
    cwd: root,
    timeout: 180000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      ORBIT_URL: '',
      ORBIT_EVIDENCE_DIR: output,
      ORBIT_DIAGNOSTIC_PROBE: report.reproduction.probe || '',
      ORBIT_DIAGNOSTIC_VARIANT: report.reproduction.variant === 'B' ? 'B' : '',
      ORBIT_EXPECTED_BUILD: JSON.stringify(report.build),
    },
  });
  assert.fail('Failure did not reproduce');
} catch (error) {
  assert.equal(error.code, 1, 'Expected a test assertion failure, not a launch/timeout failure');
  result = JSON.parse(await readFile(path.join(output, 'browser-report.json'), 'utf8'));
}
assertMatchingBuild(report.build, result.build);
assert.equal(result.status, 'failed');
const expected =
  report.failures.find((entry) => entry.kind === 'pageerror') ||
  report.failures.find((entry) => entry.kind === 'runner');
assert(expected, 'Report has no reproducible failure');
assert(
  result.failures.some(
    (entry) => entry.kind === expected.kind && entry.message === expected.message,
  ),
  'Failure signature does not match',
);
console.log(
  `Reproduced ${expected.kind} on SHA ${result.build.revision}, build ${result.build.id}: ${path.join(output, 'browser-report.json')}`,
);
