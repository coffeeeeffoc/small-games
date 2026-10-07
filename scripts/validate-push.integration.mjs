// Opt-in real repository integration: isolated fixture commits only; no browser or push.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, cleanGitEnv, initializeSnapshotSubmodules, validatePush } from './validate-push.mjs';
const source = process.cwd(),
  temp = await mkdtemp(path.join(tmpdir(), 'actual-push-matrix-')),
  root = path.join(temp, 'repo');
const env = {
  ...cleanGitEnv(process.env),
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  PLAYWRIGHT_EXECUTABLE_PATH: path.join(temp, 'browser-must-not-run'),
  PLAYWRIGHT_BROWSERS_PATH: path.join(temp, 'no-installed-browsers'),
};
const git = (cwd, args) => run('git', args, cwd, env, true);
try {
  git(source, ['clone', '--shared', '--no-checkout', '--', source, root]);
  git(root, ['config', 'core.hooksPath', '.git/fixture-hooks']);
  git(root, ['checkout', '--detach', git(source, ['rev-parse', 'HEAD'])]);
  await initializeSnapshotSubmodules(source, root, env);
  const tracked = git(source, ['diff', '--name-only', '-z']).split('\0').filter(Boolean),
    fresh = git(source, ['ls-files', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean);
  for (const file of [...new Set([...tracked, ...fresh])]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), await readFile(path.join(source, file)));
  }
  git(root, ['add', '.']);
  git(root, ['commit', '--allow-empty', '-qm', 'test fixture implementation']);
  const base = git(root, ['rev-parse', 'HEAD']);
  await writeFile(
    path.join(root, 'README.md'),
    (await readFile(path.join(root, 'README.md'), 'utf8')) +
      '\nFixture documentation verification.\n',
  );
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-qm', 'test fixture docs']);
  const docs = git(root, ['rev-parse', 'HEAD']);
  const metaFile = path.join(root, 'apps/shell-web/src/game-meta.json');
  const meta = JSON.parse(await readFile(metaFile));
  meta.games['afterimage-arena'].updated.time = new Date(
    meta.games['afterimage-arena'].updated.time,
  ).toISOString();
  await writeFile(metaFile, JSON.stringify(meta, null, 2) + '\n');
  git(root, ['add', 'apps/shell-web/src/game-meta.json']);
  git(root, ['commit', '--allow-empty', '-qm', 'test fixture metadata equivalent time']);
  const metadata = git(root, ['rev-parse', 'HEAD']);
  await writeFile(path.join(root, 'README.md'), 'deliberately dirty caller');
  await writeFile(path.join(root, 'untracked-fixture'), 'keep');
  const before = git(root, ['status', '--porcelain']);
  const zero = '0'.repeat(40);
  const refs = `refs/heads/docs ${docs} refs/heads/docs ${base}\nrefs/heads/meta ${metadata} refs/heads/meta ${docs}\n(delete) ${zero} refs/heads/obsolete ${base}\n`;
  assert.equal(await validatePush(refs, { root, env }), 2);
  assert.equal(git(root, ['status', '--porcelain']), before);
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), 'deliberately dirty caller');
  console.log(
    'REAL_REPOSITORY_DOCS_METADATA_MATRIX_PASSED: actual dependency install, formatting, registration, metadata tests; non-HEAD/multi-ref/deletion/dirty caller; nonexistent browser path; no game build invoked.',
  );
  const rulesFile = path.join(root, 'games/local/tiny-signals/rules.mjs');
  await writeFile(
    rulesFile,
    (await readFile(rulesFile, 'utf8')) + '\n// Fixture pure rule source verification.\n',
  );
  git(root, ['add', 'games/local/tiny-signals/rules.mjs']);
  git(root, ['commit', '-qm', 'test fixture ordinary pure rules']);
  const rules = git(root, ['rev-parse', 'HEAD']);
  const beforeRules = git(root, ['status', '--porcelain']);
  assert.equal(
    await validatePush(`refs/heads/rules ${rules} refs/heads/dev ${metadata}\n`, { root, env }),
    1,
  );
  assert.equal(git(root, ['status', '--porcelain']), beforeRules);
  console.log(
    'REAL_REPOSITORY_ORDINARY_RULE_PUSH_PASSED: Tiny Signals build/rules, consumer static checks and actual emitted dependencies; no unrelated Creator or real browser.',
  );

  await assert.rejects(
    validatePush(`refs/heads/new ${rules} refs/heads/new ${zero}\n`, {
      root,
      env: {
        ...env,
        KART_PREBUILT_DIR: undefined,
        NIGHT_OVERWATCH_PREBUILT_DIR: undefined,
        COCOS_CREATOR: path.join(temp, 'required-missing-Creator'),
      },
    }),
    /Incremental publication requires an explicit existing comparison base/,
  );
  // Keep the environment-negative case on an actual changed Cocos candidate;
  // a new branch now rejects its undefined incremental base before any build.
  const cocosFile = 'games/local/carding-car/assets/scripts/KartGame.ts';
  await writeFile(
    path.join(root, cocosFile),
    (await readFile(path.join(root, cocosFile), 'utf8')) + '\n// Fixture changed Creator source.\n',
  );
  git(root, ['add', cocosFile]);
  git(root, ['commit', '-qm', 'test fixture required Creator source']);
  const cocos = git(root, ['rev-parse', 'HEAD']);
  await assert.rejects(
    validatePush(`refs/heads/cocos ${cocos} refs/heads/dev ${rules}\n`, {
      root,
      env: {
        ...env,
        KART_PREBUILT_DIR: undefined,
        NIGHT_OVERWATCH_PREBUILT_DIR: undefined,
        COCOS_CREATOR: path.join(temp, 'required-missing-Creator'),
      },
    }),
    /Required Cocos target.*requires Creator/,
  );
  assert.equal(
    await validatePush(`(delete) ${zero} refs/heads/obsolete ${rules}\n`, { root, env }),
    0,
  );
  await assert.rejects(
    validatePush(`refs/heads/rules ${rules} refs/heads/dev ${'e'.repeat(40)}\n`, {
      root,
      env,
      remote: path.join(temp, 'unavailable-remote'),
    }),
    /git (?:fetch )?failed/,
  );
  assert.equal(git(root, ['status', '--porcelain']), beforeRules);
  console.log(
    'REAL_REPOSITORY_NEW_BRANCH_DELETE_UNKNOWN_BASE_PASSED: undefined incremental base, changed Creator inputs and unknown remote SHA fail closed; deletion-only does not run source checks; dirty caller unchanged.',
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
