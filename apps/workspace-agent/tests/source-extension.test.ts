import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { SourceExtensionManager } from '../src/source-extension.js';

const exec = promisify(execFile);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'source-extension-'));
  const gameRoot = path.join(root, 'apps', 'game-alpha');
  await mkdir(path.join(gameRoot, 'src'), { recursive: true });
  await writeFile(path.join(gameRoot, 'src', 'main.ts'), 'export const value = 1;\n');
  await writeFile(
    path.join(gameRoot, 'package.json'),
    JSON.stringify({ name: '@test/game-alpha', dependencies: { zod: '1.0.0' } }, null, 2) + '\n',
  );
  await exec('git', ['init', '-b', 'main'], { cwd: root });
  await exec('git', ['config', 'user.name', 'Test'], { cwd: root });
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await exec('git', ['add', '.'], { cwd: root });
  await exec('git', ['commit', '-m', 'initial'], { cwd: root });
  return root;
}

describe('Source Extension workflow', () => {
  it('isolates one active task per Game and preserves retry attempts', async () => {
    const root = await fixture();
    const manager = await SourceExtensionManager.open(root, {
      runGate: async (gate) =>
        gate === 'lint'
          ? Promise.reject(new Error('lint crashed'))
          : { exitCode: 0, log: `${gate} ok` },
    });
    const task = await manager.start({ gameId: 'game-alpha', mode: 'modify' });
    await expect(manager.start({ gameId: 'game-alpha', mode: 'modify' })).rejects.toThrow(
      'ACTIVE_TASK_EXISTS',
    );
    await manager.write(task.id, 'src/main.ts', 'export const value = 2;\n');

    const failed = await manager.validate(task.id);
    expect(failed).toMatchObject({ attempt: 1, status: 'failed', failedStep: 'lint' });
    expect(await readFile(path.join(failed.recordPath, 'lint.log'), 'utf8')).toContain(
      'lint crashed',
    );

    const resumed = await SourceExtensionManager.open(root, {
      runGate: async () => ({ exitCode: 0, log: 'ok' }),
    });
    const retry = await resumed.retry(task.id);
    expect(retry.attempt).toBe(2);
    expect(await readFile(path.join(failed.recordPath, 'lint.log'), 'utf8')).toContain(
      'lint crashed',
    );
  });

  it('restricts changes to the target Game and dependency allowlist', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'apps', 'game-empty'));
    const manager = await SourceExtensionManager.open(root);
    await expect(manager.start({ gameId: 'game-empty', mode: 'create' })).rejects.toThrow(
      'INVALID_SCOPE',
    );
    const task = await manager.start({ gameId: 'game-alpha', mode: 'modify' });
    await expect(manager.write(task.id, '../shared.ts', 'nope')).rejects.toThrow('INVALID_SCOPE');
    await expect(manager.write(task.id, 'package.json', '{}\n')).rejects.toThrow(
      'DEPENDENCY_CHANGE_REJECTED',
    );

    const secondRoot = await fixture();
    const separatelyAuthorized = await SourceExtensionManager.open(secondRoot);
    const dependencyTask = await separatelyAuthorized.start({
      gameId: 'game-alpha',
      mode: 'modify',
      allowedDependencies: ['lodash'],
    });
    await expect(
      separatelyAuthorized.write(
        dependencyTask.id,
        'package.json',
        JSON.stringify({ name: '@test/game-alpha', dependencies: {} }, null, 2) + '\n',
      ),
    ).rejects.toThrow('DEPENDENCY_NOT_ALLOWED');
    await expect(
      separatelyAuthorized.write(
        dependencyTask.id,
        'package.json',
        JSON.stringify({
          name: '@test/game-alpha',
          scripts: { unsafe: 'echo nope' },
          dependencies: { zod: '1.0.0' },
        }) + '\n',
      ),
    ).rejects.toThrow('PACKAGE_JSON_CHANGE_REJECTED');
    await expect(
      separatelyAuthorized.write(
        dependencyTask.id,
        'package.json',
        JSON.stringify({ name: '@test/game-alpha', devDependencies: { zod: '1.0.0' } }) + '\n',
      ),
    ).rejects.toThrow('DEPENDENCY_NOT_ALLOWED');

    const authorized = await manager.start({
      gameId: 'game-beta',
      mode: 'create',
      allowedDependencies: ['zod'],
    });
    await manager.write(
      authorized.id,
      'package.json',
      JSON.stringify({ name: '@test/game-beta', dependencies: { zod: '1.0.0' } }, null, 2) + '\n',
    );
    await expect(
      manager.write(
        authorized.id,
        'package.json',
        JSON.stringify({ name: '@test/game-beta', dependencies: { lodash: '1.0.0' } }) + '\n',
      ),
    ).rejects.toThrow('DEPENDENCY_NOT_ALLOWED');
  });

  it('creates a candidate commit only after every gate passes', async () => {
    const root = await fixture();
    const gates: string[] = [];
    const manager = await SourceExtensionManager.open(root, {
      runGate: async (gate) => {
        gates.push(gate);
        return { exitCode: 0, log: `${gate} ok` };
      },
    });
    const task = await manager.start({ gameId: 'game-alpha', mode: 'modify' });
    await exec('git', ['mv', 'apps/game-alpha/src/main.ts', 'apps/game-alpha/src/renamed.ts'], {
      cwd: task.worktreePath,
    });
    await manager.write(task.id, 'src/renamed.ts', 'export const value = 3;\n');
    const validated = await manager.validate(task.id);

    expect(gates).toEqual(['format:check', 'lint', 'typecheck', 'test', 'build']);
    expect(validated).toMatchObject({ status: 'validated', attempt: 1 });
    expect(await manager.diff(task.id)).toContain('value = 3');
    await expect(manager.commit(task.id, false)).rejects.toThrow('CONFIRMATION_REQUIRED');
    const lateFile = path.join(task.worktreePath, 'apps', 'game-alpha', 'src', 'late.ts');
    await writeFile(lateFile, 'this never passed the gates');
    await expect(manager.commit(task.id, true)).rejects.toThrow('CHANGES_AFTER_VALIDATION');
    await rm(lateFile);
    const candidate = await manager.commit(task.id, true);
    expect(candidate).toMatchObject({ status: 'candidate', attempt: 1 });
    expect(candidate.commit).toMatch(/^[0-9a-f]{40}$/);
    expect((await exec('git', ['status', '--short'], { cwd: root })).stdout).toBe('');
  });
});
