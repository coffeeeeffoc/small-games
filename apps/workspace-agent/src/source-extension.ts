import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { checkPackageManifest } from './source-extension-policy.js';

const exec = promisify(execFile);
const gates = ['format:check', 'lint', 'typecheck', 'test', 'build'] as const;

type Gate = (typeof gates)[number];
type Task = {
  id: string;
  gameId: string;
  mode: 'create' | 'modify';
  worktreePath: string;
  allowedDependencies: string[];
  attempt: number;
  status: 'active' | 'failed' | 'validated' | 'candidate';
  failedStep?: Gate;
  runningStep?: Gate;
  validatedDiff?: string;
  commit?: string;
};

type GateResult = { exitCode: number; log: string };
type Options = { runGate?: (gate: Gate, cwd: string) => Promise<GateResult> };

async function git(cwd: string, args: string[]) {
  return exec('git', args, { cwd, encoding: 'utf8' });
}

async function defaultGate(gate: Gate, cwd: string): Promise<GateResult> {
  try {
    const { stdout, stderr } = await exec(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      [gate],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    return { exitCode: 0, log: stdout + stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      log: (failure.stdout ?? '') + (failure.stderr ?? '') || String(failure.message ?? error),
    };
  }
}

function gamePath(gameId: string) {
  if (!/^game-[a-z0-9-]+$/.test(gameId)) throw new Error('INVALID_SCOPE');
  return `apps/${gameId}`;
}

export class SourceExtensionManager {
  private constructor(
    private readonly workspaceRoot: string,
    private readonly recordsRoot: string,
    private readonly worktreesRoot: string,
    private readonly runGate: (gate: Gate, cwd: string) => Promise<GateResult>,
  ) {}

  static async open(workspaceRoot: string, options: Options = {}) {
    const root = (await git(workspaceRoot, ['rev-parse', '--show-toplevel'])).stdout.trim();
    const common = (
      await git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
    ).stdout.trim();
    const recordsRoot = path.join(common, 'source-extensions');
    const worktreesRoot = path.join(path.dirname(root), `.${path.basename(root)}-worktrees`);
    await mkdir(path.join(recordsRoot, 'active'), { recursive: true });
    await mkdir(worktreesRoot, { recursive: true });
    return new SourceExtensionManager(
      root,
      recordsRoot,
      worktreesRoot,
      options.runGate ?? defaultGate,
    );
  }

  async start(input: {
    gameId: string;
    mode: 'create' | 'modify';
    allowedDependencies?: string[];
  }): Promise<Task> {
    const targetGame = path.join(this.workspaceRoot, gamePath(input.gameId));
    const exists = await stat(targetGame).then(
      () => true,
      () => false,
    );
    if ((input.mode === 'create' && exists) || (input.mode === 'modify' && !exists))
      throw new Error('INVALID_SCOPE');

    const lock = path.join(this.recordsRoot, 'active', input.gameId);
    try {
      await mkdir(lock);
    } catch {
      throw new Error('ACTIVE_TASK_EXISTS');
    }
    const id = randomUUID();
    const task: Task = {
      id,
      gameId: input.gameId,
      mode: input.mode,
      worktreePath: path.join(this.worktreesRoot, id),
      allowedDependencies: [...new Set(input.allowedDependencies ?? [])],
      attempt: 1,
      status: 'active',
    };
    try {
      await git(this.workspaceRoot, ['worktree', 'add', '--detach', task.worktreePath, 'HEAD']);
      await writeFile(path.join(lock, 'task-id'), id, 'utf8');
      await this.save(task);
      await mkdir(this.attemptPath(task), { recursive: true });
      return task;
    } catch (error) {
      await rm(lock, { recursive: true, force: true });
      throw error;
    }
  }

  async write(taskId: string, relativePath: string, source: string) {
    const task = await this.load(taskId);
    if (task.status !== 'active' && task.status !== 'failed') throw new Error('TASK_NOT_EDITABLE');
    const normalized = relativePath.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.split('/').some((part) => part === '..'))
      throw new Error('INVALID_SCOPE');
    const target = path.resolve(task.worktreePath, gamePath(task.gameId), normalized);
    const gameRoot = path.resolve(task.worktreePath, gamePath(task.gameId));
    if (path.relative(gameRoot, target).startsWith('..')) throw new Error('INVALID_SCOPE');
    let checked = gameRoot;
    for (const segment of normalized.split('/')) {
      checked = path.join(checked, segment);
      try {
        if ((await lstat(checked)).isSymbolicLink()) throw new Error('INVALID_SCOPE');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (normalized === 'package.json') await this.checkManifest(task, target, source);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source, 'utf8');
  }

  async retry(taskId: string) {
    const task = await this.load(taskId);
    if (
      task.status !== 'failed' &&
      task.status !== 'validated' &&
      !(task.status === 'active' && task.runningStep)
    )
      throw new Error('TASK_NOT_FAILED');
    task.attempt += 1;
    task.status = 'active';
    delete task.failedStep;
    delete task.runningStep;
    await mkdir(this.attemptPath(task), { recursive: true });
    await this.save(task);
    return task;
  }

  async validate(taskId: string) {
    const task = await this.load(taskId);
    if (task.status !== 'active') throw new Error('TASK_NOT_ACTIVE');
    await this.checkChangedPaths(task);
    for (const gate of gates) {
      task.runningStep = gate;
      await this.save(task);
      let result: GateResult;
      try {
        result = await this.runGate(gate, task.worktreePath);
      } catch (error) {
        result = {
          exitCode: 1,
          log: error instanceof Error ? (error.stack ?? error.message) : String(error),
        };
      }
      await writeFile(path.join(this.attemptPath(task), `${gate}.log`), result.log, 'utf8');
      if (result.exitCode !== 0) {
        task.status = 'failed';
        task.failedStep = gate;
        delete task.runningStep;
        await this.save(task);
        return { ...task, recordPath: this.attemptPath(task) };
      }
    }
    delete task.runningStep;
    await git(task.worktreePath, ['add', '--', gamePath(task.gameId)]);
    task.validatedDiff = await this.snapshot(task);
    task.status = 'validated';
    await this.save(task);
    return { ...task, recordPath: this.attemptPath(task) };
  }

  async diff(taskId: string) {
    const task = await this.load(taskId);
    return (await git(task.worktreePath, ['diff', '--no-ext-diff', '--binary', 'HEAD'])).stdout;
  }

  async commit(taskId: string, confirmation: boolean) {
    if (!confirmation) throw new Error('CONFIRMATION_REQUIRED');
    const task = await this.load(taskId);
    if (task.status !== 'validated') throw new Error('TASK_NOT_VALIDATED');
    await this.checkChangedPaths(task);
    if ((await this.snapshot(task)) !== task.validatedDiff)
      throw new Error('CHANGES_AFTER_VALIDATION');
    await git(task.worktreePath, ['add', '--', gamePath(task.gameId)]);
    await git(task.worktreePath, [
      'commit',
      '-m',
      `feat(${task.gameId}): source extension candidate`,
    ]);
    task.commit = (await git(task.worktreePath, ['rev-parse', 'HEAD'])).stdout.trim();
    task.status = 'candidate';
    await this.save(task);
    await rm(path.join(this.recordsRoot, 'active', task.gameId), { recursive: true });
    return { ...task, recordPath: this.attemptPath(task) };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async snapshot(task: Task) {
    const hash = createHash('sha256').update(await this.diff(task.id));
    const untracked = (
      await git(task.worktreePath, ['ls-files', '--others', '--exclude-standard', '-z'])
    ).stdout
      .split('\0')
      .filter(Boolean)
      .sort();
    for (const relative of untracked) {
      hash.update(relative).update(await readFile(path.join(task.worktreePath, relative)));
    }
    return hash.digest('hex');
  }

  private async checkManifest(task: Task, target: string, source: string, baseline?: string) {
    const previous =
      baseline ??
      (await readFile(target, 'utf8').catch(() => {
        if (task.mode === 'modify') throw new Error('DEPENDENCY_CHANGE_REJECTED');
        return undefined;
      }));
    checkPackageManifest(task.mode, task.allowedDependencies, previous, source);
  }

  private async checkChangedPaths(task: Task) {
    const tracked = (await git(task.worktreePath, ['diff', '--name-only', '-z', 'HEAD'])).stdout;
    const untracked = (
      await git(task.worktreePath, ['ls-files', '--others', '--exclude-standard', '-z'])
    ).stdout;
    const paths = (tracked + untracked)
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.replaceAll('\\', '/'));
    const root = `${gamePath(task.gameId)}/`;
    if (paths.length === 0 || paths.some((changed) => !changed.startsWith(root)))
      throw new Error('INVALID_SCOPE');
    if (paths.includes(`${root}package.json`)) {
      const target = path.join(task.worktreePath, root, 'package.json');
      const baseline = await git(task.worktreePath, ['show', `HEAD:${root}package.json`]).then(
        ({ stdout }) => stdout,
        () => undefined,
      );
      await this.checkManifest(task, target, await readFile(target, 'utf8'), baseline);
    }
  }

  private attemptPath(task: Task) {
    return path.join(this.recordsRoot, task.id, `attempt-${task.attempt}`);
  }

  private async load(id: string): Promise<Task> {
    return JSON.parse(await readFile(path.join(this.recordsRoot, `${id}.json`), 'utf8')) as Task;
  }

  private async save(task: Task) {
    const target = path.join(this.recordsRoot, `${task.id}.json`);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, JSON.stringify(task, null, 2) + '\n', 'utf8');
    await rename(temporary, target);
  }
}
