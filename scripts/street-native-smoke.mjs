import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyStreetRun } from '../services/runtime-api/rules/street-runs.mjs';
import realtime from '../services/runtime-api/rules/realtime.mjs';
import { createRenderer } from '../games/local/cops-robbers-realtime/src/competition-renderer.js';

export async function runStreetNativeSmoke() {
  for (const [platform, sdkName] of [
    ['wechat', 'wx'],
    ['bilibili', 'bl'],
    ['douyin', 'tt'],
    ['kuaishou', 'ks'],
  ]) {
    const root = new URL(
      `../apps/shell-minigame/dist/${platform}/cops-robbers-realtime/`,
      import.meta.url,
    );
    const source = await readFile(new URL('game.js', root), 'utf8');
    const config = JSON.parse(await readFile(new URL('game.json', root), 'utf8'));
    assert.equal(config.deviceOrientation, 'landscape');
    assert.doesNotMatch(source, /document\.|window\.|createElement\(|iframe/);
    const labels = [],
      listeners = new Map(),
      intervals = new Set(),
      storage = new Map(),
      submissions = [];
    let now = 0;
    const context = new Proxy(
      {
        fillRect(x, y, w) {
          if (x === 0 && y === 0 && w === 844) labels.length = 0;
        },
        fillText(value, x, y) {
          labels.push({ label: String(value), x, y });
        },
        measureText(value) {
          return { width: String(value).length * 8 };
        },
      },
      {
        get(target, key) {
          return target[key] ?? (() => {});
        },
      },
    );
    const canvas = { getContext: () => context };
    const sdk = {
      createCanvas: () => canvas,
      createImage: () => ({ width: 0 }),
      getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 1 }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      getLaunchOptionsSync: () => ({ query: {} }),
    };
    for (const name of [
      'TouchEnd',
      'Hide',
      'Show',
      'WindowResize',
      'ShareAppMessage',
      'KeyboardConfirm',
      'KeyboardComplete',
      'AudioInterruptionBegin',
    ]) {
      sdk['on' + name] = (fn) => {
        const values = listeners.get(name) || new Set();
        values.add(fn);
        listeners.set(name, values);
      };
      sdk['off' + name] = (fn) => listeners.get(name)?.delete(fn);
    }
    let room = null,
      duel = null;
    const client = {
      async request(url, init) {
        if (url === '/me') return { name: '测试玩家', playerId: 'fixture' };
        if (url.startsWith('/boards/'))
          return { modes: [{ id: 'classic', title: '自由追逐' }], top: [] };
        if (url === '/rooms') {
          duel = realtime.initial(0, 'classic', 'pursuer');
          room = {
            code: 'ABCDEF123456',
            status: 'waiting',
            you: 0,
            seq: 0,
            initiative: 'pursuer',
            roles: ['pursuer', 'runner'],
            players: [
              { id: 'fixture', name: '测试玩家', role: 'pursuer', ready: false },
              { id: 'friend', name: '好友', role: 'runner', ready: true },
            ],
            state: realtime.view(duel),
          };
          return structuredClone(room);
        }
        if (url.startsWith('/rooms/')) {
          if (url.endsWith('/ready')) room.status = 'playing';
          if (url.endsWith('/actions')) {
            const input = JSON.parse(init.body);
            realtime.action(duel, input.action, 2500, 0);
            room.seq = input.seq;
            room.state = realtime.view(duel);
          }
          if (url.endsWith('/leave')) room.status = 'abandoned';
          return structuredClone(room);
        }
        if (url.startsWith('/runs/')) {
          if (init?.body) {
            const params = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
            params.level = Number(params.level);
            const run = JSON.parse(init.body),
              result = verifyStreetRun(params, run);
            submissions.push(result);
            return {
              fastestMs: result.elapsedMs,
              top: [{ name: '测试玩家', elapsedMs: result.elapsedMs }],
            };
          }
          return { fastestMs: null, top: [] };
        }
        throw new Error('unexpected request ' + url);
      },
    };
    class TestDate extends Date {
      static now() {
        return now;
      }
    }
    const sandbox = {
      exports: {},
      [sdkName]: sdk,
      __competition: client,
      Date: TestDate,
      Math,
      Map,
      Set,
      Promise,
      console,
      URL,
      URLSearchParams,
      setInterval(fn) {
        intervals.add(fn);
        return fn;
      },
      clearInterval(fn) {
        intervals.delete(fn);
      },
      setTimeout,
      clearTimeout,
    };
    vm.runInNewContext(source, sandbox);
    const instance = sandbox.exports.instance;
    const flush = async () => {
      for (let i = 0; i < 12; i++) await Promise.resolve();
    };
    const tick = async (count) => {
      for (let i = 0; i < count; i++) {
        now += 1000 / 60;
        for (const fn of [...intervals]) fn();
      }
      await flush();
    };
    const touch = (x, y) => {
      for (const fn of [...(listeners.get('TouchEnd') || [])])
        fn({ changedTouches: [{ clientX: x, clientY: y }] });
    };
    const tap = async (label) => {
      const hit = labels.find((item) => item.label === label);
      assert.ok(hit, label);
      touch(hit.x + 8, hit.y);
      await flush();
      await tick(1);
    };
    await tap('开始游戏 →');
    await tap('街区挑战');
    await tap('自由追逐');
    await tap('出口竞速');
    await tap('开始行动 →');
    touch(58, 165);
    touch(422, 182);
    touch(786, 165);
    touch(422, 182);
    await tick(330);
    assert.ok(
      labels.some((item) => item.label === '挑战成功'),
      'real field taps win native solo',
    );
    assert.equal(submissions.length, 1, 'server verifier accepts native fixed-tick commands');
    assert.ok(storage.get('street-native-v1').includes('quick'), 'native personal best persists');
    await tap('再来一次');
    for (const fn of listeners.get('Hide')) fn();
    await tick(60);
    for (const fn of listeners.get('Show')) fn();
    await tick(1);
    assert.ok(
      labels.some((item) => item.label === '继续行动'),
      'background requires explicit resume',
    );
    await tap('首页');
    await tap('角色头像');
    await tap('猫狐头像');
    assert.equal(JSON.parse(storage.get('chase-role-appearance-v1')).cop.style, 'animals');
    await tap('首页');
    await tap('好友 PK');
    await tap('创建好友挑战');
    await tap('准备');
    const probe = createRenderer(),
      targets = probe.draw(context, 844, 336, room.state);
    const actor = targets.filter((hit) => hit.action.local !== undefined).at(-1);
    const roadNodes = targets.filter((hit) => hit.action.type === 'move');
    const roleTargets = targets.filter((hit) => hit.action.local !== undefined);
    const road = room.state.map.edges
      .map(([a, b]) => ({
        x: (roadNodes[a].x + roadNodes[b].x) / 2 + 18,
        y: (roadNodes[a].y + roadNodes[b].y) / 2 + 18,
      }))
      .find((point) =>
        roleTargets.every((hit) => Math.hypot(point.x - hit.x - 22, point.y - hit.y - 22) > 32),
      );
    assert.ok(road);
    touch(actor.x + actor.w / 2, actor.y + actor.h / 2);
    await tick(1);
    touch(road.x, road.y);
    await flush();
    await tick(1);
    assert.equal(room.seq, 1, 'native field touch reaches the duel rule');
    await tap('退出');
    assert.equal([...listeners.get('TouchEnd')].length, 1, 'PK exit removes its listener');
    assert.ok(!labels.some((item) => item.label.includes('全屏')));
    instance.stop();
    assert.equal(intervals.size, 0);
    assert.equal(
      [...listeners.values()].reduce((n, set) => n + set.size, 0),
      0,
    );
    console.log(
      `${platform}/street: actual native bundle wins from field taps, verified replay, stored best, home/avatars/PK, lifecycle and cleanup passed`,
    );
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await runStreetNativeSmoke();
