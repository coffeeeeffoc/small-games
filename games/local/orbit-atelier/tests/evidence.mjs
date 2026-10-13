import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function sanitize(value, limit = 16000) {
  return String(value ?? '')
    .replace(/https?:\/\/[^\s)"'<>]+/g, (raw) => {
      try {
        const url = new URL(raw);
        return `${url.origin}${url.pathname}`;
      } catch {
        return '[url]';
      }
    })
    .replace(
      /(?:[A-Z]:[\\/](?:Users|home)[\\/]|\/home\/)[^\s)"']+/gi,
      (raw) => '[local-path]/' + raw.split(/[\\/]/).at(-1),
    )
    .replace(
      /\b(token|secret|password|authorization|cookie|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .slice(0, limit);
}
export function errorEvidence(error) {
  return {
    name: sanitize(error.name, 100),
    message: sanitize(error.message, 4000),
    stack: sanitize(error.stack),
  };
}
export function coverageSummary(spec, receipts, source) {
  assert.equal(spec.schemaVersion, 1);
  const ids = spec.cases.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'Coverage case IDs must be unique');
  for (const entry of spec.cases) {
    assert(['portrait', 'landscape'].includes(entry.orientation));
    assert(['touch', 'mouse'].includes(entry.input));
    assert(['standalone', 'sandbox-iframe'].includes(entry.container));
    assert(entry.sequence && entry.assertion);
    assert(/^[a-z0-9-]+$/.test(entry.id));
    assert(
      new RegExp(`verify\\(\\s*'${entry.id}'`).test(source) ||
        (entry.id.startsWith('storage-') && /verify\(\s*`storage-\$\{storage\}`/.test(source)),
      `Missing executable assertion: ${entry.id}`,
    );
  }
  for (const receipt of receipts) {
    const entry = spec.cases.find((item) => item.id === receipt.id);
    assert(entry, `Unknown coverage receipt: ${receipt.id}`);
    assert.equal(receipt.status, 'passed');
    for (const dimension of ['orientation', 'input', 'container'])
      assert.equal(receipt[dimension], entry[dimension], `${receipt.id}: ${dimension} mismatch`);
  }
  assert.equal(
    new Set(receipts.map((item) => item.id)).size,
    receipts.length,
    'Duplicate receipts',
  );
  return {
    driver: spec.driver,
    driverSha256: digest(source),
    covered: spec.cases.filter((entry) => receipts.some((item) => item.id === entry.id)),
    missing: spec.cases.filter((entry) => !receipts.some((item) => item.id === entry.id)),
    gaps: spec.gaps,
    constraints: spec.constraints,
    receipts,
  };
}
export async function readCoverage() {
  return JSON.parse(await readFile(new URL('./coverage.json', import.meta.url), 'utf8'));
}
export function assertMatchingBuild(expected, actual) {
  assert.equal(actual.revision, expected.revision, 'Reproduction SHA mismatch');
  assert.equal(actual.sourceSha256, expected.sourceSha256, 'Reproduction source mismatch');
  assert.equal(actual.id, expected.id, 'Reproduction build mismatch');
  assert.equal(actual.dirty, false, 'Reproduction requires committed source');
}
