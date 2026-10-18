import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { run, cleanGitEnv } from './validate-push.mjs';
const env = cleanGitEnv();
const root = run('git', ['rev-parse', '--show-toplevel'], process.cwd(), env, true);
const hooks = run('git', ['config', '--get', 'core.hooksPath'], root, env, true);
const actual = path.resolve(root, hooks, 'pre-push');
const text = await readFile(actual, 'utf8');
const expected = await readFile(new URL('../.githooks/pre-push', import.meta.url), 'utf8');
const upToDate = text.replaceAll('\r\n', '\n') === expected.replaceAll('\r\n', '\n');
console.log(
  JSON.stringify(
    {
      root,
      hooks,
      prePush: actual,
      upToDate,
      automaticValidation: text.includes('scripts/validate-push.mjs'),
      manualValidation: 'pnpm validate:candidate --base <remote-SHA> --head <candidate-SHA>',
      node: process.version,
    },
    null,
    2,
  ),
);
if (!upToDate)
  throw new Error(
    'This worktree uses an older pre-push script; update this worktree before pushing. core.hooksPath can be shared but script contents are worktree-local.',
  );
