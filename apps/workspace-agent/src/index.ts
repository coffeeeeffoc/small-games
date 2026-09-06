import { randomBytes, randomInt } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { check as prettierCheck, resolveConfig as resolvePrettierConfig } from 'prettier';
import {
  checkSourceFormat,
  countDiffLines,
  createDiffHunks,
  repositoryDiffRequestSchema,
  repositoryWriteRequestSchema,
  REPOSITORY_BRIDGE_ERRORS,
  type RepositoryBridgeErrorCode,
} from '@coffeeeeffoc/repository-bridge';
import { gameFiles, prepareSource, repositoryPath, sourceFile } from './repository.js';
import { SourceExtensionManager } from './source-extension.js';
import type { SourceGenerator } from './source-generator.js';

export { SourceExtensionManager } from './source-extension.js';

export type RunningWorkspaceAgent = {
  url: string;
  pairingCode: string;
  close(): Promise<void>;
};

export type WorkspaceAgentOptions = {
  workspaceRoot: string;
  allowedOrigins: string[];
  host?: string;
  port?: number;
  pairingCode?: string;
  pairingExpiresAt?: number;
  tokenTtlMs?: number;
  now?: () => number;
  sourceGenerator?: SourceGenerator;
  allowedSourceDependencies?: string[];
};

function json(response: ServerResponse, status: number, body: unknown, origin?: string) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(origin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          Vary: 'Origin',
        }
      : {}),
  });
  response.end(JSON.stringify(body));
}

async function body(request: AsyncIterable<Uint8Array>) {
  let text = '';
  for await (const chunk of request) {
    text += Buffer.from(chunk).toString('utf8');
    if (text.length > 1_100_000) throw new Error('REQUEST_TOO_LARGE');
  }
  return JSON.parse(text) as unknown;
}

function errorStatus(code: RepositoryBridgeErrorCode) {
  if (code === 'VERSION_CONFLICT') return 409;
  if (code === 'SESSION_EXPIRED' || code === 'PAIRING_REJECTED') return 401;
  if (code === 'ORIGIN_REJECTED') return 403;
  return 400;
}

function isBridgeError(code: string): code is RepositoryBridgeErrorCode {
  return REPOSITORY_BRIDGE_ERRORS.some((candidate) => candidate === code);
}

