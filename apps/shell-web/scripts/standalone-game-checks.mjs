import { expect } from '@playwright/test';

export const markers = {
  fishing: '.overlay.start .primary',
  'tower-defense-game': '[aria-label="塔防战场"]',
  'xiangqi-five': '#draw-button',
  'office-slacking': '#start',
  'cops-robbers': '[data-testid="board"]',
  'cops-robbers-realtime': '#start-button',
  'h5-security': '[data-action="start"]',
  'letters-words': '#board button',
  'letters-words2': '#board button',
  'multi-battle': '[data-action="new"]',
  puzzle: '.cover',
  travel: '#travel-button',
  'vibeJam-myself-delivery': '#start',
  'vibeJam-myself-history-guess': '#start',
  'vibeJam-myself-nullrange': '#deploy',
};

export async function exerciseStandalone(frame, id, mobile = false) {
  const click = (locator) => (mobile ? locator.tap() : locator.click());
  if (id === 'tower-defense-game') {
    await click(frame.getByRole('button', { name: '切换速度，当前1倍' }));
    await expect(frame.getByRole('button', { name: '切换速度，当前2倍' })).toBeVisible();
  } else if (id === 'xiangqi-five') {
    await click(frame.locator('#draw-button'));
    await click(frame.locator('.cell').first());
    await expect(frame.locator('.cell.last-play')).toHaveCount(1);
  } else if (id === 'fishing') {
    await click(frame.getByRole('button', { name: '开始航行' }));
    await expect(frame.getByTestId('timer')).not.toHaveText('3:00');
    await click(frame.getByRole('button', { name: '暂停', exact: true }));
    await expect(frame.getByRole('button', { name: '继续航行' })).toBeVisible();
  } else if (id === 'office-slacking') {
    await click(frame.locator('#start'));
    await expect(frame.locator('.game')).toHaveAttribute('data-phase', 'playing');
    await expect(frame.locator('#asset-error')).toBeHidden();
  } else if (id === 'cops-robbers') {
    await click(frame.getByTestId('cop-0'));
    await click(frame.getByTestId('node-1'));
    await expect(frame.locator('body')).toHaveAttribute('data-turn', '1');
    await click(frame.getByTestId('undo'));
    await expect(frame.locator('body')).toHaveAttribute('data-turn', '0');
  } else if (id === 'cops-robbers-realtime') {
    await click(frame.locator('#start-button'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await click(frame.locator('.cop-card').first());
    await click(frame.locator('#pause-button'));
    await expect(frame.locator('#resume-button')).toBeVisible();
    await click(frame.locator('#resume-button'));
  } else if (id === 'h5-security') {
    await click(frame.locator('[data-action="start"]'));
    await expect(frame.locator('.home-screen')).toBeVisible();
    const notice = frame.locator('[data-action="dismiss-notification"]');
    if (await notice.isVisible()) await click(notice);
    await click(frame.locator('.app-grid [data-page="messages"]'));
    await expect(frame.locator('.thread-list')).toBeVisible();
  } else if (id === 'letters-words' || id === 'letters-words2') {
    const answer = id === 'letters-words' ? '#answer' : '#answer-slots';
    await click(frame.locator('#board button:enabled:not([aria-disabled="true"])').first());
    await expect(frame.locator(`${answer} .filled`)).toHaveCount(1);
    await click(frame.locator('#undo-button'));
    await expect(frame.locator(`${answer} .filled`)).toHaveCount(0);
  } else if (id === 'multi-battle') {
    await click(frame.locator('[data-action="new"]').first());
    await frame.locator('[name="seed"]').fill('shell-integration');
    await click(frame.locator('[data-action="start-game"]'));
    await expect(frame.locator('.map-stage')).toBeVisible();
    await click(frame.locator('[data-action="shop"][data-slot="0"]').first());
    await click(frame.locator('[data-action="buy"]').first());
    await expect(frame.locator('[data-drag-zone="hand"]')).toHaveCount(1);
  } else if (id === 'puzzle') {
    await click(frame.getByRole('button', { name: '开启档案', exact: true }));
    await click(frame.getByRole('button', { name: '进入现场', exact: true }));
    await click(frame.getByRole('button', { name: '调查提示', exact: true }));
    await expect(frame.locator('dialog')).toBeVisible();
    await click(frame.getByRole('button', { name: '关闭弹窗', exact: true }));
  } else if (id === 'travel') {
    await click(frame.locator('[data-place="oldtown"]'));
    await click(frame.locator('#travel-button'));
    await expect(frame.locator('#journey-dialog')).toBeVisible();
    await expect(frame.locator('#journey-loading')).toBeHidden({ timeout: 20000 });
    await expect(frame.locator('.journey-nav button')).toHaveCount(6);
    await click(frame.locator('#journey-collect'));
    await expect(frame.locator('#journey-collect')).toContainText('已收藏');
    await click(frame.locator('#journey-close'));
    await expect(frame.locator('#journey-dialog')).toBeHidden();
  } else if (id === 'vibeJam-myself-delivery') {
    await click(frame.locator('#start'));
    await click(frame.locator('[data-action="accept"]'));
    await expect(frame.locator('#timer')).toBeVisible();
    await expect(frame.locator('#timer')).not.toHaveText('03:00');
    await click(frame.locator('#minimap-button'));
    await expect(frame.locator('#large-map')).toBeVisible();
    await click(frame.getByRole('button', { name: '关闭地图' }));
  } else if (id === 'vibeJam-myself-history-guess') {
    await click(frame.locator('#start'));
    await expect(frame.locator('#load-cover')).toBeHidden({ timeout: 20000 });
    const mapTab = frame.locator('#map-tab');
    if (await mapTab.isVisible()) await click(mapTab);
    await frame.locator('#city-search').fill('北京');
    await click(frame.locator('#search-results button').first());
    await frame.locator('#year-number').fill('1420');
    await click(frame.locator('#submit'));
    await expect(frame.locator('#result-overlay')).toBeVisible();
  } else if (id === 'vibeJam-myself-nullrange') {
    await click(frame.locator('#deploy'));
    await expect(frame.locator('#hud')).toBeVisible();
    await click(frame.locator('#missile'));
    await expect(frame.locator('#missile-status')).not.toHaveText('× 6');
    await click(frame.locator('#pause'));
    await expect(frame.locator('#pause-dialog')).toBeVisible();
    await click(frame.locator('#resume'));
  } else {
    throw new Error(`Missing interaction check for ${id}`);
  }
}
