import * as T from 'three';
/** Original eroded bedrock: planar strata, broad broken shoulders and small chipped ridges. */
export function bedrockGeometry() {
  const geometry = new T.IcosahedronGeometry(1, 2),
    vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      y = vertices.getY(i),
      z = vertices.getZ(i),
      radius = (Math.abs(x) ** 6 + Math.abs(y) ** 6 + Math.abs(z) ** 6) ** (1 / 6),
      fracture = 0.93 + Math.sin(x * 7 + z * 3) * 0.06 + Math.cos(y * 17 + z * 9) * 0.035,
      strata = Math.sin(y * 18 + x * 2) * 0.035;
    vertices.setXYZ(
      i,
      (x / radius) * fracture + strata,
      (y / radius) * (0.84 + Math.sin(x * 4 + z * 5) * 0.07),
      (z / radius) * fracture - strata * 0.5,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}
