// Map gestures describe intent; they never depend on a later selection or network response.
export const DOUBLE_TAP_MS = 280;
const city = (state, id) => state?.cities.find((c) => c.id === id);
const junction = (state, id) => state?.junctions.find((j) => j.cityId === id);
const owns = (state, id) => city(state, id)?.owner === 0 && junction(state, id)?.owner === 0;
const destination = (state, id) => {
  const j = junction(state, id);
  return j?.exits[j.routeIndex];
};

export function nearestCity(state, p, scale = 1) {
  return state?.cities
    .map((c) => ({ c, distance: Math.hypot(c.x - p.x, c.y - p.y) }))
    .sort((a, b) => a.distance - b.distance)
    .find(({ distance }) => distance <= Math.max(29, 22 / scale))?.c;
}

export function nearestRoad(state, p, scale = 1) {
  if (!state || nearestCity(state, p, scale)) return null;
  const hits = state.roads
    .flatMap((road) => {
      const a = city(state, road.a),
        b = city(state, road.b);
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      if (t <= 0 || t >= 1) return [];
      const distance = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) * scale;
      return distance <= 16 ? [{ road, distance }] : [];
    })
    .sort((a, b) => a.distance - b.distance);
  // Crossing roads are not junctions. Ask for a less ambiguous point on the line.
  if (hits.length > 1 && hits[1].distance - hits[0].distance < 5) return { ambiguous: true };
  return hits[0]?.road ?? null;
}

export function planOrder(state, intent) {
  const command = (sourceId, targetId) => {
    if (!owns(state, sourceId)) throw new Error('这座城已不属于我方，请重新选择');
    const j = junction(state, sourceId);
    const index = targetId == null ? -1 : j.exits.indexOf(targetId);
    if (targetId != null && index < 0) throw new Error('只能沿道路向相邻城池派兵');
    return { sourceId, junctionId: j.id, index };
  };
  if (intent.kind === 'hold') return [command(intent.sourceId, null)];
  if (intent.kind === 'route') {
    const next = command(intent.sourceId, intent.targetId);
    // A direct order establishes one direction on this edge; other supply lines survive.
    return [
      ...(owns(state, intent.targetId) && destination(state, intent.targetId) === intent.sourceId
        ? [{ ...command(intent.targetId, null), stopTargetId: intent.sourceId }]
        : []),
      next,
    ];
  }
  const { a, b } = intent;
  if (!state.roads.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)))
    throw new Error('这两座城之间没有道路');
  const sources = [a, b].filter((id) => owns(state, id));
  if (!sources.length) throw new Error('这条道路没有己方城池');
  const active = sources.filter((id) => destination(state, id) === (id === a ? b : a));
  const next = active.length > 1 ? null : sources[sources.indexOf(active[0]) + 1];
  return [
    ...active.map((id) => ({ ...command(id, null), stopTargetId: id === a ? b : a })),
    ...(next ? [command(next, next === a ? b : a)] : []),
  ];
}

