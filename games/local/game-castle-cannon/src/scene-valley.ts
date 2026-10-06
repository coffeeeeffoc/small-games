/** Continuous original valley layout. No repeating peak or backdrop image geometry. */
export const riverCenter = (z: number) =>
  -34 +
  Math.max(0, Math.min(1, (15 - z) / 45)) * 10 +
  (15 - z) * 0.105 +
  Math.sin((z + 27) * 0.031) * 7 +
  Math.sin(z * 0.068) * 1.8;
export const riverSurface = (z: number) => (z < -42 ? -1.2 : -5.6);
const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export function landNoise(x: number, z: number) {
  const a = Math.floor(x),
    b = Math.floor(z),
    u = x - a,
    v = z - b,
    sx = u * u * (3 - 2 * u),
    sz = v * v * (3 - 2 * v);
  return (
    (hash(a, b) * (1 - sx) + hash(a + 1, b) * sx) * (1 - sz) +
    (hash(a, b + 1) * (1 - sx) + hash(a + 1, b + 1) * sx) * sz
  );
}
export function valleyHeight(x: number, z: number) {
  const distance = Math.abs(x - riverCenter(z)),
    water = riverSurface(z),
    terrace = 2 + Math.max(0, -z - 20) * 0.055,
    ledge = (a: number, b: number) => {
      const t = Math.max(0, Math.min(1, (distance - a) / (b - a)));
      return t * t * (3 - 2 * t);
    },
    broad = landNoise(x * 0.027, z * 0.027),
    erosion = landNoise(x * 0.22, z * 0.18) * 0.9 + landNoise(x * 0.63, z * 0.47) * 0.35;
  let y =
    water -
    2 +
    ledge(5.8, 12.5) * (terrace - water + 2) +
    ledge(28, 36) * (5 + broad * 4) +
    ledge(53, 67) * (7 + broad * 5) +
    erosion * ledge(9, 13);
  // The castle occupies the east plateau; its inner city must remain above the land.
  const eastPlateau = Math.max(0, Math.min(1, (x + 18) / 10));
  y = y * (1 - eastPlateau) - 0.12 * eastPlateau;
  // The river-facing shelf rises below the grove; the castle's eastern foundation stays low.
  const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const groveShelf =
    smooth((-z - 26) / 20) *
    smooth((z + 150) / 25) *
    smooth((x + 18) / 10) *
    (1 - smooth((x + 2) / 18));
  y += groveShelf * (7.5 + broad * 1.5);
  const bridge =
    Math.max(0, 1 - Math.abs(z + 50) / 6) * Math.max(0, 1 - Math.abs(distance - 15) / 9);
  y = y * (1 - bridge) + 2.95 * bridge;
  return y;
}
