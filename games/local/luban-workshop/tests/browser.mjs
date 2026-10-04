import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const evidenceDir = process.env.BROWSER_EVIDENCE_DIR || resolve(tmpdir(), 'luban-browser-checks');

/** All game changes come from real buttons, mouse input, and CDP touch input.
 * The diagnostic snapshot is read only; no solver or state setter is injected.
 * A shell can supply its iframe as `scope` and its element as `frameElement`.
 */
export async function exerciseStandalone(
  page,
  {
    mobile = false,
    scope = page,
    frameElement,
    screenshotPrefix = mobile ? 'mobile' : 'desktop',
    screenshotDir = evidenceDir,
    completeAllLevels = true,
    levelIndices,
    interactionsOnly = false,
    skipInteractions = false,
  } = {},
) {
  await scope.locator('#app[data-ready="true"]').waitFor();
  const snapshot = () => scope.evaluate(() => window.lubanSnapshot());
  let activeLevelIndex = 0;
  const settleLayout = () =>
    scope.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  const setControls = async (open) => {
    if ((await scope.locator('#toggle-controls').getAttribute('aria-expanded')) === String(open))
      return;
    if (mobile) await scope.locator('#toggle-controls').tap();
    else await scope.locator('#toggle-controls').click();
    await settleLayout();
    assert.equal(await scope.locator('#controls').isVisible(), open);
  };
  const activate = async (selector) => {
    const button = scope.locator(selector);
    if (await button.evaluate((element) => Boolean(element.closest('#controls, .view-tools'))))
      await setControls(true);
    if (mobile) await button.tap();
    else await button.click();
    if (selector === '#hint') await scope.locator('#app[data-hint-pending="false"]').waitFor();
  };
  const openHome = async () => {
    if (await scope.locator('#back-home').isVisible()) await activate('#back-home');
    await scope.locator('#home').waitFor({ state: 'visible' });
  };
  const enterLevel = async (index = activeLevelIndex) => {
    await activate(`#home-level-list button[data-level="${index}"]`);
    activeLevelIndex = index;
    await scope.locator('#app[data-screen="play"]').waitFor();
    await settleLayout();
  };
  const reloadGame = async () => {
    if (scope === page) await page.reload();
    else await scope.goto(scope.url());
    await scope.locator('#app[data-ready="true"]').waitFor();
    await activate('#continue-game');
    await scope.locator('#app[data-screen="play"]').waitFor();
    await setControls(true);
  };
  const cdp = mobile ? await page.context().newCDPSession(page) : null;
  const globalPoint = async (point) => {
    const frame = frameElement ? await frameElement.boundingBox() : { x: 0, y: 0 };
    assert.ok(frame, 'The embedded game must be visible');
    return { x: point.x + frame.x, y: point.y + frame.y };
  };
  const touch = async (type, points) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: await Promise.all(
        points.map(async (point, index) => ({
          ...(await globalPoint(point)),
          id: index + 1,
          radiusX: 5,
          radiusY: 5,
          force: 1,
        })),
      ),
    });
    // CDP may acknowledge a terminal touch before its pointer event is rendered.
    // Observe the completed gesture transaction after the next browser frames.
    if (type === 'touchEnd' || type === 'touchCancel') await settleLayout();
  };
  const tap = async (point) => {
    if (mobile) {
      await touch('touchStart', [point]);
      await touch('touchEnd', []);
    } else {
      const p = await globalPoint(point);
      await page.mouse.click(p.x, p.y);
    }
  };
  const drag = async (from, to, { cancel = false, keepDown = false } = {}) => {
    if (mobile) {
      await touch('touchStart', [from]);
      for (let step = 1; step <= 8; step++) {
        await touch('touchMove', [
          { x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 },
        ]);
      }
      if (!keepDown) await touch(cancel ? 'touchCancel' : 'touchEnd', []);
    } else {
      const a = await globalPoint(from),
        b = await globalPoint(to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 8 });
      if (!keepDown) await page.mouse.up();
    }
  };
  const screenshot = async (name) => {
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: resolve(screenshotDir, `${screenshotPrefix}-${name}.png`),
      fullPage: true,
    });
  };

  const axes = ['x', 'y', 'z'];
  const component = (data, id, axis) => data.state.offsets[id][axes.indexOf(axis)];
  const assertOffsetsNear = (actual, expected) => {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const id of Object.keys(expected))
      for (let coordinate = 0; coordinate < 3; coordinate++)
        assert.ok(
          Math.abs(actual[id][coordinate] - expected[id][coordinate]) < 0.000001,
          `${id} ${axes[coordinate]} offset should be ${expected[id][coordinate]}, received ${actual[id][coordinate]}`,
        );
  };
  const selectSingle = async (id) => {
    if ((await scope.locator('#group-select').getAttribute('aria-pressed')) === 'true')
      await activate('#group-select');
    await activate(`[data-piece="${id}"]`);
    assert.deepEqual((await snapshot()).selectedIds, [id]);
  };
  const chooseAxis = async (axis) => {
    await activate(`#axis-${axis}`);
    assert.equal((await snapshot()).activeAxis, axis);
  };
  const dragAlong = async (from, id, axis, distance, options) => {
    const direction = (await snapshot()).pieces.find((piece) => piece.id === id).directions[axis];
    const to = {
      x: from.x + direction.x * direction.pixelsPerUnit * distance,
      y: from.y + direction.y * direction.pixelsPerUnit * distance,
    };
    await drag(from, to, options);
    return to;
  };

  const blankPoint = async () => {
    const { stage } = await snapshot();
    const point = { x: stage.x + 25, y: stage.y + stage.height * 0.68 };
    assert.equal(
      await scope.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point),
      'CANVAS',
      'Background gestures must start on the canvas',
    );
    return point;
  };
  // The snapshot only locates visible real mesh surfaces. Actual selection and
  // movement always go through native input and the normal scene raycast.
  const piecePoint = async (id) => {
    const data = await snapshot();
    const piece = data.pieces.find((item) => item.id === id);
    assert.ok(piece, `Missing piece ${id}`);
    assert.ok(piece.pickableScreenSamples.length, `${id} must have a visible, pickable surface`);
    for (const sample of piece.pickableScreenSamples) {
      const point = {
        x: data.stage.x + sample.x,
        y: data.stage.y + sample.y,
      };
      if (
        point.x < data.stage.x + 4 ||
        point.x > data.stage.x + data.stage.width - 4 ||
        point.y < data.stage.y + 4 ||
        point.y > data.stage.y + data.stage.height - 4
      )
        continue;
      const hitsCanvas = await scope.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit?.tagName === 'CANVAS';
      }, point);
      if (!hitsCanvas) continue;
      return point;
    }
    throw new Error(`Could not locate visible ${id} directly in the scene`);
  };

  assert.equal(await scope.locator('#home').isVisible(), true, 'Launch opens the level catalog');
  const tutorialCard = scope.locator('#home-level-list button[data-level="0"]');
  assert.equal(await tutorialCard.getAttribute('data-level-id'), 'first-lift-v1');
  assert.match(await tutorialCard.innerText(), /初识 · 一提一合/);
  const complexLevelIndex = Number(
    await scope
      .locator('#home-level-list button[data-level-id="burr-interlocking-6-v1"]')
      .getAttribute('data-level'),
  );
  assert.ok(complexLevelIndex > 0, 'The established six-piece lock remains in the catalog');
  await screenshot('home');
  await enterLevel(0);
  const mainCanvas = scope.locator('#stage > canvas');
  const layout = await scope.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    canvas: document.querySelector('#stage > canvas').getBoundingClientRect().toJSON(),
  }));
  assert.ok(layout.scrollWidth <= layout.width + 1, 'The game must not overflow horizontally');
  assert.ok(layout.canvas.width >= 300 && layout.canvas.height >= 180);
  assert.equal(await scope.locator('#controls').isVisible(), false);
  for (const selector of [
    '#back-home',
    '#help',
    '#toggle-controls',
    '#phase-toggle',
    '#assembly-preview',
    '#hint',
    '#restore',
  ])
    assert.ok(await scope.locator(selector).isVisible(), `${selector} must be discoverable`);
  assert.equal(await scope.locator('.topbar').isVisible(), false, 'Gameplay hides the home header');
  assert.equal(await scope.locator('#home').isVisible(), false);
  assert.match(await scope.locator('#hint').innerText(), /拆解提示/);
  assert.equal(await scope.locator('#assembly-preview canvas').count(), 1);
  await screenshot('initial');

  const assertPose = (actual, expected) => {
    assertOffsetsNear(actual.offsets, expected.offsets);
    assert.deepEqual(actual.orientations, expected.orientations);
  };
  const assertViewAligned = (data) => {
    assert.ok(data.viewOrientation.preview, 'The assembled reference must have a live view');
    assert.equal(data.viewOrientation.yaw, data.viewOrientation.preview.yaw);
    assert.equal(data.viewOrientation.pitch, data.viewOrientation.preview.pitch);
  };
  const restart = async () => {
    await activate('#restart');
    await activate('#confirm-restart');
  };
  const restore = async () => {
    const before = await snapshot();
    await activate('#restore');
    const restored = await snapshot();
    assert.equal(restored.state.phase, 'disassemble');
    assert.equal(restored.state.moves, 0);
    assert.deepEqual(restored.state.history, []);
    assert.deepEqual(restored.state.future, []);
    assert.deepEqual(restored.run, { hints: 0, disassemblyMoves: null });
    assert.deepEqual(restored.record, before.record, 'One-click restore cannot award completion');
    assert.equal(restored.progress.complete, false);
    assert.equal(restored.progress.assembled, restored.pieces.length);
    assert.equal(await scope.locator('#dialog').evaluate((element) => element.open), false);
    return restored;
  };
  const selectGroup = async (ids) => {
    await selectSingle(ids[0]);
    await activate('#group-select');
    for (const id of ids.slice(1)) await activate(`[data-piece="${id}"]`);
    assert.deepEqual(new Set((await snapshot()).selectedIds), new Set(ids));
  };

  if (!skipInteractions) {
    const tutorial = await snapshot();
    assert.equal(tutorial.state.levelId, 'first-lift-v1');
    assert.equal(tutorial.pieces.length, 2, 'The first lesson uses only two interlocking bars');
    const start = await piecePoint('key');
    await dragAlong(start, 'key', 'y', 2.15);
    const lifted = await snapshot();
    assert.equal(lifted.state.moves, 1, 'One upward scene drag teaches the complete first move');
    assert.equal(lifted.progress.complete, true);
    assert.equal(lifted.progress.removed, 2);
    assert.equal(component(lifted, 'key', 'y'), 2);
    await screenshot('tutorial-lifted');
    await activate('#reassemble');
    await activate('#hint');
    const seated = await snapshot();
    assert.equal(seated.state.moves, 2, 'One return hint seats the teaching joint');
    assert.equal(seated.progress.assembled, 2);
    assert.equal(seated.progress.complete, true);
    assertPose(seated.state, tutorial.state);
    await screenshot('tutorial-seated');
    await restore();
    await activate('#hint');
    assert.equal((await snapshot()).state.moves, 1);
    assert.equal(
      (await snapshot()).progress.complete,
      true,
      'The first hint fully opens the lesson',
    );
    await restore();
  }

  // Keep the established interactions demanding even though the first lesson is now simpler.
  await openHome();
  await enterLevel(complexLevelIndex);
  assert.equal((await snapshot()).pieces.length, 6);

  if (!skipInteractions) {
    // Native scene taps add and remove pieces without mutating their poses.
    const initial = await snapshot();
    const visible = initial.pieces.filter((piece) => piece.pickableScreenSamples.length);
    assert.ok(visible.length >= 2, 'An assembled puzzle must expose at least two selectable parts');
    const [first, second] = visible.map((piece) => piece.id);
    await tap(await blankPoint());
    await tap(await piecePoint(first));
    await tap(await piecePoint(second));
    assert.deepEqual(new Set((await snapshot()).selectedIds), new Set([first, second]));
    await tap(await piecePoint(first));
    assert.deepEqual((await snapshot()).selectedIds, [second]);
    await tap(await piecePoint(second));
    assert.deepEqual((await snapshot()).selectedIds, []);
    assert.deepEqual((await snapshot()).state, initial.state);
    await tap(await piecePoint(first));
    await tap(await piecePoint(second));
    await tap(await blankPoint());
    assert.deepEqual((await snapshot()).selectedIds, []);

    // The main view and the compact complete model share their orientation.
    await tap(await piecePoint(first));
    const beforeOrbit = await snapshot();
    assertViewAligned(beforeOrbit);
    const blank = await blankPoint();
    await drag(blank, { x: blank.x + 40, y: blank.y + 18 });
    const afterOrbit = await snapshot();
    assert.deepEqual(afterOrbit.state, beforeOrbit.state);
    assert.deepEqual(afterOrbit.selectedIds, beforeOrbit.selectedIds);
    assert.notEqual(afterOrbit.viewOrientation.yaw, beforeOrbit.viewOrientation.yaw);
    assertViewAligned(afterOrbit);
    const preview = await scope.locator('#assembly-preview canvas').boundingBox();
    const previewPoint = {
      x: preview.x + preview.width * 0.45,
      y: preview.y + preview.height * 0.5,
    };
    // boundingBox uses page coordinates even when the game is in an iframe.
    const frameBox = frameElement ? await frameElement.boundingBox() : { x: 0, y: 0 };
    previewPoint.x -= frameBox.x;
    previewPoint.y -= frameBox.y;
    await drag(previewPoint, { x: previewPoint.x + 24, y: previewPoint.y + 12 });
    const afterPreviewOrbit = await snapshot();
    assert.notEqual(afterPreviewOrbit.viewOrientation.yaw, afterOrbit.viewOrientation.yaw);
    assertViewAligned(afterPreviewOrbit);
    assert.deepEqual(afterPreviewOrbit.state, beforeOrbit.state);
    await activate('#camera-reset');
    await setControls(false);
    assertViewAligned(await snapshot());
    await screenshot('synchronized-preview');

    if (mobile) {
      const beforeCancel = await snapshot();
      for (const point of [await piecePoint(first), await piecePoint(second), await blankPoint()]) {
        await touch('touchStart', [point]);
        await touch('touchCancel', []);
        assert.deepEqual((await snapshot()).state, beforeCancel.state);
        assert.deepEqual((await snapshot()).selectedIds, beforeCancel.selectedIds);
      }
      const point = await blankPoint();
      const other = { x: point.x + 90, y: point.y - 30 };
      const beforePinch = await snapshot();
      await touch('touchStart', [point]);
      await touch('touchStart', [point, other]);
      await touch('touchMove', [
        { x: point.x - 15, y: point.y + 6 },
        { x: other.x + 15, y: other.y - 6 },
      ]);
      await touch('touchEnd', []);
      const afterPinch = await snapshot();
      assert.deepEqual(afterPinch.state, beforePinch.state);
      assert.deepEqual(afterPinch.selectedIds, beforePinch.selectedIds);
      assert.ok(
        afterPinch.pieces[0].direction.pixelsPerUnit >
          beforePinch.pieces[0].direction.pixelsPerUnit * 1.08,
      );
      await activate('#camera-reset');
      await setControls(false);
    }
    assert.equal(await scope.locator('#controls').isVisible(), false);
  }

  await setControls(true);
  assert.ok((await mainCanvas.boundingBox()).height < layout.canvas.height);
  for (const selector of ['#clue', '#restart', '#group-select', '#axis-x', '#axis-y', '#axis-z'])
    assert.ok(
      await scope.locator(selector).isVisible(),
      `${selector} remains in optional controls`,
    );
  await activate('#help');
  assert.equal(await scope.locator('#dialog').evaluate((element) => element.open), true);
  await activate('#help-done');
  const beforeHome = await snapshot();
  await openHome();
  assert.deepEqual(
    (await snapshot()).state,
    beforeHome.state,
    'Home preserves the current attempt',
  );
  const catalog = await scope
    .locator('#home-level-list button[data-level]')
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        index: Number(button.dataset.level),
        number: button.querySelector('.level-number')?.textContent.trim(),
      })),
    );
  assert.ok(catalog.length >= 11, 'The catalog retains ten puzzles after the first lesson');
  assert.equal(catalog.length, (await snapshot()).levelCount);
  assert.deepEqual(
    catalog.map((item) => item.index),
    Array.from({ length: catalog.length }, (_, i) => i),
  );
  assert.deepEqual(
    catalog.map((item) => item.number),
    Array.from({ length: catalog.length }, (_, i) => String(i + 1).padStart(2, '0')),
  );
  await screenshot('level-catalog');
  await activate('#continue-game');
  await settleLayout();
  assert.deepEqual((await snapshot()).state, beforeHome.state);
  await setControls(true);

  if (!skipInteractions) {
    await restart();
    const initial = await snapshot();
    const ids = initial.pieces.map((piece) => piece.id);
    await activate('#clue');
    const clue = await snapshot();
    assert.deepEqual(clue.state, initial.state);
    assert.equal(clue.hint, null);

    // One hint executes one legal action, and remains an ordinary undoable move.
    await activate('#hint');
    const hinted = await snapshot();
    assert.ok(hinted.hint && hinted.hint.kind !== 'rotate');
    const { pieceId, pieceIds, axis, direction } = hinted.hint;
    const beforeMove = initial.state;
    const moved = hinted;
    assert.notDeepEqual(moved.state.offsets, beforeMove.offsets);
    assert.equal(moved.state.moves, beforeMove.moves + 1);
    assert.equal(moved.progress.complete, false);
    await openHome();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+z');
    assert.deepEqual(
      (await snapshot()).state,
      moved.state,
      'Home keyboard shortcuts cannot manipulate or undo a selected puzzle part',
    );
    await activate('#continue-game');
    await setControls(true);
    assert.deepEqual((await snapshot()).state, moved.state);
    await activate('#phase-toggle');
    const returning = await snapshot();
    assert.equal(returning.state.phase, 'reassemble');
    assert.match(await scope.locator('#hint').innerText(), /复原提示/);
    assertPose(returning.state, moved.state);
    assert.deepEqual(returning.state.history, moved.state.history);
    assert.equal(returning.state.moves, moved.state.moves);
    await activate('#phase-toggle');
    assert.equal((await snapshot()).state.phase, 'disassemble');
    assertPose((await snapshot()).state, moved.state);
    await activate('#undo');
    assertPose((await snapshot()).state, beforeMove);
    await activate('#redo');
    assertPose((await snapshot()).state, moved.state);
    await reloadGame();
    assert.deepEqual((await snapshot()).state, moved.state);
    await activate('#undo');
    assertPose((await snapshot()).state, beforeMove);

    // A direct drag follows the same legal motion and remains a single transaction.
    await selectGroup(pieceIds);
    if (pieceIds.length === 1) await activate('#group-select');
    await chooseAxis(axis);
    await activate('#camera-reset');
    const from = await piecePoint(pieceId);
    const beforeDrag = await snapshot();
    await dragAlong(from, pieceId, axis, direction * 0.7);
    const dragged = await snapshot();
    assert.equal(dragged.state.moves, beforeDrag.state.moves + 1);
    for (const id of pieceIds)
      assert.ok(
        Math.abs(component(dragged, id, axis) - component(beforeDrag, id, axis) - direction * 0.5) <
          0.000001,
      );
    await activate('#undo');
    assertPose((await snapshot()).state, beforeDrag.state);
    if (mobile) {
      const start = await piecePoint(pieceId);
      const beforeDragPreview = await snapshot();
      const beforeCancel = beforeDragPreview.state;
      await dragAlong(start, pieceId, axis, direction * 0.7, { keepDown: true });
      assert.notDeepEqual((await snapshot()).state.offsets, beforeCancel.offsets);
      assert.equal(
        (await snapshot()).stage.height,
        beforeDragPreview.stage.height,
        'Dragging must not resize the scene',
      );
      assert.equal(await scope.locator('#rotation-tools').isVisible(), true);
      assert.equal(await scope.locator('#rotate-positive').isDisabled(), true);
      await touch('touchCancel', []);
      assert.deepEqual(
        (await snapshot()).state,
        beforeCancel,
        'Cancelled drag restores the full transaction',
      );
    }

    // At least one member of a mechanical lock must be blocked while assembled.
    let blockedRotation = false;
    for (const id of ids) {
      if (blockedRotation) break;
      await selectSingle(id);
      for (const turnAxis of axes) {
        await activate(`#turn-axis-${turnAxis}`);
        const before = (await snapshot()).state;
        await activate('#rotate-positive');
        const after = (await snapshot()).state;
        if (JSON.stringify(after) === JSON.stringify(before)) {
          assert.match(await scope.locator('#status').innerText(), /挡|空间|碰撞/);
          blockedRotation = true;
          break;
        }
        await activate('#undo');
        assertPose((await snapshot()).state, before);
      }
    }
    assert.ok(blockedRotation, 'A locked piece cannot rotate through its neighbors');
    await screenshot('blocked-rotation');

    // The entire assembly can turn rigidly; its pieces stay engaged.
    await selectGroup(ids);
    await activate('#turn-axis-y');
    const beforeRotation = (await snapshot()).state;
    await activate('#rotate-positive');
    const rotated = await snapshot();
    assert.equal(rotated.state.moves, beforeRotation.moves + 1);
    for (const id of ids)
      assert.notDeepEqual(rotated.state.orientations[id], beforeRotation.orientations[id]);
    assert.equal(rotated.progress.complete, false);
    assertViewAligned(rotated);
    await screenshot('group-rotation');
    await activate('#undo');
    assertPose((await snapshot()).state, beforeRotation);
    await activate('#redo');
    assertPose((await snapshot()).state, rotated.state);
    await reloadGame();
    assert.deepEqual(
      (await snapshot()).state,
      rotated.state,
      'Reload retains orientations and atomic history',
    );
    await activate('#undo');
    await selectGroup(ids);
    await activate('#turn-axis-y');
    await activate('#rotate-positive');
    await activate('#rotate-negative');
    assertPose((await snapshot()).state, beforeRotation);

    assert.equal(await scope.locator('#rotation-angle').inputValue(), '90');
    await scope.locator('#rotation-angle').selectOption('15');
    const beforePartialTurn = (await snapshot()).state;
    await activate('#rotate-positive');
    const partialTurn = (await snapshot()).state;
    assert.equal(partialTurn.moves, beforePartialTurn.moves + 1);
    assert.ok(
      Object.values(partialTurn.orientations).some((orientation) =>
        orientation.some((value) => Math.abs(value) > 0.01 && Math.abs(value) < 0.99),
      ),
      'A 15 degree turn retains continuous orientation values',
    );
    await activate('#rotate-negative');
    assertPose((await snapshot()).state, beforePartialTurn);
    await scope.locator('#rotation-angle').selectOption('90');

    // Free group translation keeps every member's relative placement.
    await chooseAxis('x');
    await activate('#camera-reset');
    const beforeGroup = await snapshot();
    const leader = beforeGroup.pieces.find((piece) => piece.pickableScreenSamples.length).id;
    await dragAlong(await piecePoint(leader), leader, 'x', 0.7);
    const translated = await snapshot();
    assert.deepEqual(new Set(translated.selectedIds), new Set(ids));
    assert.equal(translated.state.moves, beforeGroup.state.moves + 1);
    for (const id of ids)
      assert.equal(component(translated, id, 'x') - component(beforeGroup, id, 'x'), 0.5);
    assert.equal(translated.progress.complete, false);
    await activate('#undo');
    assertPose((await snapshot()).state, beforeGroup.state);
    if (mobile) {
      const beforeCancel = (await snapshot()).state;
      await dragAlong(await piecePoint(leader), leader, 'x', 0.7, { keepDown: true });
      await touch('touchCancel', []);
      assert.deepEqual(
        (await snapshot()).state,
        beforeCancel,
        'Cancel restores every member of the selected group',
      );
    }
    await activate('#xray');
    assert.equal((await snapshot()).xray, true);
    await activate('#xray');
    assert.equal((await snapshot()).xray, false);
    const restored = await restore();
    await reloadGame();
    assert.deepEqual((await snapshot()).state, restored.state, 'One-click restore persists');

    // The optional platform port grants one operation only after reward completion.
    // The stub supplies host behavior, never a game-state setter or a solver.
    for (const outcome of ['dismissed', 'unavailable', 'failed']) {
      await scope.evaluate((status) => {
        window.lubanWorkshopHost = {
          session: { capabilities: ['advertising'] },
          ads: { offer: async () => ({ status }) },
        };
      }, outcome);
      const beforeDenied = await snapshot();
      await activate('#hint');
      const afterDenied = await snapshot();
      assert.deepEqual(afterDenied.state, beforeDenied.state);
      assert.deepEqual(afterDenied.run, beforeDenied.run, `${outcome} cannot consume a hint`);
    }
    await scope.evaluate(() => {
      window.__lubanHintOffers = [];
      window.lubanWorkshopHost = {
        session: { capabilities: ['advertising'] },
        ads: {
          offer: (request) => {
            window.__lubanHintOffers.push(request);
            return new Promise((resolve) => {
              window.__finishLubanHint = resolve;
            });
          },
        },
      };
    });
    const startReward = async () => {
      const before = await snapshot();
      if (mobile) await scope.locator('#hint').tap();
      else await scope.locator('#hint').click();
      await scope.locator('#app[data-hint-pending="true"]').waitFor();
      assert.equal(await scope.locator('#hint').isDisabled(), true);
      assert.deepEqual((await snapshot()).state, before.state, 'Pending reward cannot move pieces');
      return before;
    };
    const finishReward = async () => {
      await scope.evaluate(() => window.__finishLubanHint({ status: 'completed' }));
      await scope.locator('#app[data-hint-pending="false"]').waitFor();
      await settleLayout();
    };
    const beforeReward = await startReward();
    await finishReward();
    assert.equal((await snapshot()).state.moves, beforeReward.state.moves + 1);
    assert.equal((await snapshot()).run.hints, beforeReward.run.hints + 1);
    const opportunity = await scope.evaluate(() => window.__lubanHintOffers[0]);
    assert.equal(opportunity.id, 'luban-workshop.hint.disassemble');
    assert.deepEqual(opportunity.reward, {
      levelId: beforeReward.state.levelId,
      phase: 'disassemble',
      action: 'move',
      steps: 1,
    });
    await activate('#phase-toggle');
    const beforeReturnReward = await startReward();
    await finishReward();
    assert.equal((await snapshot()).state.moves, beforeReturnReward.state.moves + 1);
    assert.equal(
      await scope.evaluate(() => window.__lubanHintOffers.at(-1).id),
      'luban-workshop.hint.reassemble',
    );
    await restore();
    for (const cancelWith of ['#restore', '#phase-toggle', '#back-home']) {
      await startReward();
      await activate(cancelWith);
      const cancelled = await snapshot();
      await finishReward();
      const afterLateReward = await snapshot();
      assert.deepEqual(
        afterLateReward.state,
        cancelled.state,
        `${cancelWith} invalidates a late hint`,
      );
      assert.deepEqual(afterLateReward.run, cancelled.run, 'Cancelled hints cannot consume help');
      if (cancelWith === '#back-home') await activate('#continue-game');
      await restore();
    }
    await scope.evaluate(() => {
      delete window.lubanWorkshopHost;
      delete window.__lubanHintOffers;
      delete window.__finishLubanHint;
    });
  }

  if (interactionsOnly) {
    await cdp?.detach();
    return { levels: 0, mobile, screenshots: screenshotDir };
  }

  let slowestHintMs = 0;
  const solvePhase = async () => {
    const maximumActions = Math.max(80, (await snapshot()).pieces.length * 40);
    for (let attempt = 0; attempt < maximumActions; attempt++) {
      const before = await snapshot();
      if (before.progress.complete) return;
      const started = performance.now();
      await activate('#hint');
      slowestHintMs = Math.max(slowestHintMs, performance.now() - started);
      const after = await snapshot();
      assert.ok(after.hint, `No hint from a reachable ${after.state.phase} state`);
      if (process.env.BROWSER_TRACE_HINTS)
        console.log(
          JSON.stringify({
            level: after.state.levelId,
            phase: after.state.phase,
            action: attempt,
            moves: after.state.moves,
            offsets: after.state.offsets,
            hint: after.hint,
          }),
        );
      assert.equal(after.state.phase, before.state.phase, 'Assistance preserves the chosen goal');
      assert.equal(after.state.moves, before.state.moves + 1, 'A hint executes exactly one action');
      assert.equal(after.run.hints, before.run.hints + 1, 'Only applied assistance counts');
      assert.notDeepEqual(
        { offsets: after.state.offsets, orientations: after.state.orientations },
        { offsets: before.state.offsets, orientations: before.state.orientations },
        'The suggested operation must actually change the current puzzle pose',
      );
      assert.equal(
        await scope.locator('.hint-direction').count(),
        0,
        'An already applied hint cannot leave a misleading direction cue',
      );
      if (after.hint.kind !== 'rotate') {
        const { pieceId, axis, targetOffset } = after.hint;
        assert.ok(
          Math.abs(component(after, pieceId, axis) - targetOffset) < 0.000001,
          'A movement hint executes its complete safe target in one transaction',
        );
      }
      // Exercise history in both phases without driving the solver through diagnostics.
      if (attempt === 0 && !after.progress.complete) {
        await activate('#undo');
        assertPose((await snapshot()).state, before.state);
        await activate('#redo');
        assertPose((await snapshot()).state, after.state);
      }
    }
    assert.fail(`Puzzle did not complete within ${maximumActions} hinted actions`);
  };

  const playableLevels =
    levelIndices ?? (completeAllLevels ? catalog.map((item) => item.index) : [0]);
  assert.ok(playableLevels.length > 0);
  assert.ok(playableLevels.every((index) => catalog.some((item) => item.index === index)));
  const captureLevels = new Set(playableLevels);
  for (const index of playableLevels) {
    await openHome();
    await enterLevel(index);
    const pieceCount = (await snapshot()).pieces.length;
    if (index === 0)
      assert.equal(pieceCount, 2, 'The first lesson remains a simple two-part joint');
    else assert.ok(pieceCount >= 3, `Level ${index + 1} must contain a complete puzzle`);
    await solvePhase();
    assert.equal((await snapshot()).progress.removed, pieceCount);
    if (captureLevels.has(index)) await screenshot(`level-${index + 1}-disassembled`);
    if (index === complexLevelIndex && !skipInteractions) {
      const separated = await snapshot();
      let turned;
      for (const piece of separated.pieces) {
        await selectSingle(piece.id);
        for (const turnAxis of axes) {
          await activate(`#turn-axis-${turnAxis}`);
          await activate('#rotate-positive');
          const candidate = (await snapshot()).state;
          if (candidate.moves > separated.state.moves) {
            turned = candidate;
            break;
          }
        }
        if (turned) break;
      }
      assert.ok(turned, 'A separated piece must have room to turn through 90 degrees');
      assert.equal(turned.moves, separated.state.moves + 1);
      await activate('#undo');
      assertPose((await snapshot()).state, separated.state);
      await activate('#redo');
      assertPose((await snapshot()).state, turned);
      await reloadGame();
      assert.deepEqual((await snapshot()).state, turned);
      // Continue from the rotated pose: normal hints must restore its orientation too.
    }
    await activate('#reassemble');
    assert.equal((await snapshot()).state.phase, 'reassemble');
    assert.ok((await snapshot()).state.history.length > 0, 'Switching goals preserves history');
    await solvePhase();
    const complete = await snapshot();
    assert.equal(complete.progress.assembled, pieceCount);
    assert.equal(complete.progress.complete, true);
    assert.ok(
      Object.values(complete.state.offsets).every((value) =>
        value.every((coordinate) => Math.abs(coordinate) < 0.000001),
      ),
      'Rigid-group vector arithmetic must return every coordinate to the engine origin tolerance',
    );
    assert.ok(await scope.locator('#replay-level').isVisible());
    if (index < catalog.length - 1) assert.ok(await scope.locator('#next-level').isVisible());
    if (captureLevels.has(index)) await screenshot(`level-${index + 1}-reassembled`);
    console.log(`${screenshotPrefix}: level ${index + 1} disassembly and reassembly passed`);
  }

  await openHome();
  const badges = () =>
    scope.locator('#home-level-list button[data-level]').evaluateAll((buttons) =>
      buttons.map((button) => ({
        index: Number(button.dataset.level),
        badge: button.querySelector('.level-badge')?.textContent.trim(),
        seals: [...button.querySelectorAll('.seal.earned')].map((seal) => seal.textContent.trim()),
      })),
    );
  const completedBadges = (await badges()).filter((item) => playableLevels.includes(item.index));
  assert.ok(completedBadges.every((item) => /复原|独立/.test(item.badge)));
  assert.ok(
    completedBadges.every((item) => item.seals.includes('解开') && item.seals.includes('复原')),
  );
  assert.ok(
    completedBadges.every((item) => !item.seals.includes('独立')),
    'Step-assisted solves must not earn an independent seal',
  );
  await activate('#continue-game');
  await setControls(true);
  await activate('#restart');
  await activate('#keep-playing');
  assert.equal(
    (await snapshot()).progress.complete,
    true,
    'Dismissing restart must preserve completion',
  );
  await activate('#replay-level');
  const replayed = await snapshot();
  assert.equal(replayed.state.moves, 0);
  assert.equal(replayed.state.phase, 'disassemble');
  assert.equal(replayed.progress.complete, false);
  assert.ok(
    Object.values(replayed.state.offsets).every((value) =>
      value.every((coordinate) => coordinate === 0),
    ),
  );
  await reloadGame();
  assert.deepEqual((await snapshot()).state, replayed.state, 'Replay must survive a reload');
  await openHome();
  assert.deepEqual(
    (await badges()).filter((item) => playableLevels.includes(item.index)),
    completedBadges,
    'Replaying a completed puzzle must preserve all completion records after reload',
  );
  await activate('#continue-game');
  await setControls(true);
  await activate('#restart');
  await activate('#confirm-restart');
  assert.equal((await snapshot()).state.moves, 0);
  assert.equal((await snapshot()).state.phase, 'disassemble');
  assert.equal((await snapshot()).progress.complete, false);
  await cdp?.detach();
  return {
    levels: playableLevels.length,
    mobile,
    slowestHintMs: Math.round(slowestHintMs),
    screenshots: screenshotDir,
  };
}

