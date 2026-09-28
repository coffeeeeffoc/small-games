// Static mesh check / optional OBJ export of the actual World.ts tree generator.
// node scripts/model-trees.mjs [--obj path/to/trees.obj]; no Cocos build or graphics mocks.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as data from '../assets/scripts/core/Data.ts';
import { heightfieldHeight, terrainSlope } from '../assets/scripts/core/CameraMath.ts';

const source = await readFile(new URL('../assets/scripts/World.ts', import.meta.url), 'utf8');
function between(start, end) {
  const a = source.indexOf(start),
    b = source.indexOf(end, a);
  assert(a >= 0 && b > a, `World tree integration marker missing: ${start}`);
  return source.slice(a, b);
}
const program = `
${source.match(/^const geometry = .*$/m)[0]}
${between('const clamp =', '// Bake shapes,')}
${between('function segmentDistance(', 'export class World')}
const model = { geometry, addTree, noise, terrainXs, terrainZs, build() {
  const batches = [];
  const terrainBatch = (id, day, heat, build) => {
    const mesh = geometry(); mesh.grounded = true; build(mesh);
    batches.push({ id, day, heat, mesh });
  };
  // Execute the ground's real color/mesh path, substituting only Vec3 normalization with scalar math.
  ${between("    this.terrainBatch('terrain.ground'", "    this.terrainBatch('terrain.water'")
    .replaceAll('this.terrainBatch', 'terrainBatch')
    .replace(
      'new Vec3(-slope.x, 1, -slope.z).normalize()',
      '({ x: -slope.x / Math.hypot(slope.x, 1, slope.z), y: 1 / Math.hypot(slope.x, 1, slope.z), z: -slope.z / Math.hypot(slope.x, 1, slope.z) })',
    )}
  const ground = batches.pop();
  ${between('    const exit = ROUTE', "    this.terrainBatch('terrain.ridges'")}
  ${between("    this.terrainBatch('terrain.forest'", "    this.terrainBatch('terrain.details'").replaceAll('this.terrainBatch', 'terrainBatch')}
  const bark = geometry(); bark.grounded = true;
  ${source.match(/for \(const t of trees\) addTree\(null, g, t\);/)[0].replace('null, g, t', 'null, bark, t')}
  batches.push({ id: 'terrain.details (tree portion)', day: '#343e37', heat: '#19262c', mesh: bark });
  return { batches, trees, ground };
}};
`;
const api = new Function(
  ...Object.keys(data),
  'heightfieldHeight',
  'terrainSlope',
  stripTypeScriptTypes(program) + '\nreturn model;',
)(...Object.values(data), heightfieldHeight, terrainSlope);
const { batches, trees, ground } = api.build();

