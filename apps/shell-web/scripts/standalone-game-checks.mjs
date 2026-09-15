import { expect } from '@playwright/test';

export const markers = {
  'merge-front': '#start-defense',
  'night-merge': '#start-night',
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
  travel2: '[data-testid="begin-journey"]',
  'travel-bund': '#enter-world',
  'travel-bund-25d': 'main[data-ready="true"]',
  'vibeJam-myself-delivery': '#start',
  'vibeJam-myself-history-guess': '#start',
  'vibeJam-myself-nullrange': '#deploy',
};

export async function exerciseStandalone(frame, id, mobile = false) {
  const click = (locator) => (mobile ? locator.tap() : locator.click());
  if (id === 'merge-front') {
    await click(frame.locator('#start-defense'));
    await expect(frame.locator('#board [data-zone="board"][data-index]')).toHaveCount(12);
    await expect(frame.locator('#launch')).toBeVisible();
    const reserve = frame.locator('[data-zone="reserve"].occupied');
    const recruited = await reserve.count();
    await click(frame.locator('[data-offer="nezha:哪"]'));
    await expect(reserve).toHaveCount(recruited + 1);
  } else if (id === 'night-merge') {
    await click(frame.getByRole('button', { name: '开始守夜', exact: true }));
    await expect(frame.locator('.board [data-slot]')).toHaveCount(12);
    await expect(frame.locator('.board [data-slot].occupied')).toHaveCount(2);
    await click(frame.getByRole('button', { name: /^召唤守卫/ }));
    await expect(frame.locator('.board [data-slot].occupied')).toHaveCount(3);
  } else if (id === 'tower-defense-game') {
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
  } else if (id === 'travel-bund') {
    await expect(frame.locator('#enter-world')).toBeEnabled({ timeout: 120000 });
    await click(frame.locator('#enter-world'));
    await expect(frame.locator('main')).toHaveAttribute('data-phase', 'playing');
    // Escape also releases desktop pointer lock; touch uses the visible pause button.
    if (mobile) await click(frame.getByRole('button', { name: '暂停漫游' }));
    else {
      await frame.locator('canvas').press('Escape');
    }
    await expect(frame.getByRole('dialog')).toBeVisible();
  } else if (id === 'travel-bund-25d') {
    await expect(frame.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
    const scene = frame.locator('.scene');
    const initial = Number(await scene.getAttribute('data-progress'));
    await click(frame.getByRole('button', { name: '开始飞行', exact: true }));
    await expect(frame.locator('main')).toHaveAttribute('data-playing', 'true');
    await expect
      .poll(async () => Number(await scene.getAttribute('data-progress')))
      .toBeGreaterThan(initial);
    await click(frame.getByRole('button', { name: '暂停飞行', exact: true }));
    await expect(frame.locator('main')).toHaveAttribute('data-playing', 'false');
    await expect(frame.getByRole('button', { name: '开始飞行', exact: true })).toBeVisible();
  } else if (id === 'travel2') {
    const total = await frame.getByRole('button', { name: /^前往第\d+幕：/ }).count();
    await expect(frame.getByTestId('stamp-count')).toHaveText(`0 / ${total}`);
    await click(frame.getByTestId('begin-journey'));
    await click(frame.getByTestId('collect-stamp'));
    await expect(frame.locator('dialog')).toBeVisible();
    await click(frame.getByRole('button', { name: '盖上这一枚', exact: true }));
    await expect(frame.getByTestId('stamp-count')).toHaveText(`1 / ${total}`);
    await click(frame.getByRole('button', { name: '收好回忆', exact: true }));
    await expect(frame.locator('dialog')).toBeHidden();
  } else if (id === 'vibeJam-myself-delivery') {
    // Slow rendering must not slow the order clock (also exercises the frame-to-tick wiring).
    await frame.locator('body').evaluate(() => {
      const requestFrame = globalThis.requestAnimationFrame.bind(globalThis);
      globalThis.requestAnimationFrame = (callback) =>
        requestFrame(() =>
          globalThis.setTimeout(() => callback(globalThis.performance.now()), 400),
        );
    });
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
