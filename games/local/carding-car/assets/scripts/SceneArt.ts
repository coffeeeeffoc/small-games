import {
  Asset,
  Color,
  gfx,
  instantiate,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Prefab,
  primitives,
  resources,
  Texture2D,
  Vec4,
  utils,
} from 'cc';

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
export function loadArt<T extends Asset>(name: string, type: new () => T) {
  if (name.startsWith('expansion/') && Object.is(type, Prefab)) name += '/' + name.split('/').pop();
  return new Promise<T>((resolve, reject) =>
    resources.load(
      /^(expansion|glacier-sample)\//.test(name) ? name : 'seaside/' + name,
      type,
      (error, asset) => (error ? reject(error) : resolve(asset)),
    ),
  );
}

const modelMaterials = new Map<Material, Material>();
/** Shaded GLBs share one unlit material per source, including two-sided foliage. */
export function placeModel(prefab: Prefab, parent: Node, name: string) {
  const model = instantiate(prefab);
  model.name = name;
  parent.addChild(model);
  for (const renderer of model.getComponentsInChildren(MeshRenderer)) {
    renderer.sharedMaterials.forEach((original, index) => {
      if (!original) return;
      let shared = modelMaterials.get(original);
      if (!shared) {
        const texture =
          original.getProperty('mainTexture') ||
          original.getProperty('albedoMap') ||
          original.getProperty('emissiveMap');
        const baseColor =
          original.getProperty('mainColor') || original.getProperty('albedo') || Color.WHITE;
        shared = new Material();
        shared.initialize({
          effectName: 'builtin-unlit',
          defines: { USE_TEXTURE: texture instanceof Texture2D },
          states: { rasterizerState: { cullMode: gfx.CullMode.NONE } },
        });
        shared.setProperty('mainColor', baseColor instanceof Color || baseColor instanceof Vec4 ? baseColor : Color.WHITE);
        if (texture instanceof Texture2D) shared.setProperty('mainTexture', texture);
        modelMaterials.set(original, shared);
      }
      renderer.setMaterial(shared, index);
    });
  }
  return model;
}

let shadowMaterial: Material;
let shadowMesh: Mesh;
export function groundShadow(parent: Node, width: number, length: number) {
  shadowMaterial ??= new Material();
  if (!shadowMaterial.effectAsset) {
    shadowMaterial.initialize({ effectName: 'builtin-unlit', technique: 1 });
    shadowMaterial.setProperty('mainColor', new Color(16, 43, 48, 52));
  }
  const node = new Node('GroundShadow');
  parent.addChild(node);
  const renderer = node.addComponent(MeshRenderer);
  shadowMesh ??= utils.createMesh(primitives.cylinder(0.5, 0.5, 0.005, { radialSegments: 24 }));
  renderer.mesh = shadowMesh;
  renderer.setMaterial(shadowMaterial, 0);
  node.setScale(width, 1, length);
  // Above the ice road overlay (2.5 cm) as well as the base asphalt.
  node.setPosition(0, 0.045, 0);
  return node;
}
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
  constructor(private readonly lit = false) {}
  groups = new Map<
    string,
    { positions: number[]; normals: number[]; colors: number[]; uvs: number[]; indices: number[] }
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
      g = { positions: [], normals: [], colors: [], uvs: [], indices: [] };
      this.groups.set(color, g);
    }
    const offset = g.positions.length / 3,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (let i = 0; i < geo.positions.length; i += 3) {
      const px = geo.positions[i] * sx,
        pz = geo.positions[i + 2] * sz;
      g.positions.push(x + px * c + pz * s, y + geo.positions[i + 1] * sy, z + pz * c - px * s);
      const nx = (geo.normals?.[i] ?? 0) / (this.lit ? sx : 1),
        ny = (geo.normals?.[i + 1] ?? 1) / (this.lit ? sy : 1),
        nz = (geo.normals?.[i + 2] ?? 0) / (this.lit ? sz : 1);
      const rx = nx * c + nz * s,
        rz = nz * c - nx * s;
      const length = this.lit ? Math.hypot(rx, ny, rz) || 1 : 1;
      g.normals.push(rx / length, ny / length, rz / length);
      g.uvs.push(geo.uvs?.[(i / 3) * 2] ?? 0, geo.uvs?.[(i / 3) * 2 + 1] ?? 0);
      const light = this.lit ? 1 : 0.72 + 0.28 * Math.max(0, rx * -0.35 + ny * 0.8 + rz * 0.4);
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
  build(parent: Node, name: string, getMaterial: (color: string) => Material = material) {
    const root = new Node(name);
    parent.addChild(root);
    for (const [hex, geometry] of this.groups) {
      const node = new Node(hex);
      root.addChild(node);
      const renderer = node.addComponent(MeshRenderer);
      const mesh = utils.createMesh(geometry);
      renderer.mesh = mesh;
      node.once(Node.EventType.NODE_DESTROYED, () => mesh.destroy());
      renderer.setMaterial(getMaterial(hex), 0);
      if (this.lit) {
        renderer.shadowCastingMode = 1;
        renderer.receiveShadow = 1;
      }
    }
    return root;
  }
}
