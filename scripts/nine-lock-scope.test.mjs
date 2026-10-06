import assert from 'node:assert/strict';
import test from 'node:test';
import { nineLockFileScopes } from './nine-lock-scope.mjs';

const LOCK = 'pnpm-lock.yaml';
const SHELL = 'apps/shell-minigame';
const ALIPAY = 'platforms/alipay';
const TRAVEL = 'games/local/travel-bund';
const serialize = (value) => JSON.stringify(value, null, 2) + '\n';
const entry = (name, specifier, version) =>
  `      ${name.startsWith('@') ? `'${name}'` : name}:\n        specifier: ${specifier}\n        version: ${version}\n`;
const shellLink = entry(
  '@coffeeeeffoc/platform-alipay',
  'workspace:*',
  'link:../../platforms/alipay',
);
const draco = entry('draco3d', '1.5.7', '1.5.7');
const esbuild = entry('esbuild', '0.28.2', '0.28.2');
const eslint = entry('eslint', '9.35.0', '9.35.0(jiti@2.7.0)(supports-color@10.2.2)');
const typescript = entry('typescript', '7.0.2', '7.0.2');
const native = entry(
  '@coffeeeeffoc/native-game-shell',
  'workspace:*',
  'link:../../packages/native-game-shell',
);
const config =
  entry('@coffeeeeffoc/config-eslint', 'workspace:*', 'link:../../packages/config-eslint') +
  entry('@coffeeeeffoc/config-typescript', 'workspace:*', 'link:../../packages/config-typescript');
const alipayImporter = `  ${ALIPAY}:\n    dependencies:\n${native}    devDependencies:\n${config}${eslint}${typescript}\n`;
const dracoPackage = '  draco3d@1.5.7:\n    resolution: {integrity: sha512-AAAA==}\n\n';
const esbuildPackage =
  "  esbuild@0.28.2:\n    resolution: {integrity: sha512-BBBB==}\n    engines: {node: '>=18'}\n    hasBin: true\n\n";
const dracoSnapshot = '  draco3d@1.5.7: {}\n\n';
const esbuildSnapshot =
  '  esbuild@0.28.2:\n    optionalDependencies:\n      platform-binary: 0.28.2\n\n';
