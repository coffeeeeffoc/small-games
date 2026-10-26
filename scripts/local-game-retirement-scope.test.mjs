import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  localRetirementScopesForReview,
  hasLocalRetirementDeletionProof,
  isReviewedLocalRetirementDeletion,
} from './local-game-retirement-scope.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('cumulative retirement rename and Porcelain studio lock retain exact registration and consumer proofs', async () => {
  const { execFileSync } = await import('node:child_process');
  const { deliveryRetirementFileScopes, hasLocalRetirementFileProof } = await import(
    './local-game-retirement-scope.mjs'
  );
  const base = '4e97662fd910758595c345f2985a805d1a19095d';
  const head = '95b1ca8121698c2ef38ffae2ef4f2c309cd06a7c';
  const lock = 'pnpm-lock.yaml';
  const studio = 'games/local/porcelain-puzzle/package.json';
  const registry = 'apps/shell-web/src/standalone-games.json';
  const cache = new Map();
  const git = (...args) => {
    const key = JSON.stringify(args);
    if (!cache.has(key))
      cache.set(
        key,
        execFileSync('git', args, {
          cwd: new URL('../', import.meta.url),
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        }),
      );
    return cache.get(key);
  };
  const options = {
    baseCommit: base,
    changedPaths: [lock, studio],
    readBase: (file) => git('show', base + ':' + file),
    readHead: (file) => git('show', head + ':' + file),
    readBaseEntry: (file) => git('--literal-pathspecs', 'ls-tree', base, '--', file),
    readHeadEntry: (file) => git('--literal-pathspecs', 'ls-tree', head, '--', file),
    headHasPath: (file) => git('--literal-pathspecs', 'ls-tree', head, '--', file) !== '',
  };
  const scopes = deliveryRetirementFileScopes(options);
  assert.deepEqual(scopes.get(lock), [
    'apps/shell-web',
    'games/local/place-and-clear',
    'apps/shell-minigame',
    'services/runtime-api',
    'games/local/porcelain-puzzle',
  ]);
  assert(hasLocalRetirementFileProof(lock, scopes.get(lock), options.readHead));
  assert(!hasLocalRetirementFileProof(lock, [...scopes.get(lock)], options.readHead));
  assert(!hasLocalRetirementDeletionProof(lock, scopes.get(lock)));
  const drift = (file, transform) => ({
    readHead: (name) =>
      name === file ? transform(options.readHead(name)) : options.readHead(name),
  });
  for (const extra of [
    { baseCommit: head },
    { readBase: (file) => options.readBase(file) + (file === lock ? '\n' : '') },
    drift(lock, (text) => text + '\n'),
    drift(lock, (text) => text.replace('specifier: 0.180.0', 'specifier: 0.181.0')),
    drift(lock, (text) => text.replace('integrity: sha512-', 'integrity: sha512-wrong')),
    drift(lock, (text) =>
      text.replace(
        '\n  games/local/porcelain-puzzle:',
        '\n  games/local/porcelain-puzzle: {}\n\n  games/local/porcelain-puzzle:',
      ),
    ),
    drift(studio, (text) => text.replace('"devDependencies"', '"dependencies"')),
    drift(studio, (text) => text.replace('node scripts/render-vessels.mjs', 'node unknown.mjs')),
    drift('apps/shell-web/package.json', (text) => text + '\n'),
    drift('apps/shell-minigame/package.json', (text) => text + '\n'),
    drift('services/runtime-api/package.json', (text) => text + '\n'),
    drift(registry, (text) =>
      JSON.stringify([
        ...JSON.parse(text),
        JSON.parse(text).find((game) => game.id === 'porcelain-puzzle'),
      ]),
    ),
    drift(registry, (text) =>
      JSON.stringify([...JSON.parse(text), { id: 'place-and-clear', source: 'games/local/other' }]),
    ),
    { headHasPath: () => true },
    {
      headHasPath: () => {
        throw Error('tree unavailable');
      },
    },
    {
      readHead: () => {
        throw Error('blob unavailable');
      },
    },
  ])
    assert(!deliveryRetirementFileScopes({ ...options, ...extra }).has(lock));

  const registrations = [
    'apps/shell-web/package.json',
    registry,
    'apps/shell-web/src/game-meta.json',
  ];
  const registrationOptions = { ...options, changedPaths: registrations };
  const registrationScopes = deliveryRetirementFileScopes(registrationOptions);
  for (const file of registrations) {
    assert.deepEqual(registrationScopes.get(file), [
      'apps/shell-web',
      'games/local/place-and-clear',
    ]);
    assert(hasLocalRetirementFileProof(file, registrationScopes.get(file), options.readHead));
    assert(!hasLocalRetirementFileProof(file, [...registrationScopes.get(file)], options.readHead));
    assert(!hasLocalRetirementDeletionProof(file, registrationScopes.get(file)));
    assert(
      !hasLocalRetirementFileProof(
        file,
        registrationScopes.get(file),
        (name) => options.readHead(name) + '\n',
      ),
    );
  }
  for (const extra of [
    ...registrations.flatMap((file) => [
      drift(file, (text) => text + '\n'),
      { readBase: (name) => options.readBase(name) + (name === file ? '\n' : '') },
      { headHasPath: (name) => (name === file ? false : options.headHasPath(name)) },
    ]),
    drift('apps/shell-minigame/package.json', (text) => text + '\n'),
    drift('services/runtime-api/package.json', (text) => text + '\n'),
    drift('games/local/place-and-clear/package.json', (text) =>
      text.replace('@coffeeeeffoc/place-and-clear', '@coffeeeeffoc/unknown'),
    ),
    { baseCommit: head },
    { headHasPath: () => true },
    { readBaseEntry: () => '' },
    {
      readHead: () => {
        throw Error('blob unavailable');
      },
    },
  ]) {
    const rejected = deliveryRetirementFileScopes({ ...registrationOptions, ...extra });
    for (const file of registrations) assert(!rejected.has(file), file);
  }
});

