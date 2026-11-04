import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

async function withStorage(run, before) {
  const files = new Map(
    await Promise.all(
      ['night-storage.js', 'game-services.js', 'client.js'].map(async (name) => [
        '/' + name,
        await readFile(new URL('../' + name, import.meta.url), 'utf8'),
      ]),
    ),
  );
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', files.has(request.url) ? 'text/javascript' : 'text/html');
    response.end(files.get(request.url) || '<!doctype html><title>Isolated Night storage</title>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH,
    });
    const context = await browser.newContext();
    const origin = 'http://127.0.0.1:' + server.address().port;
    const open = async () => {
      const page = await context.newPage();
      await page.goto(origin);
      if (before) await before(page);
      await page.addScriptTag({ url: origin + '/night-storage.js' });
      await page.evaluate(() => globalThis.__nightStorageReady.then(() => undefined));
      return page;
    };
    await run({ page: await open(), open, context, origin });
    await context.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function recorderFixture() {
  const { createRunRecorder } = await import('/game-services.js');
  const calls = [],
    runs = new Map();
  const services = {
    config: { game: 'night-overwatch', apiUrl: '/fixture', platform: 'h5' },
    ruleVersion: 'v14',
    session: async () => ({ playerId: 'pilot-test' }),
    async startRun(input) {
      calls.push('start');
      const run = {
        id: input.requestId,
        board: input.mode,
        levelId: input.levelId,
        version: 'v14',
        seq: 0,
        status: 'active',
        expiresAt: Date.now() + 86400000,
      };
      runs.set(run.id, run);
      return { ...run };
    },
    async getRun({ runId }) {
      calls.push('get');
      return { ...runs.get(runId) };
    },
    async appendFrames({ runId, seq }) {
      calls.push('append');
      runs.get(runId).seq = seq;
    },
    async finishRun({ runId }) {
      calls.push('finish');
      runs.get(runId).status = 'finished';
      return { accepted: true, status: 'credited', points: 100, coins: 180, xp: 120 };
    },
  };
  globalThis.fixture = {
    calls,
    runs,
    services,
    recorder: createRunRecorder(services, { durable: { storage: localStorage } }),
  };
}

