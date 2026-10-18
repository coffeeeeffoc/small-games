import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { cleanGitEnv, run } from './validate-push.mjs';

test('manual candidate validation checks exact-SHA snapshots and rejects invalid formatting', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'push hook with spaces '));
  const root = path.join(temp, 'caller');
  const remote = path.join(temp, 'remote.git');
  const env = {
    ...cleanGitEnv(process.env),
    GIT_AUTHOR_NAME: 'fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    PLAYWRIGHT_EXECUTABLE_PATH: path.join(temp, 'browser-must-not-run'),
    PLAYWRIGHT_BROWSERS_PATH: path.join(temp, 'no-browsers'),
  };
  const git = (cwd, args) => run('git', args, cwd, env, true);
  try {
    await mkdir(root);
    git(root, ['init', '-q', '-b', 'dev']);
    git(root, ['config', 'core.autocrlf', 'false']);
    git(root, ['config', 'core.hooksPath', '.git/disabled-hooks']);
    await mkdir(path.join(root, 'scripts'));
    for (const file of [
      'validate-push.mjs',
      'validate-candidate.mjs',
      'validate-tree.mjs',
      'browser-preparation.mjs',
      'workspace-bootstrap.mjs',
      'cocos-validation.mjs',
      'validation-plan.mjs',
      'incremental-validation.mjs',
      'nine-native-scope.mjs',
      'nine-lock-scope.mjs',
      'publication-scopes.mjs',
      'competition-ingress.mjs',
      'admin-csp.mjs',
      'vite-patch-scope.mjs',
      'pages-test-scope.mjs',
      'pages-registration-scope.mjs',
      'rule-tasks.mjs',
    ]) {
      await writeFile(
        path.join(root, 'scripts', file),
        await readFile(new URL(file, import.meta.url)),
      );
    }
    const miniScope = 'games/minigames/scripts/validation-scope.mjs';
    await mkdir(path.join(root, 'games/minigames/scripts'), { recursive: true });
    await writeFile(
      path.join(root, miniScope),
      await readFile(new URL('../' + miniScope, import.meta.url)),
    );
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        private: true,
        packageManager: 'pnpm@12.6.0',
        volta: { node: '24.21.0' },
        devDependencies: { prettier: '3.6.2' },
        scripts: {
          'format:check': 'node -e "console.log(\'fixture formatting ran\')"',
          'check:games': 'node -e "console.log(\'fixture registration ran\')"',
        },
      }),
    );
    run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], root, env, true);
    await writeFile(path.join(root, 'README.md'), 'base\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-qm', 'fixture baseline']);
    git(temp, ['init', '--bare', '-q', remote]);
    git(root, ['remote', 'add', 'origin', remote]);
    git(root, ['push', '-q', 'origin', 'HEAD:refs/heads/dev']);
    const base = git(root, ['rev-parse', 'HEAD']);
    await writeFile(path.join(root, 'README.md'), 'pushed docs\n');
    git(root, ['commit', '-qam', 'fixture docs']);
    const target = git(root, ['rev-parse', 'HEAD']);
    await writeFile(path.join(root, 'README.md'), 'later HEAD\n');
    await writeFile(path.join(root, 'bad.json'), '{"bad":1}');
    git(root, ['add', 'bad.json']);
    git(root, ['commit', '-qam', 'fixture later HEAD']);
    await writeFile(path.join(root, 'README.md'), 'dirty caller\n');
    const before = git(root, ['status', '--porcelain']);
    const validate = (head) =>
      run(
        process.execPath,
        ['scripts/validate-candidate.mjs', '--base', base, '--head', head],
        root,
        env,
        true,
      );
    const output = validate(target);
    assert.match(output, /Checking formatting/);
    assert.match(output, /All matched files use Prettier/);
    assert.match(output, /fixture registration ran/);
    assert.match(output, new RegExp(`Validate .*${target}`));
    assert.match(output, new RegExp(`CANDIDATE_VALIDATED base=${base} head=${target}`));
    assert.throws(() => validate('HEAD'), /prettier|formatting/i);
    assert.equal(
      git(remote, ['rev-parse', 'refs/heads/dev']),
      base,
      'manual validation must not update remote',
    );
    assert.equal(git(root, ['status', '--porcelain']), before);
    assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), 'dirty caller\n');
    assert.equal(git(root, ['worktree', 'list', '--porcelain']).match(/^worktree /gm).length, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('real Git push only prints manual validation guidance and keeps remote fast-forward protection', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'manual push hook with spaces '));
  const root = path.join(temp, 'caller');
  const remote = path.join(temp, 'remote.git');
  const env = {
    ...cleanGitEnv(process.env),
    GIT_AUTHOR_NAME: 'fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  };
  const git = (cwd, args) => run('git', args, cwd, env, true);
  try {
    await mkdir(root);
    git(root, ['init', '-q', '-b', 'dev']);
    git(root, ['config', 'core.autocrlf', 'false']);
    git(root, ['config', 'core.hooksPath', '.githooks']);
    await mkdir(path.join(root, '.githooks'));
    const hook = path.join(root, '.githooks/pre-push');
    await writeFile(hook, await readFile(new URL('../.githooks/pre-push', import.meta.url)));
    await chmod(hook, 0o755);
    await mkdir(path.join(root, 'scripts'));
    await writeFile(
      path.join(root, 'scripts/validate-push.mjs'),
      'throw Error("automatic validation must not run");\n',
    );
    await writeFile(path.join(root, 'bad.json'), '{"bad":1}');
    git(root, ['add', '.']);
    git(root, ['commit', '-qm', 'fixture baseline']);
    const base = git(root, ['rev-parse', 'HEAD']);
    git(temp, ['init', '--bare', '-q', remote]);
    git(root, ['remote', 'add', 'origin', remote]);
    // Git writes hook guidance to stderr; a successful push proves the failing validator was not run.
    git(root, ['push', 'origin', 'HEAD:refs/heads/dev']);
    assert.equal(git(remote, ['rev-parse', 'refs/heads/dev']), base);
    const hookResult = spawnSync('git', ['hook', 'run', 'pre-push'], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    assert.equal(hookResult.status, 0, hookResult.stderr);
    const guidance = hookResult.stdout + hookResult.stderr;
    assert.match(guidance, /pnpm validate:candidate --base <remote-SHA> --head <candidate-SHA>/);
    assert.doesNotMatch(guidance, /Checking formatting|Validate /);
    await writeFile(path.join(root, 'README.md'), 'next\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-qm', 'fixture next']);
    git(root, ['push', 'origin', 'HEAD:refs/heads/dev']);
    const head = git(root, ['rev-parse', 'HEAD']);
    assert.throws(
      () => git(root, ['push', 'origin', `${base}:refs/heads/dev`]),
      /non-fast-forward|rejected/i,
    );
    assert.equal(git(remote, ['rev-parse', 'refs/heads/dev']), head);
    assert.equal(git(root, ['config', '--get', 'core.hooksPath']), '.githooks');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
