import assert from 'node:assert/strict';
import test from 'node:test';
import { themes } from '../assets/scripts/ThemeCatalog.ts';
import { routes, routeRecordKey } from '../assets/scripts/RouteCatalog.ts';
import { createTrack, pointAt } from '../assets/scripts/TrackGenerator.ts';
import { clearOfRoad, roadClearance, sceneryFits } from '../assets/scripts/ThemeScenery.ts';
import { cycleSelection, defaultSelection, readSelection } from '../assets/scripts/Selection.ts';

test('old world saves migrate to the same theme and route without losing car or driver', () => {
  for (const route of routes) {
    const saved = readSelection(JSON.stringify({ world: route.id, vehicle: 'rally', driver: 'ranger' }));
    assert.deepEqual(saved, { theme: route.id, route: route.id, vehicle: 'rally', driver: 'ranger' });
    assert.equal(routeRecordKey(saved.route), route.id === 'seaside' ? 'coastline-records-v1' : `kart-records-v1-${route.id}`);
  }
  assert.deepEqual(readSelection('{"theme":"glacier","route":"bad"}'), { ...defaultSelection, theme: 'glacier' });
  assert.deepEqual(readSelection('{"theme":"bad","route":"highland"}'), { ...defaultSelection, route: 'highland' });
});

test('theme and route selection cycle independently and persist mixed combinations', () => {
  const original = { ...defaultSelection, theme: 'glacier', route: 'highland' };
  const themed = cycleSelection(original, 'theme', 1);
  assert.equal(themed.route, original.route);
  const routed = cycleSelection(original, 'route', 1);
  assert.equal(routed.theme, original.theme);
  assert.deepEqual(readSelection(JSON.stringify(routed)), routed);
  assert.equal(routeRecordKey(themed.route), routeRecordKey(original.route));
  assert.notEqual(routeRecordKey(routed.route), routeRecordKey(original.route));
});

test('all 64 theme-route combinations create finite scenery without changing authoritative roads', () => {
  assert.equal(themes.length, 8);
  assert.equal(routes.length, 8);
  for (const route of routes) {
    const track = createTrack(route.track), before = JSON.stringify(track);
    for (const theme of themes) {
      const scenery = theme.scenery(track);
      assert.equal(JSON.stringify(track), before, `${theme.id}/${route.id} mutated the road`);
      for (const shape of scenery.shapes ?? []) {
        assert.ok([shape.x, shape.y, shape.z, shape.sx, shape.sy, shape.sz, shape.yaw ?? 0].every(Number.isFinite), `${theme.id}/${route.id}`);
        assert.ok(shape.sx > 0 && shape.sy > 0 && shape.sz > 0);
      }
      for (const model of scenery.models ?? []) assert.ok([model.x, model.y, model.z, model.scale].every(Number.isFinite));
    }
  }
});

test('landmark clearance includes both branches and the full footprint, with vertical space for supports', () => {
  const track = createTrack();
  const main = pointAt(track, 50), branch = track.shortcut[20];
  assert.ok(roadClearance(track, main.x, main.z) <= -track.width / 2 + 1e-8);
  assert.ok(roadClearance(track, branch.x, branch.z) <= -track.shortcutWidth / 2 + 1e-8);
  assert.equal(clearOfRoad(track, branch.x, branch.z, 1), false);
  assert.equal(clearOfRoad(track, main.x + 500, main.z, 10), true);
  assert.equal(sceneryFits(track, main.x, main.y + 2, main.z, 3, 3), false);
  assert.equal(sceneryFits(track, main.x, main.y - 2, main.z, 3, 1), true);
  assert.equal(sceneryFits(track, main.x, main.y + 10, main.z, 3, 1), true);
});