test('Night IndexedDB keeps legacy storage read-only, persists across reloads and masks deleted legacy values', async () => {
  const source = await readFile(new URL('../night-storage.js', import.meta.url), 'utf8');
  const server = createServer((request, response) =>
    response.end('<!doctype html><title>Storage test</title>'),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH,
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => {
      localStorage.setItem('night-overwatch-muted', 'true');
      localStorage.setItem('night-overwatch-room-v1', 'old-room');
    });
    const denyLegacyWrites = () => {
      globalThis.nativeWrites = 0;
      for (const name of ['setItem', 'removeItem', 'clear'])
        Storage.prototype[name] = function () {
          globalThis.nativeWrites++;
          throw new DOMException('Legacy storage is read-only', 'QuotaExceededError');
        };
    };
    await page.addInitScript({ content: `(${denyLegacyWrites})();\n${source}` });
    await page.reload();
    assert.deepEqual(
      await page.evaluate(async () => {
        await globalThis.__nightStorageReady;
        const legacy = localStorage.getItem('night-overwatch-muted');
        localStorage.setItem('night-overwatch-muted', 'false');
        localStorage.removeItem('night-overwatch-room-v1');
        await localStorage.refresh();
        await localStorage.flush();
        return {
          legacy,
          value: localStorage.getItem('night-overwatch-muted'),
          writes: globalThis.nativeWrites,
        };
      }),
      { legacy: 'true', value: 'false', writes: 0 },
    );
    await page.reload();
    assert.deepEqual(
      await page.evaluate(async () => {
        await globalThis.__nightStorageReady;
        return {
          value: localStorage.getItem('night-overwatch-muted'),
          removed: localStorage.getItem('night-overwatch-room-v1'),
          writes: globalThis.nativeWrites,
        };
      }),
      { value: 'false', removed: null, writes: 0 },
    );
    await context.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('full and write-disabled legacy storage cannot prevent an IndexedDB-backed run or settlement', async () => {
  await withStorage(
    async ({ page }) => {
      await page.evaluate(recorderFixture);
      assert.deepEqual(
        await page.evaluate(async () => {
          const { recorder, calls } = fixture;
          await recorder.start({ mode: 'campaign', levelId: 'first' });
          const started = recorder.status;
          recorder.record({ aim: 1 }, 120);
          const result = await recorder.finish();
          return {
            started,
            status: recorder.status,
            accepted: result?.accepted,
            starts: calls.filter((x) => x === 'start').length,
            finishes: calls.filter((x) => x === 'finish').length,
            nativeWrites,
          };
        }),
        {
          started: 'recording',
          status: 'finished',
          accepted: true,
          starts: 1,
          finishes: 1,
          nativeWrites: 0,
        },
      );
    },
    (page) =>
      page.evaluate(() => {
        let size = 0;
        for (let step = 1024 * 1024; step >= 1; step = Math.floor(step / 2))
          while (true) {
            try {
              localStorage.setItem('quota-test', 'x'.repeat(size + step));
              size += step;
            } catch {
              break;
            }
          }
        globalThis.nativeWrites = 0;
        for (const method of ['setItem', 'removeItem', 'clear'])
          Storage.prototype[method] = () => {
            nativeWrites++;
            throw new DOMException('quota', 'QuotaExceededError');
          };
      }),
  );
});

test('aborted IDB transactions never admit a run; receipt failures keep recoverable input', async () => {
  for (const fault of ['initial', 'attempt', 'receipt'])
    await withStorage(async ({ page }) => {
      await page.evaluate(recorderFixture);
      const result = await page.evaluate(async (fault) => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
          const request = put.call(this, value, key);
          if (
            String(key).startsWith('night-pending-run-v1:') &&
            (fault === 'initial' ||
              (fault === 'receipt' && String(key).endsWith(':synced')) ||
              (fault === 'attempt' && value && JSON.parse(value).startAttempted))
          )
            request.addEventListener('success', () => this.transaction.abort());
          return request;
        };
        const { recorder, calls } = fixture;
        await recorder.start({ mode: 'campaign', levelId: 'first' });
        if (fault === 'receipt') {
          recorder.record({}, 120);
          await recorder.finish();
        }
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open('night-overwatch-storage-v1', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const persisted = await new Promise((resolve) => {
          const tx = database.transaction('values'),
            request = tx.objectStore('values').getAll();
          tx.oncomplete = () =>
            resolve(request.result.filter((value) => value && JSON.parse(value)?.schema === 1));
        });
        database.close();
        return {
          status: recorder.status,
          detail: recorder.storageDiagnostic,
          starts: calls.filter((x) => x === 'start').length,
          persisted: persisted.length,
        };
      }, fault);
      assert.equal(result.starts, fault === 'receipt' ? 1 : 0);
      assert.equal(result.status, fault === 'receipt' ? 'finished' : 'storage-unavailable');
      assert.equal(result.persisted, fault === 'initial' ? 0 : 1);
      if (fault !== 'receipt') assert.match(result.detail, /stage=commit\nsource=indexedDB/);
    });
});

test('a stale page refreshes committed receipts without BroadcastChannel before replaying', async () => {
  await withStorage(
    async ({ page, open }) => {
      await page.evaluate(recorderFixture);
      const run = await page.evaluate(async () => {
        await fixture.recorder.start({ mode: 'campaign', levelId: 'first' });
        fixture.recorder.record({}, 120);
        fixture.recorder.persist();
        await localStorage.flush();
        const name = Array.from({ length: localStorage.length }, (_, i) =>
          localStorage.key(i),
        ).find((key) => key.startsWith('night-pending-run-v1:'));
        return { name, journal: JSON.parse(localStorage.getItem(name)) };
      });
      const other = await open();
      await other.evaluate(async ({ name, journal }) => {
        localStorage.setItem(
          name + ':synced',
          JSON.stringify({
            schema: 1,
            synced: true,
            requestId: journal.requestId,
            playerId: journal.playerId,
            id: journal.id,
            result: { accepted: true },
          }),
        );
        localStorage.removeItem(name);
        await localStorage.flush();
      }, run);
      assert.deepEqual(
        await page.evaluate(async () => {
          fixture.calls.length = 0;
          fixture.recorder.persist();
          await fixture.recorder.finish();
          return { calls: fixture.calls, status: fixture.recorder.status };
        }),
        { calls: [], status: 'finished' },
      );
    },
    (page) =>
      page.evaluate(() => {
        globalThis.BroadcastChannel = undefined;
      }),
  );
});

test('unavailable or unreadable IndexedDB permits old preferences but never claims persistence', async () => {
  for (const fault of ['missing', 'read'])
    await withStorage(
      async ({ page }) => {
        assert.deepEqual(
          await page.evaluate(async () => {
            const value = localStorage.getItem('night-overwatch-muted');
            localStorage.setItem('night-overwatch-muted', 'false');
            let failed = false;
            try {
              await localStorage.flush();
            } catch {
              failed = true;
            }
            return { value, failed };
          }),
          { value: 'true', failed: true },
        );
      },
      (page) =>
        page.evaluate((fault) => {
          localStorage.setItem('night-overwatch-muted', 'true');
          if (fault === 'missing')
            Object.defineProperty(globalThis, 'indexedDB', { value: undefined });
          else {
            const get = IDBObjectStore.prototype.getAll;
            IDBObjectStore.prototype.getAll = function (...args) {
              const request = get.apply(this, args);
              request.addEventListener('success', () => this.transaction.abort());
              return request;
            };
          }
        }, fault),
    );
});

test('identity CAS rejects stale profile, logout and login responses without cross-page notifications', async () => {
  for (const operation of ['profile', 'logout', 'login'])
    await withStorage(
      async ({ page, open }) => {
        const identity = await page.evaluate(async (operation) => {
          await import('/client.js');
          const credential = {
            identityKind: 'guest',
            game: 'night-overwatch',
            sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            playerId: 'pilot-a',
            token: 'a'.repeat(64),
            refreshToken: 'b'.repeat(64),
            expiresAt: Date.now() + 900000,
            refreshExpiresAt: Date.now() + 86400000,
          };
          globalThis.auth = __createCompetitionIdentity({
            config: { platform: 'h5', game: 'night-overwatch', apiUrl: '/api' },
            storage: localStorage,
            request: async () =>
              operation === 'login'
                ? new Promise((resolve) => {
                    globalThis.reply = () => resolve(credential);
                  })
                : credential,
          });
          globalThis.credential = credential;
          if (operation === 'login') {
            globalThis.login = auth.current().then(
              () => 'accepted',
              (error) => error.code,
            );
            while (!globalThis.reply) await new Promise((resolve) => setTimeout(resolve, 0));
          } else await auth.current();
          return { key: auth.storageKey, authority: auth.authority, credential };
        }, operation);
        const other = await open();
        await other.evaluate(async ({ key, authority, credential }) => {
          localStorage.setItem(
            key,
            JSON.stringify({
              ...credential,
              apiAuthority: authority,
              sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              playerId: 'pilot-b',
            }),
          );
          await localStorage.flush();
        }, identity);
        const result = await page.evaluate(async (operation) => {
          let code;
          try {
            if (operation === 'login') {
              reply();
              code = await login;
            } else if (operation === 'profile')
              await auth.acceptProfile(
                { playerId: 'pilot-a', game: 'night-overwatch', nickname: 'late A' },
                credential,
              );
            else await auth.logout();
          } catch (error) {
            code = error.code;
          }
          await localStorage.refresh();
          return { code, owner: JSON.parse(localStorage.getItem(auth.storageKey)).playerId };
        }, operation);
        assert.deepEqual(result, { code: 'SESSION_CHANGED', owner: 'pilot-b' });
      },
      (page) =>
        page.evaluate(() => {
          globalThis.BroadcastChannel = undefined;
        }),
    );
});

test('session creation is not exposed when its successful put is followed by an aborted transaction', async () => {
  await withStorage(async ({ page }) => {
    assert.deepEqual(
      await page.evaluate(async () => {
        await import('/client.js');
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
          const request = put.call(this, value, key);
          if (String(key).startsWith('competition-session-v3:'))
            request.addEventListener('success', () => this.transaction.abort());
          return request;
        };
        const auth = __createCompetitionIdentity({
          config: { platform: 'h5', game: 'night-overwatch', apiUrl: '/api' },
          storage: localStorage,
          request: async () => ({
            identityKind: 'guest',
            game: 'night-overwatch',
            sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            playerId: 'pilot-a',
            token: 'a'.repeat(64),
            refreshToken: 'b'.repeat(64),
            expiresAt: Date.now() + 900000,
            refreshExpiresAt: Date.now() + 86400000,
          }),
        });
        let code;
        try {
          await auth.current();
        } catch (error) {
          code = error.code;
        }
        return { code, saved: auth.saved() };
      }),
      { code: 'STORAGE_UNAVAILABLE', saved: null },
    );
  });
});

