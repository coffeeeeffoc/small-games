import { randomBytes, randomInt } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
]);
const IGNORED_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git', '.turbo']);

export type RepositoryEntry = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: RepositoryEntry[];
};

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

function isWithin(parent: string, target: string) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function body(request: AsyncIterable<Uint8Array>) {
  let text = '';
  for await (const chunk of request) {
    text += Buffer.from(chunk).toString('utf8');
    if (text.length > 4_096) throw new Error('REQUEST_TOO_LARGE');
  }
  return JSON.parse(text) as unknown;
}

async function safeGameRoot(workspaceRoot: string, gameId: string) {
  if (!/^game-[a-z0-9-]+$/.test(gameId)) throw new Error('INVALID_PATH');
  const gamesRoot = path.join(workspaceRoot, 'apps');
  const target = path.resolve(gamesRoot, gameId);
  const canonical = await realpath(target);
  if (!isWithin(await realpath(gamesRoot), canonical)) throw new Error('INVALID_PATH');
  return canonical;
}

async function safeFile(workspaceRoot: string, gameId: string, relativePath: string) {
  const gameRoot = await safeGameRoot(workspaceRoot, gameId);
  const target = path.resolve(gameRoot, relativePath);
  if (!isWithin(gameRoot, target)) throw new Error('INVALID_PATH');
  const canonical = await realpath(target);
  if (!isWithin(gameRoot, canonical)) throw new Error('INVALID_PATH');
  const details = await stat(canonical);
  if (
    !details.isFile() ||
    !SOURCE_EXTENSIONS.has(path.extname(canonical)) ||
    details.size > 1_000_000
  )
    throw new Error('INVALID_PATH');
  return canonical;
}

async function tree(root: string, current = root): Promise<RepositoryEntry[]> {
  const entries: RepositoryEntry[] = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const target = path.join(current, entry.name);
    const canonical = await realpath(target);
    if (!isWithin(root, canonical)) throw new Error('INVALID_PATH');
    const relative = path.relative(root, target).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      const children = await tree(root, canonical);
      if (children.length)
        entries.push({ name: entry.name, path: relative, type: 'directory', children });
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      entries.push({ name: entry.name, path: relative, type: 'file' });
    }
  }
  return entries;
}

/** Starts the local-only, read-only Repository Bridge. */
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
  let paired = false;

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
          const root = await safeGameRoot(workspaceRoot, entry.name);
          games.push({ id: entry.name, files: await tree(root) });
        }
        json(response, 200, { games }, origin);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/repository/file') {
        const gameId = url.searchParams.get('gameId') ?? '';
        const relativePath = url.searchParams.get('path') ?? '';
        const target = await safeFile(workspaceRoot, gameId, relativePath);
        json(
          response,
          200,
          { gameId, path: relativePath, source: await readFile(target, 'utf8') },
          origin,
        );
        return;
      }
      json(response, 404, { error: 'NOT_FOUND' }, origin);
    } catch {
      json(response, 400, { error: 'INVALID_REQUEST' }, origin);
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
