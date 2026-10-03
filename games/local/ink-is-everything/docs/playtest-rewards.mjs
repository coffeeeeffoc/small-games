import assert from 'node:assert/strict';
import { snapshot, sleep } from './playtest-driver.mjs';

export function attachRewardHandler(player, report, capture, { checkReload = true } = {}) {
  player.rewardHistory = [];
  player.rewardReloadChecked = !checkReload;
  player.handleRewards = () => handleRewards(player, report, capture);
}

async function handleRewards(player, report, capture) {
  const page = player.page;
  for (let guard = 0; guard < 20; guard++) {
    let state = await snapshot(page);
    if (!state.pendingRewards.length) return;
    await player.release();
    await page.waitForFunction(
      () =>
        document.querySelector('#modal')?.open &&
        document.querySelector('#modal')?.dataset.kind === 'reward',
    );
    state = await snapshot(page);
    const pending = state.pendingRewards[0];
    if (!player.rewardReloadChecked) {
      const before = await snapshot(page);
      for (const key of ['Space', 'Escape', 'f', 'q']) await page.keyboard.press(key);
      await sleep(page, 200);
      const frozen = await snapshot(page);
      assert.equal(frozen.time, before.time);
      assert.equal(frozen.player.ink, before.player.ink);
      assert.deepEqual(frozen.pendingRewards, before.pendingRewards);
      assert.equal(await page.locator('#modal').evaluate((dialog) => dialog.open), true);
      await capture(page, player.mobile ? 'mobile-pending-reward' : 'desktop-pending-reward');
      await player.touch?.close();
      player.touch = null;
      await page.reload({ waitUntil: 'networkidle' });
      await player.init();
      assert.match(await page.locator('#start-game').textContent(), /继续/);
      await player.tap('#start-game');
      await page.waitForFunction(
        () =>
          document.querySelector('#modal')?.dataset.kind === 'reward' &&
          document.querySelector('#modal')?.open,
      );
      const restored = await snapshot(page);
      assert.deepEqual(
        restored.pendingRewards,
        before.pendingRewards,
        'Reload must retain exactly the same queued reward and choices',
      );
      assert.deepEqual(restored.equipment, before.equipment);
      assert.equal(restored.stats.rewardsChosen, before.stats.rewardsChosen);
      player.rewardReloadChecked = true;
      report.cases.push({
        name: `${player.mobile ? 'Touch' : 'Desktop'} reward pause and refresh preserve pending IDs, choices and equipment without rerolling or duplicate grants`,
        status: 'passed',
      });
      state = restored;
    }
    const preferred = [...pending.choices].sort((a, b) => {
      const score = (id) => {
        const m = state.definition.equipment[id]?.modifiers || {};
        return (
          (m.attackDamage || 0) * 4 +
          (m.meleeDamage || 0) * 3 +
          (m.lifeSteal || 0) * 4 +
          (m.maxInk || 0) / 10
        );
      };
      return score(b) - score(a);
    })[0];
    const oldRank = state.equipment[preferred] || 0,
      oldChosen = state.stats.rewardsChosen;
    await player.tap(`[data-reward="${preferred}"]`);
    await page.waitForFunction(
      (count) => window.__inkGame.snapshot().stats.rewardsChosen > count,
      oldChosen,
    );
    const after = await snapshot(page);
    assert.equal(after.equipment[preferred], oldRank + 1);
    assert.equal(after.stats.rewardsChosen, oldChosen + 1);
    assert.ok(!after.pendingRewards.some((reward) => reward.id === pending.id));
    player.rewardHistory.push({
      source: pending.source,
      rewardId: pending.id,
      item: preferred,
      rank: after.equipment[preferred],
      modifiers: state.definition.equipment[preferred].modifiers,
    });
  }
  throw new Error('Reward queue did not drain');
}
