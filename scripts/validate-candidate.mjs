import assert from 'node:assert/strict';
import { validatePush, run, cleanGitEnv } from './validate-push.mjs';
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
try {
  assert(
    args.includes('--base') && args.includes('--head'),
    'Usage: pnpm validate:candidate --base <remote-SHA> --head <candidate-SHA>',
  );
  const root = process.cwd();
  const env = cleanGitEnv();
  const resolve = (ref) =>
    run('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], root, env, true);
  const base = resolve(value('--base'));
  const head = resolve(value('--head'));
  await validatePush(`candidate ${head} refs/heads/dev ${base}\n`, { root, env });
  console.log(`CANDIDATE_VALIDATED base=${base} head=${head} tier=incremental-static-and-entry`);
} catch (error) {
  console.error(`Candidate blocked: ${error.message}`);
  process.exitCode = 1;
}
