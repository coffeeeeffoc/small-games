import { spawn } from 'node:child_process';
import { once } from 'node:events';

/** Bootstrap passwords belong only to the initializer, never to build/service children. */
export function childEnvironment(env = process.env) {
  const copy = { ...env };
  delete copy.STUDIO_ADMIN_PASSWORD;
  delete copy.ARTIFACT_SIGNING_PRIVATE_KEY;
  return copy;
}

/** Runs one prerequisite with sanitized environment and propagates its failure. */
export async function runCommand(command, args, { cwd, input } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: childEnvironment(),
    stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
  });
  let inputError;
  if (input) {
    child.stdin.on('error', (error) => {
      inputError = error;
    });
    child.stdin.end(input);
  }
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${command} failed (${code})`);
  if (inputError) throw new Error('Could not provide prerequisite input', { cause: inputError });
}

/** Runs direct children as one group; any failure reaps peers, including stuck peers. */
export async function runProcessGroup(
  entries,
  { cwd, signal, graceMs = 3000, stdio = 'inherit' } = {},
) {
  const children = [];
  const completions = [];
  let stopping = false;
  let failure;
  let deadline;
  function stop() {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    deadline = setTimeout(() => {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
    }, graceMs);
  }
  signal?.addEventListener('abort', stop, { once: true });
  try {
    if (signal?.aborted) return;
    for (const entry of entries) {
      const child = spawn(entry.command, entry.args, {
        cwd,
        env: childEnvironment(entry.env),
        stdio,
      });
      children.push(child);
      completions.push(
        new Promise((resolve) => {
          child.once('error', (error) => {
            failure ??= error;
            stop();
          });
          child.once('close', (code) => {
            if (!stopping) {
              failure ??= new Error(`Platform child exited unexpectedly (${code})`);
              stop();
            }
            resolve();
          });
        }),
      );
    }
    await Promise.all(completions);
    if (failure) throw failure;
  } finally {
    stop();
    await Promise.all(completions);
    clearTimeout(deadline);
    signal?.removeEventListener('abort', stop);
  }
}
