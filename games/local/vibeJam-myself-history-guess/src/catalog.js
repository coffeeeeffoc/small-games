import { MIN_YEAR, MAX_YEAR, validPoint } from "./game.js";

// One contract shared by the browser and build checks; content contains no executable code.
export function createCatalog(entries, base = "./") {
  const ids = new Set();
  return entries.map((scene) => {
    const fail = (field) => {
      throw new Error(`场景 ${scene?.id || "未命名"}：${field} 无效`);
    };
    if (!scene || typeof scene !== "object") fail("配置");
    if (
      typeof scene.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene.id) ||
      ids.has(scene.id)
    )
      fail("id（须唯一）");
    ids.add(scene.id);
    for (const field of [
      "title",
      "place",
      "location",
      "era",
      "clue",
      "hint",
      "story",
    ])
      if (
        typeof scene[field] !== "string" ||
        !scene[field].trim() ||
        /[<>"']/.test(scene[field])
      )
        fail(field);
    if (!["china", "world"].includes(scene.region)) fail("region");
    if (
      !Number.isInteger(scene.year) ||
      scene.year === 0 ||
      scene.year < MIN_YEAR ||
      scene.year > MAX_YEAR
    )
      fail("year");
    if (!Number.isInteger(scene.tolerance) || scene.tolerance < 0)
      fail("tolerance");
    if (!validPoint(scene)) fail("lat/lng");
    if (
      typeof scene.image !== "string" ||
      !/^assets\/[a-z0-9-]+\.(webp|jpg|png)$/.test(scene.image)
    )
      fail("image（本地图片路径）");
    if (
      !Array.isArray(scene.details) ||
      !scene.details.length ||
      scene.details.some(
        (text) => typeof text !== "string" || !text.trim() || /[<>]/.test(text),
      )
    )
      fail("details");
    if (
      !Array.isArray(scene.source) ||
      scene.source.length !== 2 ||
      scene.source.some(
        (text) =>
          typeof text !== "string" || !text.trim() || /[<>"']/.test(text),
      )
    )
      fail("source");
    try {
      if (new URL(scene.source[1]).protocol !== "https:") fail("source URL");
    } catch {
      fail("source URL（须 HTTPS）");
    }
    if (
      scene.view !== undefined &&
      (!scene.view ||
        typeof scene.view !== "object" ||
        Array.isArray(scene.view))
    )
      fail("view");
    const view = { yaw: 180, pitch: 0, fov: 75, ...scene.view };
    for (const [key, min, max] of [
      ["yaw", 0, 360],
      ["pitch", -65, 65],
      ["fov", 35, 90],
    ])
      if (!Number.isFinite(view[key]) || view[key] < min || view[key] > max)
        fail(`view.${key}`);
    return { ...scene, image: `${base}${scene.image}`, view };
  });
}

export function catalogCities(rounds, baseCities) {
  const cities = new Map(baseCities.map((city) => [city.name, city]));
  for (const round of rounds)
    if (!cities.has(round.location))
      cities.set(round.location, {
        name: round.location,
        lat: round.lat,
        lng: round.lng,
      });
  return [...cities.values()];
}
