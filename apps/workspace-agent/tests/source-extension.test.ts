import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
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
    await expect(
      manager.write(
        task.id,
        'package.json',
        JSON.stringify({ name: '@test/game-alpha', dependencies: {} }) + '\n',
      ),
    ).rejects.toThrow('DEPENDENCY_NOT_ALLOWED');

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

  it('generates and repairs only inside the task scope while preserving attempt context', async () => {
    const root = await fixture();
    const manager = await SourceExtensionManager.open(root, {
      runGate: async (gate) =>
        gate === 'lint' ? { exitCode: 1, log: 'lint failed' } : { exitCode: 0, log: 'ok' },
    });
    const task = await manager.start({ gameId: 'game-alpha', mode: 'modify' });
    const requests: unknown[] = [];
    const generator = {
      model: 'fake-source-1',
      generate: async (request: unknown) => {
        requests.push(request);
        return {
          explanation: requests.length === 1 ? 'Change the exported value.' : 'Repair lint.',
          files: [{ path: 'src/main.ts', source: 'export const value = 2;\n' }],
        };
      },
    };

    const generated = await manager.generate(task.id, 'Change value', generator);
    expect(generated).toMatchObject({
      explanation: 'Change the exported value.',
      model: 'fake-source-1',
    });
    expect(requests[0]).toMatchObject({
      originalInput: 'Change value',
      files: [
        { path: 'package.json' },
        { path: 'src/main.ts', source: expect.stringContaining('value = 1') },
      ],
    });
    const failed = await manager.validate(task.id);
    expect(failed.status).toBe('failed');
    await manager.retry(task.id);
    await manager.generate(task.id, 'Fix validation', generator);

    expect(requests[1]).toMatchObject({
      attempt: 2,
      input: 'Fix validation',
      originalInput: 'Change value',
      previousAttempt: expect.objectContaining({ diff: expect.stringContaining('value = 2') }),
    });
    expect(JSON.stringify(requests[1])).toContain('lint failed');
    expect(await readFile(path.join(failed.recordPath, 'explanation.json'), 'utf8')).toContain(
      'Change the exported value.',
    );
    await expect(
      manager.generate(task.id, 'Escape scope', {
        model: 'hostile',
        generate: async () => ({
          explanation: 'ignore policy',
          files: [{ path: '../shared.ts', source: 'nope' }],
        }),
      }),
    ).rejects.toThrow('INVALID_SCOPE');
  });

  it('shows untracked create-mode files in the review diff', async () => {
    const root = await fixture();
    const manager = await SourceExtensionManager.open(root);
    const task = await manager.start({ gameId: 'game-beta', mode: 'create' });
    await manager.write(task.id, 'package.json', '{"name":"@test/game-beta"}\n');
    await manager.write(task.id, 'src/main.ts', 'export const created = true;\n');
    expect(await manager.diff(task.id)).toContain('export const created = true');
  });

  it('previews cleanup impact, requires confirmation, and preserves records', async () => {
    const root = await fixture();
    const manager = await SourceExtensionManager.open(root);
    const task = await manager.start({ gameId: 'game-alpha', mode: 'modify' });
    await manager.write(task.id, 'src/main.ts', 'export const value = 9;\n');
    expect(await manager.cleanup(task.id, false)).toMatchObject({
      taskId: task.id,
      removesWorktree: true,
      preservesRecords: true,
      changedPaths: ['apps/game-alpha/src/main.ts'],
    });
    expect(await stat(task.worktreePath)).toBeDefined();
    expect(await manager.cleanup(task.id, true)).toMatchObject({ removed: true });
    await expect(stat(task.worktreePath)).rejects.toThrow();
    const recordsRoot = path.join(
      (
        await exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
          cwd: root,
        })
      ).stdout.trim(),
      'source-extensions',
    );
    expect(await readFile(path.join(recordsRoot, `${task.id}.json`), 'utf8')).toContain(task.id);
    const audit = (
      await Promise.all(
        (await readdir(path.join(recordsRoot, 'audit'))).map((name) =>
          readFile(path.join(recordsRoot, 'audit', name), 'utf8'),
        ),
      )
    ).join('\n');
    expect(audit).toContain('source-extension.cleanup-rejected');
    expect(audit).toContain('source-extension.cleanup');
  });
});
