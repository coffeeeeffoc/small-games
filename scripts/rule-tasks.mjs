// Pure Cocos rules belong to validation policy, outside the Creator build inputs.
// Keep test changes from invalidating unchanged engine artifacts.
export const cocosRuleCommands = {
  'games/local/carding-car':
    'node --test tests/rules.test.ts tests/physics.test.ts tests/career.test.ts tests/track.test.ts tests/route-challenges.test.ts tests/ranked-summary.test.ts',
  'games/local/night-overwatch':
    'node --test tests/core.test.ts tests/balance.test.ts tests/training.test.ts tests/blast.test.ts tests/camera.test.ts',
};

export function ruleTask(pkg) {
  const declared = pkg.scripts?.['test:rules'];
  if (declared) return { command: declared, args: ['--filter', pkg.name, 'test:rules'] };
  const reviewed = cocosRuleCommands[pkg.dir];
  if (reviewed)
    return { command: reviewed, args: ['--filter', pkg.name, 'exec', ...reviewed.split(' ')] };
  return { command: pkg.scripts?.test, args: ['--filter', pkg.name, 'test'] };
}

// Only this unfiltered aggregate command proves that every workspace test task runs.
// Unknown/custom commands keep the separate rules check instead of guessing coverage.
export function aggregateRunsAllTests(manifest) {
  return (
    (manifest.scripts?.test ?? '').trim().replace(/\s+/g, ' ') ===
    'node --test scripts/platform-process.test.mjs && turbo run test'
  );
}

export function rulesCoveredByAggregate(pkg, manifest, tasks = new Map()) {
  const task = tasks.get(pkg.name);
  return (
    aggregateRunsAllTests(manifest) &&
    !!pkg.scripts?.test &&
    ruleTask(pkg).command === pkg.scripts.test &&
    task?.command === pkg.scripts.test &&
    task.directory.replaceAll('\\', '/') === pkg.dir
  );
}

// The imported browser game's ESLint globals omit this standard browser API.
// Declare it read-only for its validator invocation without changing upstream files or rules.
export function staticTaskArgs(pkg, task) {
  const args = ['--filter', pkg.name, task];
  if (
    task === 'lint' &&
    pkg.dir === 'games/submodules/fishing' &&
    /^eslint(?:\s|$)/.test(pkg.scripts?.lint ?? '')
  )
    args.push('--global', 'URLSearchParams');
  return args;
}

export function lintExcludedByRepository(pkg, manifest) {
  return (
    pkg.dir.startsWith('games/submodules/') &&
    (manifest.scripts?.lint ?? '').split(/\s+/).includes('--filter=!./games/submodules/*')
  );
}
