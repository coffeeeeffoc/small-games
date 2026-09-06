import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startWorkspaceAgent, type RunningWorkspaceAgent } from '../src/index.js';

const origin = 'http://127.0.0.1:5174';
let running: RunningWorkspaceAgent | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'workspace-agent-'));
  const game = path.join(root, 'apps', 'game-cultivation');
  await mkdir(path.join(game, 'src'), { recursive: true });
  await writeFile(path.join(game, 'src', 'evil&name.ts'), 'export const safe = true;');
  return { root, game };
}

async function pair(url: string, code = '123456', requestOrigin = origin) {
  return fetch(`${url}/pair`, {
    method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

async function pairedAgent(root: string) {
  running = await startWorkspaceAgent({
    workspaceRoot: root,
    allowedOrigins: [origin],
    pairingCode: '123456',
  });
  const token = String(((await (await pair(running.url)).json()) as { token: string }).token);
  const request = (path: string, init?: RequestInit) =>
    fetch(`${running!.url}${path}`, {
      ...init,
      headers: {
        Origin: origin,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  return request;
}

describe('Workspace Agent trust boundary', () => {
  it('binds only to loopback', async () => {
    const { root } = await fixture();
    for (const host of ['0.0.0.0', 'localhost', '::1'])
      await expect(
        startWorkspaceAgent({ workspaceRoot: root, allowedOrigins: [origin], host }),
      ).rejects.toThrow('127.0.0.1');
  });

  it('rejects wrong origins, expired codes, and pairing-code replay', async () => {
    const { root } = await fixture();
    let now = 1_000;
    running = await startWorkspaceAgent({
      workspaceRoot: root,
      allowedOrigins: [origin],
      pairingCode: '123456',
      pairingExpiresAt: 2_000,
      now: () => now,
    });
    expect((await pair(running.url, '123456', 'https://evil.example')).status).toBe(403);
    const paired = await pair(running.url);
    expect(paired.status).toBe(200);
    expect((await pair(running.url)).status).toBe(401);
    now = 3_000;
    const expired = await startWorkspaceAgent({
      workspaceRoot: root,
      allowedOrigins: [origin],
      pairingCode: '654321',
      pairingExpiresAt: 2_000,
      now: () => now,
    });
    expect((await pair(expired.url, '654321')).status).toBe(401);
    await expired.close();
  });

  it('expires session tokens and blocks traversal and symlink escapes', async () => {
    const { root, game } = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), 'workspace-agent-outside-'));
    await writeFile(path.join(outside, 'secret.ts'), 'secret');
    await symlink(outside, path.join(game, 'src', 'escape'), 'junction');
    let now = 1_000;
    running = await startWorkspaceAgent({
      workspaceRoot: root,
      allowedOrigins: [origin],
      pairingCode: '123456',
      tokenTtlMs: 100,
      now: () => now,
    });
    const token = String(((await (await pair(running.url)).json()) as { token: string }).token);
    const get = (file: string) =>
      fetch(`${running!.url}/repository/file?gameId=game-cultivation&path=${file}`, {
        headers: { Origin: origin, Authorization: `Bearer ${token}` },
      });
    expect((await get('../package.json')).status).toBe(400);
    expect((await get('src/escape/secret.ts')).status).toBe(400);
    now = 1_101;
    expect((await get('src/evil%26name.ts')).status).toBe(401);
  });

  it('returns game-organized source names as JSON data', async () => {
    const { root } = await fixture();
    running = await startWorkspaceAgent({
      workspaceRoot: root,
      allowedOrigins: [origin],
      pairingCode: '123456',
    });
    const token = String(((await (await pair(running.url)).json()) as { token: string }).token);
    const response = await fetch(`${running.url}/repository/tree`, {
      headers: { Origin: origin, Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      games: [
        { id: 'game-cultivation', files: [{ name: 'src', children: [{ name: 'evil&name.ts' }] }] },
      ],
    });
  });

  it('reviews and saves an allowed source with optimistic concurrency', async () => {
    const { root, game } = await fixture();
    const request = await pairedAgent(root);
    const file = await request(
      '/repository/file?gameId=game-cultivation&path=src%2Fevil%26name.ts',
    );
    expect(file.status).toBe(200);
    const current = (await file.json()) as { version: string };
    const change = {
      gameId: 'game-cultivation',
      path: 'src/evil&name.ts',
      source: 'export const safe = false;\n',
      baseVersion: current.version,
    };

    const review = await request('/repository/diff', {
      method: 'POST',
      body: JSON.stringify(change),
    });
    expect(review.status).toBe(200);
    expect(await review.json()).toMatchObject({
      stale: false,
      files: [{ path: 'apps/game-cultivation/src/evil&name.ts', added: 1, removed: 1 }],
    });

    const saved = await request('/repository/file', {
      method: 'POST',
      body: JSON.stringify({ ...change, confirmation: true }),
    });
    expect(saved.status).toBe(200);
    expect(await readFile(path.join(game, 'src', 'evil&name.ts'), 'utf8')).toBe(change.source);
    expect(await saved.json()).toMatchObject({ source: change.source, format: { ok: true } });

    const conflict = await request('/repository/file', {
      method: 'POST',
      body: JSON.stringify({
        ...change,
        source: 'export const newer = true;\n',
        confirmation: true,
      }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: 'VERSION_CONFLICT' });
  });

  it('rejects unconfirmed, binary, invalid-format, and symlink writes', async () => {
    const { root, game } = await fixture();
    await mkdir(path.join(game, 'actual'));
    await writeFile(path.join(game, 'actual', 'target.ts'), 'export const target = true;\n');
    await symlink(path.join(game, 'actual'), path.join(game, 'src', 'linked'), 'junction');
    const request = await pairedAgent(root);
    const source = 'export const safe = true;\n';
    const version = (
      (await (
        await request('/repository/file?gameId=game-cultivation&path=src%2Fevil%26name.ts')
      ).json()) as { version: string }
    ).version;
    for (const [body, error] of [
      [
        { gameId: 'game-cultivation', path: 'src/evil&name.ts', source, baseVersion: version },
        'CONFIRMATION_REQUIRED',
      ],
      [
        {
          gameId: 'game-cultivation',
          path: 'src/evil&name.ts',
          source: 'binary\u0000',
          baseVersion: version,
          confirmation: true,
        },
        'BINARY_CONTENT',
      ],
      [
        {
          gameId: 'game-cultivation',
          path: 'src/evil&name.ts',
          source: 'no newline',
          baseVersion: version,
          confirmation: true,
        },
        'FORMAT_INVALID',
      ],
    ] as const) {
      const response = await request('/repository/file', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error });
    }
    const linked = await request(
      '/repository/file?gameId=game-cultivation&path=src%2Flinked%2Ftarget.ts',
    );
    expect(linked.status).toBe(400);
  });
});
