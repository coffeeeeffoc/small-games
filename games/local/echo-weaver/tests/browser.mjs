import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Python Playwright keeps this standalone game's browser checks independent of
// the monorepo's JavaScript dependencies. Install it with pip install playwright.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.GAME_PORT || '4413';
const url = process.env.GAME_URL || `http://127.0.0.1:${port}/`;
let server;
let runner;
let output = '';

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited ${signal || code}`));
    });
    if (command !== process.execPath) runner = child;
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  if (!(await Promise.race([exited.then(() => true), delay(2000).then(() => false)]))) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function start() {
  if (process.env.GAME_URL) return;
  await run(process.execPath, ['build.mjs']);
  server = spawn(
    process.execPath,
    ['server.mjs', '--dist', '--host', '127.0.0.1', '--port', port],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let startupError;
  server.once('error', (error) => {
    startupError = error;
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-4000);
    });
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error(`Preview server stopped: ${output}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* Wait for the server, with a bounded startup deadline. */
    }
    await delay(100);
  }
  throw new Error(`Preview server did not start: ${output}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await stop(runner);
    await stop(server);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

try {
  await start();
  await run(process.env.PYTHON || 'python3', ['tests/browser-check.py', url]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stop(runner);
  await stop(server);
}
