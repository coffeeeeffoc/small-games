import { expect, it, vi } from 'vitest';
import { createNativeGameHost } from './host.js';
import type { NativeSdk } from './sdk.js';
import type { GameManifest } from '@coffeeeeffoc/game-contract';

it('a renamed game resumes and updates its original save without changing the public session ID', async () => {
  const key = 'three-choose-two-progress-v1';
  const oldKey = `wechat:three-choose-two:${key}`;
  const records = new Map([[oldKey, JSON.stringify({ version: '3', value: { unlocked: 42 } })]]);
  const sdk = {
    getStorageSync: (name: string) => records.get(name),
    setStorageSync: (name: string, value: string) => records.set(name, value),
    removeStorageSync: (name: string) => records.delete(name),
    getLogManager: () => ({ info: vi.fn() }),
  } as unknown as NativeSdk;
  const manifest = { gameId: 'place-and-clear', version: '1.0.0' } as GameManifest;
  const host = createNativeGameHost(
    sdk,
    manifest,
    {
      gameId: 'place-and-clear',
      schemaVersion: 1,
      revision: 1,
      payload: {},
    },
    { platformId: 'wechat', storageGameId: 'three-choose-two', sessionId: 'rename', online: true },
  );
  expect(host.session.gameId).toBe('place-and-clear');
  expect(await host.storage.read(key)).toEqual({ version: '3', value: { unlocked: 42 } });
  await host.storage.write(key, { unlocked: 43 }, '3');
  expect(JSON.parse(records.get(oldKey)!)).toEqual({ version: '4', value: { unlocked: 43 } });
  expect(records.has(`wechat:place-and-clear:${key}`)).toBe(false);
});
