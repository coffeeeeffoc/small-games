import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const games = ['carding-car', 'night-overwatch'];
const creator = '3.8.8';
const platform = 'web-mobile';

export function inspectProducer(run, jobs, expected) {
  assert.equal(run.head_sha, expected.sha, 'Producer SHA mismatch');
  assert.equal(run.head_branch, expected.branch, 'Producer branch mismatch');
  assert.equal(run.event, 'push', 'Producer event mismatch');
  assert.equal(run.path, '.github/workflows/ci.yml', 'Producer workflow mismatch');
  assert.equal(run.repository.full_name, expected.repository, 'Producer repository mismatch');
  const producers = games.map((game) =>
    jobs.find((job) => job.name === 'kart / creator (' + game + ')'),
  );
  for (const job of producers) {
    if (job?.status === 'completed' && job.conclusion !== 'success')
      throw new Error('Cocos producer gate failed: ' + job.name + ' / ' + job.conclusion);
  }
  if (producers.every((job) => job?.conclusion === 'success')) return 'ready';
  if (run.status === 'completed')
    throw new Error('Completed CI run lacks successful Cocos producer gates');
  return 'waiting';
}

// CI always produces; only push Pages consumers wait. Never wait for the downstream CI quality job.
export async function findProducer({
  api,
  sha,
  branch,
  repository,
  sleep,
  now = Date.now,
  discoveryMs = 90000,
  timeoutMs = 25 * 60000,
}) {
  const start = now();
  for (;;) {
    const list = await api(
      '/actions/workflows/ci.yml/runs?event=push&head_sha=' + sha + '&per_page=100',
    );
    const run = list.workflow_runs
      .filter(
        (item) =>
          item.head_sha === sha &&
          item.head_branch === branch &&
          item.event === 'push' &&
          item.repository.full_name === repository,
      )
      .sort((a, b) => b.id - a.id)[0];
    if (run) {
      const latest = await api('/actions/runs/' + run.id);
      // jobs endpoint defaults to the latest attempt, including reruns.
      const jobs = await api('/actions/runs/' + run.id + '/jobs?per_page=100');
      if (inspectProducer(latest, jobs.jobs, { sha, branch, repository }) === 'ready')
        return latest;
    } else if (now() - start >= discoveryMs) {
      console.log('No matching CI producer found; rebuilding with the normal Creator gates.');
      return null;
    }
    if (now() - start >= timeoutMs) throw new Error('Timed out waiting for Cocos producer gates');
    await sleep(15000);
  }
}

export function verifyProvenance(info, expected) {
  for (const [key, value] of Object.entries({ ...expected, creator, platform, runner: 'Windows' }))
    assert.equal(info[key], value, 'Cocos artifact provenance mismatch: ' + key);
}

export async function main(env = process.env, argv = process.argv.slice(2)) {
  if (argv[0] === 'discover') {
    assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA), 'Invalid source SHA');
    const api = async (suffix) => {
      const response = await fetch(
        'https://api.github.com/repos/' + env.GITHUB_REPOSITORY + suffix,
        {
          headers: {
            Authorization: 'Bearer ' + env.GH_TOKEN,
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new Error('Producer API returned ' + response.status);
      return response.json();
    };
    const run = await findProducer({
      api,
      sha: env.GITHUB_SHA,
      branch: env.GITHUB_REF_NAME,
      repository: env.GITHUB_REPOSITORY,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    await appendFile(
      env.GITHUB_OUTPUT,
      'run_id=' + (run?.id ?? '') + '\n' + 'run_attempt=' + (run?.run_attempt ?? '') + '\n',
    );
    return;
  }
  const [, game, directory] = argv;
  assert(games.includes(game), 'Invalid Cocos game');
  assert(directory, 'Missing artifact directory');
  const artifact = await import('../games/local/' + game + '/scripts/artifact.mjs');
  const manifest = JSON.parse(
    await readFile(new URL('../games/local/' + game + '/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.creator.version, creator, 'Unexpected Creator version');
  assert.equal(
    manifest.scripts.build,
    'node scripts/build.mjs web-mobile',
    'Unexpected build platform',
  );
  await artifact.verifyPrebuilt(directory);
  const buildInfo = JSON.parse(
    await readFile(path.join(directory, 'dist/build-info.json'), 'utf8'),
  );
  if (buildInfo.target !== undefined)
    assert.equal(buildInfo.target, platform, 'Unexpected artifact target');
  const sourceHash = await artifact.sourceHash();
  const expected = {
    sha: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    game,
    runId: env.PRODUCER_RUN_ID ?? env.GITHUB_RUN_ID,
    runAttempt: env.PRODUCER_RUN_ATTEMPT ?? env.GITHUB_RUN_ATTEMPT,
    sourceHash,
  };
  const filename = path.join(directory, 'cocos-provenance.json');
  if (argv[0] === 'stamp') {
    assert.equal(env.RUNNER_OS, 'Windows', 'Cocos producer must run on Windows');
    await writeFile(
      filename,
      JSON.stringify({ ...expected, creator, platform, runner: 'Windows' }) + '\n',
    );
  } else {
    assert.equal(argv[0], 'verify', 'Invalid command');
    verifyProvenance(JSON.parse(await readFile(filename, 'utf8')), expected);
    assert(
      (await readFile(path.join(directory, 'cc.d.ts'), 'utf8')).length > 0,
      'Missing Creator types',
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