test('failed run writes cannot block an already durable identity or its rotating refresh', async () => {
  await withStorage(async ({ page }) => {
    assert.deepEqual(
      await page.evaluate(async () => {
        await import('/client.js');
        let requests = 0;
        const auth = __createCompetitionIdentity({
          config: { platform: 'h5', game: 'night-overwatch', apiUrl: '/api' },
          storage: localStorage,
          request: async () => ({
            identityKind: 'guest',
            game: 'night-overwatch',
            sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            playerId: 'pilot-a',
            token: (++requests === 1 ? 'a' : 'c').repeat(64),
            refreshToken: 'b'.repeat(64),
            expiresAt: Date.now() + 900000,
            refreshExpiresAt: Date.now() + 86400000,
          }),
        });
        const credential = await auth.current();
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
          if (String(key).startsWith('night-pending-run-v1:'))
            throw new DOMException('Run quota', 'QuotaExceededError');
          return put.call(this, value, key);
        };
        localStorage.setItem('night-pending-run-v1:test', 'unsaved input');
        try {
          await localStorage.flush();
        } catch {}
        const existing = await auth.current();
        auth.invalidate(credential, { code: 'SESSION_EXPIRED' });
        const refreshed = await auth.current();
        return { existing: existing.playerId, refreshed: refreshed.playerId, requests };
      }),
      { existing: 'pilot-a', refreshed: 'pilot-a', requests: 2 },
    );
  });
});

