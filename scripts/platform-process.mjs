import { spawn } from 'node:child_process';

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
      const child = spawn(entry.command, entry.args, { cwd, env: entry.env, stdio });
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
