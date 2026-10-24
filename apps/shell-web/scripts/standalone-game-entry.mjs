import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export const markers = {
  'porcelain-puzzle': 'body[data-screen="home"]',
  'ashfall-front': '#GameCanvas',
  'carrom-club': '#start',
  'three-choose-two': '#GameCanvas',
  'cage-rescue': '#start',
  'flick-arena': '#start',
  'tower-brake': '#GameCanvas',
  'chase-thief': '#GameCanvas',
  'moss-garden': '[data-action="start"]',
  'ball-roguelite': '#start',
  'castle-cannon': '#GameCanvas',
  'ember-bounce': '#start',
  'tianxia-chalu': '#start',
  'voiceprint-case': '#start',
  'echo-lab': '#scene [data-object="reflector-1"]',
  'bullet-garden': '#GameCanvas',
  'maze-wander': '#start',
  'urban-breakout': '#start',
  'homebound-station': 'body[data-homebound-ready="true"]',
  'rescue-team': '#fleet-1',

  'waterline-station': '#board[data-level="1"]',
  'tiny-signals': '#game-root[data-status="playing"]',
  'echo-weaver': '#emit',
  'ink-is-everything': '#start-game',
  'out-of-frame': '#board[data-level="1"]',
  'two-sided-box': '#board[data-level]',
  'luban-workshop': '#home-level-list [data-level-id="first-lift-v1"]',
  'surprise-kept': '#game[data-ready="true"]',
  tetracube: 'body[data-tetracube-ready="true"]',

  'wulong-city': '#start-game',
  'fold-the-world': '[data-action="start"]',
  'carding-car': 'body[data-kart-ready="true"]',
  'night-overwatch': '#GameCanvas',
  'merge-front': '#GameCanvas',
  'xiangqi-five': '#home-start',
  'cops-robbers': '#home-start',
  'cops-robbers-realtime': '#levels-button',

  'letters-words2': '#focus-button',

  'travel-bund': '#enter-world',

  'vibeJam-myself-delivery': '#start',
  'vibeJam-myself-history-guess': '#start',
  'vibeJam-myself-nullrange': '#deploy',
};

// Semantic IDs are intentionally independent of layout, position and display wording.
export const homeControls = {
  'porcelain-puzzle': '[data-action="start"]',
  'carrom-club': '#start',
  'cage-rescue': '#start',
  'flick-arena': ['#start', '#play-level'],
  'wulong-city': '#start-game',
  'moss-garden': '[data-action="start"]',
  'ball-roguelite': '#start',
  'ember-bounce': '#start',
  'tianxia-chalu': ['#start', '#begin-battle'],
  'voiceprint-case': '#start',
  'maze-wander': ['#start', '#enter'],
  'urban-breakout': '#start',
  'fold-the-world': '[data-action="start"]',
  'xiangqi-five': '#home-start',
  'cops-robbers': '#home-start',
  'cops-robbers-realtime': '#levels-button',

  'letters-words2': '#focus-button',

  'vibeJam-myself-history-guess': ['#start', '#begin-level'],
  'vibeJam-myself-nullrange': '#deploy',
};

// Explicit compatibility list: these existing assertions still own their setup flow.
export const legacyEntryIds = [
  'ashfall-front',
  'castle-cannon',
  'tower-brake',
  'three-choose-two',
  'chase-thief',
  'tetracube',
  'merge-front',
  'homebound-station',
  'echo-lab',
  'bullet-garden',

  'rescue-team',

  'waterline-station',
  'tiny-signals',
  'echo-weaver',
  'ink-is-everything',
  'out-of-frame',
  'two-sided-box',
  'luban-workshop',
  'surprise-kept',

  'carding-car',
  'night-overwatch',

  'travel-bund',

  'vibeJam-myself-delivery',
];

export function entryMode(id) {
  assert(markers[id], `Missing entry adapter: ${id}`);
  if (Object.hasOwn(homeControls, id)) return 'adapter';
  assert(legacyEntryIds.includes(id), `Unreviewed entry mode: ${id}`);
  return 'legacy';
}

export async function enterStandalone(frame, id, mobile = false) {
  const mode = entryMode(id);
  const control = homeControls[id];
  if (mode === 'legacy') return mode; // The existing gameplay assertion performs setup.
  for (const selector of Array.isArray(control) ? control : [control]) {
    const locator = frame.locator(selector).first();
    await expect(locator).toBeVisible();
    await expect(locator).toBeEnabled();
    if (mobile) await locator.tap();
    else await locator.click();
  }
  return mode;
}