const tint = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = (rgb) => rgb.reduce((sum, v, k) => sum + v * [0.2126, 0.7152, 0.0722][k], 0);
// Cocos 3.8.8 builtin-unlit / legacy/output-standard / common/color/aces.
// Vertex estimates only: rasterization, coverage and the final game frame still need screenshot review.
const acesOutput = (srgbProduct) => {
  const c = Math.min(srgbProduct * srgbProduct, 8);
  return Math.sqrt((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14));
};
const groundChannels = [0, 1, 2].map((k) =>
  api.terrainXs.map((_, x) =>
    api.terrainZs.map((_, z) => ground.mesh.colors[(x * api.terrainZs.length + z) * 4 + k]),
  ),
);
function brightness({ mesh, day, heat }) {
  const dayTint = tint(day),
    heatTint = tint(heat),
    groundTint = tint(ground.day);
  const channels = [[], [], []];
  let maxDayGroundRatio = 0,
    maxHeat = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const vertex = i / 3,
      x = mesh.positions[i],
      z = mesh.positions[i + 2];
    const leaf = [0, 1, 2].map((k) => mesh.colors[vertex * 4 + k]);
    const earth = groundChannels.map((channel) =>
      heightfieldHeight(api.terrainXs, api.terrainZs, channel, x, z),
    );
    const leafOutput = leaf.map((v, k) => acesOutput(v * dayTint[k]));
    leafOutput.forEach((v, k) => channels[k].push(v * 255));
    maxDayGroundRatio = Math.max(
      maxDayGroundRatio,
      luminance(leafOutput) / luminance(earth.map((v, k) => acesOutput(v * groundTint[k]))),
    );
    maxHeat = Math.max(maxHeat, ...leaf.map((v, k) => acesOutput(v * heatTint[k]) * 255));
  }
  channels.forEach((c) => c.sort((a, b) => a - b));
  const rgb = (q) => channels.map((c) => Math.round(c[Math.floor((c.length - 1) * q)]));
  return {
    shadowRGB: rgb(0.05),
    midRGB: rgb(0.5),
    highlightRGB: rgb(0.95),
    maxDayGroundRatio: +maxDayGroundRatio.toFixed(3),
    maxHeatRGB: +maxHeat.toFixed(1),
  };
}
const brightnessStats = batches.map((batch) => ({ id: batch.id, ...brightness(batch) }));
console.log('ACES vertex estimates, NOT screenshot acceptance:', JSON.stringify(brightnessStats));
// The old all-vertex ground-ratio gate crushed crowns on shaded slopes into black silhouettes.
// Guard the requested dark-green range and visible shade separation; report contrast for review.
const near = brightnessStats[0];
for (const [values, lower, upper] of [
  [near.shadowRGB, [7, 14, 12], [12, 21, 19]],
  [near.highlightRGB, [12, 22, 19], [18, 32, 28]],
])
  values.forEach((v, k) => assert(v >= lower[k] && v <= upper[k], 'dark-green canopy color range'));
assert(near.highlightRGB[1] - near.shadowRGB[1] >= 5, 'visible canopy shade separation');
assert(near.highlightRGB[1] > near.highlightRGB[0] * 1.4, 'foliage stays green, not pale gray');
const bark = brightnessStats[2].midRGB;
assert(bark[0] > bark[1] && bark[1] > bark[2], 'brown bark remains distinct from foliage');
assert(
  brightnessStats.every((s) => s.maxHeatRGB < 14),
  'thermal trees must stay cold, without bright foliage tips',
);

