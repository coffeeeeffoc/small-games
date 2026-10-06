import assert from 'node:assert/strict';
import { snapshot, sleep } from './playtest-driver.mjs';

export function attachRewardHandler(player, report, capture, { checkReload = true } = {}) {
  player.rewardHistory = [];
  player.rewardReloadChecked = !checkReload;
  player.handleRewards = () => handleRewards(player, report, capture);
}

async function handleRewards(player, report, capture) {
  const page = player.page;
  async function openChoices() {
    const modal = await page.locator('#modal').evaluate((dialog) => ({
      open: dialog.open,
      kind: dialog.dataset.kind,
    }));
    if (modal.open && modal.kind === 'reward') return;
    if (modal.open && await page.locator('[data-menu="reward"]').count())
      await player.tap('[data-menu="reward"]');
    else {
      if (modal.open) await player.tap('#modal-close');
      await player.tap('#reward');
    }
    await page.waitForFunction(
      () => document.querySelector('#modal')?.open &&
        document.querySelector('#modal')?.dataset.kind === 'reward',
    );
  }
  for (let guard = 0; guard < 20; guard++) {
    let state = await snapshot(page);
    if (!state.pendingRewards.length || state.status === 'lost') return;
    await player.release();
    await openChoices();
    state = await snapshot(page);
    let pending = state.pendingRewards[0];
    if (!player.rewardReloadChecked && state.status === 'playing') {
      const before = await snapshot(page);
      for (const key of ['Space', 'f', 'q']) await page.keyboard.press(key);
      await sleep(page, 200);
      const frozen = await snapshot(page);
      assert.equal(frozen.time, before.time);
      assert.equal(frozen.player.ink, before.player.ink);
      assert.deepEqual(frozen.pendingRewards, before.pendingRewards);
      assert.equal(await page.locator('#modal').evaluate((dialog) => dialog.open), true);
      await capture(page, player.mobile ? 'mobile-pending-reward' : 'desktop-pending-reward');
      await player.tap('#modal-close');
      const closed = await snapshot(page);
      assert.equal(closed.paused, false);
      assert.deepEqual(closed.pendingRewards, before.pendingRewards);
      await sleep(page, 150);
      assert.ok((await snapshot(page)).time > closed.time, 'Closing deferred choices resumes play');
      await openChoices();
      const saved = await snapshot(page);
      await player.touch?.close();
      player.touch = null;
      await page.reload({ waitUntil: 'networkidle' });
      await player.init();
      assert.match(await page.locator('#start-game').textContent(), /继续/);
      await player.tap('#start-game');
      assert.equal(await page.locator('#modal').evaluate((dialog) => dialog.open), false);
      assert.equal((await snapshot(page)).paused, false);
      await openChoices();
      const restored = await snapshot(page);
      assert.deepEqual(
        restored.pendingRewards,
        saved.pendingRewards,
        'Reload must retain exactly the same queued reward and choices',
      );
      assert.deepEqual(restored.equipment, saved.equipment);
      assert.equal(restored.stats.rewardsChosen, saved.stats.rewardsChosen);
      player.rewardReloadChecked = true;
      report.cases.push({
        name: `${player.mobile ? 'Touch' : 'Desktop'} player opens, defers and reopens equipment; refresh retains pending choices without forcing the menu open`,
        status: 'passed',
      });
      state = restored;
      pending = state.pendingRewards[0];
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
