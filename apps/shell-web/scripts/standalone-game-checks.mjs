import { expect } from '@playwright/test';
import { enterStandalone } from './standalone-game-entry.mjs';
export { markers } from './standalone-game-entry.mjs';

export async function exerciseStandalone(frame, id, mobile = false) {
  await enterStandalone(frame, id, mobile);
  await assertStandaloneGameplay(frame, id, mobile);
}

export async function assertStandaloneGameplay(frame, id, mobile = false) {
  if (id === 'carrom-club') {
    const { assertCarromGameplay } = await import('./game-checks/carrom-club.mjs');
    return assertCarromGameplay(frame, mobile);
  }
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
  if (id === 'ashfall-front') {
    const game = frame.locator('#game');
    await expect(game).toHaveAttribute('data-screen', 'play');
    await expect(frame.locator('#game-canvas')).toBeVisible();
    await holdControl('#move-right', 'd', async () => {
      await expect(frame.locator('#move-right')).toHaveAttribute('aria-pressed', 'true');
    });
    await expect(frame.locator('#move-right')).toHaveAttribute('aria-pressed', 'false');
    await click(frame.getByRole('button', { name: '暂停', exact: true }));
    await expect(frame.getByRole('button', { name: '继续战斗', exact: true })).toBeFocused();
    await frame.locator('#game-canvas').page().keyboard.press('Enter');
    await expect(game).toHaveAttribute('data-screen', 'play');
    await expect(frame.locator('#game-canvas')).toBeFocused();
    await click(frame.getByRole('button', { name: '暂停', exact: true }));
    await click(frame.getByRole('button', { name: '返回主页', exact: true }));
    await expect(game).toHaveAttribute('data-screen', 'home');
    await expect(frame.locator('#start-game')).toBeFocused();
  } else if (id === 'three-choose-two') {
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
    const move = await game.evaluate(async (node) => {
      const { getLevel } = await import(new URL('./src/levels.mjs', node.baseURI).href);
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
    const savedBoard = await game.evaluate(
      () => globalThis.getThreeChooseTwoSnapshot().state.board,
    );
    await click(frame.getByRole('button', { name: '返回首页', exact: true }));
    await expect(game).toHaveAttribute('data-screen', 'home');
    await click(frame.locator('[data-action="start"]'));
    await expect(game).toHaveAttribute('data-screen', 'playing');
    expect(await game.evaluate(() => globalThis.getThreeChooseTwoSnapshot().state.board)).toEqual(
      savedBoard,
    );
    await click(frame.locator('[data-action="pause"]').last());
    await click(frame.getByRole('button', { name: /^退出关卡/ }));
    await expect(game).toHaveAttribute('data-screen', 'home');
    expect(
      await game.evaluate(
        () =>
          JSON.parse(globalThis.localStorage.getItem('three-choose-two-progress-v1')).currentGame,
      ),
    ).toBeNull();
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
    await expect(frame.locator('#levels-screen button[data-level]')).toHaveCount(30);
    await expect(frame.locator('#levels-screen button[data-level="0"]')).toBeEnabled();
    await expect(frame.locator('#levels-screen button[data-level="29"]')).toBeDisabled();
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
    const canvas = frame.locator('#GameCanvas');
    const page = canvas.page();
    const snapshot = () => canvas.evaluate(() => globalThis.__orbit?.snapshot());
    await expect.poll(async () => (await snapshot())?.assetReady, { timeout: 60000 }).toBe(true);
    await expect.poll(async () => (await snapshot())?.screen).toBe('home');
    await expect.poll(async () => (await snapshot())?.engine).toBe('Cocos Creator 3.8.8');
    const point = async (x, y) => {
      const state = await snapshot();
      const bounds = await canvas.boundingBox();
      expect(bounds).toBeTruthy();
      return {
        x: bounds.x + (x / state.width) * bounds.width,
        y: bounds.y + (y / state.height) * bounds.height,
      };
    };
    const tap = async (name) => {
      const state = await snapshot();
      const control = state.controls.find((item) => item.id === name && !item.disabled);
      expect(control, `Enabled Cocos control: ${name}`).toBeTruthy();
      const position = await point(control.x + control.w / 2, control.y + control.h / 2);
      if (mobile) await page.touchscreen.tap(position.x, position.y);
      else await page.mouse.click(position.x, position.y);
    };
    await tap('start');
    await expect.poll(async () => (await snapshot())?.screen).toBe('playing');
    const initial = await snapshot();
    const ring = initial.state.rings.find(
      (item) =>
        !item.removed &&
        initial.state.releasedCount >= (item.unlockAfter || 0) &&
        (item.requires || []).every(
          (key) => initial.state.rings.find((r) => r.id === key)?.removed,
        ),
    );
    expect(ring, 'A playable ring must be present').toBeTruthy();
    // Choose an exposed solid arc, then rotate through native input. No game action is invoked.
    const angles = Array.from({ length: 48 }, (_, index) => (index * Math.PI) / 24).filter(
      (angle) =>
        Math.abs(Math.atan2(Math.sin(angle - ring.angle), Math.cos(angle - ring.angle))) >
        ring.gap / 2 + 0.12,
    );
    const clearance = (angle) =>
      Math.min(
        1000,
        ...initial.state.rings
          .filter((item) => item.id !== ring.id && !item.removed)
          .map((item) =>
            Math.abs(
              Math.hypot(
                ring.x + Math.cos(angle) * ring.r - item.x,
                ring.y + Math.sin(angle) * ring.r - item.y,
              ) - item.r,
            ),
          ),
      );
    angles.sort((a, b) => clearance(b) - clearance(a));
    const positions = [];
    for (let index = 0; index <= 8; index++) {
      const angle = angles[0] + index * 0.065;
      positions.push(
        await point(
          initial.fit.x + (ring.x - initial.fit.cx + Math.cos(angle) * ring.r) * initial.fit.scale,
          initial.fit.y + (ring.y - initial.fit.cy + Math.sin(angle) * ring.r) * initial.fit.scale,
        ),
      );
    }
    const touch = mobile ? await page.context().newCDPSession(page) : undefined;
    try {
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [positions[0]],
        });
        for (const position of positions.slice(1))
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [position],
          });
      } else {
        await page.mouse.move(positions[0].x, positions[0].y);
        await page.mouse.down();
        for (const position of positions.slice(1)) await page.mouse.move(position.x, position.y);
      }
      await expect.poll(async () => (await snapshot()).selectedRingId).toBe(ring.id);
      await expect
        .poll(async () => (await snapshot()).state.rings.find((item) => item.id === ring.id).angle)
        .not.toBe(ring.angle);
    } finally {
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      } else await page.mouse.up();
    }
    await expect.poll(async () => (await snapshot()).moves).toBeGreaterThan(initial.moves);
    if ((await snapshot()).screen === 'result') {
      await tap('retry');
      await expect.poll(async () => (await snapshot()).screen).toBe('playing');
    }
    await tap('pause');
    await expect.poll(async () => (await snapshot()).screen).toBe('paused');
    const paused = (await snapshot()).state;
    await tap('resume');
    await expect.poll(async () => (await snapshot()).screen).toBe('playing');
    expect((await snapshot()).state).toEqual(paused);
    await tap('pause');
    await expect.poll(async () => (await snapshot()).screen).toBe('paused');
    await tap('home');
    await expect.poll(async () => (await snapshot()).screen).toBe('home');
    expect((await snapshot()).controls.some((item) => item.id === 'start' && !item.disabled)).toBe(
      true,
    );
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
    await click(frame.locator('#back-home'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'confirm');
    const confirming = await snapshot();
    await page.waitForTimeout(120);
    expect((await snapshot()).balls).toEqual(confirming.balls);
    await click(frame.locator('#confirm-cancel'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'playing');
    expect((await snapshot()).shots).toBe(confirming.shots);
    expect((await snapshot()).levelId).toBe(initial.levelId);
    await click(frame.locator('#back-home'));
    await click(frame.locator('#confirm-accept'));
    await expect(frame.locator('#start')).toBeVisible();
  } else if (id === 'castle-cannon') {
    const { assertCastleDuelEntry } = await import('./game-checks/castle-cannon.mjs');
    return assertCastleDuelEntry(frame, mobile);
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
    const canvas = frame.locator('#GameCanvas');
    await expect(canvas).toBeVisible();
    const snapshot = () => canvas.evaluate(() => globalThis.tianxiaSnapshot());
    await expect
      .poll(async () => {
        const state = await snapshot();
        return state.ready && state.artReady;
      })
      .toBe(true);
    const state = await snapshot();
    const city = state.cities.find((entry) => entry.owner === 0 && entry.client);
    expect(city).toBeTruthy();
    const junction = state.junctions.find((entry) => entry.cityId === city.id);
    expect(junction).toBeTruthy();
    // Snapshot coordinates belong to the child viewport; native input is page-wide.
    const local = await canvas.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y };
    });
    const bounds = await canvas.boundingBox();
    const x = bounds.x - local.x + city.client.x;
    const y = bounds.y - local.y + city.client.y;
    const page = canvas.page();
    if (mobile) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await expect.poll(async () => (await snapshot()).selected).toBe(city.id);
    await click(frame.locator('#cycle'));
    await expect
      .poll(
        async () =>
          (await snapshot()).junctions.find((entry) => entry.id === junction.id).routeIndex,
      )
      .not.toBe(junction.routeIndex);
    await click(frame.locator('#pause'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'pause');
    await click(frame.locator('#resume'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'battle');
    await click(frame.locator('#pause'));
    await click(frame.locator('#leave'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'home');
    await expect(frame.locator('#start')).toBeVisible();
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
    const canvas = frame.locator('#GameCanvas');
    const page = canvas.page();
    const snapshot = () => canvas.evaluate(() => globalThis.__bulletGarden?.snapshot());
    await expect.poll(async () => (await snapshot())?.art.ready, { timeout: 60000 }).toBe(true);
    expect((await snapshot()).engine).toBe('Cocos Creator 3.8.8');
    const point = async (x, y) => {
      const state = await snapshot(),
        bounds = await canvas.boundingBox();
      expect(bounds).toBeTruthy();
      return {
        x: bounds.x + (x / state.viewport.width) * bounds.width,
        y: bounds.y + (y / state.viewport.height) * bounds.height,
      };
    };
    const tap = async (id) => {
      await expect
        .poll(async () =>
          (await snapshot()).buttons.some((item) => item.id === id && !item.disabled),
        )
        .toBe(true);
      const button = (await snapshot()).buttons.find((item) => item.id === id && !item.disabled);
      expect(button, 'Enabled Cocos button: ' + id).toBeTruthy();
      const pos = await point(button.rect.x + button.rect.w / 2, button.rect.y + button.rect.h / 2);
      if (mobile) await page.touchscreen.tap(pos.x, pos.y);
      else await page.mouse.click(pos.x, pos.y);
    };
    await tap('levels');
    await expect.poll(async () => (await snapshot()).screen).toBe('levels');
    await tap('back');
    await tap('start');
    await expect.poll(async () => (await snapshot()).screen).toBe('playing');
    const host = page.locator('[data-game-display-host][data-game-id="bullet-garden"]');
    if (await host.count()) await expect(host).toHaveAttribute('data-screen', 'playing');
    // The Shell hides navigation, then Creator lays out the resized canvas before input.
    await expect
      .poll(async () => {
        const state = await snapshot(),
          bounds = await canvas.boundingBox();
        return (
          Math.abs(state.viewport.width - bounds.width) < 1 &&
          Math.abs(state.viewport.height - bounds.height) < 1
        );
      })
      .toBe(true);
    await canvas.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect
      .poll(async () => (await snapshot()).buttons.some((item) => item.id === 'move'))
      .toBe(true);
    const initial = await snapshot();
    expect(initial.state.boons).toEqual([]);
    const joystick = initial.buttons.find((item) => item.id === 'move');
    expect(joystick).toBeTruthy();
    const from = await point(
      joystick.rect.x + joystick.rect.w / 2,
      joystick.rect.y + joystick.rect.h / 2,
    );
    const to = await point(
      joystick.rect.x + joystick.rect.w / 2 + 32,
      joystick.rect.y + joystick.rect.h / 2,
    );
    const cdp = mobile ? await page.context().newCDPSession(page) : null;
    try {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, ...from }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ id: 1, ...to }],
        });
      } else {
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y);
      }
      await expect
        .poll(async () => (await snapshot()).state.player.x - initial.state.player.x)
        .toBeGreaterThan(12);
    } finally {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await cdp.detach();
      } else await page.mouse.up();
    }
    await expect.poll(async () => (await snapshot()).controls.joystickActive).toBe(false);
    await tap('pause');
    await expect.poll(async () => (await snapshot()).screen).toBe('paused');
    const time = (await snapshot()).state.time;
    await page.waitForTimeout(150);
    expect((await snapshot()).state.time).toBe(time);
    await tap('resume');
    await expect.poll(async () => (await snapshot()).state.time).toBeGreaterThan(time);
    await tap('dash');
    await expect.poll(async () => (await snapshot()).state.player.dashCooldown).toBeGreaterThan(0);
    await tap('pause');
    await tap('abandon');
    await expect.poll(async () => (await snapshot()).screen).toBe('home');
    expect((await snapshot()).buttons.some((item) => /fullscreen/i.test(item.id))).toBe(false);
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
    await expect(frame.locator('body')).toHaveAttribute('data-homebound-ready', 'true', {
      timeout: 60_000,
    });
    const canvas = frame.locator('#GameCanvas');
    const state = () => frame.locator('body').evaluate(() => globalThis.homeboundSnapshot());
    const view = () => frame.locator('body').evaluate(() => globalThis.homeboundView());
    // Read semantic control bounds, then send genuine pointer/touch input to Cocos.
    const at = (position) => (mobile ? canvas.tap({ position }) : canvas.click({ position }));
    const control = async (id) => {
      await expect
        .poll(async () => (await view()).buttons.some((b) => b.id === id && !b.disabled))
        .toBe(true);
      const b = (await view()).buttons.find((b) => b.id === id);
      await at({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    };
    await expect.poll(async () => (await view()).page).toBe('home');
    await control('continue');
    await expect.poll(async () => (await view()).page).toBe('playing');
    const total = (await state()).vehicles.length;
    await expect.poll(async () => (await view()).cars.some((c) => c.available)).toBe(true);
    const car = (await view()).cars.find((c) => c.available);
    await at({ x: car.x, y: car.y });
    await expect.poll(async () => (await state()).services.length).toBe(1);
    await control('pause');
    await expect.poll(async () => (await view()).page).toBe('pause');
    const frozen = (await state()).time;
    await canvas.page().waitForTimeout(200);
    expect((await state()).time).toBe(frozen);
    await control('retry');
    await expect.poll(async () => (await view()).page).toBe('playing');
    expect((await state()).vehicles.length).toBe(total);
    expect((await state()).services.length).toBe(0);
  } else if (id === 'out-of-frame') {
    const snapshot = () => frame.locator('body').evaluate(() => globalThis.__outOfFrameSnapshot());
    const restart = frame.locator(mobile ? '#touch-restart' : '#restart');
    const undo = frame.locator(mobile ? '#touch-undo' : '#undo');
    await click(frame.locator('#start-button'));
    const beforeMove = await snapshot();
    await holdControl('#move-right', 'ArrowRight', () =>
      expect
        .poll(async () => (await snapshot()).state.player.x)
        .toBeGreaterThan(beforeMove.state.player.x + 8),
    );
    await click(restart);
    await expect
      .poll(async () => (await snapshot()).state.player.x)
      .toBe(beforeMove.state.player.x);

    const canvas = frame.locator('#board');
    const page = canvas.page();
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    const beforeDrag = await snapshot();
    const { x, y, w, h } = beforeDrag.state.frame;
    const rotated = (await frame.locator('html').getAttribute('data-rotated')) === 'true';
    const screenPoint = (logicalX, logicalY) =>
      rotated
        ? {
            x: bounds.x + (1 - logicalY / beforeDrag.world.h) * bounds.width,
            y: bounds.y + (logicalX / beforeDrag.world.w) * bounds.height,
          }
        : {
            x: bounds.x + (logicalX / beforeDrag.world.w) * bounds.width,
            y: bounds.y + (logicalY / beforeDrag.world.h) * bounds.height,
          };
    const from = screenPoint(x + w / 2, y + h / 2);
    const dx = x + w + 110 < beforeDrag.world.w ? 100 : -100;
    const to = screenPoint(x + w / 2 + dx, y + h / 2);
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
            touchPoints: [
              {
                x: from.x + ((to.x - from.x) * step) / 6,
                y: from.y + ((to.y - from.y) * step) / 6,
                id: 1,
              },
            ],
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
      await click(undo);
    }
    await expect.poll(async () => (await snapshot()).state.frame.x).toBe(x);
    await click(restart);
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
      const position = await canvas.evaluate((element, b) => {
        const bounds = element.getBoundingClientRect(),
          s = globalThis.__night.snapshot();
        const transform = new globalThis.DOMMatrix(
          globalThis.getComputedStyle(globalThis.document.getElementById('GameDiv')).transform,
        );
        const x = b.x + b.w / 2,
          y = b.y + b.h / 2;
        return transform.b > 0.5
          ? {
              x: bounds.width - (y * bounds.width) / s.ui.height,
              y: (x * bounds.height) / s.ui.width,
            }
          : { x: (x * bounds.width) / s.ui.width, y: (y * bounds.height) / s.ui.height };
      }, b);
      await (mobile ? canvas.tap({ position }) : canvas.click({ position }));
      // Cocos commits input and then rebuilds the visible HUD on its next frame.
      await gameDocument.evaluate(
        () =>
          new Promise((resolve) =>
            globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
          ),
      );
    };
    await press('missions');
    await expect
      .poll(() => gameDocument.evaluate(() => globalThis.__night.snapshot().modal))
      .toBe('missions');
    await press('homeMenu');
    await expect
      .poll(() => gameDocument.evaluate(() => globalThis.__night.snapshot().modal))
      .toBe('home');
    await press('missions');
    await press('training');
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
  } else if (id === 'xiangqi-five') {
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'modes');
    await click(frame.locator('#mode-local'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'setup');
    await click(frame.locator('#setup-start'));
    await expect(frame.locator('body')).toHaveAttribute('data-screen', 'game');
    await click(frame.locator('#draw-button'));
    await click(frame.locator('.cell').first());
    await expect(frame.locator('.cell.last-play')).toHaveCount(1);
  } else if (id === 'cops-robbers') {
    await expect(frame.locator('#level-dialog')).toBeHidden();
    await expect(frame.locator('body')).toHaveAttribute('data-level', '1');
    await expect(frame.getByTestId('board')).toBeVisible();
    await expect(frame.getByTestId('hint')).toHaveAttribute('aria-label', '获取提示');
    await click(frame.getByTestId('hint'));
    await expect(frame.getByRole('dialog', { name: '模拟广告' })).toHaveCount(0);
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
  } else if (id === 'letters-words2') {
    const answer = '#answer-slots';
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
    await expect(frame.getByRole('button', { name: '前往下一幕' })).toBeVisible();
    await expect(frame.locator('.result-score')).toContainText('本幕评分');
    await expect(frame.locator('.page-content')).not.toContainText(
      /公里误差|年误差|正确答案|对照地图/,
    );
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
