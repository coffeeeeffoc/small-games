import * as T from 'three';
/** Opaque forked needle boughs: airy branch gaps instead of spherical foliage blobs. */
export function spruceCrown(lowPower = false) {
  const positions: number[] = [],
    colors: number[] = [];
  const triangle = (a: T.Vector3, b: T.Vector3, c: T.Vector3, color: string) => {
    const shade = new T.Color(color);
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(shade.r, shade.g, shade.b);
    }
  };
  for (let tier = 0; tier < (lowPower ? 4 : 6); tier++) {
    const reach = 1.25 - tier * (lowPower ? 0.29 : 0.19),
      y = 0.25 + tier * (lowPower ? 0.65 : 0.43);
    for (let branch = 0; branch < 5; branch++) {
      const angle = branch * Math.PI * 0.4 + tier * 1.7,
        axis = new T.Vector3(Math.cos(angle), -0.19, Math.sin(angle)),
        cross = new T.Vector3(-Math.sin(angle), 0, Math.cos(angle)),
        origin = new T.Vector3(0, y, 0);
      for (let twig = 0; twig < (lowPower ? 3 : 5); twig++) {
        const t = 0.16 + twig * (lowPower ? 0.3 : 0.18),
          center = origin.clone().addScaledVector(axis, reach * t),
          width = reach * (0.58 - t * 0.3),
          tip = origin.clone().addScaledVector(axis, reach * (t + 0.3)),
          left = center.clone().addScaledVector(cross, width),
          right = center.clone().addScaledVector(cross, -width),
          ridge = center.clone().add(new T.Vector3(0, width * 0.65, 0));
        triangle(left, tip, ridge, twig % 2 ? '#426847' : '#547548');
        triangle(ridge, tip, right, '#365b40');
        triangle(left, right, tip, '#2d5039');
      }
    }
  }
  const crown = new T.BufferGeometry();
  crown.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  crown.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  crown.computeVertexNormals();
  return crown;
}
/** Ground foliage is opaque geometry, avoiding transparent overdraw on mobile. */
export function grassTuft(seed: number) {
  const positions: number[] = [],
    colors: number[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4 + seed,
      x = Math.sin(i * 3 + seed) * 0.24,
      z = Math.cos(i * 5 + seed) * 0.24,
      width = 0.045 + (i % 3) * 0.015,
      h = 0.25 + (i % 4) * 0.075,
      dx = Math.cos(angle) * width,
      dz = Math.sin(angle) * width;
    positions.push(x - dx, 0, z - dz, x + dx, 0, z + dz, x + dx * 2, h, z + dz * 2);
    for (let j = 0; j < 3; j++) {
      const c = new T.Color(j === 2 ? '#9eae55' : '#59733a');
      colors.push(c.r, c.g, c.b);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
