import { startBilibiliShell, type ReviewedModule } from './shell.js';
import type { BilibiliSdk } from './sdk.js';
import { createCanvasSurface } from '@coffeeeeffoc/canvas-game-adapter';
declare const bl: BilibiliSdk;
declare function require(path: string): ReviewedModule;
declare const BILIBILI_AD_UNIT_ID: string;

const sdk = typeof bl === 'undefined' ? undefined : bl;
if (sdk) {
  const canvas = sdk.createCanvas();
  const dimensions = sdk.getSystemInfoSync();
  canvas.width = dimensions.windowWidth;
  canvas.height = dimensions.windowHeight;
  const surface = createCanvasSurface({
    canvas,
    onTap(listener) {
      const touch = (event: { changedTouches: Array<{ clientX: number; clientY: number }> }) => {
        const first = event.changedTouches[0];
        if (first) listener(first.clientX, first.clientY);
      };
      sdk.onTouchEnd(touch);
      return () => sdk.offTouchEnd(touch);
    },
    onPress:
      sdk.onTouchStart && sdk.offTouchStart
        ? (start, end) => {
            const touchStart = (event: {
              changedTouches: Array<{ clientX: number; clientY: number }>;
            }) => {
              const first = event.changedTouches[0];
              if (first) start(first.clientX, first.clientY);
            };
            const touchEnd = () => end();
            sdk.onTouchStart?.(touchStart);
            sdk.onTouchEnd(touchEnd);
            return () => {
              sdk.offTouchStart?.(touchStart);
              sdk.offTouchEnd(touchEnd);
            };
          }
        : undefined,
  });
  const games = [
    {
      id: 'cultivation' as const,
      title: '三分钟修仙',
      load: () => require('./cultivation/game.js'),
    },
    { id: 'office' as const, title: '打工人摸鱼记', load: () => require('./office/game.js') },
    { id: 'arena' as const, title: '电子斗蛐蛐', load: () => require('./arena/game.js') },
  ];
  surface.draw({
    title: '摸鱼游戏社',
    lines: ['选择一个已审核的本地 Game。'],
    actions: games.map((game) => ({
      label: game.title,
      run() {
        surface.dispose();
        void startBilibiliShell(sdk, game.load, {
          gameId: game.id,
          adUnitId: BILIBILI_AD_UNIT_ID,
          sessionId: `bilibili-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }).catch((error: unknown) =>
          sdk.getLogManager().info({ event: 'game-launch-failed', message: String(error) }),
        );
      },
    })),
  });
}