export function createMapInput({
  read,
  select,
  preview,
  submit,
  notify = () => {},
  now = () => performance.now(),
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  let gesture = null,
    lastTap = null,
    pending = null;
  const clearPending = () => {
    if (pending) unschedule(pending.timer);
    pending = null;
  };
  const flush = () => {
    const intent = pending?.intent;
    clearPending();
    if (intent) return submit(intent);
  };
  const cancel = () => {
    clearPending();
    gesture = lastTap = null;
    preview(null);
  };
  const order = (intent) => {
    select(null);
    submit(intent);
  };
  function pointer(phase, p, id) {
    if (phase === 'cancel') {
      cancel();
      return;
    }
    const { state, selected, scale = 1, enabled = true } = read();
    if (!enabled) {
      cancel();
      return;
    }
    const hit = nearestCity(state, p, scale);
    if (phase === 'down') {
      if (gesture) {
        cancel();
        return;
      }
      const double =
        hit &&
        owns(state, hit.id) &&
        lastTap?.cityId === hit.id &&
        now() - lastTap.time <= DOUBLE_TAP_MS;
      if (double) {
        if (pending) {
          unschedule(pending.timer);
          pending.timer = null;
        }
      } else {
        flush();
        lastTap = null;
      }
      gesture = {
        id,
        start: p,
        cityId: hit?.id,
        road: hit ? null : nearestRoad(state, p, scale),
        selected,
        moved: false,
        double,
      };
      return;
    }
    if (!gesture || gesture.id !== id) return;
    gesture.moved ||= Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) * scale > 8;
    if (phase === 'move') {
      if (gesture.moved && owns(state, gesture.cityId)) {
        select(gesture.cityId);
        preview(p);
      }
      return;
    }
    if (phase !== 'up') return;
    const down = gesture;
    gesture = null;
    preview(null);
    if (down.moved) {
      flush();
      lastTap = null;
      if (!owns(state, down.cityId)) return;
      if (hit && hit.id !== down.cityId) {
        if (junction(state, down.cityId).exits.includes(hit.id))
          order({ kind: 'route', sourceId: down.cityId, targetId: hit.id });
        else notify('只能沿道路向相邻城池派兵');
      }
      return;
    }
    if (hit?.id !== down.cityId) return;
    if (hit) {
      if (down.double) {
        clearPending();
        lastTap = null;
        if (owns(state, hit.id)) order({ kind: 'hold', sourceId: hit.id });
        else {
          select(null);
          notify('城池已经易主，屯兵令已取消');
        }
        return;
      }
      lastTap = owns(state, hit.id) ? { cityId: hit.id, time: now() } : null;
      if (hit.id === down.selected) {
        select(null);
        return;
      }
      if (owns(state, down.selected)) {
        if (junction(state, down.selected).exits.includes(hit.id)) {
          const intent = { kind: 'route', sourceId: down.selected, targetId: hit.id };
          select(null);
          if (owns(state, hit.id)) pending = { intent, timer: schedule(flush, DOUBLE_TAP_MS) };
          else submit(intent);
          return;
        }
        notify('城池不相邻；已切换选城');
      }
      select(hit.id);
      return;
    }
    lastTap = null;
    const road = nearestRoad(state, p, scale);
    if (road?.ambiguous) {
      notify('道路在此交叉，请点击连线的其他位置');
      return;
    }
    if (road && road.a === down.road?.a && road.b === down.road?.b)
      order({ kind: 'road', a: road.a, b: road.b });
    else select(null);
  }
  return { pointer, cancel, flush };
}

// Serial acknowledgements keep RemoteMatch's sequence/retry contract intact, without locking input.
export function createOrderQueue({
  read,
  send,
  changed = () => {},
  completed = () => {},
  failed = () => {},
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  let items = [],
    running = false,
    epoch = 0,
    timer = null,
    wake = null,
    drained = Promise.resolve();
  const wait = () =>
    new Promise((resolve) => {
      wake = resolve;
      timer = schedule(() => {
        timer = wake = null;
        resolve();
      }, 220);
    });
  const cancel = () => {
    items = [];
    epoch++;
    if (timer !== null) unschedule(timer);
    timer = null;
    wake?.();
    wake = null;
    changed(0);
  };
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (items.length) {
        const intent = items.shift(),
          token = epoch;
        try {
          if (!read().enabled) continue;
          const plan = planOrder(read().state, intent);
          for (const command of plan) {
            while (token === epoch && read().enabled) {
              const state = read().state,
                j = junction(state, command.sourceId);
              if (
                command.stopTargetId &&
                (!owns(state, command.sourceId) ||
                  destination(state, command.sourceId) !== command.stopTargetId)
              )
                break;
              if (!owns(state, command.sourceId)) throw new Error('城池已经易主，军令已取消');
              if (j.routeIndex === command.index) break;
              let result;
              try {
                result = await send(command);
              } catch (error) {
                if (command.stopTargetId && error.rejected && error.code === 'not-owner') break;
                throw error;
              }
              if (command.stopTargetId && result?.reason === 'not-owner') break;
              if (token !== epoch) break;
              if (result?.reason === 'cooldown') {
                await wait();
                continue;
              }
              if (result?.ok === false) throw new Error('军令未生效：' + result.reason);
              break;
            }
            if (token !== epoch || !read().enabled) break;
          }
          if (token === epoch && read().enabled) completed(intent);
        } catch (error) {
          if (token === epoch) failed(error);
        }
        changed(items.length);
      }
    } finally {
      running = false;
    }
  }
  return {
    push(intent) {
      items.push(intent);
      changed(items.length);
      if (!running) drained = drain();
      return drained;
    },
    idle: () => drained,
    cancel,
  };
}