function fixture() {
  const scripts = {
    build: 'node scripts/build.mjs --all --preview',
    test: 'vitest run',
  };
  const shellBefore = {
    name: '@coffeeeeffoc/shell-minigame',
    scripts,
    dependencies: { '@coffeeeeffoc/native-game-shell': 'workspace:*' },
    devDependencies: { typescript: '7.0.2' },
  };
  const shellAfter = structuredClone(shellBefore);
  shellAfter.dependencies['@coffeeeeffoc/platform-alipay'] = 'workspace:*';
  Object.assign(shellAfter.scripts, {
    'build:nine': 'node scripts/nine-games-build.mjs',
    'test:nine:build': 'node --test scripts/*.test.mjs',
    'test:nine:native': 'node ../../scripts/nine-canvas-games-smoke.mjs',
    'test:nine:resources':
      'node --test ../../platforms/wechat/tests/native-resources.test.mjs ../../platforms/bilibili/tests/native-resources.test.mjs ../../platforms/douyin/tests/native-resources.test.mjs ../../platforms/kuaishou/tests/native-resources.test.mjs ../../platforms/alipay/tests/native-resources.test.mjs',
    test: 'vitest run tests && node --test scripts/*.test.mjs',
  });
  const travelBefore = {
    name: '@coffeeeeffoc/travel-bund',
    scripts: { test: 'node --test tests/*.test.ts' },
    dependencies: { react: '19.2.8' },
    devDependencies: { typescript: '7.0.2' },
  };
  const travelAfter = structuredClone(travelBefore);
  Object.assign(travelAfter.devDependencies, { draco3d: '1.5.7', esbuild: '0.28.2' });
  const alipay = {
    name: '@coffeeeeffoc/platform-alipay',
    dependencies: { '@coffeeeeffoc/native-game-shell': 'workspace:*' },
    devDependencies: {
      '@coffeeeeffoc/config-eslint': 'workspace:*',
      '@coffeeeeffoc/config-typescript': 'workspace:*',
      eslint: '9.35.0',
      typescript: '7.0.2',
    },
  };
  // Two YAML documents reflect pnpm 12's toolchain lock plus workspace lock.
  const prefix =
    "---\nlockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\npackages: {}\n\nsnapshots: {}\n\n---\nlockfileVersion: '9.0'\n\nimporters:\n\n";
  const tools = `  base-tools:\n    dependencies:\n${native}    devDependencies:\n${config}${eslint}${typescript}\n`;
  const shellBlock = `  ${SHELL}:\n    dependencies:\n${native}    devDependencies:\n${typescript}\n`;
  const travelBlock = `  ${TRAVEL}:\n    dependencies:\n${entry('react', '19.2.8', '19.2.8')}    devDependencies:\n${typescript}\n`;
  const tail = `packages:\n\n${dracoPackage}${esbuildPackage}snapshots:\n\n${dracoSnapshot}${esbuildSnapshot}`;
  const base = new Map([
    [LOCK, prefix + tools + shellBlock + travelBlock + tail],
    [`${SHELL}/package.json`, serialize(shellBefore)],
    [`${TRAVEL}/package.json`, serialize(travelBefore)],
  ]);
  const head = new Map([
    [
      LOCK,
      prefix +
        tools +
        shellBlock.replace(native, native + shellLink) +
        travelBlock.replace(typescript, draco + esbuild + typescript) +
        alipayImporter +
        tail,
    ],
    [`${SHELL}/package.json`, serialize(shellAfter)],
    [`${TRAVEL}/package.json`, serialize(travelAfter)],
    [`${ALIPAY}/package.json`, serialize(alipay)],
  ]);
  for (const [dir, name] of [
    ['packages/native-game-shell', '@coffeeeeffoc/native-game-shell'],
    ['packages/config-eslint', '@coffeeeeffoc/config-eslint'],
    ['packages/config-typescript', '@coffeeeeffoc/config-typescript'],
  ]) {
    base.set(`${dir}/package.json`, serialize({ name }));
    head.set(`${dir}/package.json`, serialize({ name }));
  }
  const read = (files) => (file) => {
    if (!files.has(file)) throw new Error(`Missing ${file}`);
    return files.get(file);
  };
  return {
    base,
    head,
    context: { changedPaths: [LOCK], readBase: read(base), readHead: read(head) },
  };
}
const mutate = (files, file, transform) => files.set(file, transform(files.get(file)));
const manifestMutation = (files, dir, transform) =>
  mutate(files, `${dir}/package.json`, (text) => {
    const value = JSON.parse(text);
    transform(value);
    return serialize(value);
  });
const denied = (f) => assert.equal(nineLockFileScopes(f.context).size, 0);

