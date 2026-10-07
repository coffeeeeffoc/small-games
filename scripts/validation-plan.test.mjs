import './incremental-validation.test.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskPlan, affectedPackages } from './validation-plan.mjs';
const scope = { required: true, full: false, game_ids: ['a'], game_sources: ['games/local/a'] };
const plan = (paths, source = '', extra = {}) =>
  riskPlan({ changedPaths: paths, scope, readSource: () => source, ...extra });
test('rules and numeric modules do not request browser', () => {
  assert.deepEqual(plan(['games/local/a/rules.mjs']).browser_ids, []);
  assert.equal(plan(['games/local/a/core/engine.ts']).risk, 'rules');
});
test('UI requests related game browser/touch suite', () =>
  assert.deepEqual(plan(['games/local/a/ui.tsx']).browser_ids, ['a']));
test('mixed, dynamic, unknown and missing comparison are conservative', () => {
  for (const result of [
    plan(['games/local/a/rules.mjs', 'games/local/a/style.css']),
    plan(['games/local/a/core.ts'], 'import(foo)'),
    plan(['games/local/a/game.js']),
    plan([], '', { diffAvailable: false }),
  ])
    assert.equal(result.full, true);
});
test('semantic registry, metadata and docs do not request gameplay', () => {
  assert.deepEqual(
    plan(['apps/shell-web/src/game-meta.json'], '', {
      scope: { ...scope, game_ids: [], game_sources: [] },
    }).browser_ids,
    [],
  );
  assert.deepEqual(
    plan(['games/local/a/README.md'], '', {
      scope: { ...scope, game_ids: [], game_sources: [], required: false },
    }).browser_ids,
    [],
  );
});
test('dependent closure includes consumers transitively', () => {
  const pkgs = [
    { name: 'a', dir: 'packages/a' },
    { name: 'b', dir: 'packages/b', dependencies: { a: 'workspace:*' } },
    { name: 'c', dir: 'apps/c', dependencies: { b: 'workspace:*' } },
  ];
  assert.deepEqual(
    affectedPackages(pkgs, ['packages/a/src/a.ts']).map((p) => p.name),
    ['a', 'b', 'c'],
  );
});

test('shared CLI plan selects real rule/UI diffs and preserves affected games through docs successors', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { run, cleanGitEnv } = await import('./validate-push.mjs');
  const { main } = await import('./pages-test-scope.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'risk-cli-'));
  const env = cleanGitEnv({
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  const git = (...args) => run('git', args, root, env, true);
  try {
    await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
    for (const id of ['a', 'b']) {
      await mkdir(path.join(root, `games/local/${id}`), { recursive: true });
      await writeFile(
        path.join(root, `games/local/${id}/package.json`),
        JSON.stringify({ name: id }),
      );
      await writeFile(path.join(root, `games/local/${id}/rules.mjs`), 'export const points = 1;');
    }
    await writeFile(
      path.join(root, 'apps/shell-web/src/standalone-games.json'),
      JSON.stringify(
        ['a', 'b'].map((id) => ({
          id,
          source: `games/local/${id}`,
          title: id,
          description: id,
          output: 'dist',
        })),
      ),
    );
    git('init');
    git('add', '.');
    git('commit', '-m', 'baseline');
    const base = git('rev-parse', 'HEAD');
    const select = () =>
      main(
        { VALIDATION_RISK_PLAN: 'true', GITHUB_EVENT_NAME: 'push', PAGES_DIFF_BASE: base },
        root,
      );
    await writeFile(path.join(root, 'games/local/a/rules.mjs'), 'export const points = 2;');
    git('commit', '-am', 'rules');
    assert.deepEqual((await select()).browser_ids, []);
    await writeFile(path.join(root, 'README.md'), 'docs after an unvalidated rule change');
    git('add', '.');
    git('commit', '-m', 'docs');
    assert.deepEqual((await select()).game_sources, ['games/local/a']);
    await writeFile(path.join(root, 'games/local/a/layout.css'), 'body { color: red; }');
    git('add', '.');
    git('commit', '-m', 'mixed');
    const mixed = await select();
    assert.equal(mixed.full, false);
    assert.deepEqual(mixed.browser_ids, ['a']);
    assert.deepEqual(mixed.game_sources, ['games/local/a']);
    assert.equal(mixed.cocos, false);
    const head = git('rev-parse', 'HEAD');
    await writeFile(path.join(root, 'games/local/a/layout.css'), 'body { color: blue; }');
    git('commit', '-am', 'ui');
    const ui = await main({ VALIDATION_RISK_PLAN: 'true', PAGES_DIFF_BASE: head }, root);
    assert.equal(ui.full, false);
    assert.deepEqual(ui.browser_ids, ['a']);
    assert.equal(ui.diff_base, head);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ordinary game static checks need shared emitted inputs, not unrelated Creator web builds', async () => {
  const { staticBuildTargets, requiresCocos } = await import('./validation-plan.mjs');
  const packages = [
    { name: 'a', dir: 'games/local/a', scripts: { build: 'node build.mjs' }, exports: '.' },
    {
      name: 'core',
      dir: 'packages/core',
      scripts: { build: 'tsc' },
      exports: { '.': { default: './dist/index.js' } },
    },
    {
      name: 'kart',
      dir: 'games/local/kart',
      scripts: { build: 'creator' },
      creator: { version: '3.8.8' },
      exports: { './race': './assets/race.ts' },
    },
    {
      name: 'shell',
      dir: 'apps/shell',
      scripts: { build: 'vite', typecheck: 'tsc' },
      dependencies: { a: 'workspace:*', core: 'workspace:*', kart: 'workspace:*' },
    },
  ];
  const affected = affectedPackages(packages, ['games/local/a/rules.mjs']);
  assert.deepEqual(
    staticBuildTargets(packages, [packages[0]], affected).map((pkg) => pkg.name),
    ['a', 'core'],
  );
  assert.equal(
    requiresCocos(packages, ['games/local/a/rules.mjs'], {
      required: true,
      risk: 'rules',
      full: false,
    }),
    false,
  );
  assert.equal(requiresCocos(packages, [], { full: true }), true);
  assert.equal(requiresCocos(packages, ['README.md'], { full: false }), false);
  assert.equal(
    requiresCocos(packages, ['games/local/kart/rules.mjs'], {
      full: false,
      risk: 'rules',
      required: true,
    }),
    true,
  );
  packages[2].exports = { '.': './dist/index.js' };
  assert.equal(
    requiresCocos(packages, ['games/local/a/rules.mjs'], {
      full: false,
      risk: 'rules',
      required: true,
    }),
    true,
    'a real emitted Creator dependency cannot be skipped',
  );
});