/** Check every control at six phone sizes, including each tile in the
 * intentionally scrollable piece tray. All selections use real touch input.
 */
export async function exerciseMobileLayouts(page, { screenshotDir = evidenceDir } = {}) {
  const settleLayout = () =>
    page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  const checkLayout = async (viewport, mode) => {
    const layout = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      overflowY: document.documentElement.scrollHeight > innerHeight + 1,
      canvas: document.querySelector('#stage > canvas').getBoundingClientRect().toJSON(),
      previewUnobstructed: (() => {
        const canvas = document.querySelector('#assembly-preview canvas');
        const box = canvas.getBoundingClientRect();
        return [0.15, 0.5, 0.85].every((x) =>
          [0.15, 0.5, 0.85].every(
            (y) =>
              document.elementFromPoint(box.x + box.width * x, box.y + box.height * y) === canvas,
          ),
        );
      })(),
      controls: [
        ...document.querySelectorAll(
          '.controls button, .topbar button, .view-tools button, .axis-handle, .rotation-tools button, #rotation-angle, #phase-toggle, #back-home, #help, #toggle-controls, #hint, #restore',
        ),
      ]
        .filter(
          (button) => button.getBoundingClientRect().width > 0 && !button.closest('.piece-list'),
        )
        .map((button) => {
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return {
            name: button.id || button.getAttribute('aria-label'),
            onScreen:
              box.x >= 0 &&
              box.y >= 0 &&
              box.right <= innerWidth + 1 &&
              box.bottom <= innerHeight + 1,
            unobstructed: button === hit || button.contains(hit),
            touchSized: box.width >= 44 && box.height >= 44,
          };
        }),
    }));
    assert.equal(
      layout.overflowX || layout.overflowY,
      false,
      `No page scrolling at ${viewport.width}×${viewport.height} with controls ${mode}`,
    );
    assert.ok(
      layout.previewUnobstructed,
      `The complete reference must remain unobstructed at ${viewport.width}×${viewport.height} (${mode})`,
    );
    assert.deepEqual(
      layout.controls.filter(
        (control) => !control.onScreen || !control.unobstructed || !control.touchSized,
      ),
      [],
      `Controls must stay visible, unobstructed and touch-sized at ${viewport.width}×${viewport.height} (${mode})`,
    );
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: resolve(
        screenshotDir,
        `mobile-layout-${viewport.width}x${viewport.height}-${mode}.png`,
      ),
      fullPage: true,
    });
    return layout;
  };
  // Start from the six-piece lock so narrow-screen checks exercise the scrollable tray.
  if (await page.locator('#back-home').isVisible()) await page.locator('#back-home').tap();
  await page.locator('#home-level-list button[data-level-id="burr-interlocking-6-v1"]').tap();
  if ((await page.locator('#toggle-controls').getAttribute('aria-expanded')) !== 'true')
    await page.locator('#toggle-controls').tap();
  await page.locator('#restore').tap();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 568, height: 320 },
    { width: 740, height: 360 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    if ((await page.locator('#toggle-controls').getAttribute('aria-expanded')) === 'true')
      await page.locator('#toggle-controls').tap();
    await settleLayout();
    assert.equal(await page.locator('#controls').isVisible(), false);
    const defaultLayout = await checkLayout(viewport, 'closed');
    assert.ok(defaultLayout.canvas.width >= 300 && defaultLayout.canvas.height >= 180);
    await page.locator('#toggle-controls').tap();
    await settleLayout();
    assert.equal(await page.locator('#controls').isVisible(), true);
    const expandedCanvas = await page.locator('#stage > canvas').boundingBox();
    assert.ok(
      expandedCanvas.width * expandedCanvas.height <
        defaultLayout.canvas.width * defaultLayout.canvas.height,
      'The default scene gains the space occupied by the optional panel',
    );
    if ((await page.locator('#group-select').getAttribute('aria-pressed')) === 'true')
      await page.locator('#group-select').tap();
    const pieces = page.locator('button[data-piece]');
    for (let index = 0; index < (await pieces.count()); index++) {
      const piece = pieces.nth(index);
      await piece.tap();
      const id = await piece.getAttribute('data-piece');
      assert.equal(await page.evaluate(() => window.lubanSnapshot().selected), id);
      const size = await piece.boundingBox();
      assert.ok(size.width >= 44 && size.height >= 44, 'Each part needs a 44px touch target');
    }
    await pieces.first().tap();
    await checkLayout(viewport, 'open');
    console.log(
      `mobile layout: ${viewport.width}×${viewport.height}, optional controls closed and open passed`,
    );
  }
}

