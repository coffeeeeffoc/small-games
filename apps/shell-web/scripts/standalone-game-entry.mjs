import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export const markers = {
  'orbit-atelier': '#orbit-app[data-ready="true"]',
  'ball-roguelite': '#start',
  'castle-cannon': '.castle-root[data-ready="true"]',
  'ember-bounce': '#start',
  'tianxia-chalu': '#start',
  'voiceprint-case': '#start',
  'echo-lab': '#scene [data-object="reflector-1"]',
  'bullet-garden': '#start',
  'maze-wander': '#start',
  'urban-breakout': '#start',
  'homebound-station': '[data-level="0"]',
  'balloon-movers': '#launch',
  'weather-command': '#board[data-level="1"]',
  'off-camera': '#bank [data-card]',
  'rescue-team': '#fleet-1',
  'precision-demolition': '#primary',
  'afterimage-arena': '#continue',
  'ghost-shift-manager': '#start',
  'rule-thief': '#actors .actor',
  'waterline-station': '#board[data-level="1"]',
  'tiny-signals': '#game-root[data-status="playing"]',
  'echo-weaver': '#emit',
  'ink-is-everything': '#start-game',
  'out-of-frame': '#board[data-level="1"]',
  'two-sided-box': '#board[data-level]',
  'luban-workshop': '#home-level-list [data-level-id="first-lift-v1"]',
  'surprise-kept': '#game[data-ready="true"]',
  'one-stroke-course': 'body[data-phase="drawing"]',
  'hold-tight-acrobats': '#start',
  'wulong-city': '[data-zone="shy-door"]',
  'fold-the-world': '[data-action="start"]',
  'carding-car': 'body[data-kart-ready="true"]',
  'night-overwatch': '#GameCanvas',
  'merge-front': '#start-defense',
  'night-merge': '#start-night',
  fishing: '.overlay.start .primary',
  'tower-defense-game': '[aria-label="塔防战场"]',
  'xiangqi-five': '#home-start',
  'office-slacking': '#start',
  'cops-robbers': '#home-start',
  'cops-robbers-realtime': '#levels-button',
  'h5-security': '[data-action="start"]',
  'letters-words': '#board button',
  'letters-words2': '#board button',
  'multi-battle': '[data-action="new"]',
  puzzle: '.cover',
  travel: '#travel-button',
  travel2: '[data-testid="begin-journey"]',
  'travel-bund': '#enter-world',
  'travel-bund-25d': 'main[data-ready="true"]',
  'vibeJam-myself-delivery': '#start',
  'vibeJam-myself-history-guess': '#start',
  'vibeJam-myself-nullrange': '#deploy',
};

// Semantic IDs are intentionally independent of layout, position and display wording.
export const homeControls = {
  'orbit-atelier': '[data-action="start"]',
  'ball-roguelite': '#start',
  'castle-cannon': '[data-action="start"]',
  'ember-bounce': '#start',
  'tianxia-chalu': '#start',
  'voiceprint-case': '#start',
  'maze-wander': ['#start', '#enter'],
  'urban-breakout': '#start',
  'homebound-station': '[data-level="0"]',
  'fold-the-world': '[data-action="start"]',
  'merge-front': '#start-defense',
  'xiangqi-five': '#home-start',
  'office-slacking': '#start',
  'cops-robbers': '#home-start',
  'cops-robbers-realtime': '#levels-button',
  'h5-security': '[data-action="start"]',
  'letters-words2': '#focus-button',
  'multi-battle': '[data-action="new"]',
  'vibeJam-myself-history-guess': '#start',
  'vibeJam-myself-nullrange': '#deploy',
};

// Explicit compatibility list: these existing assertions still own their setup flow.
export const legacyEntryIds = [
  'echo-lab',
  'bullet-garden',
  'balloon-movers',
  'weather-command',
  'off-camera',
  'rescue-team',
  'precision-demolition',
  'afterimage-arena',
  'ghost-shift-manager',
  'rule-thief',
  'waterline-station',
  'tiny-signals',
  'echo-weaver',
  'ink-is-everything',
  'out-of-frame',
  'two-sided-box',
  'luban-workshop',
  'surprise-kept',
  'one-stroke-course',
  'hold-tight-acrobats',
  'wulong-city',
  'carding-car',
  'night-overwatch',
  'night-merge',
  'fishing',
  'tower-defense-game',
  'letters-words',
  'puzzle',
  'travel',
  'travel2',
  'travel-bund',
  'travel-bund-25d',
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
