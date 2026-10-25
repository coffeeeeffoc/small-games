import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  gameRename,
  gameRenameReviews,
  gameRenameRegistrationScopes,
  gameRenameFileScopes,
  isReviewedGameRename,
  hasGameRenameDeletionProof,
  hasGameRenameFileProof,
  renamedGamePath,
} from './game-rename-scope.mjs';

const registry = 'apps/shell-web/src/standalone-games.json';
const old = {
  id: gameRename.from,
  source: gameRename.oldSource,
  title: '三块选两块',
  description: 'puzzle',
  output: 'dist',
};
const current = { ...old, id: gameRename.to, source: gameRename.source, title: '摆消乐' };
const pkg = {
  name: '@coffeeeeffoc/' + gameRename.from,
  creator: { version: '3.8.8' },
  coffeeeeffoc: { role: 'game' },
  scripts: { build: 'node scripts/build.mjs web-mobile' },
  uuid: 'stable',
  dependencies: { core: 'workspace:*' },
};
const file = gameRename.oldSource + '/assets/scripts/ThreeChooseTwo.ts';
const to = renamedGamePath(file);
const entry = (name) => '100644 blob ' + '1'.repeat(40) + '\t' + name + '\n';
function fixture() {
  const base = new Map([
    [registry, JSON.stringify([old])],
    [gameRename.oldSource + '/package.json', JSON.stringify(pkg)],
  ]);
  const head = new Map([
    [registry, JSON.stringify([current])],
    [
      gameRename.source + '/package.json',
      JSON.stringify({ ...pkg, name: '@coffeeeeffoc/' + gameRename.to }),
    ],
  ]);
  const read = (map, f) => {
    if (!map.has(f)) throw Error('missing: ' + f);
    return map.get(f);
  };
  const oldEntries = new Map([
    [gameRename.oldSource, '040000 tree ' + gameRename.tree + '\t' + gameRename.oldSource + '\n'],
    [file, entry(file)],
  ]);
  const newEntries = new Map([
    [gameRename.source, '040000 tree ' + '2'.repeat(40) + '\t' + gameRename.source + '\n'],
    [to, entry(to)],
  ]);
  return {
    base,
    head,
    oldEntries,
    newEntries,
    context: {
      changedPaths: [file, to, registry],
      readBase: (f) => read(base, f),
      readHead: (f) => read(head, f),
      readBaseEntry: (f) => oldEntries.get(f) || '',
      readHeadEntry: (f) => newEntries.get(f) || '',
    },
  };
}

test('reviewed directory rename preserves destination checks and rejects unrelated or copied deletion proof', () => {
  const { context } = fixture(),
    scopes = gameRenameFileScopes(context);
  assert.deepEqual(scopes.get(file), [gameRename.source]);
  assert.deepEqual(scopes.get(registry), [gameRename.source]);
  assert(isReviewedGameRename({ status: 'R089', paths: [file, to] }, scopes));
  assert(isReviewedGameRename({ status: 'D', paths: [file] }, scopes));
  assert(hasGameRenameDeletionProof(file, scopes.get(file)));
  assert(!hasGameRenameDeletionProof(file, [...scopes.get(file)]));
  assert(!isReviewedGameRename({ status: 'R100', paths: [file, to + '.other'] }, scopes));
  assert(!isReviewedGameRename({ status: 'C100', paths: [file, to] }, scopes));
  assert(!isReviewedGameRename({ status: 'D', paths: ['scripts/unrelated.mjs'] }, scopes));
  assert(
    !scopes.has(to),
    'new game source remains under normal rules/Creator/browser classification',
  );
});

test('rename requires the reviewed source tree, absent old directory and every moved target', () => {
  for (const mutate of [
    (f) =>
      f.oldEntries.set(
        gameRename.oldSource,
        '040000 tree ' + '0'.repeat(40) + '\t' + gameRename.oldSource + '\n',
      ),
    (f) => f.newEntries.set(gameRename.oldSource, f.oldEntries.get(gameRename.oldSource)),
    (f) => f.newEntries.delete(to),
    (f) => f.oldEntries.set(gameRename.source, f.newEntries.get(gameRename.source)),
    (f) => f.head.set(registry, JSON.stringify([current, current])),
    (f) => f.head.set(registry, JSON.stringify([{ ...current, source: 'games/local/other' }])),
    (f) =>
      f.head.set(
        gameRename.source + '/package.json',
        JSON.stringify({
          ...pkg,
          name: '@coffeeeeffoc/' + gameRename.to,
          creator: { version: '3.8.7' },
        }),
      ),
    (f) => {
      f.context.readHeadEntry = () => {
        throw Error('tree unavailable');
      };
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(gameRenameFileScopes(f.context).size, 0);
  }
});

test('parallel catalog changes retain the rename deletion proof without inheriting registry scope', () => {
  const f = fixture();
  f.base.set(registry, JSON.stringify([old, { id: 'removed', source: 'games/local/removed' }]));
  f.head.set(registry, JSON.stringify([current, { id: 'added', source: 'games/local/added' }]));
  const scopes = gameRenameFileScopes(f.context);
  assert(hasGameRenameDeletionProof(file, scopes.get(file)));
  assert(!scopes.has(registry));
  assert(!scopes.has('games/local/removed/main.mjs'));
});

test('registry and lock allow only the one identity move without changing dependencies or resolution', () => {
  const f = fixture();
  const lock = 'pnpm-lock.yaml';
  f.base.set(
    lock,
    '\n  games/local/three-choose-two:\n    dependencies:\n      core:\n        version: 1.0.0\n',
  );
  f.head.set(lock, f.base.get(lock).replaceAll('three-choose-two', 'place-and-clear'));
  f.context.changedPaths.push(lock);
  assert(gameRenameRegistrationScopes(f.context).has(lock));
  f.head.set(lock, f.head.get(lock).replace('1.0.0', '2.0.0'));
  assert(!gameRenameRegistrationScopes(f.context).has(lock));
  f.head.set(registry, JSON.stringify([{ ...current, description: 'unrelated edit' }]));
  assert.equal(gameRenameRegistrationScopes(f.context).size, 0);
});

test('shared workflow proof binds exact baseline and candidate bytes and cannot be copied', () => {
  const f = fixture(),
    shared = '.github/workflows/ci.yml';
  const before = execFileSync(
    'git',
    ['show', '510a24c4b9d90d8de80523ee5bb4b838e8f56dc2:' + shared],
    { encoding: 'utf8' },
  );
  const after = before
    .replaceAll('three-choose-two', 'place-and-clear')
    .replaceAll('THREE_CHOOSE_TWO', 'PLACE_AND_CLEAR');
  f.base.set(shared, before);
  f.head.set(shared, after);
  f.context.changedPaths.push(shared);
  assert(gameRenameReviews[shared]);
  const value = gameRenameFileScopes(f.context).get(shared);
  assert(value);
  assert(hasGameRenameFileProof(shared, value, f.context.readHead));
  assert(!hasGameRenameFileProof(shared, [...value], f.context.readHead));
  f.head.set(shared, after + '\nextra executable change');
  assert(!hasGameRenameFileProof(shared, value, f.context.readHead));
  assert(!gameRenameFileScopes(f.context).has(shared));
  f.context.changedPaths.push('scripts/unreviewed-tool.mjs');
  assert(!gameRenameFileScopes(f.context).has('scripts/unreviewed-tool.mjs'));
});
