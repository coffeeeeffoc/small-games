import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkStagedFormat } from './check-staged-format.mjs';

const script = fileURLToPath(new URL('./check-staged-format.mjs', import.meta.url));
const good = "const message = 'hello';\n";
const bad = 'const message="hello"\n';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'small-games-staged-format-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = async (relative, content) => {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  };
  git('init', '--quiet');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', '.git/fixture-hooks');
  git('config', 'user.name', 'coffeeeeffoc');
  git('config', 'user.email', '1521152077@qq.com');
  await write('.prettierrc.json', '{ "singleQuote": true }\n');
  await write('base.js', good);
  git('add', '.prettierrc.json', 'base.js');
  git('commit', '--quiet', '-m', 'fixture');
  const check = () => checkStagedFormat(root);
  const cli = () => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  return { root, git, write, check, cli };
}

test('accepts a clean index and formatted staged files with spaces in their paths', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.check(), { checked: 0, unformatted: [], errors: [] });
  await f.write('folder with spaces/file name.js', good);
  f.git('add', 'folder with spaces/file name.js');
  assert.deepEqual(await f.check(), { checked: 1, unformatted: [], errors: [] });
  const run = f.cli();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /passed \(1 files\)/);
});

test('rejects a bad staged blob even when the working copy is already formatted', async (t) => {
  const f = await fixture(t);
  await f.write('partially staged.js', bad);
  f.git('add', 'partially staged.js');
  await f.write('partially staged.js', good);
  const stagedBefore = f.git('diff', '--cached', '--binary');
  assert.deepEqual(await f.check(), {
    checked: 1,
    unformatted: ['partially staged.js'],
    errors: [],
  });
  const run = f.cli();
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /partially staged\.js/);
  assert.equal(f.git('diff', '--cached', '--binary'), stagedBefore);
  assert.equal(await readFile(path.join(f.root, 'partially staged.js'), 'utf8'), good);
});

test('uses formatted staged content when the working copy is bad or absent', async (t) => {
  const f = await fixture(t);
  await f.write('working-copy.js', good);
  await f.write('removed-after-staging.js', good);
  f.git('add', 'working-copy.js', 'removed-after-staging.js');
  await f.write('working-copy.js', bad);
  await rm(path.join(f.root, 'removed-after-staging.js'));
  assert.deepEqual(await f.check(), { checked: 2, unformatted: [], errors: [] });
});

test('honors both CLI ignore files and skips unsupported files, symlinks and gitlinks', async (t) => {
  const f = await fixture(t);
  await f.write('.gitignore', 'git-ignored.js\n');
  await f.write('.prettierignore', 'prettier-ignored.js\n');
  for (const file of ['git-ignored.js', 'prettier-ignored.js', 'notes.txt', 'node_modules/file.js'])
    await f.write(file, bad);
  f.git('add', '-f', '.', 'node_modules/file.js');
  const blob = f.git('rev-parse', ':notes.txt');
  f.git('update-index', '--add', '--cacheinfo', `120000,${blob},link.js`);
  f.git('update-index', '--add', '--cacheinfo', `160000,${f.git('rev-parse', 'HEAD')},submodule`);
  assert.deepEqual(await f.check(), { checked: 0, unformatted: [], errors: [] });
});

test('skips staged deletions and checks the destination of a staged rename', async (t) => {
  const f = await fixture(t);
  f.git('rm', '--quiet', 'base.js');
  assert.deepEqual(await f.check(), { checked: 0, unformatted: [], errors: [] });
  await f.write('old name.js', good);
  f.git('add', 'old name.js');
  f.git('commit', '--quiet', '-m', 'add rename source');
  await rename(path.join(f.root, 'old name.js'), path.join(f.root, 'new name.js'));
  await f.write('new name.js', bad);
  f.git('add', '-A');
  assert.deepEqual(await f.check(), { checked: 1, unformatted: ['new name.js'], errors: [] });
});