test('classifies only the three real package directories with existing transitive tool resolutions', () => {
  const f = fixture();
  assert.deepEqual([...nineLockFileScopes(f.context)], [[LOCK, [SHELL, ALIPAY, TRAVEL]]]);
  // No base draco/esbuild importer tuples exist: only the proven package/snapshot records.
  assert.equal(f.base.get(LOCK).includes(draco), false);
  assert.equal(f.base.get(LOCK).includes(esbuild), false);
});
test('does not read files when no lock change was requested', () => {
  const scopes = nineLockFileScopes({
    changedPaths: ['docs/readme.md'],
    readBase() {
      throw new Error('Unexpected read');
    },
    readHead() {
      throw new Error('Unexpected read');
    },
  });
  assert.equal(scopes.size, 0);
});
for (const [label, alter] of [
  ['missing base lock', (f) => f.base.delete(LOCK)],
  ['missing base Shell manifest', (f) => f.base.delete(`${SHELL}/package.json`)],
  ['missing base Travel manifest', (f) => f.base.delete(`${TRAVEL}/package.json`)],
  ['missing head Alipay manifest', (f) => f.head.delete(`${ALIPAY}/package.json`)],
  [
    'missing base workspace target manifest',
    (f) => f.base.delete('packages/config-eslint/package.json'),
  ],
  [
    'wrong Shell workspace link',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace('version: link:../../platforms/alipay', 'version: link:../../platforms/wechat'),
      ),
  ],
  [
    'wrong Alipay native link',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace(
          alipayImporter,
          alipayImporter.replace('packages/native-game-shell', 'packages/canvas-game-adapter'),
        ),
      ),
  ],
  [
    'duplicate new importer',
    (f) => mutate(f.head, LOCK, (s) => s.replace(alipayImporter, alipayImporter + alipayImporter)),
  ],
  [
    'preexisting Alipay importer',
    (f) => mutate(f.base, LOCK, (s) => s.replace('packages:\n', alipayImporter + 'packages:\n')),
  ],
  [
    'additional importer',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace(alipayImporter, alipayImporter + '  another-game: {}\n\n'),
      ),
  ],
  [
    'unknown quoted importer syntax',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace(alipayImporter, alipayImporter + "  'another-game': {}\n\n"),
      ),
  ],
  [
    'extra importer section',
    (f) => mutate(f.head, LOCK, (s) => s + '\nimporters:\n  hidden: {}\n'),
  ],
  [
    'changed unrelated resolution integrity',
    (f) => mutate(f.head, LOCK, (s) => s.replace('sha512-AAAA==', 'sha512-CCCC==')),
  ],
  [
    'added external package resolution',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace(
          'snapshots:\n\n',
          '  external@1.0.0:\n    resolution: {integrity: sha512-DDDD==}\n\nsnapshots:\n\n',
        ),
      ),
  ],
  [
    'changed snapshot dependency',
    (f) =>
      mutate(f.head, LOCK, (s) => s.replace('platform-binary: 0.28.2', 'platform-binary: 0.28.3')),
  ],
  ['additional snapshot', (f) => mutate(f.head, LOCK, (s) => s + '  external@1.0.0: {}\n')],
  [
    'different Alipay peer resolution',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace(alipayImporter, alipayImporter.replace('jiti@2.7.0', 'jiti@2.8.0')),
      ),
  ],
  [
    'duplicate Alipay dependency key',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace(alipayImporter, alipayImporter.replace(eslint, eslint + eslint)),
      ),
  ],
  [
    'new external Alipay dependency',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace(
          alipayImporter,
          alipayImporter.replace(typescript, typescript + entry('external', '1.0.0', '1.0.0')),
        ),
      ),
  ],
  [
    'Travel wildcard specifier',
    (f) => mutate(f.head, LOCK, (s) => s.replace(draco, entry('draco3d', '^1.5.7', '1.5.7'))),
  ],
  [
    'Travel resolved version mismatch',
    (f) => mutate(f.head, LOCK, (s) => s.replace(esbuild, entry('esbuild', '0.28.2', '0.28.3'))),
  ],
  [
    'Alipay tuple moved to wrong section',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s.replace(
          alipayImporter,
          alipayImporter.replace('    dependencies:', '    optionalDependencies:'),
        ),
      ),
  ],
  [
    'Shell tuple moved to devDependencies',
    (f) =>
      mutate(f.head, LOCK, (s) =>
        s
          .replace(shellLink, '')
          .replace(
            `    devDependencies:\n${typescript}`,
            `    devDependencies:\n${shellLink}${typescript}`,
          ),
      ),
  ],
  ['lock newline normalization', (f) => mutate(f.head, LOCK, (s) => s.replaceAll('\n', '\r\n'))],
  ['lock extra trailing byte', (f) => mutate(f.head, LOCK, (s) => s + '\n')],
  [
    'Alipay manifest tool mismatch',
    (f) =>
      manifestMutation(f.head, ALIPAY, (p) => {
        p.devDependencies.typescript = '7.0.3';
      }),
  ],
  [
    'Alipay manifest additional dependency',
    (f) =>
      manifestMutation(f.head, ALIPAY, (p) => {
        p.dependencies.external = '1.0.0';
      }),
  ],
  [
    'Alipay manifest optional dependency',
    (f) =>
      manifestMutation(f.head, ALIPAY, (p) => {
        p.optionalDependencies = { external: '1.0.0' };
      }),
  ],
  [
    'Alipay package name mismatch',
    (f) =>
      manifestMutation(f.head, ALIPAY, (p) => {
        p.name = '@coffeeeeffoc/platform-other';
      }),
  ],
  [
    'workspace link target package mismatch',
    (f) =>
      manifestMutation(f.head, 'packages/config-eslint', (p) => {
        p.name = '@coffeeeeffoc/config-typescript';
      }),
  ],
  [
    'Travel manifest draco version mismatch',
    (f) =>
      manifestMutation(f.head, TRAVEL, (p) => {
        p.devDependencies.draco3d = '^1.5.7';
      }),
  ],
  [
    'Travel extra unrelated dependency',
    (f) =>
      manifestMutation(f.head, TRAVEL, (p) => {
        p.dependencies.extra = '1.0.0';
      }),
  ],
  [
    'Travel unrelated script change',
    (f) =>
      manifestMutation(f.head, TRAVEL, (p) => {
        p.scripts.test = 'echo passed';
      }),
  ],
  [
    'Shell unauthorized test script',
    (f) =>
      manifestMutation(f.head, SHELL, (p) => {
        p.scripts.test = 'vitest run || true';
      }),
  ],
  [
    'Shell reviewed script value differs',
    (f) =>
      manifestMutation(f.head, SHELL, (p) => {
        p.scripts['build:nine'] += ' --skip-validation';
      }),
  ],
  [
    'Shell additional script',
    (f) =>
      manifestMutation(f.head, SHELL, (p) => {
        p.scripts.extra = 'echo hidden';
      }),
  ],
  [
    'Shell base test was not reviewed value',
    (f) =>
      manifestMutation(f.base, SHELL, (p) => {
        p.scripts.test = 'echo skipped';
      }),
  ],
  [
    'Shell extra development dependency',
    (f) =>
      manifestMutation(f.head, SHELL, (p) => {
        p.devDependencies.extra = '1.0.0';
      }),
  ],
  [
    'JSON duplicate key',
    (f) =>
      mutate(f.head, `${ALIPAY}/package.json`, (s) =>
        s.replace('  "name":', '  "name": "discarded",\n  "name":'),
      ),
  ],
]) {
  test(`fails closed: ${label}`, () => {
    const f = fixture();
    alter(f);
    denied(f);
  });
}
for (const [label, record] of [
  ['draco package', dracoPackage],
  ['esbuild package', esbuildPackage],
  ['draco snapshot', dracoSnapshot],
  ['esbuild snapshot', esbuildSnapshot],
]) {
  test(`requires unique base ${label} even when all other lock bytes match`, () => {
    for (const replacement of ['', record + record]) {
      const f = fixture();
      mutate(f.base, LOCK, (s) => s.replace(record, replacement));
      mutate(f.head, LOCK, (s) => s.replace(record, replacement));
      denied(f);
    }
  });
}
test('requires a real base integrity record for promoted tools', () => {
  const f = fixture();
  for (const files of [f.base, f.head])
    mutate(files, LOCK, (s) => s.replace('    resolution: {integrity: sha512-AAAA==}\n', ''));
  denied(f);
});

test('rejects semantically duplicate quoted base package/snapshot keys', () => {
  for (const record of [dracoPackage, dracoSnapshot, esbuildPackage, esbuildSnapshot]) {
    for (const quote of ["'", '"']) {
      const f = fixture();
      const quoted = record.replace(
        /^ {2}([^:]+):/,
        (_match, name) => `  ${quote}${name}${quote}:`,
      );
      for (const files of [f.base, f.head])
        mutate(files, LOCK, (value) => value.replace(record, record + quoted));
      denied(f);
    }
  }
});
test('fails closed on quoted importer names even if base and head both contain them', () => {
  const f = fixture();
  for (const files of [f.base, f.head])
    mutate(files, LOCK, (value) => value.replace('  base-tools:', "  'base-tools':"));
  denied(f);
});
