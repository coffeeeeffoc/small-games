import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../src/game/levels/levels.ts';
import { geometry, move, circleHits, focus, occluded, isSafe } from '../src/game/core/geometry.ts';
import {
  newRun,
  step,
  observe,
  mapData,
  useMap,
  interact,
  placeMark,
  defaultSave,
  finish,
} from '../src/game/core/rules.ts';
import { decodeSave } from '../src/game/core/save.ts';
import { roomPosition } from '../src/game/core/model.ts';
import { solve } from '../src/game/levels/validate.ts';

test('wall collision, large displacement and corner slide use a radius', () => {
  const l = levels[0],
    g = geometry(l),
    r = newRun(l, 'A');
  move(r, 0, -100, g.boxes);
  assert.ok(r.z >= 5.32 && r.z < 5.41); // wall half-thickness .09 + player radius .24
  move(r, 100, 0, g.boxes);
  assert.ok(isSafe(l, r, g.boxes));
  assert.ok(!g.boxes.some((b) => circleHits(r.x, r.z, b)));
  const corner = newRun(l, 'A');
  move(corner, -10, 10, g.boxes);
  assert.ok(isSafe(l, corner, g.boxes));
});
test('A has no map; viewing is irreversible and B reveals only visited rooms', () => {
  const l = levels[0],
    g = geometry(l),
    r = newRun(l, 'A');
  observe(l, r, g.targets, g.boxes);
  assert.equal(mapData(l, r, g.targets), null);
  useMap(r);
  assert.equal(r.mode, 'B');
  const m = mapData(l, r, g.targets)!;
  assert.deepEqual(
    m.rooms.map((r) => r.id),
    ['A'],
  );
  assert.equal(m.points.length, 0);
  assert.equal(m.edges.length, 0);
  assert.ok(!r.visited.includes('D'));
  assert.equal(r.viewedMap, true);
});
test('physical traversal records a connection without unveiling neighbours', () => {
  const l = levels[0],
    g = geometry(l),
    r = newRun(l, 'B');
  for (let i = 0; i < 145; i++)
    step(l, r, { forward: 1, right: 0 }, 1 / 60, g.boxes, g.targets, true);
  assert.ok(r.visited.includes('B'));
  assert.ok(r.walked.includes('AB'));
  assert.ok(!r.visited.includes('D'));
  assert.ok(!r.visited.includes('C'));
});
test('pause stops timer and movement; large dt is bounded', () => {
  const l = levels[0],
    g = geometry(l),
    r = newRun(l, 'B'),
    before = structuredClone(r);
  step(l, r, { forward: 1, right: 1 }, 5, g.boxes, g.targets, false);
  assert.deepEqual(r, before);
  step(l, r, { forward: 1, right: 0 }, 5, g.boxes, g.targets, true);
  assert.equal(r.seconds, 0.25);
  assert.ok(Math.hypot(r.x - before.x, r.z - before.z) < 1);
});
test('mark place, replace, delete, world direction, wall occlusion and save', () => {
  const l = levels[0],
    g = geometry(l),
    r = newRun(l, 'B'),
    anchor = g.targets.find((t) => t.id === 'mark:A:2')!;
  r.x = anchor.x;
  r.z = anchor.z - 1.5;
  r.yaw = Math.PI;
  assert.equal(focus(r, g.targets, g.boxes, true)?.id, anchor.id);
  assert.ok(placeMark(r, g.targets, g.boxes, anchor.id, 'arrow', 3));
  assert.equal(r.marks[anchor.id].direction, 3);
  assert.equal(mapData(l, r, g.targets)!.marks.length, 1);
  assert.ok(placeMark(r, g.targets, g.boxes, anchor.id, 'cleared', 1));
  assert.equal(Object.keys(r.marks).length, 1);
  const save = defaultSave();
  save.run = r;
  const recovered = decodeSave(JSON.stringify(save), levels).save.run!;
  assert.deepEqual(recovered, r);
  placeMark(r, g.targets, g.boxes, anchor.id, null, 0);
  assert.equal(Object.keys(r.marks).length, 0);
  r.z = anchor.z + 1;
  r.yaw = 0;
  assert.equal(placeMark(r, g.targets, g.boxes, anchor.id, 'visited', 0), false);
  assert.equal(occluded(0, 0, 10, 0, [{ x: 5, z: 0, w: 1, d: 3, room: '' }]), true);
});
test('exit interaction really finishes, awards mode and unlocks without requiring both modes', () => {
  const l = levels[0],
    g = geometry(l),
    r = newRun(l, 'A'),
    t = g.targets.find((t) => t.kind === 'exit')!;
  const p = roomPosition(l.rooms.find((n) => n.id === l.exit.room)!);
  r.x = p.x;
  r.z = t.z - 1.5;
  r.yaw = Math.PI;
  interact(l, r, g.targets, g.boxes);
  assert.equal(r.finished, true);
  const s = defaultSave();
  finish(s, r, 20);
  assert.equal(s.unlocked, 2);
  assert.ok(s.records['1:A']);
  assert.equal(s.records['1:B'], undefined);
});
test('corrupt and incompatible saves fail safely while preserving profile fields', () => {
  assert.equal(decodeSave('{bad', levels).save.unlocked, 1);
  const s = defaultSave();
  s.run = newRun(levels[0], 'A');
  s.settings.fov = 90;
  s.run.version = -1;
  s.run.x = 999;
  const result = decodeSave(JSON.stringify(s), levels);
  assert.ok(result.warning.includes('布局'));
  assert.equal(result.save.settings.fov, 90);
  assert.deepEqual(result.save.run, newRun(levels[0], 'A'));
  s.run.version = 1;
  const safe = decodeSave(JSON.stringify(s), levels);
  assert.ok(safe.warning.includes('安全'));
  assert.equal(safe.save.run!.x, 0);
});