test('reports parse errors as failures without changing the staged content', async (t) => {
  const f = await fixture(t);
  await f.write('invalid.js', 'const = ;\n');
  f.git('add', 'invalid.js');
  const stagedBefore = f.git('diff', '--cached', '--binary');
  const result = await f.check();
  assert.equal(result.checked, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].path, 'invalid.js');
  assert.equal(f.cli().status, 1);
  assert.equal(f.git('diff', '--cached', '--binary'), stagedBefore);
});

test('honors config parser overrides for otherwise unsupported paths', async (t) => {
  const f = await fixture(t);
  await f.write(
    '.prettierrc.json',
    JSON.stringify({
      singleQuote: true,
      overrides: [{ files: '*.custom', options: { parser: 'babel' } }],
    }),
  );
  await f.write('script.custom', bad);
  f.git('add', 'script.custom');
  assert.deepEqual(await f.check(), { checked: 1, unformatted: ['script.custom'], errors: [] });
});

async function installRealHooks(f) {
  // pnpm may create this generated file; the real repository also excludes it.
  await f.write('.prettierignore', 'pnpm-lock.yaml\n');
  f.git('config', 'core.hooksPath', '.githooks');
  for (const name of ['pre-commit', 'pre-push']) {
    await f.write(
      `.githooks/${name}`,
      await readFile(new URL(`../.githooks/${name}`, import.meta.url), 'utf8'),
    );
    await chmod(path.join(f.root, '.githooks', name), 0o755);
  }
  const prettierCli = fileURLToPath(
    new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url),
  );
  await f.write(
    'package.json',
    `${JSON.stringify(
      {
        private: true,
        packageManager: 'pnpm@12.6.0',
        scripts: {
          'format:staged': `node "${script.replaceAll('\\', '/')}"`,
          'format:check': `node "${prettierCli.replaceAll('\\', '/')}" --check .`,
          'check:games': 'node -e "console.log(\'game-check-ran\')"',
        },
      },
      null,
      2,
    )}\n`,
  );
  return (name) =>
    spawnSync('git', ['hook', 'run', name], {
      cwd: f.root,
      encoding: 'utf8',
      timeout: 30000,
      // This fixture has no toolchain lockfile. Reuse the installed pnpm rather than
      // bootstrapping packageManager dependencies; pnpm 11/12 uses pmOnFail for this:
      // https://pnpm.io/settings/cli#pmonfail. The real hooks and scripts still execute.
      env: {
        ...process.env,
        PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
        PNPM_CONFIG_PM_ON_FAIL: 'ignore',
      },
    });
}

test('the real pre-commit hook rejects bad staged content and succeeds after restaging', async (t) => {
  const f = await fixture(t);
  const hook = await installRealHooks(f);
  await f.write('partially staged.js', bad);
  f.git('add', 'partially staged.js');
  await f.write('partially staged.js', good);
  const stagedBefore = f.git('diff', '--cached', '--binary');
  const rejected = hook('pre-commit');
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stderr, /partially staged\.js/);
  assert.equal(f.git('diff', '--cached', '--binary'), stagedBefore);
  assert.equal(await readFile(path.join(f.root, 'partially staged.js'), 'utf8'), good);
  f.git('add', 'partially staged.js');
  const stagedGood = f.git('diff', '--cached', '--binary');
  const accepted = hook('pre-commit');
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.equal(f.git('diff', '--cached', '--binary'), stagedGood);
  assert.equal(await readFile(path.join(f.root, 'partially staged.js'), 'utf8'), good);
});

test('the real pre-push hook fails on formatting before a successful game checker can run', async (t) => {
  const f = await fixture(t);
  const hook = await installRealHooks(f);
  await f.write('bad.js', bad);
  const rejected = hook('pre-push');
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stderr, /bad\.js/);
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /game-check-ran/);
  assert.equal(await readFile(path.join(f.root, 'bad.js'), 'utf8'), bad);
  await f.write('bad.js', good);
  const accepted = hook('pre-push');
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.match(accepted.stdout + accepted.stderr, /game-check-ran/);
});