test('saved Pages retirement plus rename binds exact files and retains every surviving consumer', async () => {
  const { execFileSync } = await import('node:child_process');
  const {
    deliveryRetirementBase: base,
    deliveryRetirementTrees: trees,
    deliveryRetirementReviews,
    deliveryRenameRetirementReviews: reviews,
  } = await import('./local-game-retirement-reviews.mjs');
  const { localRetirementFileScopes, localRetirementHeadQueryPaths, hasLocalRetirementFileProof } =
    await import('./local-game-retirement-scope.mjs');
  const { gameRenameFileScopes, isReviewedGameRename } = await import('./game-rename-scope.mjs');
  const head = 'ff34bc7c74d5643f78b05c7b1b0135ea0c59ed62';
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const entries = (ref) =>
    new Map(
      git('ls-tree', '-r', '-t', ref)
        .trimEnd()
        .split('\n')
        .map((line) => [line.split('\t')[1], line + '\n']),
    );
  const before = entries(base),
    after = entries(head),
    cache = new Map();
  const read = (ref, file) => {
    const key = ref + ':' + file;
    if (!cache.has(key)) cache.set(key, git('show', key));
    return cache.get(key);
  };
  const root = Object.keys(trees)[0];
  const changedPaths = git('diff', '--no-renames', '--name-only', '-z', base, head)
    .split('\0')
    .filter(Boolean);
  const context = {
    baseCommit: base,
    changedPaths,
    readBaseEntry: (file) => before.get(file) ?? '',
    readHeadEntry: (file) => after.get(file) ?? '',
    readBase: (file) => read(base, file),
    readHead: (file) => read(head, file),
    headHasPath: (file) => after.has(file),
  };
  const scopes = localRetirementFileScopes(context);
  const deleted = changedPaths.filter((file) => file.startsWith(root + '/'));
  assert.equal(deleted.length, 24);
  assert.equal(scopes.size, deleted.length + Object.keys(reviews).length);
  assert.equal(localRetirementScopesForReview(context, trees, deliveryRetirementReviews).size, 0);
  const cloned = localRetirementScopesForReview(context, trees, { ...reviews });
  for (const file of deleted) {
    const change = { status: 'D', paths: [file] };
    assert(isReviewedLocalRetirementDeletion(change, scopes), file);
    assert(!isReviewedLocalRetirementDeletion(change, cloned), 'a cloned review cannot lend proof');
    assert(!hasLocalRetirementDeletionProof(file, [...scopes.get(file)]));
    assert(!isReviewedLocalRetirementDeletion({ status: 'R100', paths: [file, 'other'] }, scopes));
  }
  const queryPaths = localRetirementHeadQueryPaths(changedPaths);
  for (const [file, review] of Object.entries(reviews)) {
    assert(queryPaths.includes(file), file);
    assert.equal(hash(context.readBase(file)), review.before, file);
    assert.equal(hash(context.readHead(file)), review.after, file);
    assert.deepEqual(scopes.get(file), review.sources, file);
    assert(hasLocalRetirementFileProof(file, scopes.get(file), context.readHead), file);
    assert(!hasLocalRetirementFileProof(file, [...scopes.get(file)], context.readHead));
    assert(!hasLocalRetirementFileProof(file, cloned.get(file), context.readHead));
    for (const reader of ['readBase', 'readHead'])
      assert.equal(
        localRetirementScopesForReview(
          {
            ...context,
            [reader]: (name) => context[reader](name) + (name === file ? '\nextra' : ''),
          },
          trees,
          reviews,
        ).size,
        0,
        `${file}: ${reader} drift`,
      );
  }
  const shellAndGame = ['apps/shell-web', 'games/local/place-and-clear'];
  for (const file of ['package.json', 'src/game-meta.json', 'src/standalone-games.json'])
    assert.deepEqual(scopes.get('apps/shell-web/' + file), shellAndGame);
  assert.deepEqual(scopes.get('pnpm-lock.yaml'), [
    ...shellAndGame,
    'apps/shell-minigame',
    'services/runtime-api',
  ]);
  assert.deepEqual(scopes.get('apps/shell-web/scripts/standalone-game-checks.mjs'), [
    ...shellAndGame,
    'games/local/flick-arena',
    'games/local/waterline-station',
    'games/local/tianxia-chalu',
  ]);
  for (const file of ['scripts/standalone-game-entry.mjs', 'src/game-assessments.json'])
    assert.deepEqual(scopes.get('apps/shell-web/' + file), [
      ...shellAndGame,
      'games/local/waterline-station',
    ]);
  for (const file of [
    'apps/shell-web/scripts/pages-smoke.mjs',
    'apps/shell-web/src/StandaloneGame.tsx',
    'apps/shell-web/tests/standalone-immersive.integration.test.tsx',
    'apps/shell-web/tests/standalone.integration.test.tsx',
    'scripts/test-game-dev-mode.mjs',
  ])
    assert.deepEqual(scopes.get(file), [...shellAndGame, 'games/local/waterline-station']);
  for (const file of ['src/game-sharing.ts', 'tests/game-sharing.test.tsx'])
    assert.deepEqual(scopes.get('apps/shell-web/' + file), [
      ...shellAndGame,
      'games/local/ball-roguelite',
      'games/local/ember-bounce',
    ]);
  assert.deepEqual(scopes.get('apps/shell-web/tests/routes.integration.test.tsx'), [
    ...shellAndGame,
    'games/local/ember-bounce',
  ]);

  // The entire multi-document lock must equal these two removals plus the rename;
  // every other importer, package resolution, integrity and snapshot byte survives.
  const lock = context.readBase('pnpm-lock.yaml');
  const link =
    '      tangerine-express:\n' +
    '        specifier: workspace:*\n' +
    '        version: link:../../games/local/vibeJam-myself-delivery\n';
  const importer =
    '  games/local/vibeJam-myself-delivery:\n' +
    '    dependencies:\n' +
    '      three:\n' +
    '        specifier: 0.180.0\n' +
    '        version: 0.180.0\n' +
    '    devDependencies:\n' +
    '      vite:\n' +
    '        specifier: 7.3.7\n' +
    '        version: 7.3.7(@types/node@24.3.1)(jiti@2.7.0)(lightningcss@1.33.0)(terser@5.51.2)(tsx@4.23.13)\n\n';
  assert.equal(lock.split(link).length, 2);
  assert.equal(lock.split(importer).length, 2);
  assert.equal(
    lock.replace(link, '').replace(importer, '').replaceAll('three-choose-two', 'place-and-clear'),
    context.readHead('pnpm-lock.yaml'),
  );
  const tokens = git(
    'diff',
    '--find-renames',
    '--name-status',
    '-z',
    '--diff-filter=DR',
    base,
    head,
  )
    .split('\0')
    .filter(Boolean);
  const renameScopes = gameRenameFileScopes(context);
  let renamed = 0;
  while (tokens.length) {
    const status = tokens.shift();
    const change = { status, paths: tokens.splice(0, status.startsWith('R') ? 2 : 1) };
    if (change.paths[0].startsWith(root + '/'))
      assert(isReviewedLocalRetirementDeletion(change, scopes));
    else {
      assert(isReviewedGameRename(change, renameScopes), change.paths[0]);
      assert(!scopes.has(change.paths[1]), 'surviving game files keep ordinary validation');
      renamed++;
    }
  }
  assert.equal(renamed, 216);
  // A changed surviving file loses the cumulative proof, while the separately
  // verified retired tree keeps the remote branch's independent deletion proof.
  const shared = 'apps/shell-web/scripts/standalone-game-checks.mjs';
  const drifted = localRetirementFileScopes({
    ...context,
    readHead: (file) => context.readHead(file) + (file === shared ? '\nextra' : ''),
  });
  assert(!drifted.has(shared));
  for (const file of deleted)
    assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, drifted), file);
  for (const override of [
    { baseCommit: head },
    { readBaseEntry: (file) => (file === root ? '' : context.readBaseEntry(file)) },
    { headHasPath: (file) => file === root || context.headHasPath(file) },
    { headHasPath: () => undefined },
    { changedPaths: [...changedPaths, root + '/unknown-extra.mjs'] },
    {
      readHead: () => {
        throw new Error('query failed');
      },
    },
  ])
    assert.equal(localRetirementFileScopes({ ...context, ...override }).size, 0);
  assert(!scopes.has('scripts/unknown-deletion.mjs'));
});

