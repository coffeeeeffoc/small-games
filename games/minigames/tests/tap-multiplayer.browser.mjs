import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { prepareH5Service } from '../../../scripts/competition-h5-service.mjs';
import { tapServicesVariable } from '../../../scripts/taptap-services-config.mjs';
import { createBattleHub } from './tap-multiplayer-fixture.mjs';

const repo = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const evidence = path.resolve(
  process.env.TAP_MULTIPLAYER_EVIDENCE_ROOT || path.join(repo, 'outputs/taptap-multiplayer'),
);
await mkdir(evidence, { recursive: true });
const paths = {
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'xiangqi-five': 'games/submodules/xiangqi-five',
};
const settings = (game) => ({
  enabled: true,
  appConsoleId: '800001',
  appId: `tapfixture_${game}`,
  leaderboardId: 'fixtureboard',
});
for (const [game, directory] of Object.entries(paths)) {
  const env = {
    ...process.env,
    COMPETITION_SERVICE_ENABLED: '0',
    H5_ADS_ENABLED: '0',
    [tapServicesVariable(game)]: JSON.stringify(settings(game)),
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
  'cops-robbers': ['games/minigames/cops-robbers/controller.mjs', 'startCocosCopsGame'],
  'cops-robbers-realtime': [
    'games/local/cops-robbers-realtime/src/native.js',
    'startNativeStreetGame',
  ],
  'xiangqi-five': ['platforms/competition/xiangqi-five/native.js', 'startNativeXiangqiGame'],
};
function nativeHtml(game) {
  const [entry, start] = entries[game],
    directory = paths[game] + (game === 'xiangqi-five' ? '' : '/src');
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script type="module">
import {${start} as start} from '/${entry}';import {createBrowserTapSdk} from '/platforms/taptap/browser-entry.mjs';
import {startTapMultiplayerScreen} from '/platforms/taptap/multiplayer-screen.mjs';import {tapMultiplayer} from '/${directory}/tap-multiplayer.js';
const canvas=document.querySelector('canvas'),bridge=createBrowserTapSdk(canvas),base=bridge.sdk;
const sdk=new Proxy(base,{get(target,key){if(key==='createCanvas')return()=>canvas;if(key==='createImage')return()=>new Image();if(key==='getStorageSync')return key=>localStorage.getItem(key);if(key==='setStorageSync')return(key,value)=>localStorage.setItem(key,value);return target[key];}});
globalThis.__nativeGame=start(sdk,{game:${JSON.stringify(game)},platform:'taptap',adMode:'off',tapServices:${JSON.stringify(settings(game))},tapMultiplayer:options=>startTapMultiplayerScreen({...options,descriptor:tapMultiplayer})});
globalThis.__tapSnapshot=()=>__nativeGame.getTapServiceState();</script>`;
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture');
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
    for (const game of Object.keys(paths)) {
      const hub = createBattleHub(),
        pages = [],
        contexts = [],
        errors = [];
      const viewport =
        game === 'cops-robbers-realtime'
          ? { width: 844, height: 390 }
          : { width: 390, height: 844 };
      try {
        for (const player of ['owner/+=', 'friend/+=']) {
          const context = await browser.newContext({
            viewport,
            hasTouch: true,
            deviceScaleFactor: 1,
          });
          contexts.push(context);
          const page = await context.newPage();
          pages.push(page);
          page.on('pageerror', (error) => errors.push(error.message));
          hub.add(player, (name, data) =>
            page.evaluate(
              ({ name, data }) => {
                for (const listener of globalThis.__battleListeners) listener[name]?.(data);
              },
              { name, data },
            ),
          );
          await page.exposeBinding('__tapBattleCall', (_source, method, data) =>
            hub.call(player, method, data),
          );
          await page.addInitScript(() => {
            globalThis.__battleListeners = new Set();
            globalThis.__nativeHide = new Set();
            const manager = {
              registerListener: (listener) => __battleListeners.add(listener),
              unregisterListener: (listener) => __battleListeners.delete(listener),
            };
            for (const method of [
              'connect',
              'disconnect',
              'createRoom',
              'joinRoom',
              'leaveRoom',
              'sendCustomMessage',
              'updatePlayerCustomProperties',
            ])
              manager[method] = (options) =>
                __tapBattleCall(method, JSON.parse(JSON.stringify(options || {})));
            globalThis.tap = {
              login: (options) => options.success({ code: 'fixture-only' }),
              getOnlineBattleManager: () => manager,
              onHide: (listener) => __nativeHide.add(listener),
              offHide: (listener) => __nativeHide.delete(listener),
              setClipboardData: (options) => {
                globalThis.__copiedRoom = options.data;
                options.success?.({});
              },
              getSystemInfoSync: () => ({
                windowWidth: innerWidth,
                windowHeight: innerHeight,
                pixelRatio: 1,
                safeArea: { left: 8, top: 12, right: innerWidth - 8, bottom: innerHeight - 12 },
              }),
              getMenuButtonBoundingClientRect: () => ({ bottom: 32 }),
            };
          });
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
            const hit = await page.evaluate(() =>
              (__nativeGame.getLayout?.() || __nativeGame.getState()).hits.find(
                (hit) => hit.id === 'tap-services' || hit.label === 'TapTap 小站',
              ),
            );
            const offset = game === 'cops-robbers-realtime' ? { x: 8, y: 32 } : { x: 0, y: 0 };
            assert(hit);
            await page.touchscreen.tap(hit.x + hit.w / 2 + offset.x, hit.y + hit.h / 2 + offset.y);
          }
          await page.waitForFunction(() => __tapSnapshot?.());
          const hit = await page.evaluate(() =>
            __tapSnapshot().hits.find((hit) => hit.id === 'multiplayer'),
          );
          assert(hit, `${game}/${type} multiplayer entry`);
          await page.touchscreen.tap(hit.x + hit.w / 2 + 8, hit.y + hit.h / 2 + 32);
          await page.waitForFunction(() => __tapSnapshot().multiplayer?.phase === 'idle');
        }
        const child = (page) => page.evaluate(() => __tapSnapshot().multiplayer);
        const physical = (state, p) => ({
          x:
            state.left +
            (state.rotation > 0 ? state.physicalSafeWidth - p.y : state.rotation < 0 ? p.y : p.x),
          y:
            state.top +
            (state.rotation > 0 ? p.x : state.rotation < 0 ? state.physicalSafeHeight - p.x : p.y),
        });
        const tapAt = async (page, p) => {
          const state = await child(page);
          const q = physical(state, p);
          await page.touchscreen.tap(q.x, q.y);
        };
        const cell = async (page, index) => {
          for (let attempt = 0; attempt < 4; attempt++) {
            const state = await child(page),
              hit = state.boardHits.find((item) => item.index === index);
            if (hit) {
              assert.equal(hit.w, 44);
              assert.equal(hit.h, 44);
              return { hit, state };
            }
            const area = state.boardLayout.area,
              dx = index % 9 < 4 ? 100 : -100,
              dy = index < 45 ? 100 : -100;
            const from = {
                x: area.x + area.w / 2 - dx / 2,
                y: state.playTop + area.y + area.h / 2 - dy / 2,
              },
              to = { x: from.x + dx, y: from.y + dy };
            const cdp = await page.context().newCDPSession(page),
              before = state.state.ply;
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [{ ...physical(state, from), id: 1 }],
            });
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: [{ ...physical(state, to), id: 1 }],
            });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await cdp.detach();
            assert.equal(
              (await child(page)).state.ply,
              before,
              'dragging the board does not deploy',
            );
          }
          assert.fail(`cell ${index} reachable by real touch pan`);
        };
        const click = async (page, id) => {
          const state = await child(page),
            hit = state.hits.find((hit) => hit.id === id);
          assert(hit?.enabled, `${type}/${game}: ${id}`);
          assert(hit.y >= 0 && hit.y + hit.h <= state.height, `${id} safe area`);
          await tapAt(page, { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 });
        };
        const [owner, friend] = pages;
        await click(owner, 'create');
        await owner.waitForFunction(() => __tapSnapshot().multiplayer.phase === 'waiting');
        const roomId = (await child(owner)).roomId;
        await click(friend, 'room-input');
        const input = friend.getByRole('textbox', { name: '好友房间号' });
        await input.fill(roomId);
        await friend.getByRole('button', { name: '完成', exact: true }).tap();
        assert.equal((await child(friend)).roomInput, roomId);
        await click(friend, 'join');
        await friend.waitForFunction(() => __tapSnapshot().multiplayer.phase === 'waiting');
        await owner.screenshot({ path: path.join(evidence, `actual-${type}-${game}-room.png`) });
        await click(owner, 'ready');
        await click(friend, 'ready');
        for (const page of pages)
          await page.waitForFunction(() => __tapSnapshot().multiplayer.phase === 'playing');
        if (game === 'cops-robbers-realtime')
          await owner.waitForFunction(() => __tapSnapshot().multiplayer.state.tick >= 240);
        const streetHit = async (page, seat) =>
          await page.evaluate(async (seat) => {
            const { routePreview } = await import(
              '/games/local/cops-robbers-realtime/src/engine.js'
            );
            const s = __tapSnapshot().multiplayer;
            return s.boardHits.find(
              (hit) =>
                hit.action?.type === 'move' &&
                !s.boardHits.some(
                  (other) =>
                    other.action?.local !== undefined &&
                    hit.x + hit.w / 2 >= other.x &&
                    hit.x + hit.w / 2 <= other.x + other.w &&
                    hit.y + hit.h / 2 >= other.y &&
                    hit.y + hit.h / 2 <= other.y + other.h,
                ) &&
                routePreview(s.state.game, 0, hit.action, seat ? 'robber' : 'cop')?.length > 1,
            );
          }, seat);
        for (let seat = 0; seat < 2; seat++) {
          const page = pages[seat];
          let state = await child(page);
          let hit;
          if (game === 'cops-robbers')
            hit = state.boardHits.find((hit) => hit.label === '留守一步');
          else if (game === 'xiangqi-five') ({ hit, state } = await cell(page, seat ? 89 : 0));
          else hit = await streetHit(page, seat);
          assert(hit, `${type}/${game} seat ${seat} actual board hit`);
          const before = hub.messages.length;
          await tapAt(page, { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 + state.playTop });
          await page.waitForFunction(() => !__tapSnapshot().multiplayer.pending);
          await owner.waitForFunction(() => __tapSnapshot().multiplayer.seq > 0);
          // Wait for the actual accepted action, not merely an empty timer batch.
          const deadline = Date.now() + 4000;
          while (
            !hub.messages
              .slice(before)
              .some(
                (item) =>
                  item.value.k === 'commit' && item.value.a.some((entry) => entry.s === seat),
              )
          ) {
            assert(Date.now() < deadline, `${type}/${game} seat ${seat} action committed`);
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
        await owner.screenshot({ path: path.join(evidence, `actual-${type}-${game}-play.png`) });
        if (game === 'xiangqi-five') {
          for (const [size, target, peerTarget] of [
            [{ width: 320, height: 568 }, 8, 88],
            [{ width: 568, height: 320 }, 81, 87],
          ]) {
            await owner.setViewportSize(size);
            const { hit, state } = await cell(owner, target),
              ply = state.state.ply;
            await tapAt(owner, { x: hit.x + 22, y: state.playTop + hit.y + 22 });
            await owner.waitForFunction((ply) => __tapSnapshot().multiplayer.state.ply > ply, ply);
            await owner.screenshot({
              path: path.join(evidence, `actual-${type}-${game}-${size.width}.png`),
            });
            const other = await cell(friend, peerTarget);
            await tapAt(friend, { x: other.hit.x + 22, y: other.state.playTop + other.hit.y + 22 });
            await friend.waitForFunction(
              (ply) => __tapSnapshot().multiplayer.state.ply > ply + 1,
              ply,
            );
          }
        }
        // Check convergence at a common committed sequence despite the independent rendering clocks.
        for (let attempt = 0; attempt < 20; attempt++) {
          const a = await child(owner),
            b = await child(friend);
          if (a.seq === b.seq) {
            assert.deepEqual(a.state, b.state);
            break;
          }
          assert(attempt < 19, 'clients reach a common sequence');
        }
        if (game === 'cops-robbers-realtime') {
          await owner.setViewportSize({ width: 390, height: 844 });
          await owner.waitForFunction(() => __tapSnapshot().multiplayer.rotated);
          const state = await child(owner),
            hit = await streetHit(owner, 0),
            before = hub.messages.length;
          assert(hit, 'rotated map has a reachable destination');
          await tapAt(owner, { x: hit.x + hit.w / 2, y: state.playTop + hit.y + hit.h / 2 });
          const deadline = Date.now() + 4000;
          while (
            !hub.messages
              .slice(before)
              .some(
                (item) => item.value.k === 'commit' && item.value.a.some((entry) => entry.s === 0),
              )
          ) {
            assert(Date.now() < deadline, 'rotated map touch commits an action');
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          await owner.screenshot({
            path: path.join(evidence, `actual-${type}-${game}-rotated.png`),
          });
        }
        await click(friend, 'exit');
        await owner.waitForFunction(() => __tapSnapshot().multiplayer.phase === 'ended');
        await click(owner, 'exit');
        for (const page of pages) {
          await page.waitForFunction(() => !__tapSnapshot().multiplayer);
          assert.equal(await page.evaluate(() => __battleListeners.size), 0);
        }
        assert.equal(errors.length, 0, errors.join('\n'));
        assert(hub.messages.every((message) => message.bytes <= 2048));
        console.log(
          `PASS ${type}/${game}: touch create, typed room ID, ready, both seats, ordered state, leave`,
        );
      } finally {
        for (const context of contexts) await context.close();
      }
    }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
