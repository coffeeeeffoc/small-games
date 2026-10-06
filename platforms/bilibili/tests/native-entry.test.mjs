import assert from 'node:assert/strict';
import test from 'node:test';
import { attachBilibiliEntry } from '../native-entry.mjs';

function fixture({ stored, initial = {}, synchronousShow } = {}) {
  let listener;
  let probe;
  let navigate;
  let shortcut;
  let writes = 0;
  let off = 0;
  const calls = [];
  const sdk = {
    onShow(value) {
      assert.equal(this, sdk);
      calls.push('onShow');
      listener = value;
      if (synchronousShow) value(synchronousShow);
    },
    offShow(value) {
      assert.equal(value, listener);
      off++;
    },
    getLaunchOptionsSync() {
      calls.push('launch');
      return initial;
    },
    getStorageSync(key) {
      assert.equal(key, 'bilibili:game:entry-gifts');
      calls.push('read');
      return stored;
    },
    setStorageSync(key, value) {
      assert.equal(key, 'bilibili:game:entry-gifts');
      calls.push('write');
      stored = value;
      writes++;
    },
    checkScene(options) {
      assert.equal(this, sdk);
      assert.equal(options.scene, 'sidebar');
      probe = options;
      calls.push('probe');
    },
    navigateToScene(options) {
      assert.equal(this, sdk);
      assert.equal(options.scene, 'sidebar');
      navigate = options;
      calls.push('navigate');
    },
    addShortcut(options) {
      assert.equal(this, sdk);
      shortcut = options;
      calls.push('shortcut');
    },
  };
  return {
    sdk,
    calls,
    emit: (options) => listener(options),
    probe: () => probe,
    navigate: () => navigate,
    shortcut: () => shortcut,
    writes: () => writes,
    stored: () => stored,
    off: () => off,
  };
}
const now = () => Date.parse('2026-10-05T16:00:00Z');

test('onShow is synchronous before storage and latest event beats cold launch options', () => {
  const f = fixture({
    initial: { scene: '10002' },
    synchronousShow: { scene: '021036', query: { from: 'sidebar' } },
  });
  const entry = attachBilibiliEntry(f.sdk, { gameId: 'game', now });
  assert.deepEqual(f.calls.slice(0, 2), ['onShow', 'read']);
  assert.equal(f.calls.includes('launch'), false);
  assert.equal(entry.getSnapshot().scene, '021036');
  assert.equal(entry.getSnapshot().count, 1);
  assert.equal(JSON.parse(f.stored()).sidebar, '2026-10-06');
  assert.equal(JSON.parse(f.stored()).desktop, undefined);
  const view = entry.getSnapshot();
  view.launchOptions.query.from = 'changed';
  assert.equal(entry.getSnapshot().launchOptions.query.from, 'sidebar');
});

test('cold and hot sidebar/desktop returns collect once per Beijing day and survive restart', () => {
  let time = Date.parse('2026-10-05T15:59:59Z');
  const f = fixture({ initial: { scene: '021036' } });
  const entry = attachBilibiliEntry(f.sdk, { gameId: 'game', now: () => time });
  assert.equal(entry.getSnapshot().count, 1);
  f.emit({ scene: '021036' });
  entry.menuActions[0].run();
  assert.equal(f.writes(), 1);
  f.emit({ scene: '10002' });
  f.emit({ scene: '10002' });
  assert.equal(entry.getSnapshot().count, 2);
  time += 1000;
  f.emit({ scene: '10002' });
  f.emit({ scene: '021036' });
  assert.equal(entry.getSnapshot().count, 4);
  entry.dispose();
  const next = fixture({ stored: f.stored(), initial: { scene: '021036' } });
  assert.equal(
    attachBilibiliEntry(next.sdk, { gameId: 'game', now: () => time }).getSnapshot().count,
    4,
  );
  assert.equal(next.writes(), 0);
});

test('real navigation and shortcut callbacks never award a stamp without entry scene', () => {
  const f = fixture();
  const entry = attachBilibiliEntry(f.sdk, { gameId: 'game', now });
  assert.equal(entry.getSnapshot().sidebarSupported, null);
  entry.menuActions[0].run();
  assert.equal(f.navigate(), undefined);
  f.probe().success({ isExist: true });
  assert.equal(entry.menuActions[0].available, true);
  entry.menuActions[0].run();
  entry.menuActions[0].run();
  assert.equal(f.calls.filter((call) => call === 'navigate').length, 1);
  f.navigate().success();
  assert.match(entry.getSnapshot().message, /侧边栏进入/);
  entry.menuActions[1].run();
  f.shortcut().success();
  assert.match(entry.getSnapshot().message, /已添加/);
  assert.equal(entry.getSnapshot().count, 0);
  assert.equal(f.writes(), 0);
  f.emit({ scene: '10002' });
  assert.equal(entry.getSnapshot().count, 1);
});

