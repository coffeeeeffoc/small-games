import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function cleanGitEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|CONFIG|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE)/.test(
          key,
        ),
    ),
  );
}
export function parsePushRefs(input) {
  return input
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const fields = line.trim().split(/\s+/);
      assert(fields.length === 4, 'Invalid pre-push stdin record');
      const [localRef, localSha, remoteRef, remoteSha] = fields;
      assert(
        /^[a-f\d]{40}$|^[a-f\d]{64}$/i.test(localSha) &&
          /^[a-f\d]{40}$|^[a-f\d]{64}$/i.test(remoteSha),
        'Invalid push SHA',
      );
      assert(remoteRef.startsWith('refs/'), 'Invalid remote ref');
      return { localRef, localSha, remoteRef, remoteSha, deleted: /^0+$/.test(localSha) };
    });
}
export function pnpmInvocation(
  env = process.env,
  platform = process.platform,
  exists = existsSync,
) {
  if (platform !== 'win32') return { command: 'pnpm', prefix: [] };
  const dirs = (env.Path || env.PATH || '').split(';');
  if (env.npm_execpath && /pnpm\.(?:cjs|js)$/.test(env.npm_execpath) && exists(env.npm_execpath))
    return { command: process.execPath, prefix: [env.npm_execpath] };
  for (const dir of dirs) {
    const native = path.win32.join(dir, 'pnpm.exe');
    if (exists(native)) return { command: native, prefix: [] };
    for (const relative of [
      'node_modules/pnpm/bin/pnpm.cjs',
      'node_modules/corepack/dist/pnpm.js',
      '../pnpm/bin/pnpm.cjs',
    ]) {
      const cli = path.win32.resolve(dir, relative);
      if (exists(cli)) return { command: process.execPath, prefix: [cli] };
    }
  }
  throw new Error(
    'Cannot resolve a Windows pnpm Node CLI or pnpm.exe; reinstall pnpm. No shell fallback.',
  );
}
export function run(command, args, cwd, env, capture = false) {
  if (command === 'pnpm' || command === 'pnpm.cmd') {
    const invocation = pnpmInvocation(env);
    command = invocation.command;
    args = [...invocation.prefix, ...args];
  }
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell: false,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (capture === 'logged') {
    if (result.stdout) writeSync(process.stdout.fd, result.stdout);
    if (result.stderr) writeSync(process.stderr.fd, result.stderr);
  }
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args[0] || ''} failed (${result.status}${result.signal ? '/' + result.signal : ''}): ${result.stderr || result.stdout?.slice(-16384) || ''}\nArguments: ${JSON.stringify(args)}`,
    );
  return result.stdout?.trim();
}
/** Reuse readable local Git objects, never source working files or source HEAD.
 * Missing objects retain Git's configured submodule transport and fail on its error.
 */
export async function initializeSnapshotSubmodules(sourceRoot, snapshot, env) {
  const git = (cwd, args) => run('git', args, cwd, env, true);
  const entries = git(snapshot, ['ls-tree', '-r', '-z', 'HEAD']).split('\0').filter(Boolean);
  for (const entry of entries) {
    const [metadata, relative] = entry.split('\t');
    const [mode, , sha] = metadata.split(' ');
    if (mode !== '160000') continue;
    assert(
      relative && !path.isAbsolute(relative) && !relative.split('/').includes('..'),
      'Invalid submodule path',
    );
    const source = path.resolve(sourceRoot, relative);
    const destination = path.resolve(snapshot, relative);
    let reusable = false;
    try {
      reusable = path.resolve(git(source, ['rev-parse', '--show-toplevel'])) === source;
      if (reusable) git(source, ['cat-file', '-e', `${sha}^{commit}`]);
    } catch {
      reusable = false;
    }
    try {
      if (reusable) {
        await mkdir(path.dirname(destination), { recursive: true });
        // Git clones objects through an alternates reference; no dirty files enter the snapshot.
        git(snapshot, [
          'clone',
          '--shared',
          '--no-checkout',
          '--no-hardlinks',
          '--',
          source,
          destination,
        ]);
        git(destination, ['checkout', '--detach', sha]);
        console.log(`Snapshot submodule ${relative}: exact local object ${sha}`);
      } else {
        git(snapshot, ['submodule', 'update', '--init', '--', relative]);
      }
      assert(
        git(destination, ['rev-parse', 'HEAD']) === sha,
        `Submodule ${relative}: wrong snapshot SHA`,
      );
      await initializeSnapshotSubmodules(source, destination, env);
    } catch (error) {
      throw new Error(`Submodule ${relative} at ${sha}: ${error.message}`);
    }
  }
}
export async function validatePush(
  input,
  { root = process.cwd(), remote = 'origin', env = process.env, validate } = {},
) {
  const clean = { ...cleanGitEnv(env), PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false' };
  const git = (args, cwd = root) => run('git', args, cwd, clean, true);
  // Keep source/toolchain-keyed Turbo artifacts outside dirty caller directories.
  if (!clean.TURBO_CACHE_DIR) {
    const common = path.resolve(root, git(['rev-parse', '--git-common-dir']));
    clean.TURBO_CACHE_DIR = path.join(
      os.tmpdir(),
      'small-games-validation-cache',
      createHash('sha256').update(common).digest('hex').slice(0, 24),
    );
  }
  const records = parsePushRefs(input);
  const checked = new Set();
  for (const record of records) {
    if (record.deleted) {
      console.log(`Deletion only: ${record.remoteRef}`);
      continue;
    }
    const head = git(['rev-parse', '--verify', '--end-of-options', `${record.localSha}^{commit}`]);
    // Remote-advertised SHA is authoritative. Never substitute a tracking ref or HEAD.
    let base = record.remoteSha;
    if (!/^0+$/.test(base)) {
      try {
        git(['cat-file', '-e', `${base}^{commit}`]);
      } catch {
        git(['fetch', '--no-tags', '--', remote, base]);
        git(['cat-file', '-e', `${base}^{commit}`]);
      }
    } else base = ''; // New branch checks the entire tree; no guessed upstream.
    const key = `${base}:${head}`;
    if (checked.has(key)) continue;
    const temp = await mkdtemp(path.join(os.tmpdir(), 'small-games-push-'));
    const snapshot = path.join(temp, 'snapshot');
    let added = false;
    try {
      git(['worktree', 'add', '--detach', snapshot, head]);
      added = true;
      await initializeSnapshotSubmodules(root, snapshot, clean);
      console.log(
        `Validate ${record.localRef} -> ${record.remoteRef}: ${base || 'new branch'}..${head}`,
      );
      if (validate) await validate({ snapshot, base, head, record, env: clean });
      else {
        const manifest = JSON.parse(await readFile(path.join(snapshot, 'package.json'), 'utf8'));
        assert(
          process.version === `v${manifest.volta.node}`,
          `Use Node ${manifest.volta.node}; current ${process.version}`,
        );
        const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
        assert(
          run(pnpm, ['--version'], snapshot, clean, true) ===
            manifest.packageManager.split('@').at(-1),
          `Use ${manifest.packageManager}`,
        );
        // Independent node_modules: never symlink a dirty working tree or run prepare to alter shared hooks.
        run(pnpm, ['install', '--frozen-lockfile', '--ignore-scripts'], snapshot, clean);
        const { bootstrapWorkspace } = await import('./workspace-bootstrap.mjs');
        await bootstrapWorkspace(snapshot, clean);
        run(
          process.execPath,
          [
            path.join(root, 'scripts/validate-tree.mjs'),
            '--root',
            snapshot,
            '--base',
            base,
            '--head',
            head,
          ],
          snapshot,
          clean,
          'logged',
        );
      }
      checked.add(key);
    } finally {
      if (added) git(['worktree', 'remove', '--force', snapshot]);
      await rm(temp, { recursive: true, force: true });
    }
  }
  return checked.size;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  validatePush(input, { remote: process.argv[2] || 'origin' }).catch((error) => {
    console.error(`Push blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
