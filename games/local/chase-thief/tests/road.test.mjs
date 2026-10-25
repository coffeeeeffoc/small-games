import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as route from '../assets/scripts/core/route.ts';
import * as simulation from '../assets/scripts/core/simulation.ts';
import { createHash } from 'node:crypto';

async function compile(file, result, bindings) {
  const code = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8'))
    .replace(/^import [\s\S]*?from '[^']+';\s*/gm, '')
    .replace(/^export /gm, '');
  return new Function(...Object.keys(bindings), code + `;return ${result}`)(
    ...Object.values(bindings),
  );
}

test('real road mesh removes trench surfaces and contains recessed floors across streets and chunk edges', async () => {
  const { Batch, rgb } = await compile('../assets/scripts/Geometry.ts', '{ Batch, rgb }', {
    cc: {},
  });
  const meshes = new Map();
  Batch.prototype.node = function (name) {
    meshes.set(name, this.data);
  };
  class Node {
    addChild() {}
  }
  const World = await compile('../assets/scripts/World.ts', 'World', {
    cc: { Node, Color: class {} },
    Batch,
    rgb,
    ...route,
    ...simulation,
  });
  const world = Object.create(World.prototype);
  world.root = new Node();
  world.art = JSON.parse(
    await readFile(new URL('../assets/resources/art/city-models.json', import.meta.url)),
  );
  const trianglesAt = (mesh, p) => {
    const hits = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const t = mesh.indices.slice(i, i + 3).map((n) => mesh.positions.slice(n * 3, n * 3 + 3));
      const cross = (a, b, x, z) => (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
      if (Math.abs(cross(t[0], t[1], t[2][0], t[2][2])) < 1e-7) continue;
      const sides = t.map((v, j) => cross(v, t[(j + 1) % 3], p.x, p.z));
      if (sides.every((v) => v >= -1e-6) || sides.every((v) => v <= 1e-6)) hits.push(t);
    }
    return hits;
  };
  let checked = 0,
    seam = false;
  for (const departure of route.DISTRICTS)
    for (let wave = 4; wave < 70; wave++) {
      const obstacles = route.waveAt(wave, 15, departure);
      for (const gap of obstacles.filter((o) => o.type === 'gap')) {
        const run = simulation.createRun({ seed: 15, departure });
        for (const offset of [-1.8, 0, 1.8]) {
          const s = gap.at + offset;
          world.chunk(Math.floor(s / 40), run);
          const p = route.lanePosition(s, gap.lane, run.seed, departure);
          assert.equal(
            trianglesAt(meshes.get('Paved road'), p).length,
            0,
            `paving covers ${gap.id}/${departure}/${offset}`,
          );
          assert.ok(
            trianglesAt(meshes.get('Architecture and props'), p).some((t) =>
              t.every((v) => v[1] < p.y - 1.3),
            ),
            'missing recessed floor',
          );
          const safe = [0, 1, 2].find(
            (lane) => !obstacles.some((o) => o.type === 'gap' && o.lane === lane),
          );
          assert.ok(
            trianglesAt(meshes.get('Paved road'), route.lanePosition(s, safe, run.seed, departure))
              .length > 0,
          );
        }
        seam ||= (gap.at + route.GAP.length / 2) % 40 === 0;
        checked++;
      }
    }
  assert.ok(checked >= 20);
  assert.ok(seam);
});

test('district scenery differs and obstacle variants retain silhouettes, clearance and a bounded cache', async () => {
  const { Batch, rgb } = await compile('../assets/scripts/Geometry.ts', '{ Batch, rgb }', {
    cc: {},
  });
  const chunks = new Map();
  Batch.prototype.node = function (name) {
    chunks.set(name, this.data);
  };
  class Node {
    addChild() {}
  }
  const World = await compile('../assets/scripts/World.ts', 'World', {
    cc: { Node, Color: class {}, utils: { createMesh: (data) => data } },
    Batch,
    rgb,
    ...route,
    ...simulation,
  });
  const world = Object.create(World.prototype);
  world.root = new Node();
  world.meshes = new Map();
  world.art = JSON.parse(
    await readFile(new URL('../assets/resources/art/city-models.json', import.meta.url)),
  );
  const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const architecture = new Set(),
    facades = new Set();
  const bounds = (mesh, axis) => {
    const values = mesh.positions.filter((_, i) => i % 3 === axis);
    return [Math.min(...values), Math.max(...values)];
  };
  for (const district of route.DISTRICTS) {
    world.chunk(0, simulation.createRun({ seed: 15, departure: district }));
    architecture.add(fingerprint(chunks.get('Architecture and props').positions));
    facades.add(fingerprint(chunks.get('Shop facades')));
    for (const type of route.OBSTACLE_TYPES.filter((type) => type !== 'gap')) {
      const variants = [];
      for (const variant of [0, 1]) {
        const mesh = world.obstacleMesh(type, district, variant);
        assert.equal(world.obstacleMesh(type, district, variant), mesh);
        assert.ok(mesh.positions.every(Number.isFinite));
        for (const axis of [0, 1, 2]) {
          const base = bounds(world.art.meshes[type], axis).map(
            (n) => n - (type === 'barrel' && axis === 1 ? 0.35 : 0),
          );
          const actual = bounds(mesh, axis);
          assert.ok(
            actual[0] >= base[0] - 1e-5 && actual[1] <= base[1] + 1e-5,
            `${district}/${type}/${variant} exceeds original silhouette on axis ${axis}`,
          );
        }
        if (type === 'beam') {
          const sourceVertices = world.art.meshes[type].positions.length;
          for (let i = sourceVertices; i < mesh.positions.length; i += 3)
            assert.ok(mesh.positions[i + 1] >= 1.25, 'decoration blocks slide clearance');
        }
        variants.push(fingerprint(mesh));
      }
      assert.notEqual(...variants, `${district}/${type} variants should differ`);
    }
  }
  assert.equal(architecture.size, 3);
  assert.equal(facades.size, 3);
  assert.equal(world.meshes.size, 30);
});
