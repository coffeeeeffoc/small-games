import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeHistoryImageLoader } from '../native-assets.mjs';
import { createRenderer } from '../competition-renderer.js';
const source = 'assets/angkor.webp', other = 'assets/athens.webp';
const entry = path => ({ name: 'history-images-0', path: `history-images-0/${path}` });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function sdkFixture() {
  const images = [], packages = [];
  class NativeImage {
    width = 1000; height = 500;
    set src(value) { this.path = value; }
  }
  const sdk = { loadSubpackage(name) { packages.push(name); return Promise.resolve(); }, createImage() { const image = new NativeImage(); images.push(image); return image; } };
  return { sdk, images, packages, NativeImage };
}
test('loads declared package before src and returns actual SDK Image identity, deduplicating package work', async () => {
  const f = sdkFixture(); let ready; f.sdk.loadSubpackage = name => { f.packages.push(name); return new Promise(resolve => { ready = resolve; }); };
  const load = createNativeHistoryImageLoader(f.sdk, { [source]: entry(source), [other]: entry(other) });
  const a = load(source), b = load(other); await flush(); assert.equal(f.images.length, 0); assert.deepEqual(f.packages, ['history-images-0']);
  ready(); await flush(); assert.deepEqual(f.images.map(image => image.path), [entry(source).path, entry(other).path]);
  for (const image of f.images) image.onload();
  assert.equal(await a, f.images[0]); assert.equal(await b, f.images[1]); assert.ok((await a) instanceof f.NativeImage);
  const c = load(source); await flush(); f.images[2].onload(); await c; assert.equal(f.packages.length, 1);
});
test('package rejection does not create fake images and the same package can retry', async () => {
  const f = sdkFixture(); let attempts = 0;
  f.sdk.loadSubpackage = () => ++attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();
  const load = createNativeHistoryImageLoader(f.sdk, { [source]: entry(source) });
  await assert.rejects(load(source), /offline/); assert.equal(f.images.length, 0);
  const retry = load(source); await flush(); f.images[0].onload(); await retry; assert.equal(attempts, 2);
});
test('missing declarations and unsupported SDK/package result fail explicitly', async () => {
  const f = sdkFixture();
  await assert.rejects(createNativeHistoryImageLoader(f.sdk, {})(source), /声明/);
  await assert.rejects(createNativeHistoryImageLoader(f.sdk, { [source]: { ...entry(source), path: '../bad.webp' } })(source), /无效/);
  await assert.rejects(createNativeHistoryImageLoader({ createImage: f.sdk.createImage }, { [source]: entry(source) })(source), /不支持分包/);
  await assert.rejects(createNativeHistoryImageLoader({ ...f.sdk, loadSubpackage: () => ({}) }, { [source]: entry(source) })(source), /Promise/);
  await assert.rejects(createNativeHistoryImageLoader(f.sdk)('../secret'), /路径无效/);
  assert.equal(f.images.length, 0);
});
test('native image errors, malformed dimensions, source setter errors and timeout reject', async () => {
  const f = sdkFixture(), load = createNativeHistoryImageLoader(f.sdk);
  let promise = load(source); await flush(); f.images[0].onerror(); await assert.rejects(promise, /图片加载失败/);
  promise = load(source); await flush(); f.images[1].width = 0; f.images[1].onload(); await assert.rejects(promise, /尺寸无效/);
  await assert.rejects(createNativeHistoryImageLoader({ createImage: () => ({ set src(value) { throw new Error('decode'); } }) })(source), /decode/);
  await assert.rejects(createNativeHistoryImageLoader(f.sdk, undefined, { imageTimeoutMs: 5 })(source), /超时/);
  assert.equal(f.images.at(-1).onload, null);
});
function rendererFixture(loadImage) {
  const labels = [], drawings = [], ctx = new Proxy({ measureText: text => ({ width: String(text).length * 5 }), fillText: text => labels.push(text), drawImage: image => drawings.push(image) }, { get: (o, key) => key in o ? o[key] : () => {} });
  const renderer = createRenderer({ loadImage });
  const state = image => ({ roundKey: image, image, round: 1, total: 5, score: 0, phase: 'guessing', clue: '观察全景' });
  const draw = image => { labels.length = 0; drawings.length = 0; renderer.draw(ctx, 390, 700, state(image)); };
  return { renderer, draw, labels, drawings, state };
}
test('late prior scene loads and failures cannot contaminate current renderer image', async () => {
  const requests = [];
  const f = rendererFixture(path => new Promise((resolve, reject) => requests.push({ path, resolve, reject })));
  f.draw(source); await flush(); f.draw(other); await flush();
  const second = { width: 1000, height: 500 }; requests[1].resolve(second); await flush();
  f.draw(other); assert.equal(f.drawings[0], second);
  requests[0].reject(new Error('old image failed')); await flush(); f.draw(other); assert.equal(f.drawings[0], second); assert.ok(!f.labels.some(text => text.includes('加载失败')));
});
test('scene A to B to A uses a new token and retains native image identity; image failure is retryable', async () => {
  const requests = [];
  const f = rendererFixture(path => new Promise((resolve, reject) => requests.push({ path, resolve, reject })));
  f.draw(source); await flush(); f.draw(other); await flush(); f.draw(source); await flush();
  const stale = { width: 1000, height: 500 }, latest = { width: 1200, height: 600 };
  requests[0].resolve(stale); await flush(); f.draw(source); assert.equal(f.drawings.length, 0);
  requests[2].reject(new Error('bad image')); await flush(); f.draw(source); assert.ok(f.labels.some(text => text.includes('点击画面重试')));
  f.renderer.tap(30, 140, f.state(source)); f.draw(source); await flush(); assert.equal(requests.length, 4);
  requests[3].resolve(latest); await flush(); f.draw(source); assert.equal(f.drawings[0], latest);
  requests[1].resolve(stale); await flush(); f.draw(source); assert.equal(f.drawings[0], latest);
});
