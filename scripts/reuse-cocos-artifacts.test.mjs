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
test('reuse waits for all five successful producer gates, not downstream CI', () => {
  assert.deepEqual(games, [
    'carding-car',
    'night-overwatch',
    'orbit-atelier',
    'tianxia-chalu',
    'bullet-garden',
  ]);
  assert.equal(inspectProducer(run, jobs, expected), 'ready');
  for (let i = 0; i < games.length; i++) {
    const missing = jobs.filter((_, index) => index !== i);
    assert.equal(inspectProducer(run, missing, expected), 'waiting');
    assert.throws(() => inspectProducer({ ...run, status: 'completed' }, missing, expected));
    assert.throws(
      () =>
        inspectProducer(
          run,
          jobs.map((job, index) => (index === i ? { ...job, conclusion: 'failure' } : job)),
          expected,
        ),
      /gate failed/,
    );
  }
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
  assert.equal(pages.jobs.kart.with.reuse_ci, "${{ github.event_name == 'push' && inputs.cocos }}");
  assert.equal(producer.jobs.reuse.if, 'inputs.reuse_ci');
  assert.equal(producer.jobs.reuse['continue-on-error'], undefined);
  const verify = producer.jobs.reuse.steps.find((step) => step.id === 'verify');
  assert.equal(
    verify.if,
    "steps.kart.outcome == 'success' && steps.night.outcome == 'success' && steps.orbit.outcome == 'success' && steps.tianxia.outcome == 'success' && steps.garden.outcome == 'success'",
  );
  for (const game of games) {
    const transfers = producer.jobs.reuse.steps.filter(
      (step) => step.with?.name === game + '-${{ github.sha }}',
    );
    assert.equal(transfers.length, 2);
    assert.equal(transfers[0].uses, 'actions/download-artifact@v8');
    assert.equal(transfers[0].with.path, `.scratch/ci-cocos/${game}`);
    assert.equal(transfers[0].with['run-id'], '${{ steps.producer.outputs.run_id }}');
    assert.equal(transfers[1].uses, 'actions/upload-artifact@v7');
    assert.equal(transfers[1].with.path, transfers[0].with.path);
    assert.equal(transfers[1].if, "steps.verify.outcome == 'success'");
    assert(
      verify.run.includes(
        `node scripts/reuse-cocos-artifacts.mjs verify ${game} .scratch/ci-cocos/${game}`,
      ),
    );
  }
  const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert(
    root.scripts['test:validation'].split(' ').includes('scripts/reuse-cocos-artifacts.test.mjs'),
  );
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

test('all five downloaded artifacts must verify before reuse publishes any of them', async () => {
  const producer = yaml.load(
    await readFile(new URL('../.github/workflows/carding-car.yml', import.meta.url), 'utf8'),
  );
  const steps = producer.jobs.reuse.steps;
  const verify = steps.find((step) => step.id === 'verify');
  for (const [game, id] of [
    ['carding-car', 'kart'],
    ['night-overwatch', 'night'],
    ['orbit-atelier', 'orbit'],
    ['tianxia-chalu', 'tianxia'],
  ]) {
    assert(verify.if.includes(`steps.${id}.outcome == 'success'`));
    assert(verify.run.includes(`verify ${game} .scratch/ci-cocos/${game}`));
    const download = steps.find((step) => step.id === id);
    assert.equal(download.with.name, game + '-${{ github.sha }}');
    const upload = steps.find(
      (step) =>
        step.uses?.startsWith('actions/upload-artifact@') &&
        step.with.name === game + '-${{ github.sha }}',
    );
    assert.equal(upload.if, "steps.verify.outcome == 'success'");
    assert.equal(upload.with.path, `.scratch/ci-cocos/${game}`);
  }
});
