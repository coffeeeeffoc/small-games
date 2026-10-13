import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coverageSummary, digest, readCoverage } from './evidence.mjs';

const spec = await readCoverage();
const source = await readFile(new URL('./browser.mjs', import.meta.url), 'utf8');
const report = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : null;
if (report)
  assert.equal(
    report.coverage.driverSha256,
    digest(source),
    'Report belongs to another test driver; check out its SHA',
  );
const result = coverageSummary(spec, report?.coverage.receipts || [], source);
console.log(
  JSON.stringify(
    { status: report?.status || 'not-run', build: report?.build || null, ...result },
    null,
    2,
  ),
);
if (report && (report.status !== 'passed' || result.missing.length)) process.exitCode = 1;
