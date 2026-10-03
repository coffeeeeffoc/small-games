import { clamp, dist } from './dom.mjs';

/** Tap-to-walk routing reads geometry only. It has no knowledge of chapter/room IDs. */
export function createNavigation({ getState, getRoom, perform, feedback }) {
  let path = [],
    action = null,
    stall = 0;
  function clear(point, radius = getState().player.r + 4) {
    const room = getRoom(getState());
    const boundary = room.boundary ?? 33;
    if (
      point.x < boundary + radius ||
      point.y < boundary + radius ||
      point.x > room.width - boundary - radius ||
      point.y > room.height - boundary - radius
    )
      return false;
    return !room.obstacles
      .filter((o) => !o.bridgeId || !room.bridges.find((b) => b.id === o.bridgeId)?.drawn)
      .some(
        (o) =>
          Math.hypot(
            point.x - clamp(point.x, o.x, o.x + o.w),
            point.y - clamp(point.y, o.y, o.y + o.h),
          ) < radius,
      );
  }
  function route(target) {
    const grid = 24,
      room = getRoom(getState()),
      cols = Math.ceil(room.width / grid),
      rows = Math.ceil(room.height / grid);
    const cell = (p) => ({
      x: clamp(Math.floor(p.x / grid), 0, cols - 1),
      y: clamp(Math.floor(p.y / grid), 0, rows - 1),
    });
    const point = (c) => ({ x: c.x * grid + grid / 2, y: c.y * grid + grid / 2 });
    const begin = cell(getState().player),
      goal = cell(target),
      queue = [begin],
      seen = new Map([[`${begin.x},${begin.y}`, null]]);
    let final;
    for (let i = 0; i < queue.length && i < cols * rows; i++) {
      const current = queue[i];
      if (current.x === goal.x && current.y === goal.y) {
        final = current;
        break;
      }
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const next = { x: current.x + dx, y: current.y + dy },
          key = `${next.x},${next.y}`;
        if (
          next.x < 0 ||
          next.y < 0 ||
          next.x >= cols ||
          next.y >= rows ||
          seen.has(key) ||
          !clear(point(next))
        )
          continue;
        if (
          dx &&
          dy &&
          (!clear(point({ x: current.x + dx, y: current.y })) ||
            !clear(point({ x: current.x, y: current.y + dy })))
        )
          continue;
        seen.set(key, current);
        queue.push(next);
      }
    }
    if (!final) return [];
    const result = [];
    for (let c = final; c; c = seen.get(`${c.x},${c.y}`)) result.unshift(point(c));
    result.shift();
    if (clear(target)) result.push(target);
    return result;
  }
  const api = {
    reset() {
      path = [];
      action = null;
      stall = 0;
    },
    walkTo(point, interaction = null) {
      const room = getRoom(getState()),
        margin = (room.boundary ?? 33) + getState().player.r + 5;
      const dest = {
        x: clamp(point.x, margin, room.width - margin),
        y: clamp(point.y, margin, room.height - margin),
      };
      path = route(dest);
      action = interaction;
      stall = 0;
      if (!path.length && dist(getState().player, dest) > 40) {
        feedback('这里还不能通过。绕开石墙，或先画出墨桥。', true);
        action = null;
      }
    },
    movement() {
      const p = getState().player;
      if (action && dist(p, action) < 94) {
        const object = action;
        api.reset();
        perform({ type: 'interact', objectId: object.id });
        return { x: 0, y: 0 };
      }
      while (path.length && dist(p, path[0]) < 13) path.shift();
      if (!path.length) return { x: 0, y: 0 };
      const d = dist(p, path[0]);
      return { x: (path[0].x - p.x) / d, y: (path[0].y - p.y) / d };
    },
    afterStep(before, input, dt) {
      if (!path.length || Math.hypot(input.moveX, input.moveY) < 0.1) return;
      stall = dist(before, getState().player) < 0.1 ? stall + dt : 0;
      if (stall > 0.7) {
        api.reset();
        feedback('前路受阻，用摇杆绕开障碍。');
      }
    },
  };
  return api;
}