export async function exerciseUnavailableGraphics(page, url) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (typeof kind === 'string' && /^(webgl|experimental-webgl)/.test(kind)) return null;
      return Reflect.apply(getContext, this, [kind, ...args]);
    };
  });
  await page.goto(url);
  const checkFallback = async () => {
    await page.locator('#app[data-screen="play"][data-error="webgl"]').waitFor();
    assert.equal(await page.locator('#retry').isVisible(), true, 'Graphics failure exposes retry');
    assert.equal(await page.locator('#retry').isEnabled(), true);
    assert.match(await page.locator('.webgl-error').innerText(), /暂时无法打开 3D 画面/);
    assert.deepEqual(
      await page
        .locator('#app button:not(#retry)')
        .evaluateAll((buttons) =>
          buttons.filter((button) => !button.disabled).map((button) => button.id),
        ),
      [],
      'All game actions, including hidden continue and restore, are disabled without graphics',
    );
    for (const selector of ['#continue-game', '#restore', '#hint', '#back-home'])
      assert.equal(await page.locator(selector).isDisabled(), true);
    assert.deepEqual(errors, [], 'Graphics initialization failure must remain a handled error');
  };
  await checkFallback();
  const state = await page.evaluate(() => window.lubanSnapshot().state);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+z');
  assert.deepEqual(await page.evaluate(() => window.lubanSnapshot().state), state);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('#retry').click(),
  ]);
  await checkFallback();
  assert.deepEqual(await page.evaluate(() => window.lubanSnapshot().state), state);
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: resolve(evidenceDir, 'webgl-unavailable.png'), fullPage: true });
  console.log('WebGL unavailable: visible retry, disabled scene actions, and safe retry passed');
}

