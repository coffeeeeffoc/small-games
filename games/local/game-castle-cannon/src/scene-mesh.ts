import { surfaceTexture } from './scene-assets.js';
import * as T from 'three';
import { createPerson, type PersonPose } from './scene-person.js';
import spruceModel from './models/spruce-rodin.json';
import { chamferedBox } from './scene-geometry.js';
import { sculptedGeometry } from './scene-sculpture.js';
import masonryModel from './models/stone-rodin.json';
import { drapedBanner, heraldry } from './scene-banner.js';
import { bedrockGeometry } from './scene-rock.js';
import { compactMeshes } from './scene-compact.js';
const woodColors = new Set(
  '#8d6236 #b17d43 #a36e38 #996b3e #7d532d #c29758 #946835 #a57b4d #70583b #725034 #926735 #a87843 #80623e #a07944 #9f7446 #a06a45 #bb855a #8b663f #b9884d #8d5c2d #b78a54 #927044'.split(
    ' ',
  ),
);
const stoneColors = new Set(
  '#cbb78e #d4c19b #bda984 #e0ccaa #c6b28e #b7a583 #d5c29c #938b73 #9a9480 #aca491 #c9b58e #b1a27f #c0ae88 #cbb68e #bdad8c #baa98a'.split(
    ' ',
  ),
);
export interface PbrMaps {
  color: string;
  normal: string;
  metalRoughness: string;
}

