import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function cleanupSourceExtension(
  workspaceRoot: string,
  recordsRoot: string,
  task: { id: string; gameId: string; status: string; attempt: number; worktreePath: string },
  confirmation: boolean,
) {
  const changedPaths = (await exec('git', ['status', '--short'], { cwd: task.worktreePath })).stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3));
  const impact = {
    taskId: task.id,
    gameId: task.gameId,
    status: task.status,
    attemptCount: task.attempt,
    worktreePath: task.worktreePath,
    removesWorktree: await stat(task.worktreePath).then(
      () => true,
      () => false,
    ),
    preservesRecords: true as const,
    changedPaths,
  };
  const audit = async (action: string) => {
    const id = randomUUID();
    const directory = path.join(recordsRoot, 'audit');
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, `${Date.now()}-${id}.json`),
      JSON.stringify({
        id,
        action,
        taskId: task.id,
        impact,
        createdAt: Date.now(),
      }) + '\n',
      { encoding: 'utf8', flag: 'wx' },
    );
  };
  if (!confirmation) {
    await audit('source-extension.cleanup-rejected');
    return impact;
  }
  try {
    if (impact.removesWorktree)
      await exec('git', ['worktree', 'remove', '--force', task.worktreePath], {
        cwd: workspaceRoot,
      });
    await rm(path.join(recordsRoot, 'active', task.gameId), { recursive: true, force: true });
    await audit('source-extension.cleanup');
    return { ...impact, removed: true as const };
  } catch (error) {
    await audit('source-extension.cleanup-failed');
    throw error;
  }
}