test('delivery retirement binds its original tree and surviving edits', async () => {
  const { execFileSync } = await import('node:child_process');
  const { deliveryRetirementBase, deliveryRetirementTrees, deliveryRetirementReviews } =
    await import('./local-game-retirement-reviews.mjs');
  const { localRetirementFileScopes, hasLocalRetirementFileProof } = await import(
    './local-game-retirement-scope.mjs'
  );
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const head = 'dcd768cdd681458b4e54fa07581f7d2ec2787e3a';
  const entries = (ref) =>
    new Map(
      git('ls-tree', '-r', '-t', ref)
        .trimEnd()
        .split('\n')
        .map((line) => [line.split('\t')[1], line + '\n']),
    );
  const before = entries(deliveryRetirementBase);
  const after = entries(head);
  const root = Object.keys(deliveryRetirementTrees)[0];
  const deleted = git('diff', '--name-only', '-z', deliveryRetirementBase, head)
    .split('\0')
    .filter((file) => file.startsWith(root + '/'));
  const context = {
    baseCommit: deliveryRetirementBase,
    changedPaths: [...deleted, ...Object.keys(deliveryRetirementReviews)],
    readBaseEntry: (file) => before.get(file) ?? '',
    readHeadEntry: (file) => after.get(file) ?? '',
    readBase: (file) => git('show', `${deliveryRetirementBase}:${file}`),
    readHead: (file) => git('show', `${head}:${file}`),
    headHasPath: (file) => after.has(file),
  };
  const scopes = localRetirementFileScopes(context);
  assert.equal(deleted.length, 24);
  for (const file of deleted) {
    assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, scopes), file);
    assert(
      !isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, new Map([[file, []]])),
    );
  }
  for (const [file, review] of Object.entries(deliveryRetirementReviews)) {
    assert.deepEqual(scopes.get(file), review.sources, file);
    assert(hasLocalRetirementFileProof(file, scopes.get(file), context.readHead));
  }
  assert.equal(localRetirementFileScopes({ ...context, baseCommit: head }).size, 0);
  assert.equal(
    localRetirementFileScopes({
      ...context,
      readBaseEntry: (file) => (file === root ? '' : context.readBaseEntry(file)),
    }).size,
    0,
  );
  const changed = Object.keys(deliveryRetirementReviews)[0];
  const drifted = localRetirementFileScopes({
    ...context,
    readHead: (file) => context.readHead(file) + (file === changed ? '\nextra' : ''),
  });
  assert(!drifted.has(changed), 'A changed surviving file must use ordinary validation');
  assert(!drifted.has('pnpm-lock.yaml'), 'Lock proof also binds the Shell manifest');
  for (const file of deleted)
    assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, drifted));
  for (const cumulativeHead of [
    '6c7125c11edf72f8906d77fdbc7627bad883e651',
    '031384b2db466f7f332ec88a9f6d1efaa916e8ea',
  ]) {
    const cumulativeEntries = entries(cumulativeHead);
    const cumulative = {
      ...context,
      readHeadEntry: (file) => cumulativeEntries.get(file) ?? '',
      readHead: (file) => git('show', `${cumulativeHead}:${file}`),
      headHasPath: (file) => cumulativeEntries.has(file),
    };
    const current = localRetirementFileScopes(cumulative);
    for (const file of deleted) {
      assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, current));
      assert(
        !isReviewedLocalRetirementDeletion({ status: 'R100', paths: [file, 'extra.mjs'] }, current),
      );
      assert(
        !isReviewedLocalRetirementDeletion(
          { status: 'D', paths: [file] },
          new Map([[file, [...current.get(file)]]]),
        ),
      );
    }
    const meta = 'apps/shell-web/src/game-meta.json';
    for (const [file, review] of Object.entries(deliveryRetirementReviews)) {
      assert.equal(
        current.has(file),
        file === meta || hash(cumulative.readHead(file)) === review.after,
        file,
      );
      if (current.has(file)) {
        assert(hasLocalRetirementFileProof(file, current.get(file), cumulative.readHead));
        assert(!hasLocalRetirementFileProof(file, [...current.get(file)], cumulative.readHead));
      }
    }
    const metadata = JSON.parse(cumulative.readHead(meta));
    const firstId = Object.keys(metadata.games)[0];
    for (const mutate of [
      (data) => {
        data.extra = true;
      },
      (data) => {
        data.games[firstId].source = root;
      },
      (data) => {
        data.games[firstId].updated.commit = 'invalid';
      },
      (data) => {
        data.games[firstId].updated.time = 'invalid';
      },
      (data) => {
        data.games.unknown = data.games[firstId];
      },
      (data) => {
        delete data.games[firstId];
      },
    ]) {
      const invalid = structuredClone(metadata);
      mutate(invalid);
      const rejected = localRetirementFileScopes({
        ...cumulative,
        readHead: (file) => (file === meta ? JSON.stringify(invalid) : cumulative.readHead(file)),
      });
      assert(!rejected.has(meta), 'Invalid cumulative metadata cannot borrow retirement proof');
      assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [deleted[0]] }, rejected));
    }
    const lockDrift = localRetirementFileScopes({
      ...cumulative,
      readHead: (file) => cumulative.readHead(file) + (file === 'pnpm-lock.yaml' ? '\nextra' : ''),
    });
    assert(!lockDrift.has('pnpm-lock.yaml'));
    assert(lockDrift.has('apps/shell-web/package.json'));
    for (const override of [
      { baseCommit: cumulativeHead },
      { readBaseEntry: (file) => (file === root ? '' : context.readBaseEntry(file)) },
      { headHasPath: (file) => file === root || cumulative.headHasPath(file) },
      { headHasPath: (file) => file === deleted[0] || cumulative.headHasPath(file) },
      { headHasPath: () => undefined },
      { readHead: () => JSON.stringify([{ source: root }]) },
      { readHead: () => JSON.stringify([{ source: root + '/revived' }]) },
      {
        readHead: () => {
          throw Error('query failed');
        },
      },
      { changedPaths: [...context.changedPaths, root + '/unknown-extra.mjs'] },
    ])
      assert.equal(localRetirementFileScopes({ ...cumulative, ...override }).size, 0);
    const unknown = 'scripts/unknown-deletion.mjs';
    assert(
      !isReviewedLocalRetirementDeletion(
        { status: 'D', paths: [unknown] },
        localRetirementFileScopes({
          ...cumulative,
          changedPaths: [...context.changedPaths, unknown],
        }),
      ),
    );
  }
});
test('maze and voice retirements bind the exact base trees and reject borrowed proofs', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mazeVoiceRetirementBase, mazeVoiceRetirementTrees, mazeVoiceRetirementReviews } =
    await import('./local-game-retirement-reviews.mjs');
  const { localRetirementFileScopes, hasLocalRetirementFileProof } = await import(
    './local-game-retirement-scope.mjs'
  );
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const head = '4e97662fd910758595c345f2985a805d1a19095d';
  const entries = (ref) =>
    new Map(
      git('ls-tree', '-r', '-t', ref)
        .trimEnd()
        .split('\n')
        .map((line) => [line.split('\t')[1], line + '\n']),
    );
  const before = entries(mazeVoiceRetirementBase);
  const after = entries(head);
  const deleted = git('diff', '--name-only', '-z', mazeVoiceRetirementBase, head)
    .split('\0')
    .filter((file) =>
      Object.keys(mazeVoiceRetirementTrees).some((root) => file.startsWith(root + '/')),
    );
  const context = {
    baseCommit: mazeVoiceRetirementBase,
    changedPaths: [...deleted, ...Object.keys(mazeVoiceRetirementReviews)],
    readBaseEntry: (file) => before.get(file) ?? '',
    readHeadEntry: (file) => after.get(file) ?? '',
    readBase: (file) => git('show', `${mazeVoiceRetirementBase}:${file}`),
    readHead: (file) => git('show', `${head}:${file}`),
    headHasPath: (file) => after.has(file),
  };
  const scopes = localRetirementFileScopes(context);
  assert.equal(deleted.length, 88);
  for (const file of deleted) {
    assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, scopes), file);
    assert(
      !isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, new Map([[file, []]])),
    );
  }
  for (const [file, review] of Object.entries(mazeVoiceRetirementReviews)) {
    assert.deepEqual(scopes.get(file), review.sources);
    assert(hasLocalRetirementFileProof(file, scopes.get(file), context.readHead));
    assert.equal(
      localRetirementFileScopes({
        ...context,
        readHead: (name) => context.readHead(name) + (name === file ? '\nextra' : ''),
      }).size,
      0,
    );
  }
  assert.equal(localRetirementFileScopes({ ...context, baseCommit: head }).size, 0);
  assert.equal(
    localRetirementFileScopes({
      ...context,
      readBaseEntry: (file) =>
        file === 'games/local/maze-wander' ? '' : context.readBaseEntry(file),
    }).size,
    0,
  );
});
test('catalog cleanup binds its real deleted tree and exact surviving edits without reusable proofs', async () => {
  const { execFileSync } = await import('node:child_process');
  const {
    catalogCleanupBase: base,
    catalogCleanupTrees: trees,
    catalogCleanupReviews: reviews,
  } = await import('./local-game-retirement-reviews.mjs');
  const { localRetirementFileScopes, hasLocalRetirementFileProof } = await import(
    './local-game-retirement-scope.mjs'
  );
  const head = '2dea9a2a14cd4071435af927042ca83cd241853a';
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const tree = (ref) =>
    new Map(
      git('ls-tree', '-r', '-t', ref)
        .trimEnd()
        .split('\n')
        .map((line) => [line.split('\t')[1], line + '\n']),
    );
  const before = tree(base),
    after = tree(head),
    cache = new Map();
  const read = (ref, file) => {
    const key = ref + ':' + file;
    if (!cache.has(key)) cache.set(key, git('show', key));
    return cache.get(key);
  };
  const changedPaths = git('diff', '--name-only', '-z', base, head).split('\0').filter(Boolean);
  const context = {
    baseCommit: base,
    changedPaths,
    readBaseEntry: (file) => before.get(file) ?? '',
    readHeadEntry: (file) => after.get(file) ?? '',
    readBase: (file) => read(base, file),
    readHead: (file) => read(head, file),
    headHasPath: (file) => after.has(file),
  };
  const scopes = localRetirementFileScopes(context);
  const roots = Object.keys(trees);
  const deleted = changedPaths.filter((file) => roots.some((root) => file.startsWith(root + '/')));
  assert.equal(deleted.length, 63);
  for (const file of deleted) {
    assert(!after.has(file));
    const change = { status: 'D', paths: [file] };
    assert(isReviewedLocalRetirementDeletion(change, scopes), file);
    assert(!isReviewedLocalRetirementDeletion(change, new Map([[file, [...scopes.get(file)]]])));
    assert(
      !isReviewedLocalRetirementDeletion({ status: 'R100', paths: [file, 'extra.mjs'] }, scopes),
    );
  }
  for (const [file, review] of Object.entries(reviews)) {
    assert.deepEqual(scopes.get(file), review.sources, file);
    assert(hasLocalRetirementFileProof(file, scopes.get(file), context.readHead), file);
    assert(!hasLocalRetirementFileProof(file, [...scopes.get(file)], context.readHead));
    for (const reader of ['readBase', 'readHead'])
      assert.equal(
        localRetirementFileScopes({
          ...context,
          [reader]: (name) => context[reader](name) + (name === file ? '\nextra' : ''),
        }).size,
        0,
        `${file}: ${reader} drift`,
      );
  }
  for (const override of [
    { readBaseEntry: (file) => (roots.includes(file) ? '' : context.readBaseEntry(file)) },
    { headHasPath: (file) => roots.includes(file) || context.headHasPath(file) },
    { headHasPath: () => undefined },
    {
      readHead: () => {
        throw new Error('query failed');
      },
    },
  ])
    assert.equal(localRetirementFileScopes({ ...context, ...override }).size, 0);
  for (const file of ['scripts/unknown-deletion.mjs', roots[0] + '/unknown-extra.mjs']) {
    const unknown = localRetirementFileScopes({
      ...context,
      changedPaths: [...changedPaths, file],
    });
    assert(!isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, unknown));
  }
});
test('current main retirement binds the real Git deletions and moves without lending proofs to surviving files', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const {
    mainIntegrationBase: base,
    mainIntegrationFixture: head,
    mainRetirementTrees,
    mainRetirementMoves,
  } = await import('./local-game-retirement-reviews.mjs');
  const { mainRetirementDeletionScopes, mainRetirementTreesMatch, hasLocalRetirementFileProof } =
    await import('./local-game-retirement-scope.mjs');
  const { isDocumentation } = await import('./validation-plan.mjs');
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const tree = (ref) =>
    new Map(
      git('ls-tree', '-r', '-t', ref)
        .trimEnd()
        .split('\n')
        .map((line) => [line.split('\t')[1], line + '\n']),
    );
  const before = tree(base),
    after = tree(head),
    cache = new Map();
  const read = (ref, file) => {
    const key = ref + ':' + file;
    if (!cache.has(key)) cache.set(key, git('show', key));
    return cache.get(key);
  };
  const tokens = git('diff', '--find-renames', '--name-status', '-z', base, head)
    .split('\0')
    .filter(Boolean);
  const changes = [];
  while (tokens.length) {
    const status = tokens.shift();
    changes.push({ status, paths: tokens.splice(0, /^[RC]/.test(status) ? 2 : 1) });
  }
  const context = {
    baseCommit: base,
    changedPaths: changes.flatMap((change) => change.paths),
    readBaseEntry: (file) => before.get(file) ?? '',
    readHeadEntry: (file) => after.get(file) ?? '',
    readBase: (file) => read(base, file),
    readHead: (file) => read(head, file),
    headHasPath: (file) => after.has(file),
  };
  const scopes = mainRetirementDeletionScopes(context);
  assert.equal(Object.keys(mainRetirementTrees).length, 27);
  assert.equal(Object.keys(mainRetirementMoves).length, 16);
  assert(scopes.size > 700, 'Actual historical deletion set must be exercised');
  const underRetired = (file) =>
    Object.keys(mainRetirementTrees).some((root) => file === root || file.startsWith(root + '/'));
  for (const change of changes.filter(
    (change) =>
      /^[DR]/.test(change.status) &&
      underRetired(change.paths[0]) &&
      !change.paths.every(isDocumentation),
  )) {
    assert(isReviewedLocalRetirementDeletion(change, scopes), JSON.stringify(change));
    const value = scopes.get(change.paths[0]);
    assert(!isReviewedLocalRetirementDeletion(change, new Map([[change.paths[0], [...value]]])));
  }
  for (const [from, move] of Object.entries(mainRetirementMoves)) {
    assert(!scopes.has(move.to), move.to);
    assert(!hasLocalRetirementFileProof(move.to, scopes.get(from), context.readHead));
    assert(
      !isReviewedLocalRetirementDeletion(
        { status: move.status, paths: [from, move.to + '.extra'] },
        scopes,
      ),
    );
    assert(!isReviewedLocalRetirementDeletion({ status: 'C100', paths: [from, move.to] }, scopes));
    assert(!isReviewedLocalRetirementDeletion({ status: 'R099', paths: [from, move.to] }, scopes));
  }
  const [from, move] = Object.entries(mainRetirementMoves)[0];
  const retiredRoot = Object.keys(mainRetirementTrees)[0];
  const overrides = [
    { baseCommit: head },
    { readBaseEntry: (file) => (file === retiredRoot ? '' : context.readBaseEntry(file)) },
    { headHasPath: (file) => file === retiredRoot || context.headHasPath(file) },
    { headHasPath: () => undefined },
    {
      headHasPath: () => {
        throw new Error('query failed');
      },
    },
    { readHead: () => JSON.stringify([{ id: 'revived', source: retiredRoot }]) },
    { readBaseEntry: (file) => (file === move.to ? move.afterEntry : context.readBaseEntry(file)) },
    {
      readHeadEntry: (file) =>
        file === move.to
          ? move.afterEntry.replace(/blob [a-f\d]{40}/, 'blob ' + '0'.repeat(40))
          : context.readHeadEntry(file),
    },
    { readBaseEntry: (file) => (file === from ? '' : context.readBaseEntry(file)) },
  ];
  for (const override of overrides)
    assert.equal(mainRetirementDeletionScopes({ ...context, ...override }).size, 0);
  for (const override of [
    {
      readHeadEntry: (file) =>
        file === move.to
          ? move.afterEntry.replace('100644', '100755')
          : context.readHeadEntry(file),
    },
    { headHasPath: (file) => file === from || context.headHasPath(file) },
  ])
    assert.equal(mainRetirementDeletionScopes({ ...context, ...override }).size, 0);
  assert(mainRetirementTreesMatch(context));
  for (const file of ['scripts/unknown-deletion.mjs', retiredRoot + '/unknown-extra.mjs']) {
    const additional = mainRetirementDeletionScopes({
      ...context,
      changedPaths: [...context.changedPaths, file],
    });
    assert(!isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, additional));
  }
  const standalone = 'scripts/build-artifact.mjs';
  assert(scopes.has(standalone));
  assert.equal(
    mainRetirementDeletionScopes({
      ...context,
      readBase: (file) => context.readBase(file) + (file === standalone ? '\nextra' : ''),
    }).size,
    0,
  );
});

