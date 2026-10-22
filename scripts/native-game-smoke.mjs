import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import vm from 'node:vm';

export async function verifyNativeArtifact({
  root,
  standalone = true,
  platform = 'bilibili',
  game,
}) {
  root = path.resolve(root);
  const localPath = (relative) => {
    const filename = path.resolve(root, relative);
    const inside = path.relative(root, filename);
    assert.ok(
      inside && !inside.startsWith(`..${path.sep}`) && inside !== '..' && !path.isAbsolute(inside),
      'Asset and require paths must stay within the Artifact',
    );
    return filename;
  };
  const config = JSON.parse(readFileSync(path.join(root, 'game.json'), 'utf8'));
  assert.ok(standalone, 'Only independent native artifacts are supported');
  const games = [
    ['flick-arena', '弹指擂台'],
    ['moss-garden', '苔光花园'],
    ['wulong-city', '乌龙城'],
    ['three-choose-two', '三块选两块'],
  ];
  if (standalone) {
    assert.equal(config.deviceOrientation, 'portrait');
    assert.equal(config.subpackages, undefined);
    const release = JSON.parse(readFileSync(path.join(root, 'release.json'), 'utf8'));
    assert.equal(release.platform, platform);
    assert.equal(release.gameId, game);
    const project = JSON.parse(readFileSync(path.join(root, 'project.config.json'), 'utf8'));
    assert.equal(project.compileType, 'game');
    const assets = {
      'three-choose-two': 'assets',
      'flick-arena': 'audio',
      'moss-garden': 'moss-garden-audio',
      'wulong-city': 'assets',
    };
    assert.deepEqual(
      readdirSync(root).filter((name) => !name.endsWith('.json') && name !== 'game.js'),
      [assets[game]],
    );
    const code = readFileSync(path.join(root, 'game.js'), 'utf8');
    for (const [id, title] of games)
      if (id !== game)
        assert.ok(!code.includes(title), 'Single-game Artifact must exclude sibling Games');
  }

  async function launch([gameId, title]) {
    const rendered = [];
    const labels = new Map();
    const labelPositions = new Map();
    const rectangles = [];
    const records = new Map();
    const logs = [];
    const touches = new Set();
    const presses = new Set();
    const moves = new Set();
    const cancels = new Set();
    const hidden = new Set();
    const shown = new Set();
    const drawnImages = [];
    const paths = [];
    const images = [];
    const audio = [];
    const intervals = new Map();
    let clock = Date.now();
    let timerId = 0;
    let canvases = 0;
    let drawingDepth = 0;
    const drawing = {
      beginPath() {},
      closePath() {},
      arc() {},
      rect() {},
      strokeRect() {},
      ellipse() {},
      fill() {},
      stroke() {},
      strokeText() {},
      setLineDash() {},
      moveTo(x, y) {
        paths.push([x, y]);
      },
      lineTo(x, y) {
        paths.push([x, y]);
      },
      quadraticCurveTo() {},
      bezierCurveTo() {},
      rotate() {},
      clip() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
      save() {
        drawingDepth += 1;
      },
      restore() {
        drawingDepth -= 1;
      },
      scale() {},
      translate() {},
      transform() {},
      setTransform() {},
      drawImage(image, ...coordinates) {
        assert.ok(image.width > 0 && image.height > 0, 'drawImage requires a loaded local image');
        drawnImages.push({ src: image.src, coordinates });
      },
      clearRect() {
        labelPositions.clear();
        paths.length = 0;
        rendered.length = 0;
        rectangles.length = 0;
        drawnImages.length = 0;
      },
      fillRect(x, y, width, height) {
        if (y === 0 && drawingDepth <= 1) {
          labels.clear();
          labelPositions.clear();
          rendered.length = 0;
          rectangles.length = 0;
          drawnImages.length = 0;
        } else if (height > 1) rectangles.push({ x, y, width, height });
      },
      fillText(text, x, y) {
        rendered.push(text);
        labels.set(text, y);
        labelPositions.set(text, { x, y });
      },
      measureText(text) {
        const width = 17;
        return { width: text.length * width };
      },
    };
    const sdk = {
      createCanvas: () => {
        canvases += 1;
        return { width: 390, height: 844, getContext: () => drawing };
      },
      createImage() {
        const image = { width: 0, height: 0, onload: null, onerror: null };
        let src = '';
        Object.defineProperty(image, 'src', {
          get: () => src,
          set(value) {
            src = value;
            const filename = localPath(value);
            const bytes = readFileSync(filename);
            if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
              image.width = bytes.readUInt32BE(16);
              image.height = bytes.readUInt32BE(20);
            } else {
              assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', 'Expected a local PNG or WebP');
              assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
              const format = bytes.toString('ascii', 12, 16);
              if (format === 'VP8X') {
                image.width = 1 + bytes.readUIntLE(24, 3);
                image.height = 1 + bytes.readUIntLE(27, 3);
              } else if (format === 'VP8 ') {
                image.width = bytes.readUInt16LE(26) & 0x3fff;
                image.height = bytes.readUInt16LE(28) & 0x3fff;
              } else {
                assert.equal(format, 'VP8L');
                const size = bytes.readUInt32LE(21);
                image.width = 1 + (size & 0x3fff);
                image.height = 1 + ((size >>> 14) & 0x3fff);
              }
            }
            queueMicrotask(() => image.onload?.());
          },
        });
        images.push(image);
        return image;
      },
      createInnerAudioContext() {
        const sound = {
          src: '',
          loop: false,
          volume: 1,
          playing: false,
          play() {
            const bytes = readFileSync(localPath(this.src));
            assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
            this.playing = true;
          },
          stop() {
            this.playing = false;
          },
          destroy() {
            this.playing = false;
          },
          onError() {},
          offError() {},
        };
        audio.push(sound);
        return sound;
      },
      getSystemInfoSync: () =>
        config.deviceOrientation === 'landscape'
          ? { windowWidth: 844, windowHeight: 390 }
          : { windowWidth: 390, windowHeight: 844 },
      onTouchStart(listener) {
        presses.add(listener);
      },
      offTouchStart(listener) {
        presses.delete(listener);
      },
      onTouchMove(listener) {
        moves.add(listener);
      },
      offTouchMove(listener) {
        moves.delete(listener);
      },
      onTouchCancel(listener) {
        cancels.add(listener);
      },
      offTouchCancel(listener) {
        cancels.delete(listener);
      },
      onTouchEnd(listener) {
        touches.add(listener);
      },
      offTouchEnd(listener) {
        touches.delete(listener);
      },
      onHide(listener) {
        hidden.add(listener);
      },
      offHide(listener) {
        hidden.delete(listener);
      },
      onShow(listener) {
        shown.add(listener);
      },
      offShow(listener) {
        shown.delete(listener);
      },
      getStorageSync: (key) => records.get(key),
      setStorageSync: (key, value) => records.set(key, value),
      removeStorageSync: (key) => records.delete(key),
      getLogManager: () => ({ info: (value) => logs.push(value) }),
    };
    let launches = 0;
    Object.assign(sdk, {
      launchSuccess() {
        launches++;
      },
      checkScene(options) {
        options.success({ isExist: true });
      },
      navigateToScene(options) {
        options.success();
      },
      addShortcut(options) {
        options.success();
      },
      showToast() {},
      exitMiniProgram(options) {
        options.success();
      },
    });
    const context = vm.createContext({
      [{ wechat: 'wx', bilibili: 'bl', douyin: 'tt', kuaishou: 'ks' }[platform]]: sdk,
      setTimeout,
      clearTimeout,
      Date: class extends Date {
        static now() {
          return clock;
        }
      },
      setInterval(callback, delay) {
        const id = ++timerId;
        intervals.set(id, { callback, delay, previous: clock });
        return id;
      },
      clearInterval(id) {
        intervals.delete(id);
      },
      console: { ...console, info: (...values) => logs.push(...values) },
    });
    const tap = (x, y) => {
      const event = { changedTouches: [{ identifier: 1, clientX: x, clientY: y }] };
      for (const listener of [...presses]) listener(event);
      for (const listener of [...touches]) listener(event);
    };
    const choose = (text) => {
      const found = [...labels].reverse().find(([label]) => label.includes(text));
      assert.ok(found, `Missing action: ${text}`);
      tap(30, found[1] - 10);
    };
    const advance = (milliseconds) => {
      const end = clock + milliseconds;
      while (clock < end) {
        clock = Math.min(end, clock + 16);
        for (const timer of intervals.values()) {
          if (clock - timer.previous >= timer.delay) {
            timer.previous = clock;
            timer.callback();
          }
        }
      }
    };
    const modules = new Map();
    function requireLocal(filename) {
      const resolved = localPath(filename);
      if (modules.has(resolved)) return modules.get(resolved).exports;
      const module = { exports: {} };
      modules.set(resolved, module);
      const code = readFileSync(resolved, 'utf8');
      if (gameId === 'three-choose-two') {
        // The shared competition client carries one browser fallback. This VM
        // exposes no fetch, window or document: native play must use SDK request.
        assert.doesNotMatch(code, /XMLHttpRequest|import\s*\(\s*['"]https?:/);
        assert.equal((code.match(/\bfetch\s*\(/g) ?? []).length, 1);
        assert.match(code, /globalThis\.__installCompetition\s*=/);
      } else {
        assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|import\s*\(\s*['"]https?:/);
      }
      const wrapper = vm.runInContext(`(function(module,exports,require){${code}\n})`, context);
      wrapper(module, module.exports, (specifier) => {
        assert.ok(specifier.startsWith('./') || specifier.startsWith('../'));
        return requireLocal(path.resolve(path.dirname(resolved), specifier));
      });
      return module.exports;
    }
    const entry = requireLocal(path.join(root, 'game.js'));
    if (standalone && platform !== 'bilibili') await entry.ready;
    const button = rectangles[0];
    if (platform === 'bilibili') {
      assert.ok(button, `Launch screen must render ${gameId}`);
      // The shared launch surface draws in 390 × 844 logical coordinates.
      const size = sdk.getSystemInfoSync();
      tap(
        ((button.x + button.width / 2) * size.windowWidth) / 390,
        ((button.y + button.height / 2) * size.windowHeight) / 844,
      );
    }
    if (standalone) await entry.ready;
    const ready = gameId === 'three-choose-two' ? '继续闯关' : title;
    for (let index = 0; index < 50 && !rendered.includes(ready); index++)
      await new Promise(setImmediate);
    assert.ok(rendered.includes(ready), `${gameId} Artifact must launch without a DOM`);
    assert.equal(canvases, 1, 'Native Game must reuse the first visible Canvas');
    if (standalone && platform === 'bilibili') assert.equal(launches, 1);
    if (gameId === 'flick-arena') {
      const click = (label, x = 195) => {
        assert.ok(labels.has(label), 'Missing control: ' + label);
        tap(x, labels.get(label) + 32);
      };
      click('练习场', 79);
      assert.ok(rendered.includes('初入江湖'));
      tap(195, 228 + 36 + 32);
      advance(1500);
      assert.ok(rendered.includes('蓝小侠 · 轮到你了'));
      const touch = (listeners, x, y) => {
        for (const fn of listeners)
          fn({ changedTouches: [{ identifier: 7, clientX: x, clientY: y + 32 }] });
      };
      touch(presses, 195, 475.6);
      touch(moves, 175, 580);
      assert.ok(rendered.some((text) => text.startsWith('力度')));
      touch(cancels, 175, 580);
      assert.ok(rendered.includes('蓝小侠 · 轮到你了'));
      touch(presses, 195, 475.6);
      touch(moves, 175, 580);
      touch(touches, 175, 580);
      advance(150);
      assert.ok(rendered.includes('出招！'));
      for (const fn of hidden) fn();
      const paused = JSON.stringify(rendered);
      advance(2000);
      assert.equal(JSON.stringify(rendered), paused);
      for (const fn of shown) fn();
      assert.ok(rendered.includes('继续切磋'));
      click('继续切磋');
      advance(6000);
      assert.ok(rendered.length > 0);
      assert.ok(!rendered.includes('全屏'), 'Native builds must not expose browser fullscreen');
    }
    if (gameId === 'three-choose-two') {
      assert.ok(standalone);
      const { getLevel } = await import('../games/local/three-choose-two/src/levels.mjs');
      const { canPlace } = await import('../games/local/three-choose-two/src/engine.mjs');
      const click = (label) => {
        const position = labelPositions.get(label);
        assert.ok(position, `Missing three choose two control: ${label}`);
        tap(position.x, position.y);
      };
      const emit = (listeners, x, y, identifier = 1) => {
        for (const listener of [...listeners])
          listener({ changedTouches: [{ identifier, clientX: x, clientY: y }] });
      };
      const saved = async () => {
        // Flush the Host's serialized asynchronous write queue before observing it.
        for (let flush = 0; flush < 4; flush++) await new Promise(setImmediate);
        const record = [...records.entries()].find(([key]) =>
          key.includes('three-choose-two-progress-v1'),
        );
        assert.ok(record, 'Native progress must use the shared Host storage namespace');
        return JSON.parse(record[1]).value;
      };
      const drag = (move, cancel = false, settle = 600) => {
        const source = { x: 74 + move.slot * 121, y: 638 };
        const destination = { x: 27 + (move.x + 0.5) * 42, y: 178 + (move.y + 0.5) * 42 + 54 };
        emit(presses, source.x, source.y, 11);
        // A second finger never owns or submits the active block.
        emit(presses, source.x, source.y, 12);
        emit(moves, destination.x, destination.y, 11);
        emit(cancel ? cancels : touches, destination.x, destination.y, 11);
        emit(touches, destination.x, destination.y, 12);
        advance(settle);
      };
      assert.ok(rendered.includes('继续闯关'), 'Native home must contain a real start action');
      assert.ok(!rendered.some((text) => text.includes('全屏')), 'Native hosts own full screen');
      for (const name of ['garden', 'hero', 'logo'])
        assert.ok(
          images.some((image) => image.src.endsWith(`assets/art/${name}.png`)),
          `Native art must ship and load: ${name}`,
        );
      click('设置');
      assert.ok(rendered.includes('消除闪光'));
      click('开');
      assert.equal(
        (await saved()).settings.reducedFlash,
        true,
        'Flash off maps to the existing reducedFlash save',
      );
      click('返回首页');
      click('选关');
      click('下一章');
      click('下一章');
      const lockedProgress = JSON.stringify([...records]);
      click('30');
      assert.equal(
        JSON.stringify([...records]),
        lockedProgress,
        'Ordinary selection cannot open locked levels',
      );
      click('返回');
      click('继续闯关');
      drag(getLevel(1).solution[0], true);
      assert.equal((await saved()).currentGame.stats.placements, 0, 'Touch cancellation is free');
      drag(getLevel(1).solution[0]);
      assert.ok(rendered.includes('好选择，漂亮！'), 'Real dragging must clear the tutorial level');
      const progress = await saved();
      assert.equal(progress.records[1].stars, 3);
      assert.equal(progress.unlocked, 2, 'A verified clear unlocks the next configured level');
      click('下一关');
      drag(getLevel(2).solution[0], false, 0);
      assert.equal((await saved()).currentGame.stats.placements, 1);
      drag(getLevel(2).solution[1], false, 0);
      assert.equal(
        (await saved()).currentGame.stats.placements,
        1,
        'Clear feedback locks another touch placement for 300ms',
      );
      advance(350);
      click('撤销 · 3');
      const undone = (await saved()).currentGame;
      assert.equal(undone.stats.placements, 0);
      assert.equal(undone.undoRemaining, 2);
      click('暂停');
      for (const hide of hidden) hide();
      const paused = JSON.stringify(rendered);
      advance(120000);
      assert.equal(JSON.stringify(rendered), paused, 'Background time cannot mutate a paused game');
      assert.ok(audio.every((voice) => !voice.playing));
      for (const show of shown) show();
      click('继续游戏');
      assert.equal((await saved()).currentGame.undoRemaining, 2);
      click('暂停');
      click('返回首页');
      click('无尽挑战');
      click('开始练习');
      for (let step = 0; step < 2; step++) {
        const current = (await saved()).currentGame;
        let next;
        for (let slot = 0; slot < 3 && !next; slot++)
          for (let y = 0; y < 8 && !next; y++)
            for (let x = 0; x < 8 && !next; x++)
              if (canPlace(current, slot, x, y)) next = { slot, x, y };
        assert.ok(next, 'An empty practice board must admit the first two blocks');
        drag(next);
      }
      const practice = (await saved()).currentGame;
      assert.equal(practice.completedGroups, 1);
      assert.equal(practice.stats.discardedBlocks, 1, 'The third block is discarded exactly once');
      assert.equal(practice.undoRemaining, 0);
      assert.equal(
        practice.ranked,
        false,
        'Unconfigured native practice never claims ranked identity',
      );
      click('暂停');
      click('结束练习');
      assert.ok(rendered.includes('离线练习成绩不参与排位'));
      click('返回首页');
      click('无尽挑战');
      click('开始挑战');
      for (let step = 0; step < 2; step++) {
        const before = (await saved()).currentGame;
        assert.equal(before.variant, 'refill');
        let next;
        for (let slot = 0; slot < 3 && !next; slot++)
          for (let y = 0; y < 8 && !next; y++)
            for (let x = 0; x < 8 && !next; x++)
              if (canPlace(before, slot, x, y)) next = { slot, x, y };
        assert.ok(next);
        drag(next);
        const after = (await saved()).currentGame;
        assert.equal(after.stats.placements, step + 1);
        assert.deepEqual(after.used, []);
        assert.equal(after.stats.discardedBlocks, 0);
        for (let slot = 0; slot < 3; slot++)
          if (slot !== next.slot) assert.deepEqual(after.candidates[slot], before.candidates[slot]);
      }
      const refill = (await saved()).currentGame;
      click('首页');
      click('继续游戏');
      assert.deepEqual((await saved()).currentGame, refill);
      click('暂停');
      click('结束练习');
      click('再玩一次');
      assert.equal((await saved()).currentGame.variant, 'refill');
      assert.equal((await saved()).currentGame.stats.placements, 0);
      assert.ok(audio.some((voice) => voice.src.endsWith('place.wav')));
      await (await entry.ready).dispose();
      assert.equal(
        presses.size + touches.size + moves.size + cancels.size + hidden.size + shown.size,
        0,
      );
      assert.equal(intervals.size, 0);
      assert.ok(audio.every((voice) => !voice.playing));
      assert.ok(
        logs.every(
          (event) =>
            event.gameId === 'three-choose-two' && event.name?.startsWith('three-choose-two.'),
        ),
        'Native gameplay may emit structured telemetry but no lifecycle errors',
      );
      return;
    }
    if (gameId === 'wulong-city') {
      assert.ok(standalone);
      const click = (label) => {
        const position =
          labelPositions.get(label) ?? (label === '返回' ? { x: 43, y: 74 } : undefined);
        assert.ok(position, 'Missing Wulong control: ' + label);
        tap(position.x, position.y);
      };
      const touch = (listeners, x, y, identifier = 1) => {
        for (const listener of [...listeners])
          listener({ changedTouches: [{ identifier, clientX: x, clientY: y }] });
      };
      assert.ok(rendered.includes('开始奇遇'), 'Native game must open its own home');
      assert.ok(!rendered.some((text) => text.includes('全屏')), 'Native host owns full screen');
      click('选择关卡');
      assert.ok(rendered.includes('选择关卡'));
      click('下一章');
      assert.ok(rendered.includes('第 2 章'));
      // Locked levels must never become reachable through the ordinary map.
      tap(105, 275);
      assert.ok(rendered.includes('选择关卡'));
      click('返回');
      click('开始奇遇');
      assert.ok(rendered.some((text) => text.includes('奇遇 01 / 100')));
      assert.ok(
        rendered.some((text) => text.includes('跳跃')),
        'The native game must provide touch controls',
      );
      assert.ok(
        audio.some((sound) => sound.playing),
        'Native input must play packaged feedback',
      );
      click('提示');
      assert.ok(rendered.includes('提示 1 / 3'));
      click('再明确一点');
      assert.ok(rendered.includes('提示 2 / 3'));
      click('回去试试');
      touch(presses, 124, 770, 11);
      touch(presses, 335, 770, 12);
      advance(250);
      touch(cancels, 335, 770, 12);
      touch(touches, 124, 770, 11);
      // Native visibility changes must cancel touches and pause simulation.
      for (const hide of hidden) hide();
      assert.ok(rendered.includes('继续探索'));
      const paused = JSON.stringify(rendered);
      advance(120000);
      assert.equal(JSON.stringify(rendered), paused);
      assert.ok(audio.every((sound) => !sound.playing));
      for (const show of shown) show();
      assert.ok(rendered.includes('继续探索'));
      click('继续探索');
      // Solve the actual shared shy-door rule using touch movement only.
      touch(presses, 44, 770, 21);
      advance(180);
      touch(touches, 44, 770, 21);
      advance(8000);
      touch(presses, 124, 770, 22);
      advance(550);
      touch(touches, 124, 770, 22);
      advance(2200);
      assert.ok(
        rendered.includes('乌龙解决啦！'),
        'Native touch controls must complete a real level',
      );
      await new Promise(setImmediate);
      const stored = [...records.entries()].find(([key]) => key.includes('wulong-city-v1'));
      assert.ok(stored);
      const progress = JSON.parse(stored[1]).value;
      assert.ok(progress.records['1']);
      assert.ok(progress.unlockedLevels.includes(2), 'A real clear must unlock the next level');
      click('再玩一次');
      tap(352, 46);
      click('返回主页');
      click('奇遇手记');
      assert.ok(rendered.includes('奇遇手记'));
      assert.ok(rendered.includes('已归档 1 / 100'));
      await new Promise(setImmediate);
      assert.ok(
        [...records.keys()].some((key) => key.includes('wulong-city-v1')),
        'Native progress must use Host storage',
      );
      assert.ok(
        drawnImages.length > 0 || images.some((image) => image.width > 0),
        'Native game must load shared packaged artwork',
      );
      await (await entry.ready).dispose();
      assert.equal(
        presses.size + touches.size + moves.size + cancels.size + hidden.size + shown.size,
        0,
      );
      assert.equal(intervals.size, 0);
      assert.ok(audio.every((sound) => !sound.playing));
      return;
    }
    if (gameId === 'moss-garden') {
      assert.ok(standalone);
      const click = (label) => {
        const position = labelPositions.get(label);
        assert.ok(position, 'Missing control: ' + label);
        tap(position.x, position.y);
      };
      const expectSeeds = (count) =>
        assert.ok(rendered.includes(`光种 ${count} / 4`), 'Expected seed count: ' + count);
      click('开始第 1 关');
      expectSeeds(0);
      // The native SDK and Canvas share the same 390 × 844 portrait coordinates.
      tap(72, 261);
      expectSeeds(1);
      assert.ok(
        audio.some((sound) => sound.playing),
        'Seed placement must play packaged audio',
      );
      tap(72, 261);
      expectSeeds(0);
      click('玩法手册');
      assert.ok(rendered.includes('返回花园'), 'Help must have a return path');
      click('返回花园');
      expectSeeds(0);
      for (const hide of hidden) hide();
      assert.ok(
        audio.every((sound) => !sound.playing),
        'Background transition must stop puzzle audio',
      );
      const paused = JSON.stringify(rendered);
      advance(2000);
      assert.equal(JSON.stringify(rendered), paused, 'Background time must not advance the puzzle');
      for (const show of shown) show();
    }
    if (standalone && platform === 'bilibili') {
      const key = `bilibili:${gameId}:entry-gifts`;
      for (const show of shown) show({ scene: '021036' });
      assert.equal(JSON.parse(records.get(key)).count, 1);
      for (const show of shown) show({ scene: '021036' });
      assert.equal(
        JSON.parse(records.get(key)).count,
        1,
        'Same-day entry gifts must be idempotent',
      );
      for (const show of shown) show({ scene: '10002' });
      assert.equal(JSON.parse(records.get(key)).count, 2);
      clock += 24 * 60 * 60 * 1000;
      for (const show of shown) show({ scene: '021036' });
      assert.equal(JSON.parse(records.get(key)).count, 3, 'Entry gifts must be available next day');
    }
    if (standalone) {
      const instance = await entry.ready;
      await instance.dispose();
      assert.equal(
        presses.size + touches.size + moves.size + cancels.size + hidden.size + shown.size,
        0,
        'Disposal must release all SDK listeners',
      );
    }
    assert.deepEqual(logs, []);
  }

  const selected = games.filter(([id]) => id === game);
  assert.ok(selected.length, 'Unknown game');
  for (const item of selected) {
    await launch(item);
  }
  console.log(`${platform}/${game ?? 'catalog'} passed native artifact checks.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      standalone: { type: 'boolean' },
      game: { type: 'string' },
      platform: { type: 'string' },
    },
  });
  const platforms = ['wechat', 'bilibili', 'douyin', 'kuaishou'];
  assert.ok(!values.platform || platforms.includes(values.platform), 'Unknown native platform');
  const standaloneGames = ['moss-garden', 'wulong-city', 'flick-arena', 'three-choose-two'];
  assert.ok(!values.game || standaloneGames.includes(values.game), 'Unknown game');
  for (const game of values.game ? [values.game] : standaloneGames) {
    for (const platform of values.platform ? [values.platform] : platforms) {
      await verifyNativeArtifact({
        root: fileURLToPath(
          new URL(`../apps/shell-minigame/dist/${platform}/${game}/`, import.meta.url),
        ),
        standalone: true,
        platform,
        game,
      });
    }
  }
}
