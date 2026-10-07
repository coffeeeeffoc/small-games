import { expect } from '@playwright/test';
import { enterStandalone } from './standalone-game-entry.mjs';
export { markers } from './standalone-game-entry.mjs';

export async function exerciseStandalone(frame, id, mobile = false) {
  await enterStandalone(frame, id, mobile);
  await assertStandaloneGameplay(frame, id, mobile);
}

export async function assertStandaloneGameplay(frame, id, mobile = false) {
  if (id === 'cage-rescue') {
    const { assertCageRescueGameplay } = await import('./game-checks/cage-rescue.mjs');
    return assertCageRescueGameplay(frame, mobile);
  }
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
  if (id === 'three-choose-two') {
    const game = frame.locator('#game');
    await expect(game).toHaveAttribute('data-screen', 'playing');
    await expect(frame.locator('#board')).toBeVisible();
    await expect(frame.locator('[data-slot]')).toHaveCount(3);
    await click(frame.locator('[data-action="pause"]').last());
    await expect(game).toHaveAttribute('data-screen', 'pause');
    await click(frame.locator('[data-action="resume"]').last());
    await expect(game).toHaveAttribute('data-screen', 'playing');
    // Read the catalog's verified move, then perform it through real input.
    // The fixture never edits the board, progress or the game's current state.
    const move = await game.evaluate(async () => {
      const { getLevel } = await import(new URL('./src/levels.mjs', document.baseURI).href);
      return getLevel(1).solution[0];
    });
    const candidate = frame.locator(`[data-slot="${move.slot}"]`);
    const source = await candidate.boundingBox();
    const board = await frame.locator('#board').boundingBox();
    const width = Number(await candidate.getAttribute('data-width'));
    const height = Number(await candidate.getAttribute('data-height'));
    const pitch = (board.width * 40) / 360;
    const pad = (board.width * 20) / 360;
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = {
      x: board.x + pad + (move.x + width / 2) * pitch,
      y: board.y + pad + (move.y + (mobile ? height : height / 2)) * pitch + (mobile ? 46 : 0),
    };
    const page = game.page();
    if (mobile) {
      const touch = await page.context().newCDPSession(page);
      try {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await expect(game).toHaveAttribute('data-placements', '0');
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await touch.detach();
      }
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(4, 4, { steps: 4 });
      await page.mouse.up();
      await expect(game).toHaveAttribute('data-placements', '0');
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 8 });
      await page.mouse.up();
    }
    await expect(game).toHaveAttribute('data-screen', 'result');
    await expect(game).toHaveAttribute('data-status', 'won');
    await expect(game).toHaveAttribute('data-placements', '1');
    await expect(game).toHaveAttribute('data-lines', '1');
    await click(frame.locator('[data-action="retry"]'));
    await expect(game).toHaveAttribute('data-screen', 'playing');
    await click(frame.locator('[data-action="pause"]').last());
    await click(frame.locator('[data-action="home"]'));
    await expect(game).toHaveAttribute('data-screen', 'home');
    await expect(frame.locator('[data-action="start"]')).toBeVisible();
    await click(frame.locator('[data-action="levels"]'));
    await expect(frame.locator('[data-level="1"]')).toBeEnabled();
    await expect(frame.locator('[data-level="2"]')).toBeEnabled();
    await expect(frame.locator('[data-level="30"]')).toBeDisabled();
    await click(frame.locator('[data-action="home"]'));
    await expect(game).toHaveAttribute('data-screen', 'home');
  } else if (id === 'retreat-rally') {
    await expect(frame.locator('#game')).toHaveAttribute('data-screen', 'battle');
    await holdControl('#retreat-blue', 'Space', async () => {
      await expect(frame.locator('#retreat-blue')).toHaveAttribute('aria-pressed', 'true');
      await expect(frame.locator('#game')).toHaveAttribute('data-retreat', 'true');
    });
    await expect(frame.locator('#retreat-blue')).toHaveAttribute('aria-pressed', 'false');
    await click(frame.locator('#pause'));
    await expect(frame.locator('#paused')).toBeVisible();
    await click(frame.locator('#resume'));
    await expect(frame.locator('#battle')).toBeVisible();
  } else if (id === 'flick-arena') {
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect(frame.locator('#game')).toHaveAttribute('data-shots', '0');
    await click(frame.locator('#pause'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'paused');
    await click(frame.locator('#resume'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
  } else if (id === 'tower-brake') {
    const play = frame.locator('#play-screen');
    const scene = frame.locator('#scene');
    await expect(play).toBeVisible();
    await expect(play).toHaveAttribute('data-phase', 'playing');
    await expect(scene).toBeVisible();
    const initialAngle = await play.getAttribute('data-angle');
    await click(frame.locator('#brake-button'));
    await expect(frame.locator('#brake-button')).toHaveAttribute('data-charges', '0');
    const page = scene.page();
    const bounds = await scene.boundingBox();
    const start = { x: bounds.x + bounds.width * 0.35, y: bounds.y + bounds.height * 0.5 };
    const end = { x: bounds.x + bounds.width * 0.7, y: start.y };
    if (mobile) {
      const touch = await page.context().newCDPSession(page);
      try {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      } finally {
        await touch.detach();
      }
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 3 });
      await page.mouse.up();
    }
    await click(frame.locator('#pause-button'));
    await expect(play).toHaveAttribute('data-phase', 'paused');
    expect(await play.getAttribute('data-angle')).not.toBe(initialAngle);
    await expect(frame.locator('#pause-screen')).toBeVisible();
    await click(frame.locator('#resume-game'));
    await expect(play).toHaveAttribute('data-phase', 'playing');
    await click(frame.locator('#pause-button'));
    await click(frame.locator('#pause-home'));
    await expect(frame.locator('#home')).toBeVisible();
    await click(frame.locator('#choose-level'));
    await expect(frame.locator('#levels-screen')).toBeVisible();
    await expect(frame.locator('#levels-screen button[data-level]')).toHaveCount(8);
    await click(frame.locator('#levels-home'));
    await expect(frame.locator('#start-game')).toBeVisible();
  } else if (id === 'chase-thief') {
    const game = frame.locator('#game');
    const body = frame.locator('body');
    await expect(body).toHaveAttribute('data-phase', 'running');
    await click(frame.locator('[data-action="left"]'));
    await expect(game).toHaveAttribute('data-lane', '0');
    await click(frame.locator('[data-action="right"]'));
    await expect(game).toHaveAttribute('data-lane', '1');
    await click(frame.locator('[data-action="jump"]'));
    await expect(game).toHaveAttribute('data-action', 'jump');
    await expect(game).toHaveAttribute('data-action', 'run');
    await click(frame.locator('[data-action="slide"]'));
    await expect(game).toHaveAttribute('data-action', 'slide');
    await click(frame.locator('#pause'));
    await expect(body).toHaveAttribute('data-phase', 'paused');
    await click(frame.locator('#resume'));
    await expect(body).toHaveAttribute('data-phase', 'running');
    await click(frame.locator('#pause'));
    await click(frame.locator('#pause-home'));
    await expect(body).toHaveAttribute('data-phase', 'home');
    await expect(frame.locator('#home')).toBeVisible();
    await expect(frame.locator('#start')).toBeVisible();
    await expect(frame.locator('#choose-levels')).toBeVisible();
  } else if (id === 'orbit-atelier') {
    const app = frame.locator('#orbit-app');
    await expect(app).toHaveAttribute('data-screen', 'playing');
    const board = frame.locator('#ring-board');
    const ring = board.locator('[data-ring-id]').first();
    await expect(ring).toBeVisible();
    const initialAngle = await ring.getAttribute('data-angle');
    const points = await ring.evaluate((node) => {
      const matrix = node.getScreenCTM();
      if (!matrix) throw new Error('Ring has no SVG screen transform');
      const radius = Number(node.getAttribute('data-radius'));
      const angle = Number(node.getAttribute('data-angle')) + Math.PI;
      if (!(radius > 0) || !Number.isFinite(angle)) throw new Error('Invalid ring geometry');
      const point = (theta) => {
        const transformed = new globalThis.DOMPoint(
          radius * Math.cos(theta),
          radius * Math.sin(theta),
        ).matrixTransform(matrix);
        return { x: transformed.x, y: transformed.y };
      };
      const bounds = node.getBoundingClientRect();
      return {
        start: point(angle),
        middle: point(angle + 0.3),
        end: point(angle + 0.65),
        bounds: { x: bounds.x, y: bounds.y },
      };
    });
    // SVG screen coordinates are local to the child document; native input is page-wide.
    const bounds = await ring.boundingBox();
    const offset = { x: bounds.x - points.bounds.x, y: bounds.y - points.bounds.y };
    const absolute = (point) => ({ x: point.x + offset.x, y: point.y + offset.y });
    const page = board.page();
    if (mobile) {
      const touch = await page.context().newCDPSession(page);
      try {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [absolute(points.start)],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [absolute(points.middle)],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [absolute(points.end)],
        });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await touch.detach();
      }
    } else {
      const start = absolute(points.start);
      const middle = absolute(points.middle);
      const end = absolute(points.end);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(middle.x, middle.y, { steps: 3 });
      await page.mouse.move(end.x, end.y, { steps: 3 });
      await page.mouse.up();
    }
    await expect(ring).not.toHaveAttribute('data-angle', initialAngle);
    await expect(frame.locator('[data-action="undo"]')).toBeEnabled();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
        ),
    );
    await click(frame.getByRole('button', { name: '暂停', exact: true }));
    await expect(app).toHaveAttribute('data-screen', 'paused');
    await click(frame.getByRole('button', { name: '继续解扣', exact: true }));
    await expect(app).toHaveAttribute('data-screen', 'playing');
    await click(frame.getByRole('button', { name: '暂停', exact: true }));
    await click(frame.getByRole('button', { name: '返回工坊', exact: true }));
    await expect(app).toHaveAttribute('data-screen', 'home');
    await expect(frame.locator('[data-action="start"]')).toBeVisible();
  } else if (id === 'moss-garden') {
    const seed = frame.getByRole('button', { name: '花圃 第1行 第1列', exact: true });
    await expect(seed).toBeVisible();
    await expect(seed).toHaveAttribute('aria-pressed', 'false');
    await click(seed);
    await expect(seed).toHaveAttribute('aria-pressed', 'true');
    await click(seed);
    await expect(seed).toHaveAttribute('aria-pressed', 'false');
    await click(frame.getByRole('button', { name: '玩法手册', exact: true }));
    await expect(frame.getByRole('button', { name: '返回花园', exact: true })).toBeVisible();
    await click(frame.getByRole('button', { name: '返回花园', exact: true }));
    await expect(seed).toBeVisible();
    await expect(seed).toHaveAttribute('aria-pressed', 'false');
  } else if (id === 'ball-roguelite') {
    const arena = frame.locator('#arena');
    const snapshot = () => arena.evaluate((canvas) => canvas.getOrbitSnapshot());
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'playing');
    const initial = await snapshot();
    const bounds = await arena.boundingBox();
    const page = arena.page();
    const start = { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * 0.92 };
    const target = { x: bounds.x + bounds.width * 0.35, y: bounds.y + bounds.height * 0.25 };
    if (mobile) {
      const touch = await page.context().newCDPSession(page);
      try {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [target] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await touch.detach();
      }
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 8 });
      await page.mouse.up();
    }
    await expect.poll(async () => (await snapshot()).shots).toBe(initial.shots + 1);
    await click(frame.locator('#pause'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'paused');
    const paused = await snapshot();
    await page.waitForTimeout(120);
    expect((await snapshot()).balls).toEqual(paused.balls);
    await click(frame.locator('#resume'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'playing');
    await click(frame.locator('#pause'));
    await click(frame.locator('#back-home'));
    await expect(frame.locator('#start')).toBeVisible();
  } else if (id === 'castle-cannon') {
    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing');
    await click(frame.locator('[data-action="blast"]'));
    await click(frame.locator('[data-action="pause"]'));
    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'paused');
    await click(frame.locator('[data-action="resume"]'));
    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing');
  } else if (id === 'ember-bounce') {
    const arena = frame.locator('#arena');
    const snapshot = () => arena.evaluate((canvas) => canvas.getEmberSnapshot?.());
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect.poll(async () => !!(await snapshot())).toBe(true);
    const initial = await snapshot();
    const bounds = await arena.boundingBox();
    const page = arena.page();
    const start = { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * (64 / 600) };
    const aim = {
      x: bounds.x + bounds.width * (130 / 390),
      y: bounds.y + bounds.height * (492 / 600),
    };
    if (mobile) {
      const touch = await page.context().newCDPSession(page);
      try {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [start],
        });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [aim] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await touch.detach();
      }
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(aim.x, aim.y, { steps: 8 });
      await page.mouse.up();
    }
    await expect.poll(async () => (await snapshot())?.shots ?? 0).toBeGreaterThan(initial.shots);
    await click(frame.locator('#pause'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'paused');
    const paused = await snapshot();
    await page.waitForTimeout(150);
    expect((await snapshot()).score).toBe(paused.score);
    await click(frame.locator('#resume'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await click(frame.locator('#pause'));
    await click(frame.locator('#back-home'));
    await expect(frame.locator('#start')).toBeVisible();
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'home');
  } else if (id === 'tianxia-chalu') {
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'battle');
    const junction = frame.locator('button[data-junction]:enabled').first();
    await expect(junction).toBeVisible();
    const route = await junction.getAttribute('data-route');
    expect(route).not.toBeNull();
    await click(junction);
    await expect(junction).not.toHaveAttribute('data-route', route);
    await click(frame.locator('#pause'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'pause');
    await click(frame.locator('#resume'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'battle');
  } else if (id === 'voiceprint-case') {
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
  } else if (id === 'tetracube') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.tetracubeSnapshot());
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect(frame.locator('#game-canvas')).toBeVisible();
    const placed = (await snapshot()).game.placed;
    await click(frame.locator('#hard-drop'));
    await expect.poll(async () => (await snapshot()).game.placed).toBe(placed + 1);
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await click(frame.locator('#pause-game'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'paused');
    await click(frame.locator('#resume-game'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await click(frame.locator('#pause-game'));
    await click(frame.locator('#home-game'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'home');
    await expect(frame.locator('#start-game')).toBeVisible();
    expect((await snapshot()).game.placed).toBe(placed + 1);
  } else if (id === 'surprise-kept') {
    await expect(frame.locator('#game')).toHaveAttribute('data-steps', '0');
    await click(frame.locator('#box-blue'));
    await expect(frame.locator('#game')).toHaveAttribute('data-steps', '1');
    await click(frame.locator('#undo'));
    await expect(frame.locator('#game')).toHaveAttribute('data-steps', '0');
    await click(frame.locator('#box-blue'));
    await click(frame.locator('#reveal'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'success', {
      timeout: 20_000,
    });
    await click(frame.locator('#next-level'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect(frame.locator('#game')).toHaveAttribute('data-steps', '0');
  } else if (id === 'luban-workshop') {
    await expect(frame.locator('#controls')).toBeHidden();
    await click(frame.locator('#home-level-list [data-level-id="first-lift-v1"]'));
    await expect(frame.locator('.topbar')).toBeHidden();
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '0');
    // The two-piece introduction separates with one automatic hint, no extra nudge.
    await click(frame.locator('#hint'));
    await expect(frame.locator('#app')).toHaveAttribute('data-hint-pending', 'false');
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '1');
    await expect(frame.locator('#app')).toHaveAttribute('data-complete', 'true');
    await click(frame.locator('#reassemble'));
    await click(frame.locator('#toggle-controls'));
    await expect(frame.locator('#controls')).toBeVisible();
    await click(frame.locator('#undo'));
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '0');
    await click(frame.locator('#redo'));
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '1');
    await click(frame.locator('#hint'));
    await expect(frame.locator('#app')).toHaveAttribute('data-hint-pending', 'false');
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '2');
    await expect(frame.locator('#app')).toHaveAttribute('data-complete', 'true');
    await click(frame.locator('#restore'));
    await expect(frame.locator('#app')).toHaveAttribute('data-moves', '0');
    await click(frame.locator('#toggle-controls'));
    await expect(frame.locator('#controls')).toBeHidden();
    await click(frame.locator('#back-home'));
    await expect(frame.locator('#home')).toBeVisible();
  } else if (id === 'bullet-garden') {
    const snapshot = () =>
      frame.locator('body').evaluate(() => globalThis.__bulletGarden.snapshot());
    const page = frame.locator('#arena').page();
    const clearHudTargets = () =>
      expect
        .poll(() =>
          frame.locator('#game').evaluate((game) => {
            const pause = game.querySelector('#pause');
            const fullscreen = game.querySelector('#fullscreen');
            const a = pause.getBoundingClientRect();
            const b = fullscreen.getBoundingClientRect();
            const separated =
              a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
            return (
              separated &&
              [pause, fullscreen].every((button) => {
                const rect = button.getBoundingClientRect();
                return (
                  rect.width >= 44 &&
                  rect.height >= 44 &&
                  button.contains(
                    globalThis.document.elementFromPoint(
                      rect.left + rect.width / 2,
                      rect.top + rect.height / 2,
                    ),
                  )
                );
              })
            );
          }),
        )
        .toBe(true);
    // Normal play draws the stage setup automatically from unlocked content.
    await click(frame.locator('#start'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    expect((await snapshot()).progression.nextXp).toBeGreaterThan(0);
    // Energy skills are introduced after the first clear, keeping onboarding focused.
    expect((await snapshot()).skillSlots).toEqual([]);
    await expect(frame.locator('[data-skill-slot="0"]')).toBeHidden();
    await expect(frame.locator('[data-skill-slot="1"]')).toBeHidden();
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
    expect((await snapshot()).boons).toEqual([]);
    expect((await snapshot()).plants).toEqual([]);
    expect((await snapshot()).stats.skillCasts).toBe(0);

    const initialPlayer = (await snapshot()).player;
    const touch = mobile ? await page.context().newCDPSession(page) : undefined;
    try {
      if (touch) {
        const bounds = await frame.locator('#joystick').boundingBox();
        const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        const rotated = (await frame.locator('#game').getAttribute('data-rotated')) === 'true';
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, ...start }],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { id: 1, x: start.x + (rotated ? 0 : 32), y: start.y + (rotated ? 32 : 0) },
          ],
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
    // Chromium can change the primary pointer when the touch CDP session ends.
    // A phone must retain its logical landscape layout and both complete hit areas.
    if (mobile)
      await expect(frame.locator('#game')).toHaveAttribute(
        'data-rotated',
        String(page.viewportSize().height > page.viewportSize().width),
      );
    await clearHudTargets();
    await click(frame.locator('#pause'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'paused');
    const pausedTime = (await snapshot()).time;
    await page.waitForTimeout(150);
    expect((await snapshot()).time).toBe(pausedTime);
    await click(frame.locator('#resume'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect.poll(async () => (await snapshot()).time).toBeGreaterThan(pausedTime);
    await click(frame.locator('#dash'));
    await expect.poll(async () => (await snapshot()).player.dashCooldown).toBeGreaterThan(0);
    const arena = frame.locator('#arena');
    const bounds = await arena.boundingBox();
    // Native battlefield targeting remains available before energy skills unlock.
    const target = { position: { x: bounds.width * 0.65, y: bounds.height * 0.6 } };
    expect(
      await arena.evaluate((element, { x, y }) => {
        const rect = element.getBoundingClientRect();
        return globalThis.document.elementFromPoint(rect.left + x, rect.top + y) === element;
      }, target.position),
    ).toBe(true);
    if (mobile) await arena.tap(target);
    else await arena.click(target);
    expect((await snapshot()).stats.skillCasts).toBe(0);
    await expect
      .poll(async () => (await snapshot()).stats.shots, { timeout: 10000 })
      .toBeGreaterThan(0);
    // Longer exit text, host fullscreen resize, pause recovery and a second run.
    await click(frame.locator('#pause'));
    await click(frame.locator('#fullscreen'));
    await expect(frame.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'true');
    await click(frame.locator('#resume'));
    await clearHudTargets();
    await click(frame.locator('#pause'));
    await click(frame.locator('#fullscreen'));
    await expect(frame.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
    await click(frame.locator('#pause-home'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'ready');
    await click(frame.locator('#start'));
    await clearHudTargets();
    await click(frame.locator('#pause'));
    await click(frame.locator('#resume'));
    await expect(frame.locator('body')).toHaveAttribute('data-phase', 'playing');
  } else if (id === 'maze-wander') {
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
    await expect(frame.locator('.stage')).toHaveAttribute('data-playing', 'true');
    await expect
      .poll(() => frame.locator('body').evaluate(() => globalThis.urbanSnapshot().tick))
      .toBeGreaterThan(15);
    await click(frame.locator('#pause'));
    await expect(frame.getByRole('dialog', { name: '暂停菜单' })).toBeVisible();
    await click(frame.locator('#resume'));
    await expect(frame.locator('.stage')).toHaveAttribute('data-playing', 'true');
  } else if (id === 'homebound-station') {
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
        const rotated = (await frame.locator('#game-root').getAttribute('data-rotated')) === 'true';
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { id: 1, x: start.x + (rotated ? 0 : 32), y: start.y + (rotated ? 32 : 0) },
          ],
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
    await click(frame.locator('#pause'));
    await expect(frame.locator('#modal')).toBeVisible();
    await expect(frame.locator('#modal')).toHaveAttribute('data-kind', 'pause');
    await expect.poll(async () => (await snapshot()).paused).toBe(true);
    await click(frame.locator('#modal [data-menu="equipment"]'));
    await expect.poll(async () => (await snapshot()).paused).toBe(true);
    const summary = frame.locator('#modal .skill-summary');
    await expect(summary).toContainText('8 伤害 / 6 墨');
    await click(frame.locator('#modal .equipment-detail summary'));
    await expect(frame.locator('#modal .equipment-detail')).toContainText('25% 实际伤害');
    await expect(frame.locator('#modal .equipment-detail')).toContainText('50% 技能消耗');
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
    await expect(frame.locator('#board')).toHaveAttribute('data-level', 'first-turn');
    await expect(frame.locator('#board')).toBeVisible();
    await expect(frame.locator('#face-nav [data-face]')).toHaveCount(6);
    await expect(frame.locator('#face-nav [data-revealed="true"]')).toHaveCount(2);
    expect((await snapshot()).state.structureViewed).toBe(false);
    await expect(frame.locator('canvas[data-face-board]')).toHaveCount(2);
    await expect(frame.locator('[role="tab"], [role="tablist"], #flip')).toHaveCount(0);
    const view = async (face) => {
      const before = (await snapshot()).state;
      if (!before.revealedFaces.includes(face)) {
        await click(frame.locator(`#face-nav [data-face="${face}"]`));
        await expect(frame.locator('#hint-dialog')).toBeVisible();
        await expect(frame.locator('#reveal-structure')).toHaveCount(0);
        await click(frame.locator(`[data-reveal-face="${face}"]`));
        await expect(frame.locator('#hint-dialog')).not.toBeVisible();
      }
      const after = await snapshot();
      expect(after.boards[face].faces).toEqual([face]);
      expect(Object.keys(after.boards).sort()).toEqual([...after.state.revealedFaces].sort());
      await expect(frame.locator(`canvas[data-face-board="${face}"]`)).toBeVisible();
      expect(after.state.shafts).toEqual(before.shafts);
      expect(after.state.latches).toEqual(before.latches);
      expect(after.state.moves).toBe(before.moves);
      expect(after.state.side).toBe(before.side);
    };
    // Initial observations are random; discover the actual control faces through
    // the same reveal flow available to the player before operating the box.
    await view('front');
    const upperNotch = frame.locator('[data-face-card="front"] [data-shaft="A"][data-value="2"]');
    const initialState = (await snapshot()).state;
    await click(upperNotch);
    await expect.poll(async () => (await snapshot()).state).toEqual(initialState);
    await expect(frame.locator('#status')).toContainText(/锁|背|扣/);
    await view('back');
    await click(frame.locator('[data-latch="lock-A"]'));
    await expect.poll(async () => (await snapshot()).state.latches['lock-A']).toBe(false);
    await expect(frame.locator('[data-latch="lock-A"]')).toHaveAttribute('aria-pressed', 'false');
    await view('front');
    await click(upperNotch);
    await expect.poll(async () => (await snapshot()).state.shafts.A).toBe(2);
    await expect(upperNotch).toHaveAttribute('aria-pressed', 'true');
    await click(frame.locator('#release'));
    await expect
      .poll(async () => (await snapshot()).state.completed, { timeout: 15000 })
      .toBe(true);
    await expect(frame.locator('#structure-dialog')).toBeVisible();
    await expect(frame.locator('#result')).not.toBeVisible();
    const xray = frame.locator('#structure-xray');
    await expect(xray).toHaveAttribute('aria-pressed', 'true');
    await click(xray);
    await expect(xray).toHaveAttribute('aria-pressed', 'false');
    expect((await snapshot()).structure.xray).toBe(false);
    await click(xray);
    await expect(xray).toHaveAttribute('aria-pressed', 'true');
    expect((await snapshot()).structure.xray).toBe(true);
    await click(frame.locator('#structure-close'));
    await expect(frame.locator('#structure-dialog')).not.toBeVisible();
    await expect(frame.locator('#result')).toBeVisible();
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
    await expect(frame.locator('#counter')).toHaveText('02 / 100');
    await click(frame.locator('#hint'));
    await expect(frame.locator('.hint-step')).toHaveText('提示 1 / 3');
    await click(frame.locator('[data-more]'));
    await expect(frame.locator('.hint-step')).toHaveText('提示 2 / 3');
    await click(frame.locator('[data-close-hint]'));
  } else if (id === 'fold-the-world') {
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
    // Read the real document directly: Locator.evaluate also resolves and disposes
    // an element handle on every poll, consuming the same five-second deadline.
    const gameDocument = frame.owner
      ? await (await frame.owner().elementHandle()).contentFrame()
      : frame;
    expect(gameDocument).not.toBeNull();
    await expect
      .poll(() => gameDocument.evaluate(() => globalThis.__night?.snapshot().modelImport), {
        timeout: 60000,
      })
      .toBe('loaded');
    const press = async (id) => {
      const buttons = await gameDocument.evaluate(() => globalThis.__night.snapshot().buttons);
      if (!buttons.some((b) => b.id === id) && buttons.some((b) => b.id === 'flightControls'))
        await press('flightControls');
      await expect
        .poll(() =>
          gameDocument.evaluate(
            (id) => globalThis.__night.snapshot().buttons.some((b) => b.id === id),
            id,
          ),
        )
        .toBe(true);
      const b = await gameDocument.evaluate(
        (id) => globalThis.__night.snapshot().buttons.find((b) => b.id === id),
        id,
      );
      const position = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      await (mobile ? canvas.tap({ position }) : canvas.click({ position }));
      // Cocos commits input and then rebuilds the visible HUD on its next frame.
      await gameDocument.evaluate(
        () =>
          new Promise((resolve) =>
            globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
          ),
      );
    };
    await press('start');
    await expect
      .poll(() => gameDocument.evaluate(() => globalThis.__night.snapshot().time))
      .toBeGreaterThan(0);
    await press('settings');
    await expect
      .poll(() =>
        gameDocument.evaluate(() => globalThis.__night.snapshot().pauses.includes('settings')),
      )
      .toBe(true);
    await press('help');
    await expect
      .poll(() =>
        gameDocument.evaluate(() => globalThis.__night.snapshot().pauses.includes('help')),
      )
      .toBe(true);
    await press('close');
    await expect
      .poll(() => gameDocument.evaluate(() => globalThis.__night.snapshot().pauses))
      .toEqual(['settings']);
    await press('close');
    await expect
      .poll(() => gameDocument.evaluate(() => globalThis.__night.snapshot().pauses))
      .toEqual([]);
    await press('weapon2');
    await expect
      .poll(() => gameDocument.evaluate(() => globalThis.__night.snapshot().selected))
      .toBe(2);
  } else if (id === 'carding-car') {
    const canvas = frame.locator('#GameCanvas');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__kart?.snapshot().loading), { timeout: 120000 })
      .toBe(false);
    const bounds = await canvas.boundingBox();
    const rotated = await canvas.evaluate(() => {
      const { DOMMatrix, getComputedStyle, document } = globalThis;
      const transform = new DOMMatrix(
        getComputedStyle(document.getElementById('GameDiv')).transform,
      );
      return transform.b > 0.5 && Math.abs(transform.a) < 0.01;
    });
    const width = rotated ? bounds.height : bounds.width;
    const height = rotated ? bounds.width : bounds.height;
    const scale = Math.min(width / 960, height / 540);
    const action = async (x, y) => {
      const px = width / 2 + x * scale,
        py = height / 2 - y * scale;
      const position = rotated ? { x: bounds.width - py, y: px } : { x: px, y: py };
      await (mobile ? canvas.tap({ position }) : canvas.click({ position }));
    };
    const homeAction = async (prefix) => {
      const button = await canvas.evaluate(
        (_canvas, prefix) =>
          globalThis.__kart
            .snapshot()
            .home.buttons.find((button) => button.label.startsWith(prefix)),
        prefix,
      );
      expect(button?.enabled).toBe(true);
      await action(button.x, button.y);
    };
    await homeAction('选择比赛');
    await homeAction('进入赛道');
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__kart.snapshot().loading), { timeout: 120000 })
      .toBe(false);
    await expect
      .poll(() => canvas.evaluate(() => globalThis.__kart.snapshot().phase))
      .toBe('ready');
    await action(-282, -163);
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
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'modes');
    await click(frame.locator('#mode-local'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'setup');
    await click(frame.locator('#setup-start'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'game');
    await click(frame.locator('#draw-button'));
    await click(frame.locator('.cell').first());
    await expect(frame.locator('.cell.last-play')).toHaveCount(1);
  } else if (id === 'fishing') {
    await click(frame.getByRole('button', { name: '开始航行' }));
    await expect(frame.getByTestId('timer')).not.toHaveText('3:00');
    await click(frame.getByRole('button', { name: '暂停', exact: true }));
    await expect(frame.getByRole('button', { name: '继续航行' })).toBeVisible();
  } else if (id === 'office-slacking') {
    await expect(frame.locator('.game')).toHaveAttribute('data-phase', 'playing');
    await expect(frame.locator('#asset-error')).toBeHidden();
  } else if (id === 'cops-robbers') {
    await expect(frame.locator('#level-dialog')).toBeVisible();
    await click(frame.getByTestId('level-button-1'));
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
    const member = frame.locator('#cop-roster [data-member="0"]');
    await click(member);
    await expect(member).toHaveAttribute('aria-pressed', 'true');
    await click(frame.locator('#pause-button'));
    await expect(frame.locator('#resume-button')).toBeVisible();
    await click(frame.locator('#resume-button'));
  } else if (id === 'h5-security') {
    await expect(frame.locator('.home-screen')).toBeVisible();
    const notice = frame.locator('[data-action="dismiss-notification"]');
    if (await notice.isVisible()) await click(notice);
    await click(frame.locator('.app-grid [data-page="messages"]'));
    await expect(frame.locator('.thread-list')).toBeVisible();
  } else if (id === 'letters-words' || id === 'letters-words2') {
    const answer = id === 'letters-words' ? '#answer' : '#answer-slots';
    await expect(frame.locator('#board')).toBeVisible();
    await click(frame.locator('#board button:enabled:not([aria-disabled="true"])').first());
    await expect(frame.locator(`${answer} .filled`)).toHaveCount(1);
    if (id === 'letters-words2') {
      await click(frame.locator('#pause-button'));
      await expect(frame.locator('#pause-dialog')).toBeVisible();
      await click(frame.locator('#resume-button'));
      await expect(frame.locator(`${answer} .filled`)).toHaveCount(1);
      await click(frame.locator('#pause-button'));
      await click(frame.locator('#home-button'));
      await expect(frame.locator('#learn-button')).toBeVisible();
      await click(frame.locator('#focus-button'));
      await expect(frame.locator(`${answer} .filled`)).toHaveCount(1);
    }
    await click(frame.locator('#undo-button'));
    await expect(frame.locator(`${answer} .filled`)).toHaveCount(0);
  } else if (id === 'multi-battle') {
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
    await expect(frame.locator('main')).toHaveAttribute('data-phase', 'playing', {
      timeout: 120000,
    });
    const pause = frame.getByRole('button', { name: '暂停', exact: true });
    // Reuse the real document instead of repeatedly adopting element handles
    // between Playwright worlds while the default software WebGL frame is busy.
    const embedded = Boolean(frame.owner);
    const gameDocument = embedded
      ? await (await frame.owner().elementHandle()).contentFrame()
      : frame;
    expect(gameDocument).not.toBeNull();
    const pressGameControl = (control, selector) =>
      pressWebGLControl(frame, control, selector, mobile, gameDocument);
    // Escape releases desktop pointer lock without opening settings.
    if (mobile) {
      await pressGameControl(pause, 'button[aria-label="暂停"]');
    } else {
      const canvas = frame.locator('canvas');
      await expect(canvas).toBeFocused();
      const look = frame.locator('.look-mode');
      // Keep the native Pointer Lock assertion in the actual game document.
      // Locator.evaluate waits for an element handle, adopts it into the main
      // world, then evaluates it. Each round trip can wait for another software
      // WebGL frame. One document evaluation preserves the assertion without
      // changing the default scene, input or operation timeout.
      const pointerLockState = () =>
        gameDocument.evaluate(() => {
          const document = globalThis.document;
          const canvases = document.querySelectorAll('canvas');
          return {
            canvasCount: canvases.length,
            locked: canvases.length === 1 && document.pointerLockElement === canvases[0],
            released: document.pointerLockElement === null,
          };
        });
      // Async scene readiness can outlive the entry gesture. Acquire through the real HUD control.
      const initialLock = await pointerLockState();
      expect(initialLock.canvasCount).toBe(1);
      if (!initialLock.locked)
        await pressGameControl(
          frame.getByRole('button', { name: '鼠标环顾', exact: true }),
          '.look-mode',
        );
      // Wait inside the browser; Node-side polling can expire while software WebGL is busy.
      await expect(look).toHaveText('Esc 释放鼠标', { timeout: 120000 });
      expect(await pointerLockState()).toEqual({ canvasCount: 1, locked: true, released: false });
      // start() already focuses the canvas; send native input without refocusing WebGL.
      await canvas.page().keyboard.press('Escape');
      await expect(look).toHaveText('鼠标环顾', { timeout: 120000 });
      expect(await pointerLockState()).toEqual({ canvasCount: 1, locked: false, released: true });
      await expect(frame.getByRole('dialog')).toBeHidden();
      await expect(frame.locator('main')).toHaveAttribute('data-phase', 'playing');
      await pressGameControl(pause, 'button[aria-label="暂停"]');
    }
    await expect(frame.getByRole('dialog')).toBeVisible();
    await expect(frame.locator('main')).toHaveAttribute('data-phase', 'paused');
    // Resume starts rendering immediately; use native input without Locator's
    // post-click navigation waiter, then verify the actual dialog and phase.
    await pressGameControl(
      frame.getByRole('button', { name: '继续漫游', exact: true }),
      'dialog .settings-footer button.primary',
    );
    await expect(frame.getByRole('dialog')).toBeHidden();
    await expect(frame.locator('main')).toHaveAttribute('data-phase', 'playing');
  } else if (id === 'travel-bund-25d') {
    await expect(frame.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
    const scene = frame.locator('.scene');
    const initial = Number(await scene.getAttribute('data-progress'));
    await click(frame.getByRole('button', { name: '开始飞行', exact: true }));
    await expect(frame.locator('main')).toHaveAttribute('data-playing', 'true');
    await expect
      .poll(async () => Number(await scene.getAttribute('data-progress')))
      .toBeGreaterThan(initial);
    await pressWebGLControl(
      frame,
      frame.getByRole('button', { name: '暂停飞行', exact: true }),
      '.control-row > button:first-child',
      mobile,
    );
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
    await expect(frame.locator('#load-cover')).toBeHidden({ timeout: 20000 });
    const mapTab = frame.locator('#map-tab');
    if (await mapTab.isVisible()) await click(mapTab);
    await frame.locator('#city-search').fill('北京');
    await click(frame.locator('#search-results button').first());
    await frame.locator('#year-number').fill('1420');
    await click(frame.locator('#submit'));
    await expect(frame.locator('#result-overlay')).toBeVisible();
  } else if (id === 'vibeJam-myself-nullrange') {
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

// Native input with visibility, enabled and hit-target checks, without adopting
// element handles across worlds between expensive software WebGL frames.
async function pressWebGLControl(frame, control, selector, mobile = false, document = null) {
  // Reuse the real document instead of repeatedly adopting element handles
  // between Playwright worlds while the default software WebGL frame is busy.
  const embedded = Boolean(frame.owner);
  const gameDocument =
    document ?? (embedded ? await (await frame.owner().elementHandle()).contentFrame() : frame);
  expect(gameDocument).not.toBeNull();

  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  const point = await gameDocument.evaluate((selector) => {
    const document = globalThis.document;
    const controls = document.querySelectorAll(selector);
    const control = controls[0];
    const bounds = control?.getBoundingClientRect();
    const x = bounds ? bounds.x + bounds.width / 2 : -1;
    const y = bounds ? bounds.y + bounds.height / 2 : -1;
    return {
      count: controls.length,
      x,
      y,
      inViewport:
        bounds?.width > 0 &&
        bounds?.height > 0 &&
        x >= 0 &&
        x < globalThis.innerWidth &&
        y >= 0 &&
        y < globalThis.innerHeight,
      hit: Boolean(control?.contains(document.elementFromPoint(x, y))),
    };
  }, selector);
  expect(point.count).toBe(1);
  expect(point.inViewport).toBe(true);
  expect(point.hit).toBe(true);
  let { x, y } = point;
  if (embedded) {
    const host = await control.page().evaluate(({ x, y }) => {
      const document = globalThis.document;
      const frames = document.querySelectorAll('iframe');
      const owner = frames[0];
      const bounds = owner?.getBoundingClientRect();
      const scaleX = bounds ? bounds.width / owner.offsetWidth : 1;
      const scaleY = bounds ? bounds.height / owner.offsetHeight : 1;
      const pageX = bounds ? bounds.x + (owner.clientLeft + x) * scaleX : -1;
      const pageY = bounds ? bounds.y + (owner.clientTop + y) * scaleY : -1;
      return {
        count: frames.length,
        x: pageX,
        y: pageY,
        hit: Boolean(owner && document.elementFromPoint(pageX, pageY) === owner),
      };
    }, point);
    expect(host.count).toBe(1);
    expect(host.hit).toBe(true);
    ({ x, y } = host);
  }
  if (mobile) await control.page().touchscreen.tap(x, y);
  else await control.page().mouse.click(x, y);
}
