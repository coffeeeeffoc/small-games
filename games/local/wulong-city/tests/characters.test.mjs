import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const render = await readFile(new URL('../render.js', import.meta.url), 'utf8');
const levelsSource = await readFile(new URL('../levels.js', import.meta.url), 'utf8');
const data = await readFile(new URL('../levels-data.js', import.meta.url), 'utf8');

function scene(id, assets = {}) {
  const calls = [],
    levels = {},
    zones = new Map();
  let state;
  const ctx = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (...args) => {
          calls.push([method, ...args]);
          if (method === 'createLinearGradient') return { addColorStop() {} };
        },
    },
  );
  const context = vm.createContext({ window: {} });
  vm.runInContext(render, context);
  const art = context.WulongArt.create(ctx, () => state, assets);
  context.W = {
    ...art,
    add: (key, level) => {
      levels[key] = level;
    },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    near: () => false,
    say() {},
    tone() {},
    win() {},
    hit: (key, label, x, y, w, h, click) => zones.set(key, { click }),
  };
  vm.runInContext(data, context);
  vm.runInContext(levelsSource, context);
  state = { id, t: 0.37, p: { x: 65, y: 436, dir: 1, vx: 120 }, ...levels[id].init() };
  return {
    art,
    state,
    calls,
    zones,
    characters: context.WulongArt.characters,
    draw() {
      calls.length = 0;
      levels[id].draw(state);
      if (!state.hideActor) art.actor(state.p.x, state.p.y, state.p.dir);
      return calls.filter(([method]) => method === 'drawImage').map(([, image]) => image);
    },
  };
}

const sprite = (id) => ({ id, width: 240, height: 480 });
const assets = Object.fromEntries(
  ['actor', 'waiter', 'guard', 'elder', 'aunt', 'girl', 'uncle', 'performer', 'postman'].map(
    (id) => [id, sprite(id)],
  ),
);

test('diner and queue show a different sprite for each person, including the player', () => {
  for (const [id, people] of [
    [8, ['guard', 'waiter', 'actor']],
    [17, ['elder', 'aunt', 'girl', 'actor']],
  ]) {
    const run = scene(id, assets);
    const drawn = run.draw().map((image) => image.id);
    assert.deepEqual(drawn, people);
    assert.equal(new Set(drawn).size, drawn.length);
    assert.deepEqual(
      run.draw().map((image) => image.id),
      people,
      'identities remain stable across frames',
    );
  }
});

test('other residents and the performer are distinct from Xiaocha', () => {
  for (const [id, person] of [
    [12, 'uncle'],
    [14, 'elder'],
    [19, 'performer'],
    [23, 'aunt'],
  ]) {
    assert.deepEqual(
      scene(id, assets)
        .draw()
        .map((image) => image.id),
      [person, 'actor'],
    );
  }
  assert.deepEqual(
    scene(24, assets)
      .draw()
      .map((image) => image.id),
    ['actor'],
    'the award scene has one Xiaocha',
  );
});

test('NPCs stay still while the player walks; sprites retain aspect ratio and feet baseline', () => {
  const run = scene(8, assets);
  run.art.npc(407, 430, -1, 1.1, 'guard');
  assert.equal(run.calls.filter(([method]) => method === 'rotate').length, 1);
  assert.equal(run.calls.find(([method]) => method === 'rotate')[1], 0);
  const [, image, x, y, w, h] = run.calls.find(([method]) => method === 'drawImage');
  assert.equal(w / h, image.width / image.height);
  assert.equal(x, -w / 2);
  assert.equal(y + h, 2);
  run.calls.length = 0;
  run.art.actor(65, 436, 1);
  assert.notEqual(run.calls.find(([method]) => method === 'rotate')[1], 0);
});

test('missing NPC art requests only that identity and never draws the player sprite', () => {
  const requests = [],
    run = scene(8, { actor: assets.actor, loadCharacter: (id) => requests.push(id) });
  assert.deepEqual(
    run.draw().map((image) => image.id),
    ['actor'],
  );
  assert.deepEqual(requests, ['guard', 'waiter']);
  const silhouettes = [];
  for (const id of ['waiter', 'guard', 'elder', 'aunt', 'girl']) {
    run.calls.length = 0;
    run.art.npc(100, 436, 1, 1, id);
    silhouettes.push(JSON.stringify(run.calls));
  }
  assert.equal(
    new Set(silhouettes).size,
    silhouettes.length,
    'fallback hairstyles and uniforms remain distinct',
  );
});

test('player representations inside a dog, map preview, window and memory keep the protagonist', () => {
  const memory = scene(13, assets);
  memory.state.time = 1;
  assert.deepEqual(
    memory.draw().map((image) => image.id),
    ['actor', 'actor'],
  );
  const map = scene(15, assets);
  map.state.mapPreview = { x: 300, valid: true };
  assert.deepEqual(
    map.draw().map((image) => image.id),
    ['actor', 'actor'],
  );
  const dog = scene(3, assets);
  dog.state.dogCarry = true;
  dog.state.hideActor = true;
  assert.deepEqual(
    dog.draw().map((image) => image.id),
    ['actor', 'actor'],
    'the passenger diagram and carried player both depict Xiaocha',
  );
  const counter = scene(17, assets);
  counter.state.entered = true;
  counter.state.hideActor = true;
  assert.deepEqual(
    counter.draw().map((image) => image.id),
    ['elder', 'aunt', 'girl', 'actor'],
  );
});

test('all character identities, including reserve sprites, have separate transparent PNG assets', async () => {
  const { characters } = scene(8);
  const files = Object.values(characters).map((profile) => profile.file);
  assert.equal(new Set(files).size, files.length);
  assert.equal(files.length, 9);
  for (const file of files) {
    const png = await readFile(new URL('../assets/art/' + file, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', file);
    assert.equal(png[25], 6, `${file}: PNG RGBA color type`);
    assert(
      png.readUInt32BE(16) > 100 && png.readUInt32BE(20) > 200,
      `${file}: adequate sprite resolution`,
    );
  }
});
