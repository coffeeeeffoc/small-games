import { expect } from '@playwright/test';

export const markers = {
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
  'two-sided-box': '#board[data-level="1"]',
  'luban-workshop': '#stage canvas',
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
  'xiangqi-five': '#draw-button',
  'office-slacking': '#start',
  'cops-robbers': '#start-mode',
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
  // Keep input native in both the embedded desktop and direct touch checks.
  const holdControl = async (selector, key, check) => {
    const page = frame.locator('canvas').page();
    const touch = mobile ? await page.context().newCDPSession(page) : undefined;
    try {
      if (touch) {
        const bounds = await frame.locator(selector).boundingBox();
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }],
        });
      } else {
        await page.keyboard.down(key);
      }
      await check();
    } finally {
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      } else {
        await page.keyboard.up(key);
      }
    }
  };
  if (id === 'voiceprint-case') {
    await click(frame.locator('#start'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing', {
      timeout: 20_000,
    });
    await expect(frame.locator('#game')).toBeVisible();
    await expect(frame.locator('#confirm')).toBeDisabled();
    // Starting a round automatically plays the scene after the user unlocks audio.
    await expect(frame.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
    await expect(frame.locator('#scene-play')).toHaveAttribute('aria-pressed', 'false', {
      timeout: 20_000,
    });
    await click(frame.locator('#scene-play'));
    await expect(frame.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
    for (const slot of [0, 1, 2]) {
      await click(frame.locator(`button[data-listen="${slot}"]`));
    }
    await click(frame.locator('button[data-select="0"]'));
    await expect(frame.locator('#confirm')).toBeEnabled();
    await click(frame.locator('#confirm'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'feedback');
    await expect(frame.locator('#feedback')).toBeVisible();
    await click(frame.locator('#next'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect(frame.locator('#feedback')).toBeHidden();
    await expect(frame.locator('#confirm')).toBeDisabled();
    await expect(frame.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
    await click(frame.locator('#stop'));
    await expect(frame.locator('#scene-play')).toHaveAttribute('aria-pressed', 'false');
  } else if (id === 'luban-workshop') {
    await click(frame.locator('#levels'));
    await click(frame.locator('[data-level="0"]'));
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '0');
    await click(frame.locator('[data-piece]').first());
    await click(frame.locator('#nudge-positive'));
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '1');
    await expect(frame.locator('#status')).toBeVisible();
    await click(frame.locator('#undo'));
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '0');
    await click(frame.locator('#redo'));
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '1');
  } else if (id === 'bullet-garden') {
    const snapshot = () =>
      frame.locator('body').evaluate(() => globalThis.__bulletGarden.snapshot());
    const page = frame.locator('#arena').page();
    await click(frame.locator('[data-boon="trench"]'));
    await frame.locator('#loadout-skill-0').selectOption('blast');
    await frame.locator('#loadout-skill-1').selectOption('gale');
    await click(frame.locator('#start'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    // Isolate the time-based skill charge from an XP modal opening between taps.
    await click(frame.locator('#auto-fire'));
    expect((await snapshot()).progression.nextXp).toBeGreaterThan(0);
    // Keep the middle of the battlefield available for direct touch targeting.
    if (mobile) {
      await expect
        .poll(() =>
          frame.locator('body').evaluate(() => {
            const target = globalThis.document.elementFromPoint(
              globalThis.innerWidth / 2,
              globalThis.innerHeight * 0.45,
            );
            return target?.id;
          }),
        )
        .toBe('arena');
    }
    expect((await snapshot()).boons).toEqual(['trench']);
    expect((await snapshot()).stats.skillCasts).toBe(0);

    const initialPlayer = (await snapshot()).player;
    const touch = mobile ? await page.context().newCDPSession(page) : undefined;
    try {
      if (touch) {
        const bounds = await frame.locator('#joystick').boundingBox();
        const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, ...start }],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ id: 1, x: start.x + 32, y: start.y }],
        });
      } else {
        await page.keyboard.down('d');
      }
      await expect
        .poll(async () => Math.abs((await snapshot()).player.x - initialPlayer.x))
        .toBeGreaterThan(12);
    } finally {
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      } else {
        await page.keyboard.up('d');
      }
    }
    await click(frame.locator('#pause'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'paused');
    const pausedTime = (await snapshot()).time;
    await page.waitForTimeout(150);
    expect((await snapshot()).time).toBe(pausedTime);
    await click(frame.locator('#resume'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect.poll(async () => (await snapshot()).time).toBeGreaterThan(pausedTime);
    const finishUpgrade = async () => {
      let current = await snapshot();
      while (current.phase === 'upgrade') {
        const choice = current.upgradeChoices.find((id) => !id.startsWith('boon-'));
        expect(choice).toBeTruthy();
        await click(frame.locator(`[data-upgrade="${choice}"]`));
        current = await snapshot();
      }
      return current;
    };
    await expect
      .poll(async () => (await finishUpgrade()).skillSlots[0].energy, { timeout: 20000 })
      .toBe(100);
    await finishUpgrade();
    // Full slots wait for the player's target; they never release automatically.
    expect((await snapshot()).stats.skillCasts).toBe(0);
    await click(frame.locator('[data-skill-slot="0"]'));
    const arena = frame.locator('#arena');
    const bounds = await arena.boundingBox();
    const target = { position: { x: bounds.width * 0.65, y: bounds.height * 0.4 } };
    if (mobile) await arena.tap(target);
    else await arena.click(target);
    await expect.poll(async () => (await snapshot()).stats.skillCasts).toBe(1);
    expect((await snapshot()).plants.every((plant) => plant.kind === 'trench')).toBe(true);
  } else if (id === 'maze-wander') {
    await click(frame.locator('#start'));
    await click(frame.locator('#enter'));
    await expect(frame.locator('#maze-game')).toHaveAttribute('data-screen', 'playing');
    if (mobile) {
      await click(frame.locator('#pause'));
    } else {
      const page = frame.locator('canvas').page();
      await page.keyboard.down('w');
      await page.waitForTimeout(350);
      await page.keyboard.up('w');
      await page.keyboard.press('Escape');
    }
    await expect(frame.locator('#maze-game')).toHaveAttribute('data-screen', 'pause');
    await click(frame.locator('#resume'));
    await expect(frame.locator('#maze-game')).toHaveAttribute('data-screen', 'playing');
    if (!mobile) {
      // Resuming captures the mouse again; Escape must release it before Shell navigation.
      await frame.locator('canvas').page().keyboard.press('Escape');
      await expect(frame.locator('#maze-game')).toHaveAttribute('data-screen', 'pause');
      await expect
        .poll(() =>
          frame.locator('body').evaluate(() => globalThis.document.pointerLockElement === null),
        )
        .toBe(true);
    }
  } else if (id === 'urban-breakout') {
    await click(frame.locator('#start'));
    await expect(frame.locator('.stage')).toHaveAttribute('data-playing', 'true');
    await expect
      .poll(() => frame.locator('body').evaluate(() => globalThis.urbanSnapshot().tick))
      .toBeGreaterThan(15);
    await click(frame.locator('#pause'));
    await expect(frame.getByRole('dialog', { name: '暂停菜单' })).toBeVisible();
    await click(frame.locator('#resume'));
    await expect(frame.locator('.stage')).toHaveAttribute('data-playing', 'true');
  } else if (id === 'homebound-station') {
    await click(frame.locator('[data-level="0"]'));
    await click(frame.locator('[data-vehicle="巡01"]'));
    await expect
      .poll(() =>
        frame.locator('body').evaluate(() => globalThis.homeboundSnapshot().services.length),
      )
      .toBe(1);
    await click(frame.locator('#pause'));
    await expect(frame.locator('#dialog')).toContainText('已暂停');
    await click(frame.locator('[data-action="retry"]'));
    await expect(frame.locator('#remaining')).toHaveText('12');
    await expect
      .poll(() =>
        frame.locator('body').evaluate(() => globalThis.homeboundSnapshot().services.length),
      )
      .toBe(0);
  } else if (id === 'balloon-movers') {
    await expect(frame.locator('#launch')).toBeDisabled();
    await click(frame.locator('#suggest'));
    await expect(frame.locator('#left-count')).toHaveText('2');
    await click(frame.locator('#launch'));
    await expect(frame.locator('#flight')).toHaveAttribute('data-phase', 'flying');
    await holdControl('#left-valve', 'KeyA', () =>
      expect
        .poll(() => frame.locator('#left-gas').evaluate((el) => parseFloat(el.style.width)))
        .toBeLessThan(99),
    );
    await expect(frame.locator('#left-valve')).toHaveAttribute('aria-pressed', 'false');
    await click(frame.locator('#pause'));
    await expect(frame.locator('#flight')).toHaveText('已暂停');
    await click(frame.locator('#retry'));
    await expect(frame.locator('#flight')).toHaveAttribute('data-phase', 'ready');
  } else if (id === 'weather-command') {
    await click(frame.locator('[data-weather="rain"]'));
    await expect(frame.locator('#remaining')).toHaveText('2');
    await expect(frame.locator('#board')).toHaveAttribute('data-h', '1');
    await click(frame.locator('#undo'));
    await expect(frame.locator('#remaining')).toHaveText('3');
    await expect(frame.locator('#board')).toHaveAttribute('data-h', '0');
    await click(frame.locator('[data-weather="rain"]'));
    await click(frame.locator('[data-dir="right"]'));
    await expect(frame.locator('#board')).toHaveAttribute('data-status', 'won');
  } else if (id === 'out-of-frame') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__outOfFrameSnapshot());
    await click(frame.locator('#start-button'));
    const beforeMove = await snapshot();
    await holdControl('#move-right', 'ArrowRight', () =>
      expect
        .poll(async () => (await snapshot()).state.player.x)
        .toBeGreaterThan(beforeMove.state.player.x + 8),
    );
    await click(frame.locator('#restart'));
    await expect
      .poll(async () => (await snapshot()).state.player.x)
      .toBe(beforeMove.state.player.x);

    const canvas = frame.locator('#board');
    const page = canvas.page();
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    const beforeDrag = await snapshot();
    const { x, y, w, h } = beforeDrag.state.frame;
    const from = {
      x: bounds.x + ((x + w / 2) / beforeDrag.world.w) * bounds.width,
      y: bounds.y + ((y + h / 2) / beforeDrag.world.h) * bounds.height,
    };
    const dx = x + w + 110 < beforeDrag.world.w ? 100 : -100;
    const to = { x: from.x + (dx / beforeDrag.world.w) * bounds.width, y: from.y };
    if (mobile) {
      const touch = await page.context().newCDPSession(page);
      try {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ ...from, id: 1 }],
        });
        for (let step = 1; step <= 6; step += 1) {
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: from.x + ((to.x - from.x) * step) / 6, y: to.y, id: 1 }],
          });
        }
      } finally {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      }
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
    }
    await expect
      .poll(async () => Math.abs((await snapshot()).state.frame.x - x))
      .toBeGreaterThan(50);
    // Touch may scroll to the controls for longer than one second; rewind until
    // the recorded drag has been crossed, using the same free rewind as players.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (Math.abs((await snapshot()).state.frame.x - x) < 0.001) break;
      await click(frame.locator('#undo'));
    }
    await expect.poll(async () => (await snapshot()).state.frame.x).toBe(x);
    await click(frame.locator('#restart'));
  } else if (id === 'off-camera') {
    await click(frame.locator('#bank [data-card="move"]'));
    await click(frame.locator('#bank [data-card="sit"]'));
    await expect(frame.locator('#confirm')).toBeEnabled({ timeout: 20000 });
    await click(frame.locator('#confirm'));
    await expect(frame.locator('#confirm')).toHaveText('下一件小案 →');
    await click(frame.locator('#confirm'));
    await expect(frame.locator('#case-number')).toHaveText('02');
  } else if (id === 'rescue-team') {
    await click(frame.locator('#event-fire-1'));
    await click(frame.locator('[data-dispatch-car="1"]'));
    await expect(frame.locator('#event-fire-1 .assigned')).toContainText('1号');
    await expect(frame.locator('#app')).toHaveAttribute('data-paused', 'false');
    await expect
      .poll(async () => Number(await frame.locator('#app').getAttribute('data-time')))
      .toBeGreaterThan(0);
    await click(frame.locator('#go'));
    await expect(frame.locator('#app')).toHaveAttribute('data-paused', 'true');
    await click(frame.locator('#restart'));
    await expect(frame.locator('#app')).toHaveAttribute('data-time', '0.0');
  } else if (id === 'precision-demolition') {
    await click(frame.locator('#primary'));
    const joint = frame.locator('[data-id="upperL-R"]');
    await joint.scrollIntoViewIfNeeded();
    if (!mobile) await joint.focus();
    await holdControl('[data-id="upperL-R"]', 'Space', () =>
      expect(joint).toHaveAttribute('data-hp', '0', { timeout: 15000 }),
    );
    await click(frame.locator('#pause'));
    await expect(frame.locator('#primary')).toHaveText('继续施工');
    await click(frame.locator('#primary'));
    await expect(frame.locator('#overlay')).toBeHidden();
  } else if (id === 'afterimage-arena') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__arena.snapshot());
    await click(frame.locator('#continue'));
    await expect.poll(async () => (await snapshot()).mode).toBe('playing');
    await holdControl('#fire', 'Space', () =>
      expect
        .poll(async () => (await snapshot()).actors.find((actor) => actor.id === 3).shots)
        .toBeGreaterThan(0),
    );
    await click(frame.locator('#pause'));
    await expect.poll(async () => (await snapshot()).mode).toBe('paused');
    await click(frame.locator('#continue'));
    await expect.poll(async () => (await snapshot()).mode).toBe('playing');
  } else if (id === 'ghost-shift-manager') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.ghostShiftSnapshot());
    await click(frame.locator('#start'));
    await click(frame.locator('[data-ghost="0"]'));
    await click(frame.locator('[data-delay="8"]'));
    await click(frame.locator('[data-room="1"]'));
    await expect.poll(async () => (await snapshot()).ghosts[0].job?.target).toBe(1);
    await click(frame.locator('[data-cancel="0"]'));
    await expect.poll(async () => (await snapshot()).ghosts[0].job).toBeNull();
    await click(frame.locator('#pause'));
    await expect(frame.locator('#continue')).toBeVisible();
    await click(frame.locator('#continue'));
    await expect.poll(async () => (await snapshot()).paused).toBe(false);
  } else if (id === 'rule-thief') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__ruleThief.inspect());
    await click(frame.locator('[data-rule="stride"]'));
    await click(frame.locator('[data-entity="b"]'));
    await expect.poll(async () => (await snapshot()).state.owners.stride).toBe('b');
    await click(frame.locator('#undo'));
    await expect(frame.locator('#counter')).toHaveText('第 0 拍');
    await click(frame.locator('#wait'));
    await expect.poll(async () => (await snapshot()).state.status).toBe('lost');
    await click(frame.locator('#retry'));
    await expect.poll(async () => (await snapshot()).state.status).toBe('playing');
    await expect(frame.locator('#counter')).toHaveText('第 0 拍');
  } else if (id === 'ink-is-everything') {
    const page = frame.locator('#game-canvas').page();
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__inkGame.snapshot());
    await click(frame.locator('#start-game'));
    await expect(frame.locator('#game-root')).toHaveAttribute('data-status', 'playing');
    await expect(frame.locator('#game-canvas')).toBeVisible();

    // Exercise continuous movement with real keyboard/touch input, including release.
    const initialState = await snapshot();
    expect(initialState.version).toBe(3);
    const initialPlayer = initialState.player;
    expect(initialPlayer).not.toHaveProperty('hp');
    expect(initialPlayer).not.toHaveProperty('maxHp');
    const touch = mobile ? await page.context().newCDPSession(page) : undefined;
    try {
      if (touch) {
        const bounds = await frame.locator('#joystick').boundingBox();
        const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, ...start }],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ id: 1, x: start.x + 32, y: start.y }],
        });
      } else {
        await page.keyboard.down('d');
      }
      await expect
        .poll(async () => (await snapshot()).player.x - initialPlayer.x)
        .toBeGreaterThan(12);
    } finally {
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      } else {
        await page.keyboard.up('d');
      }
    }
    const releasedPlayer = (await snapshot()).player;
    await page.waitForTimeout(160);
    expect(Math.abs((await snapshot()).player.x - releasedPlayer.x)).toBeLessThan(2);

    // The same finite ink meter must pay for firing, on both direct and embedded pages.
    const inkBefore = (await snapshot()).player.ink;
    const fire = await frame.locator('#fire').boundingBox();
    const firingTouch = mobile ? await page.context().newCDPSession(page) : undefined;
    try {
      if (firingTouch) {
        await firingTouch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 }],
        });
      } else {
        await page.mouse.move(fire.x + fire.width / 2, fire.y + fire.height / 2);
        await page.mouse.down();
      }
      await expect.poll(async () => (await snapshot()).player.ink).toBeLessThan(inkBefore);
      await expect
        .poll(async () => (await snapshot()).pickups.some((drop) => drop.kind === 'reclaim'))
        .toBe(true);
    } finally {
      if (firingTouch) {
        await firingTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await firingTouch.detach();
      } else {
        await page.mouse.up();
      }
    }
    await click(frame.locator('#equipment'));
    await expect.poll(async () => (await snapshot()).paused).toBe(true);
    const summary = frame.locator('#modal .skill-summary');
    await expect(summary).toContainText('8 伤害 / 6 墨');
    await expect(summary).toContainText('25% 实际伤害');
    await expect(summary).toContainText('50% 技能消耗');
    await click(frame.locator('#modal [data-close]'));
    await expect.poll(async () => (await snapshot()).paused).toBe(false);

    await click(frame.locator('#pause'));
    await expect.poll(async () => (await snapshot()).paused).toBe(true);
    const pausedTime = (await snapshot()).time;
    await page.waitForTimeout(150);
    expect((await snapshot()).time).toBe(pausedTime);
    await click(frame.locator('#resume'));
    await expect.poll(async () => (await snapshot()).paused).toBe(false);
    await expect.poll(async () => (await snapshot()).time).toBeGreaterThan(pausedTime);
  } else if (id === 'waterline-station') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__waterlineSnapshot());
    await expect(frame.locator('#level-name')).not.toBeEmpty();
    await expect(frame.locator('#gate-controls')).toHaveCount(0);
    await expect(frame.locator('.board-wrap #board-controls button[data-gate]')).toHaveCount(2);
    await expect(frame.locator('#chapter-nav [data-chapter-index]')).toHaveCount(5);
    await expect(frame.locator('#level-nav [data-level-index]')).toHaveCount(10);
    await click(frame.locator('[data-chapter-index="4"]'));
    await expect(frame.locator('[data-level-index="49"]')).toBeVisible();
    await expect(frame.locator('#board')).toHaveAttribute('data-level', '1');
    await click(frame.locator('[data-level-index="49"]'));
    await expect(frame.locator('#board')).toHaveAttribute('data-level', '50');
    await click(frame.locator('[data-chapter-index="0"]'));
    await click(frame.locator('[data-level-index="0"]'));
    const valve = frame.locator('#board-controls button[data-gate="AB"]');
    await expect(valve).toHaveAttribute('aria-pressed', 'false');
    const moves = Number(await frame.locator('#moves-left').textContent());
    const initialWater = await frame.locator('[data-tank="A"]').getAttribute('data-water');
    await click(valve);
    await expect(frame.locator('#moves-left')).toHaveText(String(moves - 1));
    await expect(frame.locator('#board')).toHaveAttribute('data-status', 'won');
    await expect(valve).toHaveAttribute('aria-pressed', 'true');
    await expect(frame.locator('[data-tank="A"]')).not.toHaveAttribute('data-water', initialWater);
    await click(frame.locator('#result-undo'));
    await expect(frame.locator('#board')).toHaveAttribute('data-status', 'playing');
    await expect(frame.locator('#moves-left')).toHaveText(String(moves));
    await expect(frame.locator('[data-tank="A"]')).toHaveAttribute('data-water', initialWater);
    await click(valve);
    await expect(frame.locator('#board')).toHaveAttribute('data-status', 'won');
    await click(frame.locator('#result-retry'));
    await expect(frame.locator('#board')).toHaveAttribute('data-status', 'playing');
    await expect(frame.locator('#moves-left')).toHaveText(String(moves));
    await click(frame.locator('[data-level-index="3"]'));
    const laterMoves = Number(await frame.locator('#moves-left').textContent());
    await click(valve);
    await expect(valve).toHaveAttribute('aria-pressed', 'true');
    await expect(valve).toBeEnabled();
    await click(valve);
    await expect(valve).toHaveAttribute('aria-pressed', 'false');
    await expect(valve).toBeEnabled();
    await expect(frame.locator('#moves-left')).toHaveText(String(laterMoves - 2));
    await click(frame.locator('#restart'));
    await expect(frame.locator('#moves-left')).toHaveText(String(laterMoves));
    const pipe = frame.locator('#board [data-connection="AB"]');
    await pipe.scrollIntoViewIfNeeded();
    const position = await pipe.evaluate((group) => {
      const path = group.querySelector('.pipe-hit');
      const bounds = globalThis.document.querySelector('#board').getBoundingClientRect();
      const matrix = path.getScreenCTM();
      for (let step = 5; step < 196; step += 1) {
        const point = path.getPointAtLength((path.getTotalLength() * step) / 200);
        const screen = new globalThis.DOMPoint(point.x, point.y).matrixTransform(matrix);
        const target = globalThis.document.elementFromPoint(screen.x, screen.y);
        if (target?.closest('[data-connection]')?.dataset.connection === 'AB') {
          return { x: screen.x - bounds.left, y: screen.y - bounds.top };
        }
      }
      return null;
    });
    expect(position).not.toBeNull();
    const pipeBounds = await frame.locator('#board').boundingBox();
    const beforePipe = await snapshot();
    const pipePage = pipe.page();
    if (mobile)
      await pipePage.touchscreen.tap(pipeBounds.x + position.x, pipeBounds.y + position.y);
    else await pipePage.mouse.click(pipeBounds.x + position.x, pipeBounds.y + position.y);
    await expect.poll(async () => (await snapshot()).focusedConnection).toBe('AB');
    await expect(frame.locator('#board [data-connection="AB"]')).toHaveAttribute(
      'data-focused',
      'true',
    );
    await expect(frame.locator('#board-foreground [data-foreground-connection]')).toHaveAttribute(
      'data-foreground-connection',
      'AB',
    );
    expect((await snapshot()).state).toEqual(beforePipe.state);
    await expect(frame.locator('#moves-left')).toHaveText(String(laterMoves));
  } else if (id === 'echo-lab') {
    await frame.locator('#preset').selectOption('first');
    await expect(frame.locator('#roomBadge')).toHaveText('72 × 40 m');
    await click(frame.locator('#addAbsorber'));
    await expect(frame.locator('#panelCount')).toHaveText('2 / 8');
    await expect(frame.locator('#selectionTitle')).toContainText('吸音屏');
    await expect(frame.locator('#scene [data-rotate]')).toHaveCount(1);
    const angle = frame.locator('#panelAngle');
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const before = Number(await angle.inputValue());
      const min = Number(await angle.getAttribute('min'));
      const max = Number(await angle.getAttribute('max'));
      // On a 0–360 range, a quarter-track click hits the initial 90-degree thumb.
      // Press the far side instead, and verify a physical edit on every attempt.
      const fraction = before < (min + max) / 2 ? 0.85 : 0.15;
      await angle.scrollIntoViewIfNeeded();
      const box = await angle.boundingBox();
      expect(box).not.toBeNull();
      const position = { x: box.width * fraction, y: box.height / 2 };
      if (mobile) await angle.tap({ position });
      else await angle.click({ position });
      await expect
        .poll(async () => Math.abs(Number(await angle.inputValue()) - before))
        .toBeGreaterThan((max - min) / 4);
      const value = await angle.inputValue();
      await expect(frame.locator('#angleValue')).toHaveText(`${value}°`);
      await expect(frame.locator('#panelAngleNumber')).toHaveValue(value);
      await expect(frame.locator('#quickAngle')).toHaveValue(value);
      const renderedAngle = await frame
        .locator('#scene [data-object][aria-pressed="true"] line')
        .first()
        .evaluate((line) => {
          const dx = Number(line.getAttribute('x2')) - Number(line.getAttribute('x1'));
          const dy = Number(line.getAttribute('y2')) - Number(line.getAttribute('y1'));
          return ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        });
      expect(renderedAngle).toBeCloseTo(Number(value), 5);
    }
    await click(frame.locator('#removePanel'));
    await expect(frame.locator('#panelCount')).toHaveText('1 / 8');
    await click(frame.locator('#playWet'));
    await expect(frame.locator('#playWet')).toHaveClass(/playing/);
    await click(frame.locator('#stopAudio'));
    await click(frame.locator('#shareLayout'));
    await expect(frame.locator('#shareDialog')).toBeVisible();
    await expect(frame.locator('#shareLink')).toHaveValue(/\/games\/echo-lab\/index\.html#room=/);
    await click(frame.locator('#closeShare'));
  } else if (id === 'echo-weaver') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__echoWeaverSnapshot());
    await click(frame.locator('#level-nav [data-level]').first());
    await expect(frame.locator('#level-title')).not.toBeEmpty();
    const initial = (await snapshot()).state;
    expect((await snapshot()).report).toBeNull();
    // Read a legal fixture, then exercise the same placement controls as a player.
    const placement = await frame.locator('body').evaluate(async () => {
      const [{ LEVELS }, { createState, canPlace }] = await Promise.all([
        import('./levels.mjs'),
        import('./engine.mjs'),
      ]);
      const level = LEVELS[0];
      const state = createState(level);
      const piece = state.pieces.find((item) => item.x === null && item.type === 'mirror');
      for (let y = 0; y < level.rows; y++) {
        for (let x = 0; x < level.cols; x++) {
          if (piece && canPlace(level, state, piece.id, x, y)) return { id: piece.id, x, y };
        }
      }
      return null;
    });
    expect(placement).not.toBeNull();
    await click(frame.locator(`#inventory button[data-piece="${placement.id}"]`));
    await expect.poll(async () => (await snapshot()).selectedPiece).toBe(placement.id);
    await click(frame.locator(`#board .cell[data-x="${placement.x}"][data-y="${placement.y}"]`));
    await expect.poll(async () => (await snapshot()).state).not.toEqual(initial);
    await expect(frame.locator(`#board .cell[data-piece="${placement.id}"]`)).toBeVisible();
    const placed = (await snapshot()).state;
    await click(frame.locator('#rotate'));
    await expect.poll(async () => (await snapshot()).state).not.toEqual(placed);
    await click(frame.locator('#undo'));
    await expect.poll(async () => (await snapshot()).state).toEqual(placed);
    if ((await snapshot()).selectedPiece !== placement.id) {
      await click(frame.locator(`#board .cell[data-piece="${placement.id}"]`));
    }
    await click(frame.locator('#return-piece'));
    await expect.poll(async () => (await snapshot()).state).toEqual(initial);
    await click(frame.locator('#undo'));
    await expect.poll(async () => (await snapshot()).state).toEqual(placed);
    await click(frame.locator('#undo'));
    await expect.poll(async () => (await snapshot()).state).toEqual(initial);
    expect((await snapshot()).report).toBeNull();
    await click(frame.locator('#emit'));
    await expect.poll(async () => (await snapshot()).phase).toBe('running');
    await expect.poll(async () => (await snapshot()).phase, { timeout: 20000 }).toBe('result');
    expect((await snapshot()).report.won).toBe(false);
    await expect(frame.locator('#arrival-log')).not.toBeEmpty();
    await expect(frame.locator('#result')).not.toBeVisible();
    await click(frame.locator('#restart'));
    await expect.poll(async () => (await snapshot()).phase).toBe('ready');
    await expect.poll(async () => (await snapshot()).state).toEqual(initial);
    expect((await snapshot()).report).toBeNull();
    await click(frame.locator('#level-nav [data-level]').nth(1));
    await expect.poll(async () => (await snapshot()).levelIndex).toBe(1);
    await expect.poll(async () => (await snapshot()).historyLength).toBe(0);
  } else if (id === 'two-sided-box') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__twoSidedSnapshot());
    await click(frame.locator('#start'));
    const front = frame.locator('#board');
    const back = frame.locator('#back-board');
    await expect(front).toHaveAttribute('data-level', '1');
    await expect(front).toHaveAttribute('data-side', 'front');
    await expect(back).toHaveAttribute('data-side', 'back');
    await expect(front).toBeVisible();
    await expect(back).toBeVisible();
    await expect(frame.locator('#flip')).toHaveCount(0);
    // Both faces now expose the same shaft. Operate the front detent and back
    // latch explicitly, and require both rendered controls to stay in sync.
    const upperNotch = front.locator('[data-notch-shaft="A"][data-value="2"]');
    const expectSharedShaft = async (value, locked) => {
      await expect.poll(async () => (await snapshot()).state.shafts.A).toBe(value);
      for (const face of [front, back]) {
        const shaft = face.locator('[data-shaft="A"]');
        await expect(shaft).toHaveAttribute('aria-valuenow', String(value));
        await expect(shaft).toHaveAttribute('aria-disabled', String(locked));
      }
    };
    await expectSharedShaft(0, true);
    const initialState = (await snapshot()).state;
    // A locked shaft still gives feedback to a physical touch or mouse press.
    // Send that input directly because the notch inherits aria-disabled.
    await upperNotch.scrollIntoViewIfNeeded();
    const lockedBounds = await upperNotch.boundingBox();
    expect(lockedBounds).not.toBeNull();
    const page = upperNotch.page();
    const lockedX = lockedBounds.x + lockedBounds.width / 2;
    const lockedY = lockedBounds.y + lockedBounds.height / 2;
    if (mobile) await page.touchscreen.tap(lockedX, lockedY);
    else await page.mouse.click(lockedX, lockedY);
    await expect.poll(async () => (await snapshot()).state).toEqual(initialState);
    await expect(frame.locator('#status')).toContainText(/锁|背|扣/);
    await click(back.locator('[data-latch="lock-A"]'));
    await expect.poll(async () => (await snapshot()).state.latches['lock-A']).toBe(false);
    await expectSharedShaft(0, false);
    await click(upperNotch);
    await expectSharedShaft(2, false);
    await click(frame.locator('#release'));
    await expect
      .poll(async () => (await snapshot()).state.completed, { timeout: 15000 })
      .toBe(true);
    await expect(frame.locator('#board')).toHaveAttribute('data-status', 'won');
    await expect(frame.locator('#next')).toBeVisible();
  } else if (id === 'tiny-signals') {
    const swipe = async (dx, dy) => {
      const boards = frame.locator('#boards');
      await boards.scrollIntoViewIfNeeded();
      const bounds = await boards.boundingBox();
      const page = boards.page();
      const touch = await page.context().newCDPSession(page);
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      try {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + dx, y: y + dy }],
        });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await touch.detach();
      }
    };
    await click(frame.locator('#level-nav [data-level]').first());
    await expect(frame.locator('#moves')).toHaveText('00');
    if (mobile) {
      await swipe(70, 0);
    } else {
      await frame.locator('[data-dir="right"]').focus();
      await frame.locator('#game-root').page().keyboard.press('ArrowRight');
    }
    await expect(frame.locator('#moves')).toHaveText('01');
    await click(frame.locator('#undo'));
    await expect(frame.locator('#moves')).toHaveText('00');
    if (mobile) await swipe(0, 70);
    else await click(frame.locator('[data-dir="down"]'));
    await expect(frame.locator('#moves')).toHaveText('01');
    await click(frame.locator('#restart'));
    await expect(frame.locator('#moves')).toHaveText('00');
    const next = frame.locator('#level-nav [data-level]').nth(1);
    const level = await next.getAttribute('data-level');
    await click(next);
    await expect(frame.locator('#game-root')).toHaveAttribute('data-level', level);
    await expect(frame.locator('#game-root')).toHaveAttribute('data-status', 'playing');
    await expect(frame.locator('#moves')).toHaveText('00');
  } else if (id === 'one-stroke-course') {
    await expect(frame.locator('#start')).toBeDisabled();
    await click(frame.locator('#example'));
    await expect(frame.locator('#start')).toBeEnabled();
    await click(frame.locator('#start'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'running');
    await holdControl('[data-control="right"]', 'ArrowRight', () =>
      expect(frame.locator('#result-title')).toHaveText('这条路，你跑通了！', { timeout: 20000 }),
    );
    await click(frame.locator('#retry'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'running');
    await click(frame.locator('#pause-button'));
    await expect(frame.locator('#pause-panel')).toBeVisible();
    await click(frame.locator('#pause-redraw'));
    await expect(frame.locator('#start')).toBeDisabled();
  } else if (id === 'hold-tight-acrobats') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__acroSnapshot);
    await click(frame.locator('#start'));
    await click(frame.locator('[data-who="2"]'));
    await expect(frame.locator('[data-who="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await snapshot()).actors[2].action, { timeout: 20000 })
      .toBe('jump');
    // Long frames deliberately cancel charging; sustained walking still works on slow runners.
    // The game's own input/physics suites cover charge, jump and cancellation.
    const before = (await snapshot()).actors[2].x;
    await holdControl('#right', 'ArrowRight', () =>
      expect
        .poll(async () => (await snapshot()).actors[2].x, { timeout: 20000 })
        .toBeGreaterThan(before + 20),
    );
    const moved = (await snapshot()).actors[2].x;
    // A slow observation round-trip can carry the actor off the platform before release.
    // Retry through the visible result/pause dialog when it owns input.
    await click(frame.locator('#dialog[open] #restart-full, body:not(:has(dialog[open])) #retry'));
    await expect.poll(async () => (await snapshot()).actors[2].x).toBeLessThan(moved - 10);
    await expect.poll(async () => (await snapshot()).actions.length).toBe(0);
    await click(frame.locator('#pause'));
    await expect(frame.locator('#resume')).toBeVisible();
    await click(frame.locator('#resume'));
    await expect.poll(async () => (await snapshot()).paused).toBe(false);
  } else if (id === 'wulong-city') {
    await click(frame.locator('[data-zone="shy-door"]'));
    await expect(frame.locator('#feedback')).toContainText('别盯着我');
    await holdControl('#right', 'ArrowRight', () =>
      expect(frame.locator('#feedback')).toContainText('小碎步', { timeout: 15000 }),
    );
    await holdControl('#left', 'ArrowLeft', () =>
      expect(frame.locator('#feedback')).toContainText('把自己打开了', { timeout: 15000 }),
    );
    await holdControl('#right', 'ArrowRight', () =>
      expect(frame.locator('#next')).toBeVisible({ timeout: 15000 }),
    );
    await click(frame.locator('#next'));
    await expect(frame.locator('#counter')).toHaveText('02 / 26');
    await click(frame.locator('#hint'));
    await expect(frame.locator('.hint-step')).toHaveText('提示 1 / 3');
    await click(frame.locator('[data-more]'));
    await expect(frame.locator('.hint-step')).toHaveText('提示 2 / 3');
    await click(frame.locator('[data-close-hint]'));
  } else if (id === 'fold-the-world') {
    await click(frame.locator('[data-action="start"]'));
    await expect(frame.locator('#fold')).toBeEnabled();
    await click(frame.locator('#show-hint'));
    await expect(frame.locator('#hint-text')).toContainText('缺口太宽');
    await click(frame.locator('[data-action="hint-more"]'));
    await click(frame.locator('[data-action="back"]'));
    await click(frame.locator('#fold'));
    await expect(frame.locator('#fold')).toHaveAttribute('aria-label', '展开');
    await click(frame.locator('#fold'));
    await expect(frame.locator('#fold')).toHaveAttribute('aria-label', '折叠');
    await click(frame.locator('#fold'));
    await expect(frame.locator('#fold')).toHaveAttribute('aria-label', '展开');
    // Keyboard controls work after button focus, in both direct and iframe documents.
    await frame.locator('canvas').press('ArrowRight', { delay: 2200 });
    await expect(frame.locator('[data-action="next"]')).toBeVisible();
    await expect(frame.getByRole('heading', { name: '道路接通了！' })).toBeVisible();
  } else if (id === 'night-overwatch') {
    const canvas = frame.locator('#GameCanvas');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__night?.snapshot().modelImport), {
        timeout: 60000,
      })
      .toBe('loaded');
    const press = async (id) => {
      const buttons = await canvas.evaluate(() => globalThis.__night.snapshot().buttons);
      if (!buttons.some((b) => b.id === id) && buttons.some((b) => b.id === 'flightControls'))
        await press('flightControls');
      await expect
        .poll(() =>
          canvas.evaluate(
            (_, id) => globalThis.__night.snapshot().buttons.some((b) => b.id === id),
            id,
          ),
        )
        .toBe(true);
      const b = await canvas.evaluate(
        (_, id) => globalThis.__night.snapshot().buttons.find((b) => b.id === id),
        id,
      );
      const position = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      await (mobile ? canvas.tap({ position }) : canvas.click({ position }));
      // Cocos commits input and then rebuilds the visible HUD on its next frame.
      await canvas.evaluate(
        () =>
          new Promise((resolve) =>
            globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
          ),
      );
    };
    await press('start');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__night.snapshot().time))
      .toBeGreaterThan(0);
    await press('settings');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__night.snapshot().pauses.includes('settings')))
      .toBe(true);
    await press('help');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__night.snapshot().pauses.includes('help')))
      .toBe(true);
    await press('close');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__night.snapshot().pauses))
      .toEqual(['settings']);
    await press('close');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__night.snapshot().pauses))
      .toEqual([]);
    await press('weapon2');
    await expect.poll(() => canvas.evaluate(() => globalThis.__night.snapshot().selected)).toBe(2);
  } else if (id === 'carding-car') {
    const canvas = frame.locator('#GameCanvas');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__kart?.snapshot().loading), { timeout: 120000 })
      .toBe(false);
    const bounds = await canvas.boundingBox();
    const scale = Math.min(bounds.width / 960, bounds.height / 540);
    const position = { x: bounds.width / 2, y: bounds.height / 2 + 125 * scale };
    await (mobile ? canvas.tap({ position }) : canvas.click({ position }));
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__kart?.snapshot().phase), { timeout: 30000 })
      .toBe('racing');
    if (!mobile) await canvas.page().keyboard.down('ArrowUp');
    try {
      await expect
        .poll(() => canvas.evaluate(() => globalThis.__kart?.snapshot().player.speed), {
          timeout: 30000,
        })
        .toBeGreaterThan(2);
    } finally {
      if (!mobile) await canvas.page().keyboard.up('ArrowUp');
    }
  } else if (id === 'merge-front') {
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
    await frame.locator('#solo-mode').selectOption('challenge');
    await click(frame.locator('#start-mode'));
    await expect(frame.getByTestId('board')).toBeVisible();
    await click(frame.getByTestId('hint'));
    const destination = frame.locator('.node-target.chosen');
    await expect(destination).toHaveCount(1);
    await click(
      frame.getByTestId((await destination.getAttribute('id')).replace('target-', 'node-')),
    );
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
    await click(frame.getByRole('button', { name: '返回调查', exact: true }));
    await expect(frame.locator('dialog')).toBeHidden();
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
    if (mobile) {
      const pause = frame.getByRole('button', { name: '暂停漫游' });
      await expect(pause).toBeVisible();
      const bounds = await pause.evaluate((button) => {
        const { x, y, width, height } = button.getBoundingClientRect();
        return { x, y, width, height };
      });
      // Send real touch input without waiting for stable WebGL frames during play.
      await pause.page().touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    } else {
      const canvas = frame.locator('canvas');
      await expect(canvas).toBeFocused();
      // start() already focuses the canvas; send native input without refocusing WebGL.
      await canvas.page().keyboard.press('Escape');
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
    await click(frame.getByRole('button', { name: '继续配送' }));
    await expect(frame.locator('#large-map')).toBeHidden();
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
