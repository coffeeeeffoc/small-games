/** Discrete, equal-width arcade vessels. Volumes use integer thousandths. */
export const SCALE = 1000;
export const CAPACITY = 10;
const units = (v) => Math.round(v * SCALE);
const amount = (v) => v / SCALE;
const requiredSwitches = (gate) => (gate.requires ? [gate.requires].flat() : []);
const wheelTarget = (level) => (level.overflow ?? []).reduce((s, o) => s + (o.powerNeeded ?? 0), 0);

function clone(state) {
  return {
    ...state,
    volumes: [...state.volumes],
    gates: [...state.gates],
    latched: [...state.latched],
    events: [],
  };
}

function validateLevel(level) {
  if (level.tanks.length < 3 || level.tanks.length > 5)
    throw Error('A station needs three to five tanks.');
  const ids = new Set(level.tanks.map((t) => t.id));
  if (ids.size !== level.tanks.length) throw Error('Tank ids must be unique.');
  for (const tank of level.tanks)
    if (!Number.isFinite(tank.volume) || tank.volume < 0 || tank.volume > CAPACITY)
      throw Error('Tank volume exceeds capacity.');
  const gateIds = new Set();
  for (const gate of level.gates) {
    if (gateIds.has(gate.id) || !ids.has(gate.a) || !ids.has(gate.b) || gate.a === gate.b)
      throw Error('Invalid gate.');
    gateIds.add(gate.id);
    if (
      requiredSwitches(gate).some(
        (id) => !level.tanks.some((t) => t.id === id && t.kind === 'crate'),
      )
    )
      throw Error('Unknown switch lock.');
  }
  for (const outlet of level.overflow ?? [])
    if (
      !ids.has(outlet.from) ||
      !ids.has(outlet.to) ||
      outlet.from === outlet.to ||
      !(outlet.at >= 0 && outlet.at <= CAPACITY)
    )
      throw Error('Invalid overflow outlet.');
}

function connectedComponents(level, gates) {
  const parent = level.tanks.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const indexOf = (id) => level.tanks.findIndex((t) => t.id === id);
  level.gates.forEach((g, i) => {
    if (gates[i]) parent[find(indexOf(g.a))] = find(indexOf(g.b));
  });
  const groups = new Map();
  level.tanks.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  return [...groups.values()];
}

/** Stable integer remainders preserve the exact amount of water. */
function distribute(volumes, component, total) {
  const base = Math.floor(total / component.length),
    remainder = total % component.length;
  component.forEach((index, offset) => {
    volumes[index] = base + (offset < remainder ? 1 : 0);
  });
}

function settle(level, state) {
  const volumes = state.volumes.map(units),
    components = connectedComponents(level, state.gates);
  for (const component of components)
    distribute(
      volumes,
      component,
      component.reduce((sum, i) => sum + volumes[i], 0),
    );
  // One spill per outlet, in authored order: finite even for custom cycles.
  for (const outlet of level.overflow ?? []) {
    const sourceIndex = level.tanks.findIndex((t) => t.id === outlet.from),
      targetIndex = level.tanks.findIndex((t) => t.id === outlet.to);
    const source = components.find((c) => c.includes(sourceIndex)),
      target = components.find((c) => c.includes(targetIndex));
    if (source === target) continue;
    const sourceTotal = source.reduce((sum, i) => sum + volumes[i], 0),
      targetTotal = target.reduce((sum, i) => sum + volumes[i], 0);
    const transferred = Math.min(
      sourceTotal - units(outlet.at) * source.length,
      units(CAPACITY) * target.length - targetTotal,
    );
    if (transferred <= 0) continue;
    distribute(volumes, source, sourceTotal - transferred);
    distribute(volumes, target, targetTotal + transferred);
    state.wheelPower = amount(units(state.wheelPower) + transferred);
    state.events.push({
      type: 'overflow',
      from: outlet.from,
      to: outlet.to,
      amount: amount(transferred),
      text: `${outlet.from} 溢流 ${amount(transferred).toFixed(1)} 格，水轮转动！`,
    });
  }
  const changed = volumes.flatMap((v, i) =>
    v !== units(state.volumes[i]) ? [level.tanks[i].id] : [],
  );
  state.volumes = volumes.map(amount);
  if (changed.length)
    state.events.unshift({
      type: 'equalize',
      tanks: changed,
      text: `${changed.join('、')} 槽液位联动`,
    });
  level.tanks.forEach((tank, index) => {
    if (
      tank.kind === 'crate' &&
      units(state.volumes[index]) <= units(tank.switchAt) &&
      !state.latched.includes(tank.id)
    ) {
      state.latched.push(tank.id);
      state.events.push({
        type: 'switch',
        tank: tank.id,
        text: `${tank.id} 箱子压下开关，机关已点亮！`,
      });
    }
  });
  state.won = getObjectives(level, state).every((o) => o.done);
  state.lost = !state.won && state.moves >= level.maxMoves + (state.bonusMoves ?? 0);
  if (state.won) state.events.push({ type: 'win', text: '机关联动完成，小船抵达出口！' });
  else if (state.lost)
    state.events.push({ type: 'lose', text: '操作次数用完了。撤销一步，试试另一种联动。' });
  return state;
}

