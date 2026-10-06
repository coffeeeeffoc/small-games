import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeHistoryGame, restoreNativeHistory } from '../native.js';
import { nativeScenes } from '../native-scenes.js';

function host(saved) {
  const handlers = new Map(), storage = new Map(saved ? [['here-and-then:native:v1', saved]] : []);
  let labels = [], offset = 0;
  const ctx = new Proxy({ setTransform() { labels = []; offset = 0; }, save() {}, restore() {}, translate(x, y) { offset += y; }, measureText: text => ({ width: [...text].length * 8 }), fillText(text, x, y) { labels.push({ text: String(text), x, y: y + offset }); } }, { get(o, k) { return k in o ? o[k] : () => {}; } });
  const sdk = { createCanvas: () => ({ getContext: () => ctx }), createImage: () => ({ width: 1000, height: 500, set src(v) { this.onload?.(); } }), getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2, safeArea: { top: 24, bottom: 824 } }), getStorageSync: k => storage.get(k), setStorageSync: (k, v) => storage.set(k, structuredClone(v)) };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize']) { sdk[`on${name}`] = fn => handlers.set(name, fn); sdk[`off${name}`] = fn => { if (handlers.get(name) === fn) handlers.delete(name); }; }
  const tap = (text, cancel = false) => { const label = labels.find(l => l.text === text); assert.ok(label, `找不到 ${text}: ${labels.map(l => l.text)}`); const t = { clientX: label.x, clientY: label.y, identifier: 1 }; handlers.get('TouchStart')({ touches: [t] }); if (cancel) handlers.get('TouchCancel')({}); handlers.get('TouchEnd')({ touches: [], changedTouches: [t] }); };
  return { sdk, handlers, storage, tap, labels: () => labels.map(l => l.text) };
}

test('native history preserves full catalog, scoring, cancel, foreground pause and stored journey', () => {
  assert.equal(nativeScenes.length, 28);
  const h = host(), game = startNativeHistoryGame(h.sdk);
  try {
    h.tap('开始五幕旅途', true); assert.ok(h.labels().includes('此时 · 此地'));
    h.tap('选择一幕练习'); h.tap(nativeScenes[0].title);
    h.tap('地图选点');
    const t = { clientX: 195, clientY: 340, identifier: 3 };
    h.handlers.get('TouchStart')({ touches: [t] }); h.handlers.get('TouchEnd')({ touches: [], changedTouches: [t] });
    h.tap('输入猜测年代'); h.tap('1'); h.tap('0'); h.tap('0'); h.tap('完成年代输入'); h.tap('提交地点与年代');
    assert.ok(h.labels().some(l => l.includes('本幕')));
    h.tap('史料与解说'); assert.ok(h.labels().includes('史料与解说')); h.tap('返回本幕');
    h.handlers.get('Hide')({}); h.handlers.get('Show')({}); assert.ok(h.labels().includes('旅途已暂停'));
    h.tap('继续观察'); h.tap('前往下一幕'); assert.ok(h.labels().includes('旅途完成'));
    assert.equal(h.storage.get('here-and-then:native:v1').visited.length, 1);
  } finally { game.stop(); }
  assert.equal(h.handlers.size, 0);
  const h2 = host(h.storage.get('here-and-then:native:v1')), game2 = startNativeHistoryGame(h2.sdk);
  try { h2.tap('继续存档'); assert.ok(h2.labels().some(l => l.includes('本幕'))); } finally { game2.stop(); }
});

test('native history rejects corrupt journey and recomputes client scores', () => {
  const valid = { version: 1, settings: {}, journey: { deck: ['changan'], index: 0, phase: 'revealed', input: { digits: '742' }, answers: [{ point: { lat: 34.265, lng: 108.943 }, year: 742, total: 999999, penalty: 0 }], remaining: 90 } };
  assert.equal(restoreNativeHistory(valid).journey.answers[0].total, 5000);
  assert.equal(restoreNativeHistory({ ...valid, journey: { ...valid.journey, deck: ['missing'] } }).journey, null);
});

test('multiple touches and sliding release do not activate native buttons; storage denial is playable', () => {
  const h = host(); h.sdk.getStorageSync = () => { throw new Error('denied'); }; h.sdk.setStorageSync = () => { throw new Error('denied'); };
  const game = startNativeHistoryGame(h.sdk);
  try {
    const a = { clientX: 195, clientY: 218, identifier: 1 }, b = { ...a, identifier: 2 };
    h.handlers.get('TouchStart')({ touches: [a, b] }); h.handlers.get('TouchEnd')({ touches: [], changedTouches: [a] }); assert.ok(h.labels().includes('此时 · 此地'));
    h.handlers.get('TouchStart')({ touches: [a] }); h.handlers.get('TouchMove')({ touches: [{ ...a, clientX: 250 }] }); h.handlers.get('TouchEnd')({ touches: [], changedTouches: [a] }); assert.ok(h.labels().includes('此时 · 此地'));
    h.tap('开始五幕旅途'); assert.ok(h.labels().includes('暂停'));
  } finally { game.stop(); }
});
