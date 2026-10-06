import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createTianxiaServer } from '../src/server.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'tianxia-smoke-'));
const app = await createTianxiaServer({ dataDir: directory });
try {
  const address = await app.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const created = await fetch(`${base}/api/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ levelId: 'crossroads' }),
  });
  assert.equal(created.status, 201);
  const { matchId, token, snapshot } = await created.json();
  const own = snapshot.state.junctions.find((junction) => junction.owner === 0);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  await delay(350);
  const running = await (await fetch(`${base}/api/matches/${matchId}`, { headers })).json();
  assert.ok(running.snapshot.state.time >= 0.1, 'real scheduler advances the match');
  for (const [action, body] of [
    ['commands', { junctionId: own.id, sequence: 1 }],
    ['pause', {}],
    ['resume', {}],
    ['abandon', {}],
  ]) {
    const response = await fetch(`${base}/api/matches/${matchId}/${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, action);
  }
  const report = await (await fetch(`${base}/api/matches/${matchId}/result`, { headers })).json();
  assert.equal(report.result.reason, 'abandoned');
  assert.equal(report.persisted, true);
  console.log('天下岔路 HTTP 实测：建局、鉴权、切路、暂停、继续、结束与持久化查询通过');
} finally {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
