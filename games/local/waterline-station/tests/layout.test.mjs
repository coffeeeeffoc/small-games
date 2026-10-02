import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.mjs';
import { createState } from '../engine.mjs';
import { getBoardLayout, renderBoard } from '../render.mjs';

for (const viewportWidth of [292, 320, 360, 390, 640, 960]) {
  test(`all stations keep controls and connection rails distinct at ${viewportWidth}px`, () => {
    const scale = viewportWidth / 960;
    for (const level of LEVELS) {
      const layout = getBoardLayout(level, viewportWidth);
      assert.equal(layout.valves.length, level.gates.length, level.id);
      for (const valve of layout.valves) {
        assert.ok(valve.x * scale >= 22, `${level.id}: valve left boundary`);
        assert.ok((960 - valve.x) * scale >= 22, `${level.id}: valve right boundary`);
        assert.ok(
          (layout.height - valve.y) * scale >= 60,
          `${level.id}: valve label bottom boundary`,
        );
        assert.ok(
          (valve.y - layout.tankBottom) * scale >= 28,
          `${level.id}: valve clears tank base`,
        );
      }
      for (let i = 0; i < layout.valves.length; i++) {
        const valve = layout.valves[i];
        for (const other of layout.valves.slice(i + 1)) {
          const dx = Math.abs(valve.x - other.x) * scale;
          const dy = Math.abs(valve.y - other.y) * scale;
          assert.ok(
            dx >= 57.9 || dy >= 77.9,
            `${level.id}: ${valve.id}/${other.id} controls and labels overlap`,
          );
          const overlap =
            Math.min(Math.max(valve.fromX, valve.toX), Math.max(other.fromX, other.toX)) -
            Math.max(Math.min(valve.fromX, valve.toX), Math.min(other.fromX, other.toX));
          if (overlap > 0) assert.ok(dy >= 16.9, `${level.id}: overlapping horizontal pipe runs`);
        }
      }
      for (const tank of level.tanks) {
        const ports = level.gates.flatMap((gate, index) =>
          gate.a === tank.id
            ? [layout.valves[index].fromX]
            : gate.b === tank.id
              ? [layout.valves[index].toX]
              : [],
        );
        assert.equal(
          new Set(ports).size,
          ports.length,
          `${level.id}: shared tank needs independent pipe ports`,
        );
      }
    }
  });
}

test('focusing connections preserves keyboard order and marks their linked tanks', () => {
  const level = LEVELS[7];
  const svg = { innerHTML: '', setAttribute() {} };
  renderBoard(svg, level, createState(level), undefined, null, 0, getBoardLayout(level), 'BD');
  const groups = [...svg.innerHTML.matchAll(/data-connection="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(groups, [...level.gates.map((gate) => gate.id), 'overflow:0']);
  assert.match(svg.innerHTML, /data-connection="BD"[^>]+data-focused="true"/);
  assert.equal(new Set(groups).size, level.gates.length + level.overflow.length);
  assert.match(svg.innerHTML, /data-tank="B"[^>]+data-connected="true"/);
  assert.match(svg.innerHTML, /data-tank="D"[^>]+data-connected="true"/);
  assert.match(svg.innerHTML, /data-tank="A"[^>]+data-connected="false"/);
  assert.equal((svg.innerHTML.match(/class="pipe-hit"/g) || []).length, groups.length);
  assert.match(
    svg.innerHTML,
    /stroke-width="26" vector-effect="non-scaling-stroke" pointer-events="stroke"/,
  );
  renderBoard(
    svg,
    level,
    createState(level),
    undefined,
    null,
    0,
    getBoardLayout(level),
    'overflow:0',
  );
  assert.deepEqual(
    [...svg.innerHTML.matchAll(/data-connection="([^"]+)"/g)].map((match) => match[1]),
    groups,
  );
  assert.match(svg.innerHTML, /data-connection="overflow:0"[^>]+data-focused="true"/);
});

test('spillways reserve headroom over intermediate tanks and render each outlet independently', () => {
  for (const level of LEVELS) {
    const outlets = Array.isArray(level.overflow)
      ? level.overflow
      : level.overflow
        ? [level.overflow]
        : [];
    if (!outlets.length) continue;
    const layout = getBoardLayout(level);
    const long = outlets.filter(
      (outlet) =>
        Math.abs(
          level.tanks.findIndex((tank) => tank.id === outlet.from) -
            level.tanks.findIndex((tank) => tank.id === outlet.to),
        ) > 1,
    );
    if (long.length)
      assert.ok(
        layout.tankTop - 47 > 45 + (long.length - 1) * 22 + 6,
        level.id + ': overhead spillways clear a full-height floating crate',
      );
    const svg = { innerHTML: '', setAttribute() {} };
    renderBoard(svg, level, createState(level));
    outlets.forEach((_, index) =>
      assert.match(svg.innerHTML, new RegExp(`data-connection="overflow:${index}"`)),
    );
    assert.equal(
      svg.innerHTML.includes('NaN'),
      false,
      level.id + ': rendering has finite geometry',
    );
  }
});
