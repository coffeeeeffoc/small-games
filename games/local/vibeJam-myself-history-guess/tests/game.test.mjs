import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  scoreGuess,
  yearDistance,
  distanceKm,
  chooseRounds,
  remainingSeconds,
  formatYear,
  formatPoint,
} from "../src/game.js";

test("distance, BCE dates, invalid guesses, score bounds, unique rounds and timer deadline", () => {
  assert.equal(yearDistance(-1, 1), 1);
  assert.equal(formatYear(-221), "公元前 221 年");
  assert.equal(
    formatPoint({ lat: -33.87, lng: 151.2 }),
    "南纬 33.87° · 东经 151.20°",
  );
  assert.equal(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  assert.ok(
    Math.abs(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }) - 20015) < 1,
  );
  assert.ok(distanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }) < 223);
  const round = { lat: 39.916, lng: 116.397, year: 1420, tolerance: 15 };
  assert.equal(scoreGuess(round, round, 1420).total, 5000);
  assert.equal(scoreGuess(round, round, 1435).timeScore, 2500);
  assert.ok(
    scoreGuess(round, round, 1500).timeScore <
      scoreGuess(round, round, 1450).timeScore,
  );
  assert.equal(scoreGuess(round, null, null).total, 0);
  assert.equal(scoreGuess(round, { lat: NaN, lng: 116 }, 0).total, 0);
  assert.equal(scoreGuess(round, { lat: 99, lng: 116 }, Infinity).total, 0);
  for (const year of [-3000, -1, 1, 1000, 2026])
    for (const lat of [-80, 0, 80]) {
      const score = scoreGuess(round, { lat, lng: -180 }, year);
      assert.ok(
        score.total >= 0 && score.total <= 5000 && Number.isFinite(score.total),
      );
    }
  const catalog = Array.from({ length: 8 }, (_, id) => ({
    id,
    region: id < 5 ? "china" : "world",
  }));
  const deck = chooseRounds(catalog, "all", () => 0.5);
  assert.equal(deck.length, 5);
  assert.equal(new Set(deck.map((r) => r.id)).size, 5);
  assert.ok(chooseRounds(catalog, "china").every((r) => r.region === "china"));
  assert.deepEqual(
    catalog.map((r) => r.id),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(remainingSeconds(90000, 1500), 89);
  assert.equal(remainingSeconds(90000, 95000), 0);
  const world = JSON.parse(
    readFileSync(new URL("../public/data/world.json", import.meta.url)),
  );
  assert.equal(world.features.length, 177);
  assert.ok(
    world.features.every((f) => /[\u3400-\u9fff]/u.test(f.properties.name)),
  );
});
