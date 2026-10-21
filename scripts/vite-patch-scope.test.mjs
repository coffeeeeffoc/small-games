import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  matchesLockPair,
  isViteManifestPatch,
  vitePatchFileScopes,
  viteBuildSources,
  viteTestSources,
  viteSmokeSources,
  viteNativeSources,
  viteNativeNodeTests,
  hasVitePatch,
} from './vite-patch-scope.mjs';
import { runIncrementalToolChecks } from './validate-tree.mjs';
import { selectedShellEnvironment } from './run-selected-shell.mjs';

test('Vite patch exercises production built-ins without broadening ordinary game changes', () => {
  const plan = { full: false, browser_ids: ['out-of-frame'] };
  const ordinary = selectedShellEnvironment(plan, { PAGES_SKIP_BUILTINS: '0' });
  const patched = selectedShellEnvironment(
    { ...plan, vite_patch: true },
    { PAGES_SKIP_BUILTINS: '1' },
  );
  assert.equal(ordinary.PAGES_SKIP_BUILTINS, '1');
  assert.equal(patched.PAGES_SKIP_BUILTINS, '0');
  assert.deepEqual(JSON.parse(patched.PAGES_GAME_IDS), plan.browser_ids);
});

const hash = (value) => createHash('sha256').update(value).digest('hex');
test('lock proof binds both pnpm documents and every resolution byte', () => {
  const before = '---\nimporters: old\n---\npackages: old\n';
  const after = '---\nimporters: new\n---\npackages: patched\n';
  const pairs = { bases: [hash(before)], head: hash(after) };
  assert.equal(matchesLockPair(before, after, pairs), true);
  for (const changed of [
    after + '\n',
    after.replace('patched', 'tampered'),
    after.replace('new', 'extra'),
    after.replaceAll('\n', '\r\n'),
  ])
    assert.equal(matchesLockPair(before, changed, pairs), false);
  assert.equal(matchesLockPair(before + ' ', after, pairs), false);
  assert.equal(
    vitePatchFileScopes({
      changedPaths: ['pnpm-lock.yaml'],
      readBase: () => before,
      readHead: () => after,
    }).size,
    0,
  );
});
test('manifest proof accepts only minimum repaired release lines', () => {
  const before = {
    scripts: { build: 'vite build' },
    devDependencies: { vite: '8.2.2', vitest: '5.0.0' },
  };
  const after = structuredClone(before);
  after.devDependencies.vite = '8.2.4';
  assert.equal(isViteManifestPatch(before, after), true);
  for (const mutate of [
    (p) => (p.scripts.build = 'true'),
    (p) => (p.devDependencies.vitest = '6.0.0'),
    (p) => (p.devDependencies.extra = '1.0.0'),
    (p) => (p.devDependencies.vite = '9.0.0'),
    (p) => (p.pnpm = { overrides: { anything: '1.0.0' } }),
  ]) {
    const bad = structuredClone(after);
    mutate(bad);
    assert.equal(isViteManifestPatch(before, bad), false);
  }
  const oldPuzzle = { devDependencies: { vite: '^8.3.0' } };
  assert.equal(isViteManifestPatch(oldPuzzle, { devDependencies: { vite: '8.3.3' } }), true);
  assert.equal(isViteManifestPatch(oldPuzzle, { devDependencies: { vite: '8.3.0' } }), false);
  const shellOld = { ...before, dependencies: {} },
    shellNew = { ...after, dependencies: { '@coffeeeeffoc/ashfall-front': 'workspace:*' } };
  assert.equal(isViteManifestPatch(shellOld, shellNew), false);
  assert.equal(isViteManifestPatch(shellOld, shellNew, true), true);
  shellNew.dependencies.extra = 'workspace:*';
  assert.equal(isViteManifestPatch(shellOld, shellNew, true), false);
});
test('Vite tests are separate from runtime consumers, and unknown locks do not activate them', () => {
  assert.equal(viteBuildSources.includes('packages/game-host'), false);
  assert.equal(viteTestSources.includes('packages/game-host'), true);
  assert.equal(viteBuildSources.includes('games/local/travel-bund'), true);
  assert.equal(viteBuildSources.includes('games/local/letters-words2'), true);
  assert.equal(hasVitePatch(['pnpm-lock.yaml'], new Map()), false);
  assert.equal(
    hasVitePatch(['pnpm-lock.yaml'], new Map([['pnpm-lock.yaml', viteBuildSources]])),
    true,
  );
  assert.equal(hasVitePatch([], new Map([['pnpm-lock.yaml', viteBuildSources]])), false);
});
test('all 30 test consumers and built-in/app smokes execute, native acceptance is explicit', () => {
  const sources = [...new Set([...viteTestSources, ...viteSmokeSources])];
  const packages = sources.map((dir) => ({
    dir,
    name: dir,
    devDependencies: { vitest: '5.0.0' },
    scripts: {
      test:
        dir === 'apps/shell-minigame'
          ? 'vitest run tests && node --test scripts/*.test.mjs'
          : 'vitest run',
      smoke: 'node smoke.mjs',
    },
  }));
  const run = (enabled) => {
    const calls = [];
    runIncrementalToolChecks({
      plan: { vite_patch: true, native_consumers: [], developer_mode_ids: [] },
      packages,
      root: '.',
      env: { MINIGAME_RELEASE_GATES: enabled },
      execute: (command, args) => calls.push([command, ...args]),
    });
    return calls;
  };
  const calls = run('0');
  for (const source of viteTestSources.filter((source) => source !== 'apps/shell-minigame'))
    assert(
      calls.some((c) => c.join(' ') === 'pnpm --filter ' + source + ' test'),
      source,
    );
  assert(
    calls.some((c) => c.join(' ') === 'pnpm --filter apps/shell-minigame exec vitest run tests'),
  );
  assert(
    calls.some(
      (c) =>
        c[0] === process.execPath &&
        c.slice(1).join(' ') === ['--test', ...viteNativeNodeTests].join(' '),
    ),
  );
  assert(!calls.some((c) => c.join(' ') === 'pnpm --filter apps/shell-minigame test'));
  for (const source of viteSmokeSources)
    assert(
      calls.some((c) => c.join(' ') === 'pnpm --filter ' + source + ' smoke'),
      source,
    );
  for (const source of viteNativeSources)
    assert(!calls.some((c) => c.join(' ') === 'pnpm --filter ' + source + ' smoke'), source);
  const enabled = run('1');
  for (const source of viteNativeSources)
    assert(
      enabled.some((c) => c.join(' ') === 'pnpm --filter ' + source + ' smoke'),
      source,
    );
  assert.throws(
    () =>
      runIncrementalToolChecks({
        plan: { vite_patch: true, native_consumers: [], developer_mode_ids: [] },
        packages: packages.slice(1),
        root: '.',
        env: {},
        execute: () => {},
      }),
    /Missing audited Vite test consumer/,
  );
  packages.find((pkg) => pkg.dir === 'apps/shell-minigame').scripts.test += ' && extra';
  assert.throws(() => run('0'), /Unreviewed mixed native test command/);
});