async function runBrowserChecks() {
  const port = process.env.GAME_PORT || '4340';
  const url = process.env.GAME_URL || `http://127.0.0.1:${port}/`;
  let server;
  let browser;
  let serverOutput = '';
  try {
    if (!process.env.GAME_URL) {
      const vite = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
      await new Promise((resolveBuild, reject) => {
        const build = spawn(process.execPath, [vite, 'build'], { cwd: root, stdio: 'inherit' });
        build.once('error', reject);
        build.once('exit', (code) =>
          code === 0 ? resolveBuild() : reject(new Error(`Vite build exited ${code}`)),
        );
      });
      server = spawn(
        process.execPath,
        [vite, 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'],
        { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let startupError;
      server.once('error', (error) => {
        startupError = error;
      });
      for (const stream of [server.stdout, server.stderr])
        stream.on('data', (chunk) => {
          serverOutput = (serverOutput + chunk).slice(-4000);
        });
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (startupError) throw startupError;
        if (server.exitCode !== null) throw new Error(`Preview stopped: ${serverOutput}`);
        try {
          ready = (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
          if (ready) break;
        } catch {
          /* Bounded preview startup polling. */
        }
        await delay(100);
      }
      assert.ok(ready, `Preview did not become available: ${serverOutput}`);
    }

    const executablePath =
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    });
    const unavailableContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      await exerciseUnavailableGraphics(await unavailableContext.newPage(), url);
    } finally {
      await unavailableContext.close();
    }
    if (process.env.BROWSER_WEBGL_ONLY === '1') return;
    for (const mobile of process.env.BROWSER_MOBILE_ONLY === '1' ? [true] : [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(url);
        await exerciseStandalone(page, {
          mobile,
          interactionsOnly: process.env.BROWSER_INTERACTIONS_ONLY === '1',
          completeAllLevels: true,
        });
        if (mobile) await exerciseMobileLayouts(page);
        assert.deepEqual(errors, [], 'The browser must not raise uncaught errors');
      } catch (error) {
        await mkdir(evidenceDir, { recursive: true });
        await page.screenshot({
          path: resolve(evidenceDir, `${mobile ? 'mobile' : 'desktop'}-failure.png`),
          fullPage: true,
        });
        throw error;
      } finally {
        await context.close();
      }
    }
    const devices = process.env.BROWSER_MOBILE_ONLY === '1' ? 'Mobile' : 'Desktop and mobile';
    console.log(`${devices} browser checks passed. Screenshots: ${evidenceDir}`);
  } finally {
    await browser?.close();
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = new Promise((resolveExit) => server.once('exit', resolveExit));
      server.kill('SIGTERM');
      await Promise.race([exited, delay(2000)]);
      if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBrowserChecks().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
