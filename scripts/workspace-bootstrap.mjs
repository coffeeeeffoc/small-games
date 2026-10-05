import path from 'node:path';
import { workspacePackages } from './validation-plan.mjs';
import { assertNodeOnly } from './validate-tree.mjs';
import { run } from './validate-push.mjs';
/** Install generated workspace vendor inputs while keeping root prepare disabled. */
export async function bootstrapWorkspace(root, env, execute = run) {
  for (const pkg of await workspacePackages(root)) {
    if (!pkg.scripts?.postinstall) continue;
    await assertNodeOnly(pkg.scripts.postinstall, path.join(root, pkg.dir));
    execute('pnpm', ['--filter', pkg.name, 'postinstall'], root, env);
  }
  await assertSnapshotUnchanged(root, env, execute);
}

export async function assertSnapshotUnchanged(root, env, execute = run) {
  // Check each repository's own tracked files. Parent Git may report a nested clone's
  // administration as '-dirty'; its exact gitlink SHA is checked explicitly instead.
  execute('git', ['diff', '--exit-code', '--ignore-submodules=all'], root, env);
  execute('git', ['diff', '--cached', '--exit-code'], root, env);
  const entries = execute('git', ['ls-tree', '-r', '-z', 'HEAD'], root, env, true)
    .split('\0')
    .filter(Boolean);
  for (const entry of entries) {
    const [metadata, relative] = entry.split('\t');
    const [mode, , sha] = metadata.split(' ');
    if (mode !== '160000') continue;
    const child = path.join(root, relative);
    const head = execute('git', ['rev-parse', 'HEAD'], child, env, true);
    if (head !== sha)
      throw new Error(`Snapshot submodule ${relative}: HEAD changed from ${sha} to ${head}`);
    await assertSnapshotUnchanged(child, env, execute);
  }
}
