import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import {
  findProducer,
  inspectProducer,
  verifyProvenance,
  games,
} from './reuse-cocos-artifacts.mjs';
const expected = { sha: 'a'.repeat(40), branch: 'dev', repository: 'owner/repo' };
const run = {
  id: 9,
  head_sha: expected.sha,
  head_branch: 'dev',
  event: 'push',
  path: '.github/workflows/ci.yml',
  repository: { full_name: 'owner/repo' },
  status: 'in_progress',
};
const jobs = games.map((game) => ({
  name: 'kart / creator (' + game + ')',
  status: 'completed',
  conclusion: 'success',
}));
test('reuse waits only for both successful producer gates, not downstream CI', () => {
  assert.equal(inspectProducer(run, jobs, expected), 'ready');
  assert.equal(inspectProducer(run, jobs.slice(0, 1), expected), 'waiting');
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out'])
    assert.throws(
      () => inspectProducer(run, [{ ...jobs[0], conclusion }], expected),
      /gate failed/,
    );
  assert.throws(() => inspectProducer({ ...run, status: 'completed' }, [], expected));
  for (const field of ['head_sha', 'head_branch', 'event', 'path'])
    assert.throws(() => inspectProducer({ ...run, [field]: 'other' }, jobs, expected));
  assert.throws(() =>
    inspectProducer({ ...run, repository: { full_name: 'fork/repo' } }, jobs, expected),
  );
});
test('missing producer falls back, active producer has a finite deadline', async () => {
  let clock = 0;
  const opts = {
    ...expected,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    discoveryMs: 15000,
    timeoutMs: 30000,
  };
  assert.equal(await findProducer({ ...opts, api: async () => ({ workflow_runs: [] }) }), null);
  clock = 0;
  await assert.rejects(
    findProducer({
      ...opts,
      api: async (url) =>
        url.includes('workflows/')
          ? { workflow_runs: [run] }
          : url.includes('/jobs?')
            ? { jobs: [] }
            : run,
    }),
    /Timed out/,
  );
});
test('discovery ignores other commits and branches and uses completed producer jobs', async () => {
  const result = await findProducer({
    ...expected,
    sleep: async () => {
      throw Error('unexpected wait');
    },
    api: async (url) =>
      url.includes('workflows/')
        ? {
            workflow_runs: [
              { ...run, id: 10, head_sha: 'b'.repeat(40) },
              { ...run, id: 11, head_branch: 'main' },
              run,
            ],
          }
        : url.includes('/jobs?')
          ? { jobs }
          : run,
  });
  assert.equal(result.id, 9);
});
test('provenance rejects wrong source, platform, engine, run, or repository', () => {
  const source = {
    sha: expected.sha,
    sourceHash: 'source',
    game: games[0],
    repository: 'owner/repo',
    runId: '9',
    runAttempt: '1',
  };
  const info = { ...source, creator: '3.8.8', platform: 'web-mobile', runner: 'Windows' };
  verifyProvenance(info, source);
  for (const key of Object.keys(info))
    assert.throws(() => verifyProvenance({ ...info, [key]: 'wrong' }, source));
});
test('CI is the sole producer direction and fallback retains original gates', async () => {
  const read = async (name) =>
    yaml.load(await readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8'));
  const ci = await read('ci.yml'),
    pages = await read('pages-validate.yml'),
    producer = await read('carding-car.yml');
  assert.equal(ci.jobs.kart.with?.reuse_ci, undefined);
  assert.equal(pages.jobs.kart.with.reuse_ci, "${{ github.event_name == 'push' }}");
  assert.equal(producer.jobs.reuse.if, 'inputs.reuse_ci');
  assert.equal(producer.jobs.reuse['continue-on-error'], undefined);
  assert(producer.jobs.creator.if.includes("needs.reuse.result == 'success'"));
  assert(producer.jobs.creator.if.includes("needs.reuse.result == 'skipped'"));
  for (const command of ['typecheck', 'test', 'build'])
    assert(
      producer.jobs.creator.steps.some(
        (step) =>
          step.run === 'pnpm --filter @coffeeeeffoc/${{ matrix.game }} ' + command &&
          !step['continue-on-error'],
      ),
    );
  assert(
    producer.jobs.reuse.steps.some(
      (step) => step.run?.includes('verify carding-car') && step['continue-on-error'] === true,
    ),
  );
});