test('Pages entry rejects extra deletion and rename alongside the valid current main retirement', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { mainIntegrationBase: base, mainIntegrationFixture: head } = await import(
    './local-game-retirement-reviews.mjs'
  );
  const { main } = await import('./pages-test-scope.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temp = await mkdtemp(path.join(tmpdir(), 'main-scope-negative-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  // A private index creates unreachable fixture objects; no branch, checkout or
  // user index changes. The candidate catalog stays identical to the real head.
  const env = {
    ...process.env,
    GIT_INDEX_FILE: path.join(temp, 'index'),
    GIT_AUTHOR_NAME: 'scope fixture',
    GIT_AUTHOR_EMAIL: 'scope@example.invalid',
    GIT_COMMITTER_NAME: 'scope fixture',
    GIT_COMMITTER_EMAIL: 'scope@example.invalid',
  };
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  const source = 'scripts/platform-config.mjs';
  const blob = git('rev-parse', head + ':' + source);
  for (const rename of [false, true]) {
    git('read-tree', head);
    git('update-index', '--force-remove', source);
    if (rename)
      git(
        'update-index',
        '--add',
        '--cacheinfo',
        '100644,' + blob + ',scripts/platform-config-extra.mjs',
      );
    const candidate = git(
      'commit-tree',
      git('write-tree'),
      '-p',
      head,
      '-m',
      'extra unknown scope fixture',
    );
    await assert.rejects(
      main(
        {
          PAGES_DIFF_BASE: base,
          PAGES_DIFF_HEAD: candidate,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REF_NAME: 'main',
          VALIDATION_RISK_PLAN: 'true',
        },
        root,
      ),
      /Relevant deletion or rename/,
    );
  }
});
const root = 'games/local/retired-fixture';
const file = root + '/main.js';
const tree = `040000 tree ${'a'.repeat(40)}\t${root}\n`;
const entry = `100644 blob ${'b'.repeat(40)}\t${file}\n`;
const trees = { [root]: tree };
const reviews = {
  'package.json': { before: hash('old'), after: hash('new'), sources: ['apps/shell-web'] },
};
function context(overrides = {}) {
  return {
    changedPaths: [file, 'package.json'],
    readBaseEntry: (name) => (name === root ? tree : name === file ? entry : ''),
    readBase: () => 'old',
    readHead: () => 'new',
    headHasPath: (name) => name === 'package.json',
    ...overrides,
  };
}
test('exact retired trees and reviewed edits select only surviving consumers', () => {
  const scopes = localRetirementScopesForReview(context(), trees, reviews);
  assert.deepEqual(
    [...scopes],
    [
      [file, []],
      ['package.json', ['apps/shell-web']],
    ],
  );
  // A caller-controlled review or an array with identical values cannot forge production proof.
  assert.equal(hasLocalRetirementDeletionProof(file, scopes.get(file)), false);
  assert.equal(hasLocalRetirementDeletionProof(file, []), false);
});
test('missing inputs, byte drift, surviving roots and unreviewed deletions fail closed', () => {
  for (const change of [
    { readBaseEntry: () => '' },
    { readBase: () => 'drift' },
    { readHead: () => 'drift' },
    { headHasPath: () => true },
    {
      headHasPath: () => {
        throw new Error('query failed');
      },
    },
  ])
    assert.equal(localRetirementScopesForReview(context(change), trees, reviews).size, 0);
  const scopes = localRetirementScopesForReview(
    context({ changedPaths: ['unknown.js'] }),
    trees,
    reviews,
  );
  assert.equal(scopes.size, 0);
  assert.equal(
    isReviewedLocalRetirementDeletion(
      { status: 'R100', paths: [file, 'new.js'] },
      new Map([[file, []]]),
    ),
    false,
  );
});

