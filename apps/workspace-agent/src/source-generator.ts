import { readFile, realpath, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const gates = ['format:check', 'lint', 'typecheck', 'test', 'build'] as const;
export type Gate = (typeof gates)[number];
export type SourceGenerator = {
  model: string;
  generate(request: {
    gameId: string;
    mode: 'create' | 'modify';
    attempt: number;
    input: string;
    originalInput: string;
    files: { path: string; source: string }[];
    previousAttempt?: { diff: string; logs: Partial<Record<Gate, string>> };
  }): Promise<{ explanation: string; files: { path: string; source: string }[] }>;
};

export async function sourceContext(worktree: string, gameId: string) {
  const root = `apps/${gameId}/`;
  const gameRoot = await realpath(path.join(worktree, root));
  const names = (
    await exec('git', ['ls-files', '-z', '--', root], { cwd: worktree, encoding: 'utf8' })
  ).stdout
    .split('\0')
    .filter((name) => /(?:package\.json|\.(?:[cm]?[jt]sx?|css|html))$/.test(name));
  const files = [];
  let size = 0;
  for (const name of names) {
    const target = await realpath(path.join(worktree, name));
    const relative = path.relative(gameRoot, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('INVALID_SCOPE');
    const source = await readFile(target, 'utf8');
    size += source.length;
    if (size > 1_000_000) throw new Error('SOURCE_CONTEXT_TOO_LARGE');
    files.push({ path: name.slice(root.length), source });
  }
  return files;
}

export async function previousGenerationAttempt(recordsRoot: string, id: string, attempt: number) {
  if (attempt < 2) return undefined;
  const root = path.join(recordsRoot, id, `attempt-${attempt - 1}`);
  const logs: Partial<Record<Gate, string>> = {};
  for (const gate of gates) {
    const log = await readFile(path.join(root, `${gate}.log`), 'utf8').catch(() => undefined);
    if (log !== undefined) logs[gate] = log;
  }
  return { diff: await readFile(path.join(root, 'diff.patch'), 'utf8').catch(() => ''), logs };
}

export async function saveGeneration(target: string, value: unknown) {
  await writeFile(target, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/** Calls a configured AI endpoint; filesystem policy remains enforced by SourceExtensionManager. */
export function createHttpSourceGenerator(options: {
  endpoint: string;
  apiKey: string;
  model: string;
  transport?: typeof fetch;
}): SourceGenerator {
  return {
    model: options.model,
    async generate(request) {
      const response = await (options.transport ?? fetch)(options.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, model: options.model }),
      });
      if (!response.ok) throw new Error('AI_GENERATION_FAILED');
      const value = (await response.json()) as {
        explanation?: unknown;
        files?: { path?: unknown; source?: unknown }[];
      };
      if (
        typeof value.explanation !== 'string' ||
        !Array.isArray(value.files) ||
        value.files.length === 0 ||
        value.files.some(
          (file) => typeof file?.path !== 'string' || typeof file?.source !== 'string',
        )
      )
        throw new Error('AI_GENERATION_INVALID');
      return value as { explanation: string; files: { path: string; source: string }[] };
    },
  };
}
