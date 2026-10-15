import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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

function installedBrowserPaths(env) {
  if (process.platform === 'win32')
    return [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]
      .filter(Boolean)
      .flatMap((directory) => [
        join(directory, 'Google/Chrome/Application/chrome.exe'),
        join(directory, 'Microsoft/Edge/Application/msedge.exe'),
      ]);
  if (process.platform === 'darwin')
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
}

export function createBrowserPreparation({
  root,
  env,
  execute = run,
  withDeps = false,
  reuseInstalled = false,
  installedExecutables = () => installedBrowserPaths(env),
  browserExecutable = () =>
    execute(
      process.execPath,
      ['-e', "process.stdout.write(require('@playwright/test').chromium.executablePath())"],
      root,
      env,
      true,
    ),
}) {
  let ready = false;
  return () => {
    if (ready) return;
    const explicit = env.PLAYWRIGHT_EXECUTABLE_PATH || env.CHROMIUM_PATH;
    const executable = explicit || browserExecutable();
    assert(
      typeof executable === 'string' && executable.length > 0,
      'Missing installed Chromium executable path',
    );
    if (!explicit && reuseInstalled) {
      for (const candidate of new Set([executable, ...installedExecutables()])) {
        if (!existsSync(candidate)) continue;
        const candidateEnv = {
          ...env,
          CHROMIUM_PATH: candidate,
          PLAYWRIGHT_EXECUTABLE_PATH: candidate,
        };
        try {
          execute(process.execPath, ['-e', launchCheck], root, candidateEnv, true);
        } catch {
          console.warn(`Browser cannot start, trying the next installed browser: ${candidate}`);
          continue;
        }
        env.CHROMIUM_PATH = env.PLAYWRIGHT_EXECUTABLE_PATH = candidate;
        console.log(`Reusing launch-checked browser: ${candidate}`);
        ready = true;
        return;
      }
    }
    if (!explicit && (!existsSync(executable) || reuseInstalled))
      execute(
        'pnpm',
        [
          'exec',
          'playwright',
          'install',
          ...(withDeps ? ['--with-deps'] : []),
          ...(reuseInstalled && existsSync(executable) ? ['--force'] : []),
          'chromium',
        ],
        root,
        env,
      );
    env.CHROMIUM_PATH ||= executable;
    env.PLAYWRIGHT_EXECUTABLE_PATH ||= executable;
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createBrowserPreparation({
    root: process.cwd(),
    env: process.env,
    reuseInstalled: process.argv.includes('--reuse-installed'),
  })();
  console.log(JSON.stringify({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }));
}