test('retired gitlinks require the exact recorded commit and confirmed absence', () => {
  const source = 'games/submodules/retired-fixture';
  const gitlink = `160000 commit ${'c'.repeat(40)}\t${source}\n`;
  const fixture = context({
    changedPaths: [source],
    readBaseEntry: () => gitlink,
    headHasPath: () => false,
  });
  assert.deepEqual(
    [...localRetirementScopesForReview(fixture, { [source]: gitlink }, {})],
    [[source, []]],
  );
  for (const override of [
    { readBaseEntry: () => gitlink.replace('c'.repeat(40), 'd'.repeat(40)) },
    { headHasPath: () => true },
    { headHasPath: () => undefined },
    { readBaseEntry: () => '' },
  ])
    assert.equal(
      localRetirementScopesForReview({ ...fixture, ...override }, { [source]: gitlink }, {}).size,
      0,
    );
  const directory = `040000 tree ${'c'.repeat(40)}\t${source}\n`;
  assert.equal(
    localRetirementScopesForReview(
      { ...fixture, readBaseEntry: () => directory },
      { [source]: directory },
      {},
    ).size,
    0,
  );
});

test('production review binds historical file bytes, retained consumers and unforgeable deletion proofs', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { localRetirementBase, localRetirementTrees, localRetirementReviews } = await import(
    './local-game-retirement-reviews.mjs'
  );
  const { localRetirementFileScopes, hasLocalRetirementFileProof } = await import(
    './local-game-retirement-scope.mjs'
  );
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const retired = Object.keys(localRetirementTrees)[0] + '/package.json';
  // The reviewed deletion is a historical transition. Later valid game changes
  // must not become part of its fixed byte proof or its positive fixture.
  const reviewedHead = 'f62716c317b391b89e78eec220abc053f874f981';
  const readHead = (file) => git('show', `${reviewedHead}:${file}`);
  const readHeadEntry = (file) => git('--literal-pathspecs', 'ls-tree', reviewedHead, '--', file);
  const context = {
    changedPaths: [
      retired,
      'games/local/game-cricket/public/cricket-audio/perfect.wav',
      ...Object.keys(localRetirementReviews),
    ],
    readBase: (file) => git('show', `${localRetirementBase}:${file}`),
    readBaseEntry: (file) => git('--literal-pathspecs', 'ls-tree', localRetirementBase, '--', file),
    readHead,
    readHeadEntry,
    headHasPath: (file) => readHeadEntry(file) !== '',
  };
  const scopes = localRetirementFileScopes(context);
  assert.equal(scopes.size, context.changedPaths.length);
  assert.equal(hasLocalRetirementDeletionProof(retired, scopes.get(retired)), true);
  assert.equal(hasLocalRetirementDeletionProof(retired, [...scopes.get(retired)]), false);
  assert.equal(isReviewedLocalRetirementDeletion({ status: 'D', paths: [retired] }, scopes), true);
  assert.equal(
    isReviewedLocalRetirementDeletion({ status: 'R100', paths: [retired, 'elsewhere'] }, scopes),
    false,
  );
  const builder = 'apps/shell-minigame/scripts/nine-games-build.mjs';
  assert.equal(
    localRetirementFileScopes({
      ...context,
      readHead: (file) => readHead(file) + (file === builder ? '\n// extra executable change' : ''),
    }).size,
    0,
  );
  assert.equal(hasLocalRetirementFileProof(builder, scopes.get(builder), readHead), true);
  assert.equal(
    hasLocalRetirementFileProof(builder, scopes.get(builder), () => 'drift'),
    false,
  );
  const { requiresIncrementalCocos } = await import('./pages-test-scope.mjs');
  const creator = {
    dir: 'games/local/creator-fixture',
    name: 'creator',
    creator: { version: '3.8.8' },
  };
  const packages = [
    creator,
    { dir: 'apps/shell-web', name: 'shell', dependencies: { creator: 'workspace:*' } },
  ];
  const scoped = {
    full: false,
    required: true,
    game_sources: [],
    nine_native_targets: [],
    nine_native_blocked: [],
  };
  const candidate = {
    packages,
    games: [],
    changedPaths: ['apps/shell-web/package.json'],
    scope: scoped,
    risk: 'incremental',
    fileScopes: scopes,
    readSource: readHead,
  };
  assert.equal(requiresIncrementalCocos(candidate), false);
  assert.equal(
    requiresIncrementalCocos({
      ...candidate,
      changedPaths: [...candidate.changedPaths, 'apps/shell-web/src/unreviewed.ts'],
    }),
    true,
  );
  const audio = 'platforms/competition/assets/action.wav';
  const originalAudio = 'games/local/game-cricket/public/cricket-audio/perfect.wav';
  assert.equal(
    isReviewedLocalRetirementDeletion({ status: 'R100', paths: [originalAudio, audio] }, scopes),
    true,
  );
  assert.equal(
    isReviewedLocalRetirementDeletion({ status: 'R90', paths: [originalAudio, audio] }, scopes),
    false,
  );
  assert.equal(
    isReviewedLocalRetirementDeletion({ status: 'R100', paths: [retired, audio] }, scopes),
    false,
  );
  assert.equal(
    localRetirementFileScopes({ ...context, readHeadEntry: () => 'different blob' }).size,
    0,
  );
  assert.equal(
    localRetirementFileScopes({
      ...context,
      headHasPath: (file) => (file === audio ? false : context.headHasPath(file)),
    }).size,
    0,
  );
});

