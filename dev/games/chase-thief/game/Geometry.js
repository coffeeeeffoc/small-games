import * as cc from '../vendor/cocos/cc.js';
                        
                      
                    
                   
                
                    
  
export function rgb(hex        )           {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
    1,
  ];
}
export class Batch {
  data           = { positions: [], normals: [], colors: [], uvs: [], indices: [] };
  quad(points            , color          , normal          , uvs = [0, 0, 1, 0, 1, 1, 0, 1]) {
    const d = this.data,
      start = d.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      d.positions.push(...points[i]);
      d.normals.push(...normal);
      d.colors.push(...color);
      d.uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
    }
    d.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  box(x        , y        , z        , w        , h        , d        , color          , yaw = 0) {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const p = (a, b, e) => [x + c * a + s * e, y + b, z - s * a + c * e];
    const n = (a, b, e) => [c * a + s * e, b, -s * a + c * e];
    w /= 2;
    h /= 2;
    d /= 2;
    this.quad([p(-w, -h, d), p(w, -h, d), p(w, h, d), p(-w, h, d)], color, n(0, 0, 1));
    this.quad([p(w, -h, -d), p(-w, -h, -d), p(-w, h, -d), p(w, h, -d)], color, n(0, 0, -1));
    this.quad([p(w, -h, d), p(w, -h, -d), p(w, h, -d), p(w, h, d)], color, n(1, 0, 0));
    this.quad([p(-w, -h, -d), p(-w, -h, d), p(-w, h, d), p(-w, h, -d)], color, n(-1, 0, 0));
    this.quad([p(-w, h, d), p(w, h, d), p(w, h, -d), p(-w, h, -d)], color, n(0, 1, 0));
    this.quad([p(-w, -h, -d), p(w, -h, -d), p(w, -h, d), p(-w, -h, d)], color, n(0, -1, 0));
  }
  add(mesh          , x = 0, y = 0, z = 0, scale = 1, yaw = 0, tint           ) {
    const d = this.data,
      start = d.positions.length / 3,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      const a = mesh.positions[i * 3] * scale,
        b = mesh.positions[i * 3 + 1] * scale,
        e = mesh.positions[i * 3 + 2] * scale;
      d.positions.push(x + c * a + s * e, y + b, z - s * a + c * e);
      const nx = mesh.normals[i * 3],
        ny = mesh.normals[i * 3 + 1],
        nz = mesh.normals[i * 3 + 2];
      d.normals.push(c * nx + s * nz, ny, -s * nx + c * nz);
      d.colors.push(...(tint || mesh.colors.slice(i * 4, i * 4 + 4)));
      d.uvs.push(mesh.uvs[i * 2] || 0, mesh.uvs[i * 2 + 1] || 0);
    }
    d.indices.push(...mesh.indices.map((i) => i + start));
  }
  node(name        , parent         , mat             ) {
    if (!this.data.positions.length) return null;
    const node = new cc.Node(name);
    parent.addChild(node);
    // Cocos createMesh uses Uint16 indices. Split by triangle with local remapping.
    const source = this.data;
    let data           = { positions: [], normals: [], colors: [], uvs: [], indices: [] };
    let mapping = new Map                (),
      part = 0;
    const flush = () => {
      if (!data.indices.length) return;
      const child = new cc.Node('batch ' + part++);
      node.addChild(child);
      const renderer = child.addComponent(cc.MeshRenderer);
      renderer.setMaterial(mat, 0);
      renderer.mesh = cc.utils.createMesh(data       , undefined, { calculateBounds: true });
      data = { positions: [], normals: [], colors: [], uvs: [], indices: [] };
      mapping = new Map();
    };
    for (let i = 0; i < source.indices.length; i += 3) {
      if (mapping.size > 59996) flush();
      for (const old of source.indices.slice(i, i + 3)) {
        let index = mapping.get(old);
        if (index === undefined) {
          index = mapping.size;
          mapping.set(old, index);
          data.positions.push(...source.positions.slice(old * 3, old * 3 + 3));
          data.normals.push(...source.normals.slice(old * 3, old * 3 + 3));
          data.colors.push(...source.colors.slice(old * 4, old * 4 + 4));
          data.uvs.push(...source.uvs.slice(old * 2, old * 2 + 2));
        }
        data.indices.push(index);
      }
    }
    flush();
    return node;
  }
}
export function disposeMeshNode(node         ) {
  for (const r of node.getComponentsInChildren(cc.MeshRenderer)) {
    const mesh = r.mesh;
    r.mesh = null;
    mesh?.destroy();
  }
  node.destroy();
}
