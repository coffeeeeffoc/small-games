import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, cleanGitEnv } from './validate-push.mjs';
import { bootstrapWorkspace, assertSnapshotUnchanged } from './workspace-bootstrap.mjs';
test('workspace vendor bootstrap checks its import graph and never runs root prepare', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bootstrap-'));
  try {
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { prepare: 'git config core.hooksPath bad' } }),
    );
    const game = path.join(root, 'games/local/a');
    await mkdir(game, { recursive: true });
    await writeFile(
      path.join(game, 'package.json'),
      JSON.stringify({ name: 'a', scripts: { postinstall: 'node vendor.mjs' } }),
    );
    await writeFile(
      path.join(game, 'vendor.mjs'),
      "import {mkdir} from 'node:fs/promises';await mkdir('vendor',{recursive:true});",
    );
    const calls = [];
    await bootstrapWorkspace(root, {}, (command, args) => {
      calls.push({ command, args });
      return args[0] === 'ls-tree' ? '' : undefined;
    });
    assert.equal(calls.filter((item) => item.command === 'pnpm').length, 1);
    assert.deepEqual(calls[0].args, ['--filter', 'a', 'postinstall']);
    assert(!calls.some((item) => item.args.includes('prepare')));
    await writeFile(path.join(game, 'vendor.mjs'), "import {chromium} from '@playwright/test';");
    await assert.rejects(
      bootstrapWorkspace(root, {}, () => {
        throw new Error('unsafe lifecycle must not run');
      }),
      /Unreviewed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('nested snapshot guard accepts clone administration and rejects tracked, indexed and gitlink changes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bootstrap-nested-'));
  const env = {
    ...cleanGitEnv(process.env),
    GIT_AUTHOR_NAME: 'fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  };
  const git = (cwd, args) => run('git', args, cwd, env, true);
  const init = async (dir) => {
    await mkdir(dir, { recursive: true });
    git(dir, ['init', '-q']);
    git(dir, ['config', 'core.hooksPath', '.git/disabled-hooks']);
    await writeFile(path.join(dir, 'tracked.txt'), 'original');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-qm', 'fixture']);
  };
  try {
    await init(root);
    const child = path.join(root, 'child');
    const nested = path.join(child, 'nested');
    await init(child);
    await init(nested);
    git(child, ['add', 'nested']);
    git(child, ['commit', '-qm', 'nested gitlink']);
    git(root, ['add', 'child']);
    git(root, ['commit', '-qm', 'child gitlink']);
    await writeFile(path.join(nested, 'untracked-vendor'), 'generated');
    await assertSnapshotUnchanged(root, env);
    await writeFile(path.join(nested, 'tracked.txt'), 'changed');
    await assert.rejects(assertSnapshotUnchanged(root, env), /git diff failed/);
    git(nested, ['add', 'tracked.txt']);
    await assert.rejects(assertSnapshotUnchanged(root, env), /git diff failed/);
    git(nested, ['commit', '-qm', 'changed gitlink']);
    await assert.rejects(assertSnapshotUnchanged(root, env), /HEAD changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