test('portfolio retirement binds the selected games, retained catalog and exact snapshot deletions', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const {
    portfolioRetirementBase: base,
    portfolioRetirementHead: head,
    portfolioRetirementTrees: trees,
    portfolioRetirementReviews: reviews,
  } = await import('./local-game-retirement-reviews.mjs');
  const { localRetirementFileScopes, hasLocalRetirementFileProof } = await import(
    './local-game-retirement-scope.mjs'
  );
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const read = (revision, file) => git('show', `${revision}:${file}`);
  const entry = (revision, file) => git('--literal-pathspecs', 'ls-tree', revision, '--', file);
  const before = JSON.parse(read(base, 'apps/shell-web/src/game-assessments.json')).games;
  const removed = before.filter(
    (game) => game.id !== 'merge-front' && game.potential.includes('low'),
  );
  assert.equal(removed.length, 19);
  assert.deepEqual(
    Object.keys(trees)
      .filter((source) => source.startsWith('games/'))
      .sort(),
    removed.map((game) => game.source).sort(),
  );
  const ids = new Set(removed.map((game) => game.id));
  assert.deepEqual(
    JSON.parse(read(head, 'apps/shell-web/src/game-assessments.json')).games,
    before.filter((game) => !ids.has(game.id)),
  );
  assert.deepEqual(
    JSON.parse(read(head, 'apps/shell-web/src/standalone-games.json')),
    JSON.parse(read(base, 'apps/shell-web/src/standalone-games.json')).filter(
      (game) => !ids.has(game.id),
    ),
  );
  assert.equal(entry(base, 'games/local/merge-front'), entry(head, 'games/local/merge-front'));
  const changedPaths = git('diff', '--no-renames', '--name-only', base, head).trim().split('\n');
  const context = {
    changedPaths,
    readBase: (file) => read(base, file),
    readBaseEntry: (file) => entry(base, file),
    readHead: (file) => read(head, file),
    readHeadEntry: (file) => entry(head, file),
    headHasPath: (file) => entry(head, file) !== '',
  };
  const scopes = localRetirementFileScopes(context);
  for (const file of changedPaths.filter((file) => entry(head, file) === '')) {
    assert(hasLocalRetirementDeletionProof(file, scopes.get(file)), file);
    assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, scopes), file);
    assert(!hasLocalRetirementDeletionProof(file, [...scopes.get(file)]), file);
  }
  for (const [file, review] of Object.entries(reviews)) {
    if (review.after !== null)
      assert(hasLocalRetirementFileProof(file, scopes.get(file), context.readHead), file);
    if (review.movedFrom)
      assert(
        isReviewedLocalRetirementDeletion(
          { status: 'R100', paths: [review.movedFrom, file] },
          scopes,
        ),
      );
  }
  const library = 'games/local/letters-words2/library.js';
  const beforeLibrary = read(base, library);
  const afterLibrary = read(head, library);
  assert(beforeLibrary.startsWith('// ') && afterLibrary.startsWith('// '));
  assert.equal(
    beforeLibrary.slice(beforeLibrary.indexOf('\n')),
    afterLibrary.slice(afterLibrary.indexOf('\n')),
  );
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  const { readFileSync } = await import('node:fs');
  const { workspacePackages } = await import('./validation-plan.mjs');
  const nativeContext = {
    changedPaths: [library],
    games: JSON.parse(read(head, 'apps/shell-web/src/standalone-games.json')),
    packages: await workspacePackages(root),
    readSource: (file) =>
      file === library
        ? afterLibrary
        : readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
    fileScopes: scopes,
  };
  assert.deepEqual(nineNativeDependencyPlan(nativeContext).targets, []);
  for (const override of [
    { fileScopes: new Map([[library, [...scopes.get(library)]]]) },
    {
      readSource: (file) =>
        nativeContext.readSource(file) + (file === library ? '\nexport const changed = true;' : ''),
    },
  ])
    assert(
      nineNativeDependencyPlan({ ...nativeContext, ...override }).targets.some(
        (target) => target.requiresCreator,
      ),
    );
  assert.equal(localRetirementFileScopes({ ...context, headHasPath: () => undefined }).size, 0);
  assert.equal(
    localRetirementFileScopes({ ...context, readHead: (file) => read(head, file) + 'drift' }).size,
    0,
  );
  assert(!scopes.has('unreviewed-file.mjs'));
});

