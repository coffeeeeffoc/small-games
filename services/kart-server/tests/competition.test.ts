import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCompetition, rankedBoard } from '../src/competition.ts';

test('outbox survives restart and retries the same result after HTTP failure', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kart-outbox-'));
  const key = 'a'.repeat(32);
  let available = false;
  const received: unknown[] = [];
  const server = createServer(async (req, res) => {
    assert.equal(req.headers['x-competition-internal-key'], key);
    if (!available) {
      res.writeHead(503).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/competition/v1`;
  const result = {
    matchId: randomUUID(),
    board: rankedBoard,
    entries: [],
    startedAt: 1000,
    finishedAt: 2000,
  };
  let integration = await createCompetition({ url, key, directory });
  try {
    await integration.settle(result);
    await integration.flush();
    assert.deepEqual(await readdir(directory), [`${result.matchId}.json`]);
    await integration.close();
    available = true;
    integration = await createCompetition({ url, key, directory });
    assert.deepEqual(received, [result]);
    assert.equal(integration.saved(result.matchId), true);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await integration.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
