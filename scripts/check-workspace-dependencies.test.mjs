import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateWorkspace } from './check-workspace-dependencies.mjs';

async function createWorkspace(packages) {
  const root = await mkdtemp(path.join(tmpdir(), 'small-games-boundaries-'));

  for (const workspacePackage of packages) {
    const packageRoot = path.join(root, workspacePackage.path);
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      path.join(packageRoot, 'package.json'),
      `${JSON.stringify(workspacePackage.manifest, null, 2)}\n`,
    );

    for (const [relativePath, source] of Object.entries(workspacePackage.files ?? {})) {
      const filePath = path.join(packageRoot, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, source);
    }
  }

  return root;
}

test('allows workspace dependencies through declared public exports', async (t) => {
  const root = await createWorkspace([
    {
      path: 'packages/contract',
      manifest: {
        name: '@coffeeeeffoc/game-contract',
        exports: { '.': './src/index.ts', './testing': './src/testing.ts' },
      },
      files: { 'src/index.ts': 'export const version = 1;\n' },
    },
    {
      path: 'apps/game-demo',
      manifest: {
        name: '@coffeeeeffoc/game-demo',
        coffeeeeffoc: { role: 'game' },
        dependencies: { '@coffeeeeffoc/game-contract': 'workspace:*' },
      },
      files: {
        'src/index.ts': "import { version } from '@coffeeeeffoc/game-contract';\nvoid version;\n",
      },
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.deepEqual(await validateWorkspace(root), []);
});

test('rejects private subpath and cross-package relative imports', async (t) => {
  const root = await createWorkspace([
    {
      path: 'packages/contract',
      manifest: {
        name: '@coffeeeeffoc/game-contract',
        exports: {
          '.': './src/index.ts',
          './src/internal/secret': './src/internal/secret.ts',
        },
      },
      files: { 'src/internal/secret.ts': 'export const secret = true;\n' },
    },
    {
      path: 'apps/game-demo',
      manifest: {
        name: '@coffeeeeffoc/game-demo',
        coffeeeeffoc: { role: 'game' },
        dependencies: { '@coffeeeeffoc/game-contract': 'workspace:*' },
      },
      files: {
        'src/private.ts': "import '@coffeeeeffoc/game-contract/src/internal/secret';\n",
        'src/relative.ts': "import '../../../packages/contract/src/internal/secret';\n",
      },
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const violations = await validateWorkspace(root);
  assert.equal(violations.filter((violation) => violation.code === 'internal-import').length, 1);
  assert.equal(
    violations.filter((violation) => violation.code === 'cross-package-relative').length,
    1,
  );
});

test('requires an explicit root export', async (t) => {
  const root = await createWorkspace([
    {
      path: 'packages/hidden',
      manifest: { name: '@coffeeeeffoc/hidden' },
      files: { 'src/index.ts': 'export const hidden = true;\n' },
    },
    {
      path: 'apps/web-shell',
      manifest: {
        name: '@coffeeeeffoc/web-shell',
        coffeeeeffoc: { role: 'shell' },
        dependencies: { '@coffeeeeffoc/hidden': 'workspace:*' },
      },
      files: { 'src/index.ts': "import '@coffeeeeffoc/hidden';\n" },
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const violations = await validateWorkspace(root);
  assert.equal(violations.filter((violation) => violation.code === 'private-export').length, 1);
});

test('rejects game dependencies on shells and services', async (t) => {
  const root = await createWorkspace([
    {
      path: 'apps/web-shell',
      manifest: {
        name: '@coffeeeeffoc/web-shell',
        coffeeeeffoc: { role: 'shell' },
      },
    },
    {
      path: 'services/runtime',
      manifest: {
        name: '@coffeeeeffoc/runtime-service',
        coffeeeeffoc: { role: 'service' },
      },
    },
    {
      path: 'games/independent-game',
      manifest: {
        name: '@coffeeeeffoc/independent-game',
        dependencies: {
          '@coffeeeeffoc/runtime-service': 'workspace:*',
          '@coffeeeeffoc/web-shell': 'workspace:*',
        },
      },
      files: { 'src/index.ts': "import '@coffeeeeffoc/web-shell';\n" },
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const violations = await validateWorkspace(root);
  assert.equal(violations.filter((violation) => violation.code === 'game-layer').length, 3);
});

test('reports the complete workspace dependency cycle', async (t) => {
  const root = await createWorkspace([
    {
      path: 'packages/a',
      manifest: {
        name: '@coffeeeeffoc/a',
        dependencies: { '@coffeeeeffoc/b': 'workspace:*' },
      },
    },
    {
      path: 'packages/b',
      manifest: {
        name: '@coffeeeeffoc/b',
        dependencies: { '@coffeeeeffoc/c': 'workspace:*' },
      },
    },
    {
      path: 'packages/c',
      manifest: {
        name: '@coffeeeeffoc/c',
        dependencies: { '@coffeeeeffoc/a': 'workspace:*' },
      },
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const violations = await validateWorkspace(root);
  assert.deepEqual(
    violations.filter((violation) => violation.code === 'dependency-cycle'),
    [
      {
        code: 'dependency-cycle',
        message:
          'Workspace dependency cycle: @coffeeeeffoc/a -> @coffeeeeffoc/b -> @coffeeeeffoc/c -> @coffeeeeffoc/a',
      },
    ],
  );
});