test('single game retirement binds both comparison trees and retains Shell consumers', async () => {
  const { execFileSync } = await import('node:child_process');
  const review = await import('./local-game-retirement-reviews.mjs');
  const { localRetirementFileScopes, hasLocalRetirementFileProof, localRetirementHeadQueryPaths } =
    await import('./local-game-retirement-scope.mjs');
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const tree = (ref) =>
    new Map(
      git('ls-tree', '-r', '-t', ref)
        .trimEnd()
        .split('\n')
        .map((line) => [line.split('\t')[1], line + '\n']),
    );
  const head = review.singleGameRetirementFixture,
    after = tree(head),
    cache = new Map();
  const read = (ref, file) => {
    const key = ref + ':' + file;
    if (!cache.has(key)) cache.set(key, git('show', key));
    return cache.get(key);
  };
  for (const [base, trees, reviews] of [
    [
      review.singleGameRetirementBase,
      review.singleGameRetirementTrees,
      review.singleGameRetirementReviews,
    ],
    [
      review.singleGamePagesRetirementBase,
      review.singleGamePagesRetirementTrees,
      review.singleGamePagesRetirementReviews,
    ],
  ]) {
    const before = tree(base),
      roots = Object.keys(trees);
    const changedPaths = git('diff', '--no-renames', '--name-only', '-z', base, head)
      .split('\0')
      .filter(Boolean);
    const context = {
      baseCommit: base,
      changedPaths,
      readBaseEntry: (file) => before.get(file) ?? '',
      readHeadEntry: (file) => after.get(file) ?? '',
      readBase: (file) => read(base, file),
      readHead: (file) => read(head, file),
      headHasPath: (file) => after.has(file),
    };
    const scopes = localRetirementFileScopes(context);
    const deleted = changedPaths.filter((file) =>
      roots.some((root) => file.startsWith(root + '/')),
    );
    assert(deleted.length > 100);
    for (const file of deleted)
      assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, scopes), file);
    for (const [file, entry] of Object.entries(reviews)) {
      assert.deepEqual(scopes.get(file), entry.sources, file);
      assert(hasLocalRetirementFileProof(file, scopes.get(file), context.readHead), file);
      assert(localRetirementHeadQueryPaths([]).includes(file));
    }
    assert.deepEqual(scopes.get('apps/shell-web/src/standalone-games.json'), ['apps/shell-web']);
    const file = deleted[0],
      value = scopes.get(file);
    assert(
      !isReviewedLocalRetirementDeletion(
        { status: 'D', paths: [file] },
        new Map([[file, [...value]]]),
      ),
    );
    assert(
      !isReviewedLocalRetirementDeletion({ status: 'R100', paths: [file, 'extra.mjs'] }, scopes),
    );
    assert(
      !isReviewedLocalRetirementDeletion(
        { status: 'D', paths: ['scripts/unknown-deletion.mjs'] },
        scopes,
      ),
    );
    const shared = 'apps/shell-web/package.json';
    for (const override of [
      { readBaseEntry: (path) => (roots.includes(path) ? '' : context.readBaseEntry(path)) },
      { headHasPath: (path) => roots.includes(path) || context.headHasPath(path) },
      { headHasPath: () => undefined },
      { readHead: (path) => context.readHead(path) + (path === shared ? '\nextra' : '') },
      {
        readHead: () => {
          throw Error('query failed');
        },
      },
      { changedPaths: [...changedPaths, roots[0] + '/unknown-extra.mjs'] },
    ])
      assert.equal(localRetirementFileScopes({ ...context, ...override }).size, 0);

    if (base === review.singleGamePagesRetirementBase) {
      for (const [from, move] of Object.entries(review.singleGamePagesRetirementMoves)) {
        const change = { status: move.status, paths: [from, move.to] };
        assert(isReviewedLocalRetirementDeletion(change, scopes), from);
        assert(!hasLocalRetirementFileProof(move.to, scopes.get(from), context.readHead));
        assert(
          !isReviewedLocalRetirementDeletion(
            { ...change, paths: [from, move.to + '.extra'] },
            scopes,
          ),
        );
        assert(!isReviewedLocalRetirementDeletion({ ...change, status: 'R001' }, scopes));
      }
      const [from, move] = Object.entries(review.singleGamePagesRetirementMoves)[0];
      assert.equal(
        localRetirementFileScopes({
          ...context,
          readHeadEntry: (path) => (path === move.to ? '' : context.readHeadEntry(path)),
        }).size,
        0,
      );
    }
    const lock = 'pnpm-lock.yaml';
    if (base === review.singleGameRetirementBase) {
      const old = context.readBase(lock);
      const removed = old
        .replace(
          /      '@coffeeeeffoc\/orbit-atelier':\n        specifier: workspace:\*\n        version: link:\.\.\/\.\.\/games\/local\/orbit-atelier\n/,
          '',
        )
        .replace(/  games\/local\/orbit-atelier:\n[\s\S]*?(?=  games\/local\/out-of-frame:)/, '');
      assert.equal(
        context.readHead(lock),
        removed,
        'Only the retired importer and workspace link leave the lockfile',
      );
    } else
      assert(
        scopes.get(lock).includes('games/local/ashfall-front') &&
          scopes.get(lock).includes('games/local/porcelain-puzzle'),
      );
  }
});
