import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { childEnvironment } from './platform-process.mjs';
import { competitionConsumers } from './publication-scopes.mjs';

export async function executeCompetitionChecks({
  plan,
  root = process.cwd(),
  env = process.env,
  execute = async (args, environment) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: childEnvironment(environment),
      stdio: 'inherit',
    });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`${args[0]} failed (${code})`)),
      );
    });
  },
  serve = async () => {
    const { preview } = await import('vite');
    const server = await preview({
      root: path.join(root, competitionConsumers['letters-words2']),
      build: { outDir: 'dist' },
      preview: { host: '127.0.0.1', port: 0 },
    });
    return {
      url: `http://127.0.0.1:${server.httpServer.address().port}/`,
      close: () => server.close(),
    };
  },
}) {
  assert(plan && ['h5', 'native', 'letters'].every((key) => typeof plan[key] === 'boolean'));
  const environment = {
    ...env,
    ...(env.PLAYWRIGHT_EXECUTABLE_PATH && !env.PLAYWRIGHT_EXECUTABLE
      ? { PLAYWRIGHT_EXECUTABLE: env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  };
  if (plan.native) {
    for (const id of Object.keys(competitionConsumers)) {
      await execute(['scripts/competition-build.mjs', '--native', `--game=${id}`], environment);
      await execute(['scripts/competition-native-smoke.mjs', `--game=${id}`], environment);
    }
  }
  if (plan.h5) await execute(['scripts/test-competition-dialogs.mjs'], environment);
  if (plan.letters) {
    await execute(['scripts/letters-words2-competition-renderer.test.mjs'], environment);
    await execute(['scripts/letters-words2-competition-mobile.browser.mjs'], environment);
    const server = await serve();
    try {
      await execute(['scripts/letters-words2-iframe.browser.mjs'], {
        ...environment,
        GAME_URL: server.url,
      });
    } finally {
      await server.close();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await executeCompetitionChecks({ plan: JSON.parse(process.argv[2]) });
