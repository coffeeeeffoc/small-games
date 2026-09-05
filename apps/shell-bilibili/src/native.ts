import { startBilibiliShell, type ReviewedModule } from './shell.js';
import type { BilibiliSdk } from './sdk.js';
declare const bl: BilibiliSdk;
declare function require(path: string): ReviewedModule;
declare const BILIBILI_AD_UNIT_ID: string;

// Literal local require stays inside the reviewed code package; never a URL or downloaded script.
void startBilibiliShell(
  typeof bl === 'undefined' ? undefined : bl,
  () => require('./cultivation/game.js'),
  {
    adUnitId: BILIBILI_AD_UNIT_ID,
    sessionId: `bilibili-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  },
).catch((error: unknown) => {
  if (typeof bl !== 'undefined')
    bl.getLogManager().info({ event: 'game-launch-failed', message: String(error) });
});
