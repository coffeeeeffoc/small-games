import * as T from 'three';
/** Battery mode keeps model silhouettes and aims, with cheaper geometry and diffuse lighting. */
export class SceneQuality {
  private diffuse = new Map<T.MeshStandardMaterial, T.MeshLambertMaterial>();
  private originals = new WeakMap<T.Mesh, T.Material | T.Material[]>();
  private geometry = new WeakMap<T.Mesh, T.BufferGeometry>();
  apply(scene: T.Scene, lowPower: boolean) {
    scene.traverse((object) => {
      if (!(object instanceof T.Mesh)) return;
      if (!this.originals.has(object)) this.originals.set(object, object.material);
      if (!this.geometry.has(object)) this.geometry.set(object, object.geometry);
      const high = this.geometry.get(object)!;
      object.geometry = lowPower ? (high.userData.lowGeometry ?? high) : high;
      const source = this.originals.get(object)!;
      const convert = (material: T.Material) => {
        if (!(material instanceof T.MeshStandardMaterial)) return material;
        if (!this.diffuse.has(material)) {
          const simple = new T.MeshLambertMaterial({
            color: material.color,
            map: material.map,
            vertexColors: material.vertexColors,
            transparent: material.transparent,
            opacity: material.opacity,
            side: material.side,
            depthWrite: material.depthWrite,
            emissive: material.emissive,
          });
          simple.onBeforeCompile = material.onBeforeCompile;
          simple.customProgramCacheKey = material.customProgramCacheKey;
          this.diffuse.set(material, simple);
        }
        return this.diffuse.get(material)!;
      };
      object.material = lowPower
        ? Array.isArray(source)
          ? source.map(convert)
          : convert(source)
        : source;
    });
  }
  sync() {
    for (const [source, simple] of this.diffuse) simple.color.copy(source.color);
  }
  dispose() {
    for (const material of this.diffuse.values()) material.dispose();
    this.diffuse.clear();
  }
}
