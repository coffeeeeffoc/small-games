import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { prepareH5Service } from '../../../scripts/competition-h5-service.mjs';
import { tapServicesVariable } from '../../../scripts/taptap-services-config.mjs';
const repo = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const evidence = path.resolve(
  process.env.TAP_SERVICES_EVIDENCE_ROOT || path.join(repo, 'outputs/taptap-services'),
);
await mkdir(evidence, { recursive: true });
const fixtureConfig = (game, native = false) => ({
  enabled: true,
  appConsoleId: native ? '800002' : '800001',
  appId: `tapfixture_${native ? 'native' : 'h5'}_${game}`,
  leaderboardId: native ? 'nativefixtureboard' : 'h5fixtureboard',
});
const paths = {
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'xiangqi-five': 'games/submodules/xiangqi-five',
};
for (const [game, directory] of Object.entries(paths)) {
  const env = {
    ...process.env,
    COMPETITION_SERVICE_ENABLED: '0',
    H5_ADS_ENABLED: '0',
    [tapServicesVariable(game)]: JSON.stringify(fixtureConfig(game)),
  };
  execFileSync(
    process.execPath,
    [game === 'xiangqi-five' ? 'build.js' : 'scripts/build.mjs', '--without-service'],
    { cwd: path.join(repo, directory), env, stdio: 'pipe' },
  );
  if (game === 'xiangqi-five')
    await prepareH5Service(game, path.join(repo, directory, 'dist'), { env });
}
const entries = {
  'cops-robbers': ['/games/minigames/cops-robbers/controller.mjs', 'startCocosCopsGame'],
  'cops-robbers-realtime': [
    '/games/local/cops-robbers-realtime/src/native.js',
    'startNativeStreetGame',
  ],
  'xiangqi-five': ['/platforms/competition/xiangqi-five/native.js', 'startNativeXiangqiGame'],
};
function nativeHtml(game) {
  const [entry, start] = entries[game];
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none}</style><canvas id="screen"></canvas><script type="module">
import {${start} as start} from '${entry}';import {createBrowserTapSdk} from '/platforms/taptap/browser-entry.mjs';
const canvas=document.querySelector('canvas'),bridge=createBrowserTapSdk(canvas),base=bridge.sdk;
const sdk=new Proxy(base,{get(target,key){if(key==='createCanvas')return()=>canvas;if(key==='createImage')return()=>new Image();if(key==='getStorageSync')return key=>localStorage.getItem(key);if(key==='setStorageSync')return(key,value)=>localStorage.setItem(key,value);return target[key];}});
globalThis.__nativeGame=start(sdk,{game:${JSON.stringify(game)},platform:'taptap',adMode:'off',tapServices:${JSON.stringify(fixtureConfig(game, true))}});
globalThis.__tapSnapshot=()=>__nativeGame.getTapServiceState();
</script>`;
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/native') {
      res.setHeader('content-type', 'text/html');
      res.end(nativeHtml(url.searchParams.get('game')));
      return;
    }
    let file = path.resolve(repo, '.' + decodeURIComponent(url.pathname));
    assert(file.startsWith(repo + path.sep));
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader(
      'content-type',
      {
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.html': 'text/html',
        '.css': 'text/css',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
try {
  for (const type of ['h5', 'native'])
    for (const game of Object.keys(paths))
      for (const small of game === 'cops-robbers-realtime' ? [false, true] : [false]) {
        const viewport =
          game === 'cops-robbers-realtime'
            ? small
              ? { width: 568, height: 320 }
              : { width: 844, height: 390 }
            : { width: 390, height: 844 };
        const context = await browser.newContext({
          viewport,
          hasTouch: true,
          deviceScaleFactor: 1,
        });
        const page = await context.newPage(),
          errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => {
          const files = new Map(),
            rows = [];
          globalThis.__tapFixture = { login: 0, upload: 0, board: 0, score: 0 };
          globalThis.tap = {
            getSystemInfoSync: () => ({
              windowWidth: innerWidth,
              windowHeight: innerHeight,
              pixelRatio: 1,
              safeArea: { left: 8, top: 12, right: innerWidth - 8, bottom: innerHeight - 12 },
            }),
            getMenuButtonBoundingClientRect: () => ({ bottom: 32 }),
            login(o) {
              __tapFixture.login++;
              if (!globalThis.__delayTapLogin) o.success({ code: 'fixture-only' });
              else globalThis.__finishTapLogin = o.success;
            },
            env: { USER_DATA_PATH: '/fixture' },
            getFileSystemManager: () => ({
              writeFile(o) {
                files.set(o.filePath, o.data);
                o.success();
              },
              readFile(o) {
                o.success({ data: files.get(o.filePath) });
              },
            }),
            getCloudSaveManager: () => ({
              getArchiveList(o) {
                o.success({ saves: rows.slice() });
              },
              createArchive(o) {
                __tapFixture.upload++;
                rows.push({
                  ...o.archiveMetaData,
                  uuid: 'fixture',
                  fileId: 'one',
                  modifiedTime: 100,
                });
                files.set('cloud', files.get(o.archiveFilePath));
                o.success({ uuid: 'fixture', fileId: 'one' });
              },
              getArchiveData(o) {
                o.success({ filePath: 'cloud' });
              },
            }),
            getLeaderboardManager: () => ({
              openLeaderboard(o) {
                __tapFixture.board++;
                o.callback.onSuccess({});
              },
              submitScores(o) {
                __tapFixture.score++;
                o.callback.onSuccess({});
              },
            }),
          };
        });
        try {
          await page.goto(
            `http://127.0.0.1:${server.address().port}${type === 'h5' ? '/' + paths[game] + '/dist/' : '/native?game=' + game}`,
          );
          if (type === 'h5') {
            await page.locator('#taptap-services').tap();
            await page.evaluate(() => {
              globalThis.__tapSnapshot = () => __tapServiceScreen.getSnapshot();
            });
          } else {
            await page.waitForFunction(() => globalThis.__nativeGame);
            const hit = await page.evaluate(() => {
              const layout = __nativeGame.getLayout?.() || __nativeGame.getState();
              return layout.hits.find(
                (hit) => hit.id === 'tap-services' || hit.label === 'TapTap 小站',
              );
            });
            assert(hit, `${game} actual home has Tap entry`);
            const offset = game === 'cops-robbers-realtime' ? { x: 8, y: 32 } : { x: 0, y: 0 };
            await page.touchscreen.tap(hit.x + hit.w / 2 + offset.x, hit.y + hit.h / 2 + offset.y);
          }
          await page.waitForFunction(() => globalThis.__tapSnapshot?.());
          const click = async (id) => {
            const hit = await page.evaluate(
              (id) => __tapSnapshot().hits.find((hit) => hit.id === id),
              id,
            );
            assert(hit, `${game}/${type} ${id}`);
            assert(hit.y + hit.h <= viewport.height - 44, `${id} fits safe canvas`);
            await page.touchscreen.tap(hit.x + hit.w / 2 + 8, hit.y + hit.h / 2 + 32);
          };
          await page.screenshot({
            path: path.join(evidence, `actual-${type}-${game}${small ? '-568' : ''}.png`),
          });
          await click('connect');
          await page.waitForFunction(() => __tapSnapshot().connected && !__tapSnapshot().pending);
          await click('upload');
          await page.waitForFunction(() => !__tapSnapshot().pending);
          assert.equal(await page.evaluate(() => __tapFixture.upload), 1);
          await click('cloud');
          await page.waitForFunction(() => __tapSnapshot().hits.some((hit) => hit.id === 'save-0'));
          await click('save-0');
          await page.waitForFunction(() => __tapSnapshot().preview);
          await click('restore');
          await page.waitForFunction(() => !__tapSnapshot().pending && !__tapSnapshot().preview);
          await click('score');
          await click('submit');
          await page.waitForFunction(() => !__tapSnapshot().pending);
          assert.equal(await page.evaluate(() => __tapFixture.score), 1);
          assert.equal(await page.evaluate(() => __tapFixture.board), 1);
          await click('exit');
          if (type === 'h5')
            assert.equal(await page.locator('canvas[aria-label="TapTap 小站"]').count(), 0);
          else
            assert.equal(await page.evaluate(() => __nativeGame.getTapServiceState()), undefined);
          if (type === 'h5' && game === 'xiangqi-five') {
            await page.evaluate(async () => {
              const { newGame, deployDirectly } = await import(
                '/games/submodules/xiangqi-five/dist/game.js'
              );
              const { encodeGame } = await import(
                '/games/submodules/xiangqi-five/dist/local-game.js'
              );
              const blackTurn = newGame();
              deployDirectly(blackTurn, 0, () => 0);
              __tapGamePort.restore({
                local: encodeGame(blackTurn, 'computer', 'standard'),
                progress: {},
              });
              __tapGamePort.resume();
              globalThis.Worker = class {
                constructor() {
                  globalThis.__lateWorker = this;
                }
                postMessage(value) {
                  this.input = value;
                }
                terminate() {}
              };
            });
            await page.locator('#home-continue').tap();
            await page.waitForFunction(() => globalThis.__lateWorker?.input);
            await page.locator('#game-back').tap();
            await page.locator('#taptap-services').tap();
            await click('cloud');
            await page.waitForFunction(() =>
              __tapSnapshot().hits.some((hit) => hit.id === 'save-0'),
            );
            await click('save-0');
            await page.waitForFunction(() => __tapSnapshot().preview);
            await click('restore');
            await page.waitForFunction(() => !__tapSnapshot().pending);
            const restored = await page.evaluate(() =>
              localStorage.getItem('xiangqi-five-local-v1'),
            );
            await page.evaluate(() =>
              __lateWorker.onmessage({ data: { action: { type: 'deploy', to: 1 } } }),
            );
            assert.equal(
              await page.evaluate(() => localStorage.getItem('xiangqi-five-local-v1')),
              restored,
            );
            await click('exit');
            await page.evaluate(() =>
              __lateWorker.onmessage({ data: { action: { type: 'deploy', to: 1 } } }),
            );
            assert.equal(await page.evaluate(() => __tapGamePort.export().local), restored);
          }
          if (type === 'h5') {
            await page.evaluate(() => {
              globalThis.__delayTapLogin = true;
            });
            await page.locator('#taptap-services').tap();
            await click('connect');
            await page.waitForFunction(() => __tapSnapshot().pending);
            await click('exit');
            assert.equal(await page.locator('canvas[aria-label="TapTap 小站"]').count(), 0);
            await page.evaluate(() => __finishTapLogin({ code: 'retired' }));
            await page.evaluate(() => {
              globalThis.__delayTapLogin = false;
              Object.defineProperty(globalThis, 'localStorage', {
                configurable: true,
                get() {
                  throw Error('storage disabled');
                },
              });
            });
            await page.locator('#taptap-services').tap();
            await click('exit');
            assert.equal(await page.locator('canvas[aria-label="TapTap 小站"]').count(), 0);
          }
          assert.deepEqual(errors, [], `${game}/${type} browser errors`);
          console.log(
            `PASS ${game}/${type} ${viewport.width}x${viewport.height} real home→login→upload→restore→score→exit`,
          );
        } finally {
          await context.close();
        }
      }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
