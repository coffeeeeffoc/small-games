import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parsePushRefs,
  cleanGitEnv,
  validatePush,
  run,
  repositoryIdentity,
} from './validate-push.mjs';
const zero = '0'.repeat(40);
test('repository identity resolves filesystem aliases without guessing missing paths', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'push-path-alias-'));
  try {
    const target = path.join(temp, 'repository');
    const alias = path.join(temp, 'alias');
    await mkdir(target);
    await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(await repositoryIdentity(alias), await repositoryIdentity(target));
    await assert.rejects(repositoryIdentity(path.join(temp, 'missing')), { code: 'ENOENT' });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test('stdin matrix: multiple refs, deletion, CRLF, malformed input', () => {
  const records = parsePushRefs(
    `refs/heads/a ${'a'.repeat(40)} refs/heads/b ${zero}\r\n(delete) ${zero} refs/heads/c ${'b'.repeat(40)}\n`,
  );
  assert.equal(records.length, 2);
  assert.equal(records[1].deleted, true);
  assert.throws(() => parsePushRefs('refs/heads/a wrong refs/heads/b wrong'));
  assert.throws(() => parsePushRefs('missing fields'));
  assert.deepEqual(parsePushRefs(''), []);
});
test('hook Git environment is removed; other environment preserved', () => {
  assert.deepEqual(
    cleanGitEnv({
      GIT_DIR: 'bad',
      GIT_INDEX_FILE: 'bad',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'bad',
      PATH: 'ok',
      SYSTEMROOT: 'win',
    }),
    { PATH: 'ok', SYSTEMROOT: 'win' },
  );
});
test('real Git: dirty/non-HEAD/multi-ref/new branch/deletion/missing base/remote advances/multi-worktree/cleanup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'push-test-'));
  const env = cleanGitEnv({
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  const git = (...args) => run('git', args, root, env, true);
  try {
    git('init', '-b', 'dev');
    await writeFile(path.join(root, 'file'), 'base');
    git('add', '.');
    git('commit', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    await writeFile(path.join(root, 'file'), 'target');
    git('commit', '-am', 'target');
    const head = git('rev-parse', 'HEAD');
    await writeFile(path.join(root, 'file'), 'new head');
    git('commit', '-am', 'new head');
    await writeFile(path.join(root, 'file'), 'dirty');
    await writeFile(path.join(root, 'untracked'), 'keep');
    const before = git('status', '--porcelain');
    let calls = 0;
    const cachePaths = new Set();
    const validate = async ({ snapshot, base: actualBase, head: actualHead, env: actualEnv }) => {
      calls++;
      assert.equal(actualHead, head);
      assert.ok(actualBase === base || actualBase === '');
      assert.equal(await readFile(path.join(snapshot, 'file'), 'utf8'), 'target');
      assert.equal(actualEnv.GIT_DIR, undefined);
      assert(!actualEnv.TURBO_CACHE_DIR.startsWith(root + path.sep));
      cachePaths.add(actualEnv.TURBO_CACHE_DIR);
    };
    const input = `refs/heads/other ${head} refs/heads/dev ${base}\nrefs/heads/other ${head} refs/heads/copy ${base}\nrefs/heads/other ${head} refs/heads/new ${zero}\n(delete) ${zero} refs/heads/deleted ${base}\n`;
    await validatePush(input, { root, env: { ...env, GIT_DIR: 'bogus' }, validate });
    assert.equal(calls, 2);
    assert.equal(git('status', '--porcelain'), before);
    await assert.rejects(
      validatePush(`refs/heads/x ${head} refs/heads/dev ${'e'.repeat(40)}\n`, {
        root,
        remote: path.join(root, 'offline'),
        env,
        validate,
      }),
    );
    await assert.rejects(
      validatePush(`refs/heads/x ${head} refs/heads/dev ${base}\n`, {
        root,
        env,
        validate: () => {
          throw new Error('missing dependency');
        },
      }),
      /missing dependency/,
    );
    assert.equal(git('worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
    const other = path.join(root, 'other');
    git('worktree', 'add', '--detach', other, base);
    await validatePush(`HEAD ${head} refs/heads/dev ${base}\n`, { root: other, env, validate });
    git('worktree', 'remove', other);
    assert.equal(git('status', '--porcelain'), before);
    assert.equal(cachePaths.size, 1, 'worktrees reuse the same source-keyed cache');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Windows resolves pnpm through a Node CLI without shell quoting', async () => {
  const { pnpmInvocation } = await import('./validate-push.mjs');
  const cli = 'C:\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs';
  const invocation = pnpmInvocation(
    { Path: 'C:\\npm;C:\\Windows' },
    'win32',
    (file) => file === cli,
  );
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.prefix, [cli]);
  assert.throws(
    () => pnpmInvocation({ PATH: 'C:\\missing' }, 'win32', () => false),
    /Cannot resolve/,
  );
});

test('advertised remote advancement is fetched by SHA; tracking refs do not choose the base', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'push-remote-'));
  const root = path.join(temp, 'local'),
    remote = path.join(temp, 'remote.git'),
    peer = path.join(temp, 'peer');
  const env = cleanGitEnv({
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  const git = (cwd, ...args) => run('git', args, cwd, env, true);
  try {
    git(temp, 'init', '--bare', remote);
    git(temp, 'clone', remote, root);
    await writeFile(path.join(root, 'file'), 'base');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'base');
    const head = git(root, 'rev-parse', 'HEAD');
    git(root, 'push', 'origin', 'HEAD:refs/heads/dev');
    git(temp, 'clone', '--branch', 'dev', remote, peer);
    await writeFile(path.join(peer, 'file'), 'advanced');
    git(peer, 'commit', '-am', 'advanced');
    git(peer, 'push', 'origin', 'dev');
    const advertised = git(peer, 'rev-parse', 'HEAD');
    assert.throws(() => git(root, 'cat-file', '-e', `${advertised}^{commit}`));
    await validatePush(`HEAD ${head} refs/heads/dev ${advertised}\n`, {
      root,
      remote,
      env,
      validate: async ({ base, snapshot }) => {
        assert.equal(base, advertised);
        assert.equal(await readFile(path.join(snapshot, 'file'), 'utf8'), 'base');
      },
    });
    assert.equal(git(root, 'rev-parse', 'refs/remotes/origin/dev'), head);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('snapshot recursively uses exact accessible submodule objects and preserves dirty source files', async () => {
  const { mkdir } = await import('node:fs/promises');
  const temp = await mkdtemp(path.join(os.tmpdir(), 'push-submodule-'));
  const root = path.join(temp, 'super'),
    module = path.join(temp, 'module');
  const env = cleanGitEnv({
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  const git = (cwd, ...args) => run('git', args, cwd, env, true);
  try {
    await mkdir(root);
    await mkdir(module);
    git(module, 'init');
    await writeFile(path.join(module, 'file'), 'pinned');
    git(module, 'add', '.');
    git(module, 'commit', '-m', 'pinned');
    const pinned = git(module, 'rev-parse', 'HEAD');
    git(root, 'init');
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', module, 'games/fixture');
    git(root, 'commit', '-m', 'submodule');
    const head = git(root, 'rev-parse', 'HEAD');
    const child = path.join(root, 'games/fixture');
    await writeFile(path.join(child, 'file'), 'newer');
    git(child, 'commit', '-am', 'newer');
    await writeFile(path.join(child, 'file'), 'dirty');
    await writeFile(path.join(child, 'untracked'), 'keep');
    const before = git(root, 'status', '--porcelain');
    await validatePush(`HEAD ${head} refs/heads/dev ${head}\n`, {
      root,
      env,
      validate: async ({ snapshot }) => {
        const target = path.join(snapshot, 'games/fixture');
        assert.equal(git(target, 'rev-parse', 'HEAD'), pinned);
        assert.equal(await readFile(path.join(target, 'file'), 'utf8'), 'pinned');
        await assert.rejects(readFile(path.join(target, 'untracked')));
      },
    });
    assert.equal(git(root, 'status', '--porcelain'), before);
    assert.equal(await readFile(path.join(child, 'file'), 'utf8'), 'dirty');
    assert.equal(git(root, 'worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('logged child executor preserves failing task diagnostics and never accepts an early success line', () => {
  assert.throws(
    () =>
      run(
        process.execPath,
        [
          '-e',
          "console.log('partial success');console.error('fixture failure');process.exitCode=7",
        ],
        process.cwd(),
        cleanGitEnv(),
        'logged',
      ),
    /failed \(7\).*fixture failure/s,
  );
  const output = run(
    process.execPath,
    ['-e', "console.log('complete success')"],
    process.cwd(),
    cleanGitEnv(),
    true,
  );
  assert.equal(output, 'complete success');
});
