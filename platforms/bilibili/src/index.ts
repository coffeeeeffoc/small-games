import { createCanvasSurface } from '@coffeeeeffoc/canvas-game-adapter';
import { HostError } from '@coffeeeeffoc/game-contract';
import {
  startNativeGame,
  type LaunchOptions,
  type NativeSdk,
  type ReviewedModule,
} from '@coffeeeeffoc/native-game-shell';

export interface StandaloneBilibiliSdk extends NativeSdk {
  launchSuccess(): void;
  checkScene(options: {
    scene: 'sidebar';
    success(result: { isExist: boolean }): void;
    fail(): void;
  }): void;
  navigateToScene(options: { scene: 'sidebar'; success(): void; fail(): void }): void;
  addShortcut(options: { success(): void; fail(): void }): void;
  showToast(options: { title: string; icon: 'none' }): void;
}

/** Single game's launch screen owns Bilibili's daily entry gifts, not the game rules. */
export async function startBilibiliGame(
  sdk: StandaloneBilibiliSdk,
  game: ReviewedModule,
  title: string,
  adUnitId?: string,
) {
  const key = `bilibili:${game.definition.manifest.gameId}:entry-gifts`;
  let scene = '';
  let sidebar = false;
  let started = false;
  let disposed = false;
  let message = '';
  let writable = true;
  let gifts: { count: number; sidebar?: string; desktop?: string } = { count: 0 };
  const toast = (text: string) => {
    try {
      sdk.showToast({ title: text, icon: 'none' });
    } catch {
      /* Optional notification. */
    }
  };
  try {
    const stored = sdk.getStorageSync(key);
    const value = typeof stored === 'string' ? JSON.parse(stored) : null;
    if (stored !== undefined && stored !== null && stored !== '') {
      if (!value || typeof value !== 'object') throw new Error('Invalid entry gifts');
      if (
        !Number.isSafeInteger(value.count) ||
        value.count < 0 ||
        !['sidebar', 'desktop'].every(
          (name) => value[name] === undefined || /^\d{4}-\d{2}-\d{2}$/.test(value[name]),
        )
      )
        throw new Error('Invalid entry gifts');
      gifts = { count: value.count, sidebar: value.sidebar, desktop: value.desktop };
    }
  } catch {
    writable = false;
    message = '收藏暂时无法读取，请稍后重试。';
  }
  const canvas = sdk.createCanvas();
  const size = sdk.getSystemInfoSync();
  canvas.width = size.windowWidth;
  canvas.height = size.windowHeight;
  let visible = true;
  let draw = () => {};
  const gift = (kind: 'sidebar' | 'desktop') => {
    if (scene !== (kind === 'sidebar' ? '021036' : '10002')) return false;
    if (!writable) return true;
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (gifts[kind] === today) {
      message = '今天的收藏签已领取。';
      return true;
    }
    const next = { ...gifts, count: gifts.count + 1, [kind]: today };
    try {
      sdk.setStorageSync(key, JSON.stringify(next));
      gifts = next;
      message = '每日收藏签 +1，已保存。';
      if (started) toast(message);
    } catch {
      message = '领取未保存，请稍后重试。';
    }
    return true;
  };
  const show = (options?: LaunchOptions) => {
    if (disposed) return;
    visible = true;
    scene = String(options?.scene ?? '');
    gift('sidebar');
    gift('desktop');
    if (!started) draw();
  };
  const hide = () => {
    visible = false;
  };
  // Register synchronously, before asynchronous content/storage/mount work.
  sdk.onShow(show);
  sdk.onHide(hide);
  const surface = createCanvasSurface({
    canvas,
    onTap(listener) {
      const touch: Parameters<NativeSdk['onTouchEnd']>[0] = (event) => {
        const point = event.changedTouches[0];
        if (visible && point) listener(point.clientX, point.clientY);
      };
      sdk.onTouchEnd(touch);
      return () => sdk.offTouchEnd(touch);
    },
  });
  let start!: () => void;
  const selected = new Promise<ReviewedModule>((resolve) => {
    start = () => {
      if (started) return;
      started = true;
      try {
        surface.dispose();
      } catch {
        /* SDK cleanup cannot prevent game startup. */
      }
      resolve(game);
    };
  });
  draw = () =>
    surface.draw({
      title,
      lines: [`每日收藏签 ${gifts.count}`, message || '从侧边栏或桌面进入，每天各收藏一签。'],
      actions: [
        { label: '开始游戏', run: start },
        ...(sidebar
          ? [
              {
                label: '侧边栏每日收藏',
                run() {
                  if (gift('sidebar')) return draw();
                  const fail = () => {
                    message = '暂时无法打开侧边栏。';
                    draw();
                  };
                  try {
                    sdk.navigateToScene({ scene: 'sidebar', success() {}, fail });
                  } catch {
                    fail();
                  }
                },
              },
            ]
          : []),
        {
          label: '添加桌面 · 每日收藏',
          run() {
            if (gift('desktop')) return draw();
            const fail = () => {
              message = '暂时无法添加桌面，请稍后重试。';
              draw();
            };
            try {
              sdk.addShortcut({
                success() {
                  message = '已添加，从桌面进入可领取每日收藏签。';
                  draw();
                },
                fail,
              });
            } catch {
              fail();
            }
          },
        },
      ],
    });
  const drawMenu = draw;
  draw = () => {
    if (!started && !disposed) drawMenu();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    for (const stop of [
      () => surface.dispose(),
      () => sdk.offShow(show),
      () => sdk.offHide(hide),
    ]) {
      try {
        stop();
      } catch {
        /* Continue releasing the other SDK resources. */
      }
    }
  };
  try {
    draw();
    sdk.launchSuccess();
    try {
      sdk.checkScene({
        scene: 'sidebar',
        success(result) {
          sidebar = result.isExist === true;
          draw();
        },
        fail() {},
      });
    } catch {
      /* Older clients may not support sidebar entry. */
    }
    const instance = await startNativeGame(sdk, () => selected, {
      platformId: 'bilibili',
      canvas,
      adUnitId,
      sessionId: `bilibili-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    return {
      pause: instance.pause,
      resume: instance.resume,
      async dispose() {
        cleanup();
        await instance.dispose();
      },
    };
  } catch (error) {
    cleanup();
    throw new HostError({ code: 'UNAVAILABLE', message: `小游戏启动失败：${String(error)}` });
  }
}