function check(g, name, heat = '#ffffff') {
  const vertices = g.positions.length / 3;
  assert(Number.isInteger(vertices) && vertices > 0 && vertices <= 65535, `${name}: 16-bit budget`);
  assert.equal(g.normals.length, vertices * 3);
  assert.equal(g.colors.length, vertices * 4);
  assert.equal(g.indices.length % 3, 0);
  for (const values of [g.positions, g.normals, g.colors])
    assert(values.every(Number.isFinite), `${name}: finite attributes`);
  assert(
    g.indices.every((i) => Number.isInteger(i) && i >= 0 && i < vertices),
    `${name}: index bounds`,
  );
  for (let i = 0; i < g.normals.length; i += 3)
    assert(Math.abs(Math.hypot(...g.normals.slice(i, i + 3)) - 1) < 1e-6, `${name}: unit normal`);
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = g.indices.slice(i, i + 3).map((v) => v * 3);
    const u = [0, 1, 2].map((k) => g.positions[b + k] - g.positions[a + k]);
    const v = [0, 1, 2].map((k) => g.positions[c + k] - g.positions[a + k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert(Math.hypot(...n) > 1e-10, `${name}: degenerate triangle ${i / 3}`);
    assert(
      n.reduce(
        (sum, value, k) => sum + value * (g.normals[a + k] + g.normals[b + k] + g.normals[c + k]),
        0,
      ) > 0,
      `${name}: inward face ${i / 3}`,
    );
  }
  const tint = [1, 3, 5].map((i) => parseInt(heat.slice(i, i + 2), 16) / 255);
  let maxHeat = 0;
  for (let i = 0; i < g.colors.length; i += 4)
    for (let k = 0; k < 3; k++) maxHeat = Math.max(maxHeat, g.colors[i + k] * tint[k]);
  return {
    vertices,
    triangles: g.indices.length / 3,
    bufferBytes: vertices * 40 + g.indices.length * 2,
    maxHeat: +maxHeat.toFixed(3),
  };
}
const stats = batches.map(({ id, heat, mesh }) => ({ id, ...check(mesh, id, heat) }));
assert.equal(batches.length, 3);
assert(trees.length <= 620);
assert(stats[1].vertices <= 1440 * 44);
// Details also contains buildings/tower; leave 12k vertices for those existing shapes.
assert(stats[2].vertices + 12000 < 65535);
assert(
  stats.every((s) => s.maxHeat < Math.min(...Object.values(data.UNITS).map((u) => u.heat)) - 0.1),
);
assert(stats.reduce((sum, s) => sum + s.triangles, 0) < 250000);

for (let seed = 0; seed < 256; seed++) {
  for (const distant of [false, true]) {
    const crown = api.geometry(),
      bark = api.geometry();
    const t = { x: 0, y: 0, z: 0, h: 4, seed };
    api.addTree(crown, bark, t, distant);
    check(crown, `crown ${seed}/${distant}`);
    check(bark, `bark ${seed}/${distant}`);
    assert(crown.positions.length / 3 <= (distant ? 36 : 105));
    assert(bark.positions.length / 3 <= (distant ? 8 : 85));
    const lifted = api.geometry();
    lifted.grounded = true;
    api.addTree(lifted, null, { ...t, y: 17 }, distant);
    assert.deepEqual(lifted.indices, crown.indices);
    assert.deepEqual(lifted.colors, crown.colors);
    lifted.positions.forEach((value, i) =>
      assert(
        Math.abs(value - crown.positions[i] - (i % 3 === 1 ? 17 : 0)) < 1e-12,
        'rigid crown/root grounding',
      ),
    );
    const appended = api.geometry();
    api.addTree(appended, null, { ...t, x: 100 }, distant);
    const colorOffset = appended.colors.length;
    api.addTree(appended, null, t, distant);
    assert.deepEqual(
      appended.colors.slice(colorOffset),
      crown.colors,
      'batch order must not change foliage color',
    );
  }
}
assert.deepEqual(api.build().batches, batches, 'deterministic forest');
console.log(
  JSON.stringify(
    {
      nearTrees: trees.length,
      distantTrees: stats[1].vertices / 44,
      evergreenNear: trees.filter((t) => api.noise(t.seed + 401) < 0.43).length,
      addedDrawCalls: 0,
      addedTextures: 0,
      stats,
      totalTreeTriangles: stats.reduce((sum, s) => sum + s.triangles, 0),
      totalTreeBufferBytes: stats.reduce((sum, s) => sum + s.bufferBytes, 0),
    },
    null,
    2,
  ),
);

if (process.argv[2] === '--obj') {
  assert(process.argv[3], 'OBJ output path required');
  const lines = [
    '# Procedural trees from World.ts, geometry review only; Cocos acceptance is separate.',
  ];
  let offset = 1;
  for (let seed = 0; seed < 6; seed++) {
    const foliage = api.geometry(),
      bark = api.geometry();
    api.addTree(foliage, bark, { x: seed * 5, y: 0, z: 0, h: 4, seed });
    for (const [name, g] of [
      ['foliage', foliage],
      ['bark', bark],
    ]) {
      lines.push(`o tree-${seed}-${name}`);
      for (let i = 0; i < g.positions.length; i += 3)
        lines.push(`v ${g.positions.slice(i, i + 3).join(' ')}`);
      for (let i = 0; i < g.normals.length; i += 3)
        lines.push(`vn ${g.normals.slice(i, i + 3).join(' ')}`);
      for (let i = 0; i < g.indices.length; i += 3)
        lines.push(
          `f ${g.indices
            .slice(i, i + 3)
            .map((v) => `${v + offset}//${v + offset}`)
            .join(' ')}`,
        );
      offset += g.positions.length / 3;
    }
  }
  await writeFile(process.argv[3], lines.join('\n') + '\n');
}
