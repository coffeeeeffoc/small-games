import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export async function verifyNativeArtifact({
  root,
  standalone = false,
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
  const games = [
    ['cultivation', '三分钟修仙'],
    ['office', '打工人摸鱼记'],
    ['cricket', '秋声斗蟋'],
    ['arena', '电子斗蛐蛐'],
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
      cricket: 'cricket-audio',
      cultivation: 'trial-audio',
      arena: 'arena-audio',
      office: 'office-scene',
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
  if (!standalone)
    assert.deepEqual(
      config.subpackages,
      games.map(([name]) => ({ name, root: `${name}/` })),
    );

  async function launch(gameIndex, [gameId, title]) {
    const subpackages = config.subpackages ?? [];
    let packageLoaded;
    const rendered = [];
    const labels = new Map();
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
      drawImage(image, ...coordinates) {
        assert.ok(image.width > 0 && image.height > 0, 'drawImage requires a loaded local image');
        drawnImages.push({ src: image.src, coordinates });
      },
      clearRect() {
        paths.length = 0;
        rendered.length = 0;
        rectangles.length = 0;
        drawnImages.length = 0;
      },
      fillRect(_x, y, _width, height) {
        if (y === 0 && drawingDepth <= 1) {
          labels.clear();
          rendered.length = 0;
          rectangles.length = 0;
          drawnImages.length = 0;
        } else if (height > 1) rectangles.push({ y, height });
      },
      fillText(text, _x, y) {
        rendered.push(text);
        labels.set(text, y);
      },
      measureText(text) {
        return { width: text.length * 17 };
      },
    };
    const sdk = {
      loadSubpackage(options) {
        packageLoaded = options.name;
        options.success();
        options.complete();
      },
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
            assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
            image.width = bytes.readUInt32BE(16);
            image.height = bytes.readUInt32BE(20);
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
      getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
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
      [platform === 'wechat' ? 'wx' : 'bl']: sdk,
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
      console,
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
      if (
        subpackages.some(({ root: subRoot }) =>
          resolved.includes(`${path.sep}${subRoot.replaceAll('/', path.sep)}`),
        )
      )
        if (!standalone) assert.equal(packageLoaded, gameId);
      if (modules.has(resolved)) return modules.get(resolved).exports;
      const module = { exports: {} };
      modules.set(resolved, module);
      const code = readFileSync(resolved, 'utf8');
      assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|import\s*\(\s*['"]https?:/);
      const wrapper = vm.runInContext(`(function(module,exports,require){${code}\n})`, context);
      wrapper(module, module.exports, (specifier) => {
        assert.ok(specifier.startsWith('./') || specifier.startsWith('../'));
        return requireLocal(path.resolve(path.dirname(resolved), specifier));
      });
      return module.exports;
    }
    const entry = requireLocal(path.join(root, 'game.js'));
    if (standalone && platform === 'wechat') await entry.ready;
    const button = rectangles[standalone ? 0 : gameIndex];
    if (!standalone || platform === 'bilibili') {
      assert.ok(button, `Launch screen must render ${gameId}`);
      tap(30, button.y + button.height / 2);
    }
    if (standalone) await entry.ready;
    const ready = gameId === 'office' ? '周一 09:08 · 迟到潜入' : title;
    for (let index = 0; index < 50 && !rendered.includes(ready); index++)
      await new Promise(setImmediate);
    if (!standalone) assert.equal(packageLoaded, gameId);
    assert.ok(rendered.includes(ready), `${gameId} Artifact must launch without a DOM`);
    assert.equal(canvases, 1, 'Native Game must reuse the first visible Canvas');
    if (standalone && platform === 'bilibili') assert.equal(launches, 1);
    if (gameId === 'cultivation') {
      tap((240 * 390) / 480, (545 * 844) / 800);
      const hold = {
        changedTouches: [{ identifier: 2, clientX: (240 * 390) / 480, clientY: (680 * 844) / 800 }],
      };
      for (const press of presses) press(hold);
      advance(1100);
      for (const release of touches) release(hold);
      assert.ok(
        rendered.some((text) => text.includes('灵气入体')),
        'Native breath must bank only on release',
      );
      assert.ok(
        audio.some((sound) => sound.playing),
        'Cultivation must play its packaged sounds',
      );
      for (const hide of hidden) hide();
      const paused = JSON.stringify(rendered);
      advance(2000);
      assert.equal(JSON.stringify(rendered), paused);
      assert.ok(audio.every((sound) => !sound.playing));
      for (const show of shown) show();
      assert.ok(rendered.includes('山腰洞府'));
    }
    if (gameId === 'arena') {
      tap(60, 670);
      tap(60, 670);
      tap(60, 670);
      tap(60, 670);
      assert.ok(rendered.includes('按住拨草'));
      const touch = { changedTouches: [{ identifier: 2, clientX: 60, clientY: 670 }] };
      for (const press of presses) press(touch);
      advance(900);
      for (const release of touches) release(touch);
      assert.ok(
        rendered.some((text) => text.includes('咬准了')),
        'Native hold/release must damage the opponent',
      );
      assert.ok(
        audio.some((sound) => sound.playing),
        'Arena must play packaged audio',
      );
      for (const hide of hidden) hide();
      const paused = JSON.stringify(rendered);
      advance(2000);
      assert.equal(JSON.stringify(rendered), paused);
      assert.ok(audio.every((sound) => !sound.playing));
      for (const show of shown) show();
      assert.ok(rendered.includes('按住拨草'));
    }
    if (gameId === 'office') {
      assert.ok(paths.length > 100, 'Office must draw its 3D room without a DOM');
      assert.ok(paths.every((point) => point.every(Number.isFinite)));
      tap(195, 844 * 0.65 + 28);
      assert.ok(rendered.includes('暂停'), 'The player must be able to start the scene');
      const beforeLook = JSON.stringify(paths);
      for (const press of presses)
        press({ changedTouches: [{ identifier: 2, clientX: 285, clientY: 410 }] });
      for (const move of moves)
        move({ changedTouches: [{ identifier: 2, clientX: 345, clientY: 430 }] });
      for (const release of touches)
        release({ changedTouches: [{ identifier: 2, clientX: 345, clientY: 430 }] });
      advance(50);
      assert.notEqual(JSON.stringify(paths), beforeLook, 'Dragging must rotate the camera');
      const beforeMove = JSON.stringify(paths);
      for (const press of presses)
        press({ changedTouches: [{ identifier: 3, clientX: 80, clientY: 720 }] });
      for (const move of moves)
        move({ changedTouches: [{ identifier: 3, clientX: 80, clientY: 655 }] });
      advance(350);
      assert.notEqual(JSON.stringify(paths), beforeMove, 'The stick must move through the room');
      assert.ok(
        audio.some((sound) => sound.playing),
        'The scene must play packaged audio after input',
      );
      for (const hide of hidden) hide();
      const paused = JSON.stringify([rendered, paths]);
      advance(1000);
      assert.equal(
        JSON.stringify([rendered, paths]),
        paused,
        'Background time must not advance Office',
      );
      assert.ok(
        audio.every((sound) => !sound.playing),
        'Background transition must stop audio',
      );
      for (const show of shown) show();
      assert.ok(rendered.includes('暂停'), 'Office must remain playable after resuming');
    }
    if (gameId === 'cricket') {
      choose('揭盖');
      choose('开始蓄力');
      advance(700);
      choose('出击');
      assert.ok(
        rendered.some((text) => text.includes('恰到好处')),
        'A timed attack must damage the opponent',
      );
      assert.ok(
        audio.some((sound) => sound.playing),
        'Cricket must play its packaged audio',
      );
      for (const hide of hidden) hide();
      const paused = JSON.stringify(rendered);
      advance(2000);
      assert.equal(JSON.stringify(rendered), paused);
      assert.ok(audio.every((sound) => !sound.playing));
      for (const show of shown) show();
      advance(45000);
      assert.ok(rendered.includes('重新上擂'), 'Cricket must settle and allow retry');
      await new Promise(setImmediate);
      const save = JSON.parse(records.get(`${platform}:cricket:progress`));
      assert.equal(save.value.runs, 1);
      assert.equal(save.value.bestHits, 1);
      choose('重新上擂');
      assert.ok(rendered.includes('揭盖 · 开斗'));
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

  const selected = standalone ? games.filter(([id]) => id === game) : games;
  assert.ok(selected.length, 'Unknown game');
  for (const item of selected) {
    if (!standalone) assert.ok(readdirSync(path.join(root, item[0])).includes('manifest.json'));
    await launch(
      games.findIndex(([id]) => id === item[0]),
      item,
    );
  }
  console.log(`${platform}/${game ?? 'catalog'} passed native artifact checks.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--catalog')) {
    await verifyNativeArtifact({
      root: fileURLToPath(new URL('../apps/shell-bilibili/dist/', import.meta.url)),
    });
  } else {
    for (const game of ['cricket', 'cultivation', 'arena', 'office']) {
      for (const platform of ['wechat', 'bilibili']) {
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
}
