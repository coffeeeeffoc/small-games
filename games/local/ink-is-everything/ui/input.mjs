import { $, dist } from './dom.mjs';
import { bindCanvasInput } from './canvas-input.mjs';
import { bindTouchInput } from './touch-input.mjs';
import { bindKeyboardInput } from './keyboard-input.mjs';

/** Gesture state is ephemeral; input emits engine commands without owning gameplay rules. */
export function createInput(options) {
  const { canvas, getState, getRoom, getStats, navigation, feedback } = options;
  const c = {
    keys: new Set(),
    moveStick: { x: 0, y: 0 },
    movePointer: null,
    firePointer: null,
    meleePointer: null,
    canvasPointer: null,
    fireAim: null,
    aimPoint: null,
    lockedEnemy: null,
    drawStroke: null,
    drawBridge: null,
    drawMode: false,
    fireHeld: false,
    meleeHeld: false,
    canvasFire: false,
    canvasMelee: false,
    dashQueued: false,
    fireQueued: false,
    meleeQueued: false,
    dryNotice: false,
  };
  // Capture is optional on older mobile browsers and can reject a pointer that
  // the browser has already cancelled. Gesture cleanup must still complete.
  function capturePointer(element, id) {
    try {
      element.setPointerCapture?.(id);
    } catch {}
  }
  function releasePointer(element, id) {
    try {
      if (id !== null && element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    } catch {}
  }
  function toggleDraw() {
    if (!options.active()) return;
    const bridge = getRoom(getState()).bridges.find((b) => !b.drawn);
    if (!bridge) {
      feedback('这一处没有待绘的墨桥。留意其他房间的锚点。');
      return;
    }
    if (dist(getState().player, bridge.from) > 125) {
      navigation.walkTo({ x: bridge.from.x, y: bridge.from.y + 36 });
      feedback('正在走近锚点。到达后，从笔尖拖到对岸。');
      c.drawMode = false;
    } else {
      c.drawMode = !c.drawMode;
      feedback(
        c.drawMode
          ? `连接锚点，消耗 ${bridge.cost} 点生命墨汁绘桥，寻找支路奖励。`
          : '已回到移动与战斗。',
      );
    }
  }
  const deps = { ...options, controls: c, toggleDraw, capturePointer, releasePointer };
  bindCanvasInput(deps);
  bindTouchInput(deps);
  bindKeyboardInput(deps);
  return {
    toggleDraw,
    get drawMode() {
      return c.drawMode;
    },
    cancel() {
      const captured = [
        [$('#joystick'), c.movePointer],
        [$('#fire'), c.firePointer],
        [canvas, c.canvasPointer],
        [$('#melee'), c.meleePointer],
      ];
      c.keys.clear();
      c.moveStick = { x: 0, y: 0 };
      c.fireAim = null;
      for (const key of [
        'movePointer',
        'firePointer',
        'meleePointer',
        'canvasPointer',
        'drawStroke',
        'drawBridge',
      ])
        c[key] = null;
      for (const key of [
        'fireHeld',
        'meleeHeld',
        'canvasFire',
        'canvasMelee',
        'dashQueued',
        'fireQueued',
        'meleeQueued',
        'dryNotice',
      ])
        c[key] = false;
      navigation.reset();
      $('#stick-thumb').style.transform = '';
      $('#fire .aim-thumb').style.transform = '';
      document
        .querySelectorAll('.held,.aiming')
        .forEach((el) => el.classList.remove('held', 'aiming'));
      for (const [element, id] of captured) releasePointer(element, id);
    },
    roomChanged() {
      this.cancel();
      c.aimPoint = null;
      c.lockedEnemy = null;
      c.drawMode = false;
    },
    frame() {
      const state = getState(),
        p = state.player,
        stats = getStats(state);
      let moveX = c.moveStick.x,
        moveY = c.moveStick.y;
      const keyX =
        Number(c.keys.has('d') || c.keys.has('arrowright')) -
        Number(c.keys.has('a') || c.keys.has('arrowleft'));
      const keyY =
        Number(c.keys.has('s') || c.keys.has('arrowdown')) -
        Number(c.keys.has('w') || c.keys.has('arrowup'));
      if (keyX || keyY) {
        moveX = keyX;
        moveY = keyY;
        navigation.reset();
      }
      if (Math.hypot(c.moveStick.x, c.moveStick.y) > 0.1) navigation.reset();
      if (!moveX && !moveY) {
        const move = navigation.movement();
        moveX = move.x;
        moveY = move.y;
      }
      let aim = c.aimPoint;
      const alive = state.enemies.filter((e) => e.hp > 0),
        target =
          alive.find((e) => e.id === c.lockedEnemy) ||
          alive.sort((a, b) => dist(p, a) - dist(p, b))[0];
      if (c.fireAim) aim = { x: p.x + c.fireAim.x * 400, y: p.y + c.fireAim.y * 400 };
      else if (
        (c.fireHeld || c.fireQueued || c.meleeHeld || c.meleeQueued || c.keys.has('f') || !aim) &&
        target
      )
        aim = { x: target.x, y: target.y };
      else if (!aim) aim = { x: p.x + p.aimX * 200, y: p.y + p.aimY * 200 };
      const shooting = c.fireHeld || c.canvasFire || c.fireQueued,
        canShoot = p.ink >= stats.attackCost + stats.minInkAfterSpend;
      if (shooting && !canShoot && !c.dryNotice) {
        feedback('墨汁不足，靠近敌人用干笔吸墨。');
        c.dryNotice = true;
      } else if (!shooting || canShoot) c.dryNotice = false;
      const frame = {
        moveX,
        moveY,
        aimX: aim.x,
        aimY: aim.y,
        shoot: shooting && canShoot,
        melee:
          c.meleeHeld ||
          c.canvasMelee ||
          c.meleeQueued ||
          c.keys.has('f'),
        dash: c.dashQueued,
      };
      c.dashQueued = false;
      c.fireQueued = false;
      c.meleeQueued = false;
      return frame;
    },
    renderContext() {
      return {
        drawStroke: c.drawStroke,
        drawMode: c.drawMode,
        drawBridgeId: c.drawBridge?.id,
        aimPoint: c.aimPoint,
      };
    },
    snapshot() {
      return {
        moveX: c.moveStick.x,
        moveY: c.moveStick.y,
        shoot: c.fireHeld || c.canvasFire,
        melee: c.meleeHeld || c.canvasMelee,
        drawing: Boolean(c.drawStroke),
      };
    },
  };
}
