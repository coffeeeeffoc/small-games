import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/levels.ts';
import {
  diagnoseCampaign,
  replayDiagnosis,
  validateReportMetadata,
} from './dispatch-diagnostics.ts';

const options = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i],
    value = process.argv[i + 1];
  assert(
    ['--interval', '--max-seconds', '--out', '--replay', '--case'].includes(key) &&
      value &&
      !options.has(key),
    'Usage: node scripts/diagnose.ts [--interval 0.5] [--max-seconds 700] [--out report.json] OR --replay report.json [--case 100/random]',
  );
  options.set(key, value);
}
if (options.has('--replay')) {
  assert(
    !options.has('--interval') && !options.has('--max-seconds') && !options.has('--out'),
    'Replay uses the recorded cadence and limit',
  );
  const report = JSON.parse(await readFile(path.resolve(options.get('--replay')!), 'utf8'));
  await validateReportMetadata(report);
  const results = options.has('--case')
    ? report.results.filter((r: { key: string }) => r.key === options.get('--case'))
    : report.results;
  assert(results.length > 0, 'Replay case not found');
  for (const result of results) {
    const level = LEVELS.find((level) => level.id === result.levelId);
    assert(level, 'Replay level not found');
    replayDiagnosis(level, result);
  }
  console.log(
    JSON.stringify({
      replayVerified: results.length,
      cases: results.map((r: { key: string }) => r.key),
    }),
  );
} else {
  assert(!options.has('--case'), '--case requires --replay');
  const report = await diagnoseCampaign(
    Number(options.get('--interval') ?? 0.5),
    Number(options.get('--max-seconds') ?? 700),
  );
  const output = path.resolve(
    options.get('--out') ??
      fileURLToPath(new URL('../reports/dispatch-diagnostics.json', import.meta.url)),
  );
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        output,
        ...report.summary,
        anomalies: report.anomalyRanking.length,
        reviewCandidates: report.reviewCandidates,
      },
      null,
      2,
    ),
  );
}
