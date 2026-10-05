import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertNodeOnly } from './validate-tree.mjs';
test('pure test dependency traversal and glob expansion; browser, unknown and missing tests fail closed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pure-tests-'));
  try {
    await writeFile(path.join(dir, 'rules.mjs'), 'export const result = 1;');
    await writeFile(
      path.join(dir, 'rules.test.mjs'),
      "import assert from 'node:assert'; import { result } from './rules.mjs'; assert(result);",
    );
    await assertNodeOnly('node --test *.test.mjs', dir);
    for (const command of [
      'playwright test',
      'unknown test',
      'node missing.mjs',
      'node --test empty*.mjs',
    ])
      await assert.rejects(assertNodeOnly(command, dir));
    await writeFile(path.join(dir, 'rules.mjs'), "import { chromium } from '@playwright/test';");
    await assert.rejects(assertNodeOnly('node --test rules.test.mjs', dir), /Unreviewed/);
    await writeFile(path.join(dir, 'rules.mjs'), "import cp from 'node:child_process';");
    await assert.rejects(assertNodeOnly('node --test rules.test.mjs', dir), /Executable/);
    await writeFile(path.join(dir, 'rules.mjs'), 'export const run = () => import(target);');
    await assert.rejects(assertNodeOnly('node --test rules.test.mjs', dir), /Unreviewed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Cocos pure rule policy retains exact files without modifying Creator package inputs', async () => {
  const { ruleTask, cocosRuleCommands } = await import('./rule-tasks.mjs');
  for (const [dir, command] of Object.entries(cocosRuleCommands)) {
    const task = ruleTask({
      dir,
      name: dir.split('/').at(-1),
      scripts: { test: 'unsafe browser' },
    });
    assert.equal(task.command, command);
    assert.deepEqual(task.args.slice(2), ['exec', ...command.split(' ')]);
    await assertNodeOnly(command, path.resolve(dir));
  }
});

test('imported browser lint retains rules and declares URLSearchParams read-only', async () => {
  const { staticTaskArgs } = await import('./rule-tasks.mjs');
  const pkg = { dir: 'games/submodules/fishing', name: 'tidebreak', scripts: { lint: 'eslint .' } };
  assert.deepEqual(staticTaskArgs(pkg, 'lint'), [
    '--filter',
    'tidebreak',
    'lint',
    '--global',
    'URLSearchParams',
  ]);
  assert.deepEqual(staticTaskArgs(pkg, 'typecheck'), ['--filter', 'tidebreak', 'typecheck']);
  assert.deepEqual(staticTaskArgs({ ...pkg, dir: 'games/local/a' }, 'lint'), [
    '--filter',
    'tidebreak',
    'lint',
  ]);
});

test('lint follows explicit tracked repository scope; absent or unknown exclusions never skip', async () => {
  const { lintExcludedByRepository } = await import('./rule-tasks.mjs');
  const external = { dir: 'games/submodules/tower-defense-game' };
  const manifest = { scripts: { lint: 'turbo run lint --filter=!./games/submodules/*' } };
  assert.equal(lintExcludedByRepository(external, manifest), true);
  assert.equal(lintExcludedByRepository({ dir: 'games/local/a' }, manifest), false);
  assert.equal(lintExcludedByRepository(external, { scripts: { lint: 'turbo run lint' } }), false);
  assert.equal(
    lintExcludedByRepository(external, {
      scripts: { lint: 'turbo run lint --filter=!something-else' },
    }),
    false,
  );
});

test('aggregate coverage requires the exact same rule command and an unfiltered root task', async () => {
  const { rulesCoveredByAggregate } = await import('./rule-tasks.mjs');
  const manifest = {
    scripts: { test: 'node --test scripts/platform-process.test.mjs && turbo run test' },
  };
  const pkg = {
    name: 'a',
    dir: 'games/local/a',
    scripts: { test: 'node --test tests/*.test.mjs' },
  };
  const tasks = new Map([['a', { command: pkg.scripts.test, directory: pkg.dir }]]);
  assert.equal(rulesCoveredByAggregate(pkg, manifest, tasks), true);
  assert.equal(rulesCoveredByAggregate(pkg, manifest), false);
  assert.equal(rulesCoveredByAggregate(pkg, manifest, new Map()), false);
  assert.equal(
    rulesCoveredByAggregate(
      pkg,
      manifest,
      new Map([['a', { command: pkg.scripts.test, directory: 'games/local/other' }]]),
    ),
    false,
  );
  assert.equal(
    rulesCoveredByAggregate(
      pkg,
      manifest,
      new Map([['a', { command: 'node other.test.mjs', directory: pkg.dir }]]),
    ),
    false,
  );
  assert.equal(
    rulesCoveredByAggregate(
      pkg,
      manifest,
      new Map([['a', { command: pkg.scripts.test, directory: 'games\\local\\a' }]]),
    ),
    true,
  );
  assert.equal(
    rulesCoveredByAggregate(
      { ...pkg, scripts: { ...pkg.scripts, 'test:rules': 'node rules.mjs' } },
      manifest,
      tasks,
    ),
    false,
  );
  for (const command of [
    'turbo run test --filter=a',
    manifest.scripts.test + ' --affected',
    manifest.scripts.test + ' --filter=!a',
    'node custom-tests.mjs',
  ])
    assert.equal(rulesCoveredByAggregate(pkg, { scripts: { test: command } }, tasks), false);
  assert.equal(
    rulesCoveredByAggregate({ name: 'a', dir: 'games/local/a', scripts: {} }, manifest, tasks),
    false,
  );
  assert.equal(
    rulesCoveredByAggregate(
      { dir: 'games/local/carding-car', scripts: { test: 'node --test tests/*.test.ts' } },
      manifest,
      tasks,
    ),
    false,
  );
});
