import { createAdRuntime } from '@coffeeeeffoc/ad-runtime';
import { createBrowserGameHost } from '@coffeeeeffoc/game-host';
import {
  HostError,
  type GameHost,
  type GameManifest,
  type GameSessionContext,
} from '@coffeeeeffoc/game-contract';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import { createBilibiliAdProvider } from './ads.js';
import type { BilibiliSdk } from './sdk.js';

/** Maps SDK storage, navigation, logging and Host Ad onto Game Host without leaking SDK objects. */
export function createBilibiliGameHost(
  sdk: BilibiliSdk,
  manifest: GameManifest,
  content: DynamicContentEnvelope,
  options: {
    adUnitId?: string;
    adAuthority?: 'host' | 'none';
    sessionId: string;
    online?: boolean;
    capabilities?: GameSessionContext['capabilities'];
  },
): GameHost {
  const telemetry = {
    async track(name: string, properties?: Readonly<Record<string, unknown>>) {
      sdk
        .getLogManager()
        .info({ name, properties, gameId: manifest.gameId, sessionId: options.sessionId });
    },
  };
  return createBrowserGameHost({
    session: {
      gameId: manifest.gameId,
      gameVersion: manifest.version,
      sessionId: options.sessionId,
      adAuthority: options.adAuthority ?? 'host',
      releaseChannel: 'stable',
      locale: 'zh-CN',
      capabilities: options.capabilities ?? [
        'content',
        'storage',
        'advertising',
        'navigation',
        'telemetry',
      ],
    },
    online: options.online,
    content,
    storagePrefix: `bilibili:${manifest.gameId}:`,
    storage: {
      getItem(key) {
        const value = sdk.getStorageSync(key);
        return typeof value === 'string' && value ? value : null;
      },
      setItem: (key, value) => sdk.setStorageSync(key, value),
      removeItem: (key) => sdk.removeStorageSync(key),
    },
    telemetry,
    navigation: {
      async navigate(destination) {
        if (destination !== 'exit')
          throw new HostError({ code: 'INVALID_INPUT', message: 'Unapproved native navigation' });
        await new Promise<void>((resolve, reject) =>
          sdk.exitMiniProgram({
            success: resolve,
            fail: () =>
              reject(new HostError({ code: 'UNAVAILABLE', message: 'Native navigation failed' })),
          }),
        );
      },
    },
    advertising: () =>
      createAdRuntime({
        authority: options.adAuthority ?? 'host',
        host: createBilibiliAdProvider(sdk, options.adUnitId),
        telemetry,
      }),
  });
}
