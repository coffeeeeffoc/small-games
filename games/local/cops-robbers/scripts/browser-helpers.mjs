import assert from 'node:assert/strict';

// Shared by solution playback and the command model; all actions still use the UI.
export async function loadPatrol(page, base, levelId, reduced = true) {
  await page.goto(`${base}/?dev=1&level=${levelId}${reduced ? '&motion=reduce' : ''}`, { waitUntil: 'networkidle' });
  assert.match(await page.title(), /围捕小队/, '端口没有返回围捕小队');
  await page.getByTestId('board').waitFor({ state: 'visible' });
  await page.waitForFunction(id => document.body.dataset.level === String(id) && document.body.dataset.phase === 'planning', levelId);
  assert.equal(await page.getByTestId('execute').count(), 0, '点击即移动，页面不应保留行动确认按钮');
}

export async function patrolSnapshot(page, level) {
  return page.evaluate(({ cops, robbers }) => ({
    cops: cops.map((_, i) => Number(document.getElementById(`cop-actor-${i}`).dataset.node)),
    robbers: robbers.map((_, i) => {
      const actor = document.getElementById(`robber-actor-${i}`);
      return actor ? Number(actor.dataset.node) : null;
    }),
    turn: Number(document.body.dataset.turn), phase: document.body.dataset.phase,
    remaining: Number(document.body.dataset.remaining), escaped: Number(document.body.dataset.escaped),
  }), level);
}

export async function completedHintFixture(target) {
  await target.addInitScript(() => {
    globalThis.SmallGamesPublishingConfig = { adMode: 'host' };
    globalThis.SmallGamesRewardAds = { offer: async () => ({ status: 'completed' }) };
  });
}