/** Starts the local-only Repository Bridge with controlled source reads and writes. */
export async function startWorkspaceAgent(
  options: WorkspaceAgentOptions,
): Promise<RunningWorkspaceAgent> {
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1') throw new Error('Workspace Agent must bind to 127.0.0.1');
  if (options.allowedOrigins.length === 0) throw new Error('At least one Origin is required');
  const workspaceRoot = await realpath(options.workspaceRoot);
  const now = options.now ?? Date.now;
  const pairingCode = options.pairingCode ?? String(randomInt(100_000, 1_000_000));
  const pairingExpiresAt = options.pairingExpiresAt ?? now() + 5 * 60_000;
  const tokenTtlMs = options.tokenTtlMs ?? 15 * 60_000;
  const sessions = new Map<string, number>();
  let writes = Promise.resolve();
  let paired = false;
  let sourceExtensions: Promise<SourceExtensionManager> | undefined;
  const extensions = () => (sourceExtensions ??= SourceExtensionManager.open(workspaceRoot));

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (!origin || !options.allowedOrigins.includes(origin)) {
      json(response, 403, { error: 'ORIGIN_REJECTED' });
      return;
    }
    if (request.method === 'OPTIONS') {
      json(response, 204, null, origin);
      return;
    }
    try {
      const url = new URL(request.url ?? '/', `http://${host}`);
      if (request.method === 'POST' && url.pathname === '/pair') {
        const parsed = (await body(request)) as { code?: unknown };
        if (paired || now() >= pairingExpiresAt || parsed.code !== pairingCode) {
          json(response, 401, { error: 'PAIRING_REJECTED' }, origin);
          return;
        }
        paired = true;
        const token = randomBytes(32).toString('base64url');
        sessions.set(token, now() + tokenTtlMs);
        json(response, 200, { token, expiresAt: now() + tokenTtlMs }, origin);
        return;
      }
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      const expiresAt = token && sessions.get(token);
      if (!token || !expiresAt || now() >= expiresAt) {
        if (token) sessions.delete(token);
        json(response, 401, { error: 'SESSION_EXPIRED' }, origin);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/repository/tree') {
        const appsRoot = path.join(workspaceRoot, 'apps');
        const games = [];
        for (const entry of await readdir(appsRoot, { withFileTypes: true })) {
          if (!entry.isDirectory() || !entry.name.startsWith('game-')) continue;
          games.push({ id: entry.name, files: await gameFiles(workspaceRoot, entry.name) });
        }
        json(response, 200, { games }, origin);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/repository/file') {
        const gameId = url.searchParams.get('gameId') ?? '';
        const relativePath = url.searchParams.get('path') ?? '';
        const current = await sourceFile(workspaceRoot, gameId, relativePath);
        json(
          response,
          200,
          {
            gameId,
            path: relativePath,
            source: current.source,
            version: current.version,
            editable: true,
          },
          origin,
        );
        return;
      }
      if (request.method === 'POST' && url.pathname === '/source-extensions') {
        const parsed = (await body(request)) as {
          gameId: string;
          mode: 'create' | 'modify';
          allowedDependencies?: string[];
        };
        const allowed = new Set(options.allowedSourceDependencies ?? []);
        if (parsed.allowedDependencies?.some((dependency) => !allowed.has(dependency)))
          throw new Error('DEPENDENCY_NOT_ALLOWED');
        json(response, 201, await (await extensions()).start(parsed), origin);
        return;
      }
      const sourceTask = url.pathname.match(
        /^\/source-extensions\/([^/]+)\/(generate|retry|validate|diff|candidate|cleanup)$/,
      );
      if (request.method === 'POST' && sourceTask) {
        const [, id, action] = sourceTask;
        const manager = await extensions();
        if (action === 'generate') {
          if (!options.sourceGenerator) {
            json(response, 503, { error: 'AI_NOT_CONFIGURED' }, origin);
            return;
          }
          const input = (await body(request)) as { input?: unknown };
          json(
            response,
            200,
            await manager.generate(id, String(input.input ?? ''), options.sourceGenerator),
            origin,
          );
        } else if (action === 'retry') json(response, 200, await manager.retry(id), origin);
        else if (action === 'validate') json(response, 200, await manager.validate(id), origin);
        else if (action === 'diff') json(response, 200, { diff: await manager.diff(id) }, origin);
        else if (action === 'cleanup') {
          const input = (await body(request)) as { confirmation?: unknown };
          json(response, 200, await manager.cleanup(id, input.confirmation === true), origin);
        } else {
          const input = (await body(request)) as { confirmation?: unknown };
          json(response, 200, await manager.commit(id, input.confirmation === true), origin);
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/repository/diff') {
        const parsed = repositoryDiffRequestSchema.parse(await body(request));
        const { current, source } = await prepareSource(workspaceRoot, parsed);
        const hunks = createDiffHunks(current.source, source);
        json(
          response,
          200,
          {
            ...parsed,
            source,
            repositoryPath: repositoryPath(parsed.gameId, parsed.path),
            before: current.source,
            version: current.version,
            stale: current.version !== parsed.baseVersion,
            hunks,
            files: hunks.length
              ? [
                  {
                    path: repositoryPath(parsed.gameId, parsed.path),
                    ...countDiffLines(hunks.flatMap((hunk) => hunk.lines)),
                  },
                ]
              : [],
          },
          origin,
        );
        return;
      }
      if (request.method === 'POST' && url.pathname === '/repository/file') {
        const input = await body(request);
        if (!(input as { confirmation?: unknown })?.confirmation)
          throw new Error('CONFIRMATION_REQUIRED');
        const parsed = repositoryWriteRequestSchema.parse(input);
        const save = writes.then(async () => {
          const { current, source } = await prepareSource(workspaceRoot, parsed);
          if (current.version !== parsed.baseVersion) return { kind: 'conflict', current } as const;
          const format = checkSourceFormat(source, parsed.path);
          if (format.ok)
            try {
              const prettier = await resolvePrettierConfig(current.target, { editorconfig: true });
              if (!(await prettierCheck(source, { ...prettier, filepath: current.target })))
                format.issues.push({ rule: 'prettier', message: 'Source must pass Prettier.' });
            } catch {
              format.issues.push({
                rule: 'prettier',
                message: 'Source must parse and pass Prettier.',
              });
            }
          format.ok = format.issues.length === 0;
          if (!format.ok) return { kind: 'format', format } as const;
          const latest = await sourceFile(workspaceRoot, parsed.gameId, parsed.path);
          if (latest.version !== current.version)
            return { kind: 'conflict', current: latest } as const;
          await writeFile(current.target, source, 'utf8');
          return {
            kind: 'saved',
            saved: await sourceFile(workspaceRoot, parsed.gameId, parsed.path),
          } as const;
        });
        writes = save.then(
          () => undefined,
          () => undefined,
        );
        const result = await save;
        if (result.kind === 'conflict')
          json(
            response,
            409,
            {
              error: 'VERSION_CONFLICT',
              version: result.current.version,
              source: result.current.source,
            },
            origin,
          );
        else if (result.kind === 'format')
          json(response, 400, { error: 'FORMAT_INVALID', issues: result.format.issues }, origin);
        else
          json(
            response,
            200,
            {
              gameId: parsed.gameId,
              path: parsed.path,
              repositoryPath: repositoryPath(parsed.gameId, parsed.path),
              source: result.saved.source,
              version: result.saved.version,
              format: { ok: true, issues: [] },
            },
            origin,
          );
        return;
      }
      json(response, 404, { error: 'NOT_FOUND' }, origin);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : '';
      const error: RepositoryBridgeErrorCode = isBridgeError(code) ? code : 'INVALID_REQUEST';
      json(response, errorStatus(error), { error }, origin);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Workspace Agent failed to listen');
  return {
    url: `http://${host}:${address.port}`,
    pairingCode,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
