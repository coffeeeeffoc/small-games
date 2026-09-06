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
  const drawing = {
    save() {},
    restore() {},
    scale() {},
    clearRect() {
      rendered.length = 0;
      rectangles.length = 0;
    },
    fillRect(_x, y, _width, height) {
      if (y === 0) {
        rendered.length = 0;
        rectangles.length = 0;
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
    createCanvas: () => ({ width: 390, height: 844, getContext: () => drawing }),
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
    onTouchStart() {},
    offTouchStart() {},
    onTouchEnd(listener) {
      touches.add(listener);
    },
    offTouchEnd(listener) {
      touches.delete(listener);
    },
    onHide() {},
    offHide() {},
    onShow() {},
    offShow() {},
    getStorageSync: (key) => records.get(key),
    setStorageSync: (key, value) => records.set(key, value),
    removeStorageSync: (key) => records.delete(key),
    getLogManager: () => ({ info: (value) => logs.push(value) }),
  };
  const context = vm.createContext({
    bl: sdk,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
    console,
  });
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
  for (const touch of [...touches])
    touch({ changedTouches: [{ clientX: 30, clientY: button.y + button.height / 2 }] });
  for (let index = 0; index < 50 && !rendered.includes(title); index++)
    await new Promise(setImmediate);
  assert.equal(packageLoaded, gameId);
  assert.ok(rendered.includes(title), `${gameId} Artifact must launch without a DOM`);
  assert.deepEqual(logs, []);
}

for (const [index, game] of games.entries()) {
  assert.ok(readdirSync(path.join(root, game[0])).includes('manifest.json'));
  await launch(index, game);
}
console.log('All reviewed CommonJS subpackage Artifacts launched without DOM or remote code.');