function createState(level) {
  validateLevel(level);
  return settle(level, {
    volumes: level.tanks.map((t) => t.volume),
    gates: level.gates.map((g) => Boolean(g.open)),
    latched: [],
    wheelPower: 0,
    moves: 0,
    bonusMoves: 0,
    won: false,
    lost: false,
    events: [],
  });
}

function isGateLocked(level, state, gateOrId) {
  const gate = typeof gateOrId === 'string' ? level.gates.find((g) => g.id === gateOrId) : gateOrId;
  return !gate || requiredSwitches(gate).some((id) => !state.latched.includes(id));
}

function toggleGate(level, state, gateId) {
  const next = clone(state);
  if (state.won || state.lost) return next;
  const index = level.gates.findIndex((g) => g.id === gateId);
  if (index < 0) {
    next.events.push({ type: 'invalid', text: '没有找到这个阀门。' });
    return next;
  }
  const gate = level.gates[index];
  if (isGateLocked(level, state, gate)) {
    next.events.push({
      type: 'locked',
      gate: gateId,
      text: `先点亮 ${requiredSwitches(gate).join('、')} 开关，才能操作这个阀门。`,
    });
    return next;
  }
  next.gates[index] = !next.gates[index];
  next.moves++;
  next.events.push({
    type: 'gate',
    gate: gateId,
    open: next.gates[index],
    text: `${next.gates[index] ? '打开' : '关闭'} ${gate.a}—${gate.b} 阀门`,
  });
  return settle(level, next);
}

/** Pure preview runs the same transition as execution. */
function previewGate(level, state, gateId) {
  return toggleGate(level, state, gateId);
}

function getObjectives(level, state) {
  const objectives = [];
  level.tanks.forEach((tank, index) => {
    if (tank.kind === 'crate')
      objectives.push({
        id: `switch-${tank.id}`,
        label: `点亮 ${tank.id} 箱子机关`,
        done: state.latched.includes(tank.id),
        value: state.volumes[index],
        target: tank.switchAt,
      });
    if (tank.kind === 'boat')
      objectives.push({
        id: `boat-${tank.id}`,
        label: `${tank.id} 小船抵达出口`,
        done: units(state.volumes[index]) >= units(tank.exitAt),
        value: state.volumes[index],
        target: tank.exitAt,
      });
  });
  const target = wheelTarget(level);
  if (target > 0)
    objectives.push({
      id: 'wheel',
      label: '溢流推动水轮',
      done: units(state.wheelPower) >= units(target),
      value: state.wheelPower,
      target,
    });
  return objectives;
}

/** Breadth-first search returns a shortest path within the remaining budget. */
function solve(level, state = createState(level)) {
  if (state.won) return [];
  if (state.lost) return null;
  const target = units(wheelTarget(level));
  const key = (s) =>
    [
      s.volumes.map(units).join(','),
      s.gates.map(Number).join(''),
      [...s.latched].sort().join(','),
      Math.min(units(s.wheelPower), target),
    ].join('|');
  const queue = [{ state, path: [] }],
    visited = new Set([key(state)]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const gate of level.gates) {
      if (isGateLocked(level, current.state, gate)) continue;
      const next = toggleGate(level, current.state, gate.id);
      if (next.moves === current.state.moves) continue;
      const path = [...current.path, gate.id];
      if (next.won) return path;
      if (next.lost) continue;
      const identity = key(next);
      if (!visited.has(identity)) {
        visited.add(identity);
        queue.push({ state: next, path });
      }
    }
  }
  return null;
}

export { createState, isGateLocked, toggleGate, previewGate, getObjectives, solve };