/** Original procedural meshes. Static geometry is merged by material before rendering. */
export class MeshKit {
  materials = new Map<string, T.MeshStandardMaterial>();
  geometries = new Map<string, T.BufferGeometry>();
  readonly pbrMaps = new Map<string, PbrMaps>();
  private stoneBump = surfaceTexture(false);
  private woodBump = surfaceTexture(true);
  private woodColor = surfaceTexture(true, true);
  private skinIndex = -1;
  private externalTextures: T.Texture[] = [];
  private stoneImage: T.Texture | null = null;
  private woodImage: T.Texture | null = null;
  pbrMaterial(maps: PbrMaps) {
    const key = `pbr:${maps.color}`;
    if (!this.materials.has(key)) {
      const material = new T.MeshStandardMaterial({
        color: '#c4ae8c',
        roughness: 0.72,
        metalness: 0,
        envMapIntensity: 1.5,
      });
      // Rodin's dark iron albedo needs a physical conductor reflectance floor, kept separate from wood.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
          roughnessFactor *= mix(1.0, 0.45, metalnessFactor);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 3.0 + vec3(0.045), metalnessFactor);
          metalnessFactor = smoothstep(0.08, 0.65, metalnessFactor);`,
        );
      };
      material.customProgramCacheKey = () => 'rodin-conductor-reflectance-v1';
      this.materials.set(key, material);
      this.pbrMaps.set(key, maps);
    }
    return this.materials.get(key)!;
  }
  applyPbrTextures(images: ReadonlyMap<string, T.Texture>) {
    for (const [key, maps] of this.pbrMaps) {
      const material = this.materials.get(key)!;
      material.map = images.get(maps.color) ?? null;
      material.normalMap = images.get(maps.normal) ?? null;
      material.metalnessMap = material.roughnessMap = images.get(maps.metalRoughness) ?? null;
      material.color.set(material.map ? '#ffffff' : '#c4ae8c');
      material.metalness = material.metalnessMap ? 1 : 0;
      material.needsUpdate = true;
    }
    this.externalTextures.push(...images.values());
  }
  applyTextures(stone: T.Texture | null, wood: T.Texture | null) {
    this.stoneImage = stone;
    this.woodImage = wood;
    this.externalTextures.push(...[stone, wood].filter((t): t is T.Texture => !!t));
    for (const [key, material] of this.materials) {
      const color = key.split(':')[0]!;
      if (stone && stoneColors.has(color)) {
        material.map = stone;
        material.color.set(color).lerp(new T.Color('#ffffff'), 0.68);
      }
      if (wood && woodColors.has(color)) {
        material.map = wood;
        material.color.lerp(new T.Color('#c8baa0'), 0.5);
        material.roughness = 0.95;
        // Grade the original oak texture in the material, keeping restrained worn grain.
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float oakLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(oakLuma), 0.38);
            diffuseColor.rgb = mix(vec3(0.17, 0.145, 0.11), diffuseColor.rgb, 0.74);`,
          );
        };
        material.customProgramCacheKey = () => 'restrained-original-oak-v1';
      }
      material.needsUpdate = true;
    }
  }
  applySkin(index: number) {
    if (this.skinIndex === index) return;
    this.skinIndex = index;
    for (const [key, material] of this.materials) {
      if (key.startsWith('soldier:blue:'))
        (material.userData.tunicTint as T.Vector3).fromArray(
          [
            [1, 1, 1],
            [5.2, 2.1, 0.23],
            [4.5, 1.15, 0.75],
          ][index]!,
        );
      if (key.startsWith('#1764a0:')) material.color.set(['#1764a0', '#d5a435', '#cb756c'][index]!);
      if (key.startsWith('#367db0:')) material.color.set(['#367db0', '#c6994b', '#b36d66'][index]!);
    }
  }
  material(color: string, metal = 0, roughness = 0.85) {
    const key = `${color}:${metal}:${roughness}`;
    if (!this.materials.has(key)) {
      this.materials.set(
        key,
        new T.MeshStandardMaterial({
          color,
          metalness: metal,
          roughness: metal > 0 ? (metal >= 0.65 ? 0.43 : 0.38) : roughness,
          map: stoneColors.has(color)
            ? this.stoneImage
            : woodColors.has(color)
              ? (this.woodImage ?? this.woodColor)
              : null,
          bumpMap: stoneColors.has(color)
            ? this.stoneBump
            : woodColors.has(color)
              ? this.woodBump
              : null,
          bumpScale: stoneColors.has(color) ? 0.06 : 0.045,
        }),
      );
      // Targets created after asynchronous textures load share the static architecture's grading.
      if (this.stoneImage && stoneColors.has(color))
        this.materials.get(key)!.color.set(color).lerp(new T.Color('#ffffff'), 0.68);
    }
    return this.materials.get(key)!;
  }
  mesh(
    parent: T.Object3D,
    g: T.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    metal = 0,
  ) {
    const m = new T.Mesh(g, this.material(color, metal));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  box(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    bevel = 0.06,
  ) {
    const stone = stoneColors.has(color) && bevel >= 0.06 && Math.max(w, h, d) <= 3;
    const key = `box:${w}:${h}:${d}:${bevel}:${stone ? color : ''}`;
    if (!this.geometries.has(key)) {
      if (stone) {
        if (!this.geometries.has('sculpted-stone'))
          this.geometries.set('sculpted-stone', sculptedGeometry(masonryModel[0]!));
        this.geometries.set(key, this.geometries.get('sculpted-stone')!.clone().scale(w, h, d));
        const geometry = this.geometries.get(key)!,
          tint = new T.Color(color).lerp(new T.Color('#ffffff'), 0.72);
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
        geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      } else
        this.geometries.set(
          key,
          bevel >= 0.06 ? chamferedBox(w, h, d, bevel) : new T.BoxGeometry(w, h, d).toNonIndexed(),
        );
      const low = new T.BoxGeometry(w, h, d);
      this.geometries.get(key)!.userData.lowGeometry = low;
      this.geometries.set(`low:${key}`, low);
    }
    const mesh = this.mesh(parent, this.geometries.get(key)!, color, x, y, z);
    if (stone) {
      mesh.material = this.pbrMaterial(masonryModel[0]!.maps);
      mesh.material.vertexColors = true;
      mesh.material.roughness = 1;
    }
    return mesh;
  }
  sphere(parent: T.Object3D, x: number, y: number, z: number, r: number, color: string, metal = 0) {
    const key = `sphere:${r}`;
    if (!this.geometries.has(key)) {
      const high = new T.SphereGeometry(r, 12, 8),
        low = new T.SphereGeometry(r, 8, 4);
      high.userData.lowGeometry = low;
      this.geometries.set(key, high);
      this.geometries.set(`low:${key}`, low);
    }
    return this.mesh(parent, this.geometries.get(key)!, color, x, y, z, metal);
  }
  cylinder(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    top: number,
    bottom: number,
    h: number,
    color: string,
    metal = 0,
  ) {
    const key = `cylinder:${top}:${bottom}:${h}`;
    if (!this.geometries.has(key)) {
      const high = new T.CylinderGeometry(top, bottom, h, 16),
        low = new T.CylinderGeometry(top, bottom, h, 8);
      high.userData.lowGeometry = low;
      this.geometries.set(key, high);
      this.geometries.set(`low:${key}`, low);
    }
    return this.mesh(parent, this.geometries.get(key)!, color, x, y, z, metal);
  }
  rock(parent: T.Object3D, x: number, y: number, z: number, scale: number, color = '#938b73') {
    const key = 'rock';
    if (!this.geometries.has(key)) this.geometries.set(key, bedrockGeometry());
    const m = this.mesh(parent, this.geometries.get(key)!, color, x, y, z);
    m.scale.set(scale, scale * 0.65, scale * 0.85);
    m.rotation.set(x * 1.7, z * 2.1, x + z);
    return m;
  }
  tree(parent: T.Object3D, x: number, y: number, z: number, scale = 1) {
    if (!this.geometries.has('rodin-spruce'))
      this.geometries.set('rodin-spruce', sculptedGeometry(spruceModel[0]!));
    const foliage = this.mesh(parent, this.geometries.get('rodin-spruce')!, '#ffffff', x, y, z);
    foliage.material = this.pbrMaterial(spruceModel[0]!.maps);
    foliage.scale.setScalar(scale * 0.8);
    foliage.rotation.y = x + z;
  }

  flag(parent: T.Object3D, x: number, y: number, z: number, blue = false, scale = 1) {
    this.cylinder(parent, x, y + 2 * scale, z, 0.05 * scale, 0.05 * scale, scale * 4, '#795b3c');
    if (blue) {
      drapedBanner(
        this,
        parent,
        x + scale * 0.85,
        y + 3.7 * scale,
        z,
        scale * 1.65,
        scale * 2.8,
        true,
      );
      return;
    }
    this.box(
      parent,
      x + 0.8 * scale,
      y + 3.3 * scale,
      z,
      scale * 1.6,
      scale * 1.1,
      0.04,
      blue ? '#1764a0' : '#a64630',
      0,
    );
    heraldry(this, parent, x + 0.8 * scale, y + 3.15 * scale, z + 0.04, scale * 0.44);
  }
  banner(parent: T.Object3D, x: number, y: number, z: number, w: number, h: number, blue = false) {
    drapedBanner(this, parent, x, y, z, w, h, blue);
  }
  person(blue = true, pose: PersonPose = 'march') {
    return createPerson(this, blue, pose);
  }
  compact(group: T.Group) {
    compactMeshes(group);
  }
  dispose() {
    for (const m of this.materials.values()) m.dispose();
    for (const g of this.geometries.values()) g.dispose();
    this.stoneBump.dispose();
    this.woodBump.dispose();
    this.woodColor.dispose();
    for (const texture of this.externalTextures) texture.dispose();
  }
}
