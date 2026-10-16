import { spawn, spawnSync } from 'node:child_process';

// Only this finite wire vocabulary may cross a secret-bearing SSH boundary.
export const adminStages = new Set([
  'preflight',
  'database_guard',
  'database_backup',
  'database_restore',
  'database_migration',
  'game_restore',
  'private_configuration',
  'image_build',
  'service_start',
  'https_probe',
  'pointer_switch',
  'rollback',
  'complete',
]);
export const adminFailures = new Set([
  'COMMAND_FAILED',
  'COMMAND_TIMEOUT',
  'SIGNAL_INTERRUPTED',
  'HTTPS_PROBE',
  'OAUTH_PROBE',
  'COOKIE_PROBE',
  'COMPOSE_RAW_UNSUPPORTED',
  'ACTIVE_GAME',
  'UNKNOWN_DATABASE_WRITER',
  'GAME_RESTART_FAILED',
  'PROTECTED_CONTAINER_CHANGED',
  'PROTECTED_POINTER_CHANGED',
  'MANAGEMENT_BOUNDARY',
  'UNKNOWN_MANAGEMENT_SERVICE',
  'PRIVATE_FILE',
  'PRIVATE_DIRECTORY',
  'DATABASE_IDENTITY',
  'PUBLIC_PRIVILEGES',
  'PRODUCTION_PERMISSION_PROOF',
  'UNEXPECTED_FAILURE',
  'UI_MOUNT_REQUIRED',
]);

export function remoteDiagnostic(line) {
  const stage = /^ADMIN_REMOTE_(?:STAGE|FAILED_STAGE) ([a-z_]+)$/.exec(line);
  if (stage && adminStages.has(stage[1])) return { stage: stage[1] };
  const failure = /^ADMIN_REMOTE_STOPPED ([A-Z_]+)$/.exec(line);
  if (failure)
    return { failure: adminFailures.has(failure[1]) ? failure[1] : 'REMOTE_GUARD_FAILED' };
  return null;
}

export async function deploymentCommand(
  program,
  args,
  {
    cwd,
    env,
    input,
    timeout = 180000,
    prefix = 'DEPLOY',
    stage = 'command',
    heartbeat = 15000,
    output = console.log,
    remote = false,
  } = {},
) {
  const start = Date.now();
  output(`${prefix}_STAGE ${stage} started`);
  return await new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: 'pipe',
    });
    let stdout = '',
      line = '',
      remoteStage = 'preflight',
      remoteFailure = null,
      timedOut = false,
      finished = false,
      forceTimer,
      abandonTimer;
    const stopOwnedTree = (signal) => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          env,
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
          timeout: 5000,
        });
      } else {
        try {
          process.kill(-child.pid, signal);
        } catch {
          /* The owned group may already have exited. */
        }
      }
    };
    const progress = setInterval(
      () =>
        output(
          `${prefix}_WAIT ${stage}${remote ? ` remote=${remoteStage}` : ''} elapsed=${Math.floor((Date.now() - start) / 1000)}s`,
        ),
      heartbeat,
    );
    const deadline = setTimeout(() => {
      timedOut = true;
      stopOwnedTree('SIGTERM');
      forceTimer = setTimeout(() => {
        stopOwnedTree('SIGKILL');
        abandonTimer = setTimeout(() => {
          child.stdin.destroy();
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
          finish(null, null, 'SIGKILL');
        }, 1000);
      }, 1000);
    }, timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 8 * 1024 * 1024) stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      // Never retain, print, or forward raw diagnostics/headers/configuration.
      for (const character of chunk) {
        if (character === '\n') {
          const value = remote && remoteDiagnostic(line.replace(/\r$/, ''));
          if (value?.stage) {
            remoteStage = value.stage;
            output(`${prefix}_REMOTE_STAGE ${remoteStage}`);
          }
          if (value?.failure) remoteFailure = value.failure;
          line = '';
        } else if (line.length < 128) line += character;
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    const finish = (error, code, signal) => {
      if (finished) return;
      finished = true;
      if (timedOut) stopOwnedTree('SIGKILL');
      clearInterval(progress);
      clearTimeout(deadline);
      clearTimeout(forceTimer);
      clearTimeout(abandonTimer);
      const elapsed = Math.floor((Date.now() - start) / 1000);
      if (timedOut || error || code !== 0) {
        const category = timedOut
          ? 'TIMEOUT'
          : remoteFailure
            ? 'REMOTE_FAILED'
            : remote
              ? 'SSH_FAILED'
              : 'TOOL_FAILED';
        output(
          `${prefix}_FAILED ${stage} category=${category}${remote ? ` remote=${remoteStage} reason=${remoteFailure ?? 'UNREPORTED'}` : ''} exit=${Number.isInteger(code) ? code : 'none'} elapsed=${elapsed}s`,
        );
        const failure = new Error(category);
        failure.stage = stage;
        failure.remoteStage = remoteStage;
        failure.remoteFailure = remoteFailure;
        failure.signal = signal;
        reject(failure);
      } else {
        output(`${prefix}_STAGE ${stage} complete elapsed=${elapsed}s`);
        resolve(stdout);
      }
    };
    child.once('error', (error) => finish(error));
    child.once('close', (code, signal) => finish(null, code, signal));
  });
}
