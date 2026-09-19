import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { themes } from '../assets/scripts/ThemeCatalog.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { aiInput } from '../assets/scripts/KartAI.ts';
import { artSource, expansionSource } from '../scripts/prepare-art.mjs';

test('seven authored worlds reference delivered scenery and have different routes', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', expansionSource), 'utf8'));
  const assets = new Set(manifest.models.map(m => 'expansion/' + m.file.replace(/\.glb$/, '')));
  const seaside = JSON.parse(await readFile(new URL('manifest.json', artSource), 'utf8'));
  for (const model of seaside.models) {
    const name = model.file.replace(/\.glb$/, '');
    assets.add(`${name}/${name}`);
  }
  const signatures = new Set<string>();
  for (const route of routes.filter(r => r.id !== 'seaside')) {
    const world = themes.find(t => t.id === route.id)!;
    const scenery = world.scenery(createTrack(route.track));
    signatures.add(JSON.stringify(route.track.controls));
    const models = scenery.models || [];
    assert.ok(models.length + (scenery.roadside || []).length > 1, world.id);
    for (const model of [...models, ...(scenery.roadside || [])])
      assert.ok(assets.has(model.asset), `${world.id}: ${model.asset}`);
  }
  assert.equal(signatures.size, 7);
});

for (const world of routes) {
  test(`${world.id}: three laps with randomized items and all rival drivers`, () => {
    const race = new RaceManager(world.track, 20260919);
    race.start();
    for (let step = 0; step < 60 * 360 && race.phase !== 'finished'; step++) {
      const player = race.drivers[0];
      race.step(aiInput(player.kart, race.track, false, player.progress.s), 1 / 60);
    }
    assert.equal(race.phase, 'finished', `${world.id}: lap=${race.drivers[0].progress.laps}, distance=${race.drivers[0].progress.distance}`);
    assert.equal(race.drivers[0].progress.laps, 3);
    assert.ok(race.itemsCollected > 0, 'items must be reachable while driving the course');
    assert.ok(race.resets <= 2, `${world.id} needed ${race.resets} recoveries`);
    assert.ok(race.drivers.every(d => Number.isFinite(d.progress.distance) && d.progress.distance > race.track.length * 1.5), 'rivals must continue racing');
  });
}
