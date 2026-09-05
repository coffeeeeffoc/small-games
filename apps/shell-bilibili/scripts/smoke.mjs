import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const config = JSON.parse(readFileSync(path.join(root, 'game.json'), 'utf8'));
assert.deepEqual(config.subpackages, [{ name: 'cultivation', root: 'cultivation/' }]);
let packageLoaded = false;
const rendered = [];
const records = new Map();
const logs = [];
const drawing = {
  save() {},
  restore() {},
  scale() {},
  clearRect() {},
  fillRect() {},
  fillText(text) {
    rendered.push(text);
  },
  measureText(text) {
    return { width: text.length * 17 };
  },
};
const sdk = {
  loadSubpackage(options) {
    assert.equal(options.name, 'cultivation');
    packageLoaded = true;
    options.success();
  },
  createCanvas: () => ({ width: 390, height: 844, getContext: () => drawing }),
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
  onTouchEnd() {},
  offTouchEnd() {},
  onHide() {},
  offHide() {},
  onShow() {},
  offShow() {},
  getStorageSync: (key) => records.get(key),
  setStorageSync: (key, value) => records.set(key, value),
  removeStorageSync: (key) => records.delete(key),
  getLogManager: () => ({ info: (value) => logs.push(value) }),
};
// No DOM, browser transport, or remote code loader exists in the production smoke environment.
const context = vm.createContext({ bl: sdk, setTimeout, clearTimeout, console });
const modules = new Map();
function requireLocal(filename) {
  const resolved = path.resolve(filename);
  assert.ok(resolved.startsWith(root), 'require must stay within the reviewed Artifact');
  if (resolved.includes(`${path.sep}cultivation${path.sep}`)) assert.ok(packageLoaded);
  if (modules.has(resolved)) return modules.get(resolved).exports;
  const module = { exports: {} };
  modules.set(resolved, module);
  const code = readFileSync(resolved, 'utf8');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|import\s*\(\s*['"]https?:/);
  const wrapper = vm.runInContext(`(function(module,exports,require){${code}\n})`, context);
  wrapper(module, module.exports, (specifier) => {
    assert.ok(
      specifier.startsWith('./') || specifier.startsWith('../'),
      'Only local CommonJS imports are allowed',
    );
    return requireLocal(path.resolve(path.dirname(resolved), specifier));
  });
  return module.exports;
}
requireLocal(path.join(root, 'game.js'));
for (let index = 0; index < 50 && !rendered.includes('三分钟修仙'); index++)
  await new Promise(setImmediate);
assert.deepEqual(logs, []);
assert.ok(rendered.includes('三分钟修仙'), 'Real native Artifact must render without a DOM');
assert.ok(readdirSync(path.join(root, 'cultivation')).includes('manifest.json'));
console.log('Reviewed CommonJS subpackage launch without DOM or remote code passed.');
