import assert from 'node:assert/strict';

export function nativeFixture(createPage, { storageFails = false } = {}) {
  const saved = new Map(),
    files = new Map(),
    notices = [];
  let pick;
  const context = new Proxy(
    {},
    {
      get: (target, key) => target[key] || (() => {}),
      set: (target, key, value) => ((target[key] = value), true),
    },
  );
  const canvas = { getContext: () => context };
  const fs = {
    unlinkSync: (path) => files.delete(path),
    writeFileSync: (path, value) => files.set(path, value),
    readFileSync: (path) => files.get(path),
  };
  const host = {
    env: { USER_DATA_PATH: '/user' },
    getFileSystemManager: () => fs,
    getStorageSync: (key) => saved.get(key),
    setStorageSync: (key, value) => {
      if (storageFails) throw new Error('denied');
      saved.set(key, value);
    },
    showToast: (value) => notices.push(value.title),
    getWindowInfo: () => ({ pixelRatio: 3 }),
    createSelectorQuery: () => ({
      in() {
        return this;
      },
      select() {
        return this;
      },
      fields() {
        return this;
      },
      exec(fn) {
        fn([{ node: canvas, width: 358, height: 290 }]);
      },
    }),
    chooseMessageFile(options) {
      pick = options;
    },
    shareFileMessage({ success }) {
      success();
    },
    setClipboardData({ success }) {
      success();
    },
    getClipboardData({ success }) {
      success({ data: '{}' });
    },
  };
  const definition = createPage(host);
  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(values, callback) {
      assert.notEqual(this.alive, false, 'no setData after unload');
      Object.assign(this.data, values);
      callback?.();
    },
  };
  page.onLoad();
  page.onReady();
  return { page, host, saved, files, notices, canvas, pick: () => pick, definition };
}
