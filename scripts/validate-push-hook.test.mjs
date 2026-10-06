import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { cleanGitEnv, run } from './validate-push.mjs';

test('real Git push runs the production hook and default exact-SHA snapshot validator', async () => {
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
      'validate-tree.mjs',
      'workspace-bootstrap.mjs',
      'cocos-validation.mjs',
      'validation-plan.mjs',
      'incremental-validation.mjs',
      'pages-test-scope.mjs',
      'pages-registration-scope.mjs',
      'rule-tasks.mjs',
    ]) {
      await writeFile(
        path.join(root, 'scripts', file),
        await readFile(new URL(file, import.meta.url)),
      );
    }
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
    await writeFile(path.join(root, 'README.md'), 'pushed docs\n');
    git(root, ['commit', '-qam', 'fixture docs']);
    const target = git(root, ['rev-parse', 'HEAD']);
    await writeFile(path.join(root, 'README.md'), 'later HEAD\n');
    await writeFile(path.join(root, 'bad.json'), '{"bad":1}');
    git(root, ['add', 'bad.json']);
    git(root, ['commit', '-qam', 'fixture later HEAD']);
    await mkdir(path.join(root, '.githooks'));
    const hook = path.join(root, '.githooks/pre-push');
    await writeFile(hook, await readFile(new URL('../.githooks/pre-push', import.meta.url)));
    await chmod(hook, 0o755);
    git(root, ['config', 'core.hooksPath', '.githooks']);
    await writeFile(path.join(root, 'README.md'), 'dirty caller\n');
    const before = git(root, ['status', '--porcelain']);
    const output = git(root, ['push', 'origin', `${target}:refs/heads/dev`]);
    assert.match(output, /Checking formatting/);
    assert.match(output, /All matched files use Prettier/);
    assert.match(output, /fixture registration ran/);
    assert.match(output, new RegExp(`Validate .*${target}`));
    assert.equal(git(remote, ['rev-parse', 'refs/heads/dev']), target);
    assert.throws(
      () => git(root, ['push', 'origin', 'HEAD:refs/heads/dev']),
      /prettier|formatting/i,
    );
    assert.equal(
      git(remote, ['rev-parse', 'refs/heads/dev']),
      target,
      'format failure must not update remote',
    );
    assert.equal(git(root, ['status', '--porcelain']), before);
    assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), 'dirty caller\n');
    assert.equal(git(root, ['worktree', 'list', '--porcelain']).match(/^worktree /gm).length, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
