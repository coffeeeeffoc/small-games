import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalog, catalogCities } from "../src/catalog.js";
import { chooseRounds, scoreGuess } from "../src/game.js";
import { checkCatalog } from "../scripts/check-catalog.mjs";

test("every discovered scene is playable, searchable and valid; new content needs no registration", () => {
  const scenes = checkCatalog();
  assert.ok(scenes.length >= 28);
  assert.ok(scenes.filter((s) => s.region === "china").length >= 15);
  assert.ok(scenes.filter((s) => s.region === "world").length >= 13);
  assert.equal(new Set(scenes.map((s) => s.image)).size, scenes.length);
  const cities = catalogCities(scenes, []);
  for (const scene of scenes) {
    assert.equal(scoreGuess(scene, scene, scene.year).total, 5000);
    assert.ok(cities.some((c) => c.name === scene.location));
  }
  for (const region of ["all", "china"])
    for (let n = 0; n < 20; n++) {
      const deck = chooseRounds(scenes, region);
      assert.equal(deck.length, 5);
      assert.equal(new Set(deck.map((s) => s.id)).size, 5);
      assert.ok(deck.every((s) => region === "all" || s.region === region));
    }
  const extra = {
    ...scenes[0],
    id: "future-scene",
    location: "新地点 / 古地名",
    view: { yaw: 90, pitch: 12, fov: 60 },
  };
  const extended = createCatalog([...scenes, extra], "/nested/game/");
  assert.equal(extended.at(-1).image, `/nested/game/${extra.image}`);
  assert.deepEqual(extended.at(-1).view, extra.view);
  assert.equal(catalogCities(extended, cities).length, cities.length + 1);
  assert.equal(chooseRounds([extra], "all").length, 1);
  assert.deepEqual(chooseRounds([], "all"), []);
  for (const invalid of [
    { id: undefined },
    { id: "../escape" },
    { year: 0 },
    { year: 99999 },
    { tolerance: -1 },
    { lat: 86 },
    { lng: NaN },
    { region: "unknown" },
    { image: "https://example.com/image.webp" },
    { image: "assets/../image.webp" },
    { location: "" },
    { title: '<img onerror="alert(1)">' },
    { details: [] },
    { source: ["source", "javascript:alert(1)"] },
    { view: { fov: 0 } },
    { view: "invalid" },
  ])
    assert.throws(() => createCatalog([{ ...scenes[0], ...invalid }]));
  assert.throws(() => createCatalog([scenes[0], scenes[0]]), /id/);
});