test('an unfinished legacy journal is recovered into IndexedDB without mutating its original data', async () => {
  await withStorage(
    async ({ page }) => {
      assert.deepEqual(
        await page.evaluate(async () => {
          const { createRunRecorder } = await import('/game-services.js');
          fixture.calls.length = 0;
          const restored = createRunRecorder(fixture.services, {
            durable: { storage: localStorage },
          });
          await restored.recover();
          await localStorage.flush();
          return {
            status: restored.status,
            finishes: fixture.calls.filter((call) => call === 'finish').length,
            hidden: localStorage.getItem(legacyJournal.name),
            original: legacyStore.getItem(legacyJournal.name) === legacyJournal.value,
            nativeWrites,
          };
        }),
        { status: 'finished', finishes: 1, hidden: null, original: true, nativeWrites: 0 },
      );
    },
    async (page) => {
      await page.evaluate(recorderFixture);
      await page.evaluate(async () => {
        const finish = fixture.services.finishRun;
        fixture.services.finishRun = async () => {
          throw Object.assign(Error('offline'), { code: 'SERVICE_UNAVAILABLE' });
        };
        await fixture.recorder.start({ mode: 'campaign', levelId: 'first' });
        fixture.recorder.record({}, 120);
        await fixture.recorder.finish();
        fixture.services.finishRun = finish;
        const name = Array.from({ length: localStorage.length }, (_, i) =>
          localStorage.key(i),
        ).find((key) => key.startsWith('night-pending-run-v1:'));
        globalThis.legacyJournal = { name, value: localStorage.getItem(name) };
        globalThis.legacyStore = localStorage;
        globalThis.nativeWrites = 0;
        for (const method of ['setItem', 'removeItem', 'clear'])
          Storage.prototype[method] = () => {
            nativeWrites++;
            throw Error('Legacy read-only');
          };
      });
    },
  );
});