test('checking a real opening reveals its nature, never the room behind it', () => {
  const l = levels[0],
    g = geometry(l),
    r = newRun(l, 'B');
  r.x = 1.3;
  observe(l, r, g.targets, g.boxes);
  assert.equal(r.verified['A:1'], undefined);
  interact(l, r, g.targets, g.boxes);
  assert.equal(r.verified['A:1'], 'passage');
  const map = mapData(l, r, g.targets)!;
  assert.equal(map.rooms.length, 1);
  assert.equal(map.edges.length, 0);
  assert.equal(map.points.length, 0);
});
test('scores cannot revert to A after a map view; familiar runs and independent mode records persist', () => {
  const s = defaultSave(),
    a = newRun(levels[0], 'A');
  a.finished = true;
  a.seconds = 10;
  finish(s, a, 20);
  const b = newRun(levels[0], 'A', true);
  useMap(b);
  b.mode = 'A';
  b.finished = true;
  b.seconds = 9;
  finish(s, b, 20);
  assert.equal(s.records['1:A'].seconds, 10);
  assert.equal(s.records['1:B'].seconds, 9);
  assert.equal(s.unlocked, 2);
  s.played = [1];
  s.run = newRun(levels[0], 'A', true);
  assert.equal(decodeSave(JSON.stringify(s), levels).save.run!.familiar, true);
});
test('mechanism-state search rejects a switch locked behind its own door', () => {
  const l = structuredClone(levels[0]);
  l.edges.find((e) => e.id === 'AB')!.gate = 'self';
  l.switches = [{ id: 'self', room: 'B', dir: 2, label: 'self' }];
  assert.equal(solve(l), null);
});

test('a closed shortcut can be inspected and remains open after its permanent switch', () => {
  const l = levels.find((l) => l.id === 8)!;
  const g = geometry(l),
    r = newRun(l, 'B');
  r.x = 1.3;
  r.z = 8;
  r.yaw = -Math.PI / 2;
  assert.match(interact(l, r, g.targets, g.boxes), /暂时关闭/);
  r.activated.push('side');
  assert.match(interact(l, r, g.targets, g.boxes), /实际门洞/);
  move(r, 6.7, 0, g.boxes);
  assert.ok(Math.abs(r.x - 8) < 0.001);
});
test('all saved progress fields survive; invalid nested values and unsupported versions recover', () => {
  const l = levels.find((l) => l.id === 12)!,
    s = defaultSave(),
    r = newRun(l, 'B');
  r.activated = ['dawn'];
  r.seconds = 34.6;
  r.yaw = -0.9;
  r.pitch = 0.3;
  r.found = ['exit'];
  s.run = r;
  s.unlocked = 14;
  s.played = [1, 12];
  const saved = decodeSave(JSON.stringify(s), levels).save;
  assert.equal(saved.unlocked, 14);
  assert.deepEqual(saved.played, [1, 12]);
  assert.deepEqual(saved.run!.activated, ['dawn']);
  assert.equal(saved.run!.pitch, 0.3);
  const bad = {
    ...s,
    run: {
      ...r,
      x: null,
      activated: ['bogus'],
      marks: { nope: { kind: 'constructor', direction: 99 } },
      visited: [null, 'A', 'bogus'],
    },
  };
  const restored = decodeSave(JSON.stringify(bad), levels);
  assert.ok(restored.warning);
  assert.deepEqual(restored.save.run!.activated, []);
  assert.deepEqual(restored.save.run!.marks, {});
  const future = decodeSave(JSON.stringify({ ...s, version: 99 }), levels);
  assert.ok(future.warning.includes('布局'));
  assert.equal(future.save.unlocked, 14);
});
