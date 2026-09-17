import { Color, Material, MeshRenderer, Node, primitives, utils } from 'cc';

export const palette = {
  road: '#374d63',
  sand: '#f5dda5',
  grass: '#87cfa3',
  sea: '#3aacc4',
  white: '#fff7dd',
  red: '#fb6555',
  navy: '#193a53',
  yellow: '#ffd15a',
  mint: '#53ddb9',
  blue: '#549cea',
};
const materials = new Map<string, Material>();
export function material(hex: string) {
  let m = materials.get(hex);
  if (!m) {
    m = new Material();
    m.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
    m.setProperty('mainColor', new Color().fromHEX(hex));
    materials.set(hex, m);
  }
  return m;
}

/** One draw call per colour for static scenery, with soft lighting baked into vertices. */
export class MeshBatch {
  groups = new Map<
    string,
    { positions: number[]; normals: number[]; colors: number[]; indices: number[] }
  >();
  add(
    color: string,
    geo: primitives.IGeometry,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    yaw = 0,
  ) {
    let g = this.groups.get(color);
    if (!g) {
      g = { positions: [], normals: [], colors: [], indices: [] };
      this.groups.set(color, g);
    }
    const offset = g.positions.length / 3,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (let i = 0; i < geo.positions.length; i += 3) {
      const px = geo.positions[i] * sx,
        pz = geo.positions[i + 2] * sz;
      g.positions.push(x + px * c + pz * s, y + geo.positions[i + 1] * sy, z + pz * c - px * s);
      const nx = geo.normals?.[i] ?? 0,
        ny = geo.normals?.[i + 1] ?? 1,
        nz = geo.normals?.[i + 2] ?? 0;
      const rx = nx * c + nz * s,
        rz = nz * c - nx * s;
      g.normals.push(rx, ny, rz);
      const light = 0.72 + 0.28 * Math.max(0, rx * -0.35 + ny * 0.8 + rz * 0.4);
      g.colors.push(light, light, light, 1);
    }
    g.indices.push(...(geo.indices ?? []).map((i) => i + offset));
  }
  box(color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) {
    this.add(color, primitives.box(), x, y, z, sx, sy, sz, yaw);
  }
  ball(color: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    this.add(color, primitives.sphere(0.5, { segments: 12 }), x, y, z, sx, sy, sz);
  }
  build(parent: Node, name: string) {
    const root = new Node(name);
    parent.addChild(root);
    for (const [hex, geometry] of this.groups) {
      const node = new Node(hex);
      root.addChild(node);
      const renderer = node.addComponent(MeshRenderer);
      renderer.mesh = utils.createMesh(geometry);
      renderer.setMaterial(material(hex), 0);
    }
    return root;
  }
}
