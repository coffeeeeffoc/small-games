import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { run } from './validate-push.mjs';

const launchCheck = `
const { chromium } = require('@playwright/test');
(async () => {
  for (const executablePath of new Set([process.env.CHROMIUM_PATH, process.env.PLAYWRIGHT_EXECUTABLE_PATH])) {
    const browser = await chromium.launch({ channel: 'chromium', executablePath, headless: true, timeout: 15000 });
    await browser.close();
  }
  console.log('Chromium launch preflight passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
`;

export function createBrowserPreparation({
  root,
  env,
  execute = run,
  withDeps = false,
  browserExecutable = () =>
    createRequire(path.join(root, 'package.json'))('@playwright/test').chromium.executablePath(),
}) {
  let ready = false;
  return () => {
    if (ready) return;
    execute(
      'pnpm',
      ['exec', 'playwright', 'install', ...(withDeps ? ['--with-deps'] : []), 'chromium'],
      root,
      env,
    );
    if (!env.CHROMIUM_PATH || !env.PLAYWRIGHT_EXECUTABLE_PATH) {
      const executable = env.PLAYWRIGHT_EXECUTABLE_PATH || env.CHROMIUM_PATH || browserExecutable();
      assert(
        typeof executable === 'string' && executable.length > 0,
        'Missing installed Chromium executable path',
      );
      env.CHROMIUM_PATH ||= executable;
      env.PLAYWRIGHT_EXECUTABLE_PATH ||= executable;
    }
    try {
      execute(process.execPath, ['-e', launchCheck], root, env, 'logged');
    } catch (error) {
      throw new Error(
        `Chromium launch preflight failed before browser validation: ${error.message}`,
        {
          cause: error,
        },
      );
    }
    ready = true;
  };
}
