import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function launch(t: TestContext, port: number, inheritedPort: number, share = false) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(inheritedPort),
    KART_SERVER_PORT: String(port),
    KART_SERVER_URL: 'wss://rooms.example.test/kart',
  };
  delete env.KART_ALLOWED_ORIGINS;
  const child = spawn(
    process.execPath,
    share ? ['src/share.ts', 'https://rooms.example.test'] : ['src/main.ts'],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  });
  for (let i = 0; i < 500; i++) {
    const match = output.match(/Server listening at http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) return { port: Number(match[1]), child };
    if (child.exitCode !== null) throw new Error(`Startup failed: ${output}`);
    await delay(20);
  }
  throw new Error('Server did not start within 10 seconds');
}

test(
  'launcher ignores unrelated PORT and never switches ports when occupied',
  { timeout: 15000 },
  async (t) => {
    const port = await freePort();
    const unrelated = await freePort();
    const started = await launch(t, port, unrelated);
    assert.equal(started.port, port, 'The tunnel target must not follow an unrelated PORT');
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    await assert.rejects(launch(t, port, unrelated), /端口 .* 已被占用/);
  },
);

test(
  'normal launcher permits configured public room creation and rejects other origins',
  { timeout: 15000 },
  async (t) => {
    const port = await freePort();
    await launch(t, port, port);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/kart`, {
      origin: 'https://rooms.example.test',
    });
    t.after(() => socket.terminate());
    await once(socket, 'open');
    const message = once(socket, 'message');
    socket.send(
      JSON.stringify({
        type: 'create',
        version: 2,
        name: '测试车手',
        vehicle: 'classic-kart',
        driver: 'rookie',
        theme: 'seaside',
        route: 'seaside',
        bots: 0,
      }),
    );
    assert.equal(JSON.parse(String((await message)[0])).type, 'joined');
    socket.send(JSON.stringify({ type: 'leave' }));
    const rejected = new WebSocket(`ws://127.0.0.1:${port}/kart`, {
      origin: 'https://unrelated.example.test',
    });
    t.after(() => rejected.terminate());
    await assert.rejects(once(rejected, 'open'), /socket hang up|Unexpected server response/);
  },
);

test(
  'share uses the same dedicated port and permits its local page origin',
  { timeout: 15000 },
  async (t) => {
    const port = await freePort();
    const started = await launch(t, port, await freePort(), true);
    assert.equal(started.port, port);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/kart`, {
      origin: `http://127.0.0.1:${port}`,
    });
    t.after(() => socket.terminate());
    await once(socket, 'open');
  },
);
