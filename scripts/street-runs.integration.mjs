import assert from 'node:assert/strict';
import { getLevels } from '../games/local/cops-robbers-realtime/src/levels.js';
import {
  createGame,
  startGame,
  stepGame,
  commandCop,
} from '../games/local/cops-robbers-realtime/src/engine.js';

export async function verifyStreetRunHttp(base) {
  async function request(path, token, body, status = 200) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  const player = await request('/sessions/guest', null, {});
  const other = await request('/sessions/guest', null, {});
  const config = {
    version: 'street-solo-v2',
    mode: 'quick',
    role: 'cop',
    level: 1,
    rule: 'standard',
    first: 'simultaneous',
  };
  const url = '/runs/cops-robbers-realtime?' + new URLSearchParams(config);
  await request(url, null, undefined, 401);
  const game = createGame(getLevels('quick')[0]);
  startGame(game);
  const trace = { ticks: 0, orders: [] };
  while (game.phase === 'playing' && trace.ticks < 1200) {
    for (const actor of [0, 1])
      if (trace.ticks === 60 + actor * 30) {
        const order = { tick: trace.ticks, type: 'move', actor, x: 500, y: 300 };
        assert.ok(commandCop(game, actor, order));
        trace.orders.push(order);
      }
    stepGame(game, 1 / 60);
    trace.ticks++;
  }
  await request(url, player.token, { ...trace, ticks: 1 }, 422);
  await request(url, player.token, { ...trace, score: 0 }, 422);
  const accepted = await request(url, player.token, trace);
  const again = await request(url, player.token, trace);
  assert.equal(again.personalMs, Math.round((trace.ticks * 1000) / 60));
  assert.equal(
    again.top.filter((row) => row.playerId === player.playerId).length,
    1,
    'retry is idempotent',
  );
  assert.ok(accepted.fastestMs <= accepted.personalMs);
  const publicView = await request(url, other.token);
  assert.equal(publicView.personalMs, null);
  assert.ok(publicView.top.some((row) => row.playerId === player.playerId));
  assert.equal((await request(url.replace('level=1', 'level=2'), player.token)).personalMs, null);
  await request(url + '&untrusted=1', player.token, undefined, 422);
  console.log(
    'Street HTTP/database: authenticated replay, tamper rejection, idempotent best, other-player visibility and separate levels passed',
  );
}
if (process.argv[1]?.endsWith('street-runs.integration.mjs'))
  await verifyStreetRunHttp(
    process.env.COMPETITION_API_URL || 'http://127.0.0.1:43705/api/competition/v1',
  );
