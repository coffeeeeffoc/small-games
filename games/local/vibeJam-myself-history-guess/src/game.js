export const MIN_YEAR = -3000;
export const MAX_YEAR = 2026;
export const ROUND_COUNT = 5;
export const LIMIT_SECONDS = 90;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const formatYear = (year) =>
  year < 0 ? `公元前 ${Math.abs(year)} 年` : `公元 ${year} 年`;
export const formatDistance = (km) =>
  km < 1
    ? `${Math.round(km * 1000)} 米`
    : `${Math.round(km).toLocaleString("zh-CN")} 公里`;
export const formatPoint = (point) =>
  `${point.lat < 0 ? "南纬" : "北纬"} ${Math.abs(point.lat).toFixed(2)}° · ${point.lng < 0 ? "西经" : "东经"} ${Math.abs(point.lng).toFixed(2)}°`;
// Civil history has no year zero. Convert BCE dates before subtracting.
export const yearDistance = (a, b) =>
  Math.abs((a < 0 ? a + 1 : a) - (b < 0 ? b + 1 : b));
export function distanceKm(a, b) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) *
      Math.cos(b.lat * r) *
      Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}
export function validPoint(point) {
  return (
    point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 85 &&
    Math.abs(point.lng) <= 180
  );
}
export function scoreGuess(round, point, year) {
  const distance = validPoint(point) ? distanceKm(point, round) : null;
  const years =
    Number.isInteger(year) && year !== 0 && year >= MIN_YEAR && year <= MAX_YEAR
      ? yearDistance(year, round.year)
      : null;
  // City-scale accuracy: the bundled atlas is not a street map.
  const locationScore =
    distance === null
      ? 0
      : Math.round(2500 * Math.exp(-Math.max(0, distance - 30) / 1800));
  const timeScore =
    years === null
      ? 0
      : Math.round(
          2500 *
            Math.exp(
              -Math.max(0, years - round.tolerance) /
                Math.max(50, yearDistance(MAX_YEAR, round.year) * 0.25),
            ),
        );
  return {
    distance,
    years,
    locationScore,
    timeScore,
    total: locationScore + timeScore,
  };
}
export function chooseRounds(catalog, region, random = Math.random) {
  const deck = catalog.filter(
    (round) => region !== "china" || round.region === "china",
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, ROUND_COUNT);
}
export const remainingSeconds = (deadline, now) =>
  Math.max(0, Math.ceil((deadline - now) / 1000));
