import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const config = JSON.parse(readFileSync(path.join(root, 'game.json'), 'utf8'));
const games = [
  ['cultivation', '三分钟修仙'],
  ['office', '打工人摸鱼记'],
  ['cricket', '秋声斗蟋'],
  ['arena', '电子斗蛐蛐'],
];
assert.deepEqual(
  config.subpackages,
  games.map(([name]) => ({ name, root: `${name}/` })),
);

async function launch(gameIndex, [gameId, title]) {
  let packageLoaded;
  const rendered = [];
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
        rendered.length = 0;
        rectangles.length = 0;
        drawnImages.length = 0;
      } else if (height > 1) rectangles.push({ y, height });
    },
    fillText(text) {
      rendered.push(text);
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
          const filename = path.resolve(root, value);
          assert.ok(filename.startsWith(`${root}${path.sep}`) || filename.startsWith(root));
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
          const bytes = readFileSync(path.resolve(root, this.src));
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
  const context = vm.createContext({
    bl: sdk,
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
    const resolved = path.resolve(filename);
    assert.ok(resolved.startsWith(root), 'require must stay within the reviewed Artifact');
    if (config.subpackages.some(({ root: subRoot }) => resolved.includes(`${path.sep}${subRoot}`)))
      assert.equal(packageLoaded, gameId);
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
  requireLocal(path.join(root, 'game.js'));
  const button = rectangles[gameIndex];
  assert.ok(button, `Catalog must render ${gameId}`);
  tap(30, button.y + button.height / 2);
  const ready = gameId === 'office' ? '周一 09:08 · 迟到潜入' : title;
  for (let index = 0; index < 50 && !rendered.includes(ready); index++)
    await new Promise(setImmediate);
  assert.equal(packageLoaded, gameId);
  assert.ok(rendered.includes(ready), `${gameId} Artifact must launch without a DOM`);
  assert.equal(canvases, 1, 'Native Game must reuse the first visible Canvas');
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
  assert.deepEqual(logs, []);
}

if (process.argv[2])
  assert.ok(
    games.some(([id]) => id === process.argv[2]),
    'Unknown game filter',
  );
for (const [index, game] of games.entries()) {
  if (process.argv[2] && process.argv[2] !== game[0]) continue;
  assert.ok(readdirSync(path.join(root, game[0])).includes('manifest.json'));
  await launch(index, game);
}
console.log(
  `Reviewed ${process.argv[2] ?? 'all'} Artifacts passed native launch, input and lifecycle checks.`,
);