test('bad or inaccessible storage is preserved and failed writes issue no stamps', () => {
  for (const stored of [
    'broken',
    '{"count":-1}',
    '{"count":0,"sidebar":"2026-02-30"}',
    { count: 0 },
  ]) {
    const f = fixture({ stored, initial: { scene: '10002' } });
    const entry = attachBilibiliEntry(f.sdk, { gameId: 'game', now });
    assert.equal(entry.getSnapshot().writable, false);
    assert.equal(entry.getSnapshot().count, 0);
    f.emit({ scene: '021036' });
    assert.equal(f.writes(), 0);
    assert.equal(f.stored(), stored);
  }
  const f = fixture();
  f.sdk.setStorageSync = () => {
    throw new Error('denied');
  };
  const entry = attachBilibiliEntry(f.sdk, { gameId: 'game', now });
  f.emit({ scene: '10002' });
  assert.equal(entry.getSnapshot().count, 0);
  assert.match(entry.getSnapshot().message, /未保存/);
  const unreadable = fixture({ initial: { scene: '10002' } });
  unreadable.sdk.getStorageSync = () => {
    throw new Error('denied');
  };
  const blocked = attachBilibiliEntry(unreadable.sdk, { gameId: 'game', now });
  assert.equal(blocked.getSnapshot().writable, false);
  assert.equal(unreadable.writes(), 0);
  const overflow = fixture({
    stored: JSON.stringify({ count: Number.MAX_SAFE_INTEGER }),
    initial: { scene: '10002' },
  });
  const full = attachBilibiliEntry(overflow.sdk, { gameId: 'game', now });
  assert.equal(full.getSnapshot().count, Number.MAX_SAFE_INTEGER);
  assert.equal(overflow.writes(), 0);
});

test('unsupported/failed SDK methods report unavailable and do not fake navigation', () => {
  const f = fixture();
  delete f.sdk.checkScene;
  delete f.sdk.addShortcut;
  const entry = attachBilibiliEntry(f.sdk, { gameId: 'game', now });
  assert.equal(entry.menuActions[0].available, false);
  entry.menuActions[0].run();
  assert.match(entry.getSnapshot().message, /不支持侧边栏/);
  entry.menuActions[1].run();
  assert.match(entry.getSnapshot().message, /不支持添加桌面/);
  const broken = fixture();
  broken.sdk.onShow = () => {
    throw new Error('unsupported');
  };
  assert.equal(attachBilibiliEntry(broken.sdk, { gameId: 'game', now }).getSnapshot().count, 0);
  const unremovable = fixture({ initial: { scene: '10002' } });
  delete unremovable.sdk.offShow;
  assert.equal(
    attachBilibiliEntry(unremovable.sdk, { gameId: 'game', now }).getSnapshot().count,
    0,
  );
  assert.equal(unremovable.calls.includes('onShow'), false);
  const failed = fixture();
  const other = attachBilibiliEntry(failed.sdk, { gameId: 'game', now });
  failed.probe().success({ isExist: true });
  failed.sdk.navigateToScene = () => {
    throw new Error('denied');
  };
  other.menuActions[0].run();
  assert.match(other.getSnapshot().message, /无法打开/);
  other.menuActions[1].run();
  failed.shortcut().fail();
  assert.match(other.getSnapshot().message, /无法添加/);
});

test('subscriptions update and unsubscribe; dispose ignores all late callbacks', () => {
  const f = fixture();
  const entry = attachBilibiliEntry(f.sdk, { gameId: 'game', now });
  let renders = 0;
  const stop = entry.subscribe(() => {
    renders++;
  });
  f.probe().success({ isExist: true });
  assert.equal(renders, 2);
  entry.menuActions[0].run();
  entry.menuActions[1].run();
  stop();
  f.emit({ scene: '10002' });
  assert.equal(renders, 2);
  entry.dispose();
  entry.dispose();
  assert.equal(f.off(), 1);
  const snapshot = entry.getSnapshot();
  f.navigate().success();
  f.shortcut().success();
  f.probe().fail();
  f.emit({ scene: '021036' });
  entry.menuActions[1].run();
  assert.deepEqual(entry.getSnapshot(), snapshot);
  assert.equal(f.writes(), 1);
});

test('late navigation callbacks cannot overwrite the latest entry collection message', () => {
  const f = fixture();
  const entry = attachBilibiliEntry(f.sdk, { gameId: 'game', now });
  f.probe().success({ isExist: true });
  entry.menuActions[0].run();
  f.emit({ scene: '021036' });
  const message = entry.getSnapshot().message;
  f.navigate().fail();
  assert.equal(entry.getSnapshot().message, message);
});
