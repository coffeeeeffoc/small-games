import * as T from 'three';
import { createPerson, type PersonPose } from './scene-person.js';
import { spruceCrown } from './scene-foliage.js';
import { chamferedBox } from './scene-geometry.js';
import { sculptedGeometry } from './scene-sculpture.js';
import masonryModel from './models/masonry.json';
import { drapedBanner } from './scene-banner.js';
import { bedrockGeometry } from './scene-rock.js';
import { compactMeshes } from './scene-compact.js';
const woodColors = new Set([
  '#8d6236',
  '#b17d43',
  '#a36e38',
  '#996b3e',
  '#7d532d',
  '#c29758',
  '#946835',
  '#a57b4d',
  '#70583b',
  '#725034',
  '#926735',
  '#a87843',
  '#80623e',
  '#a07944',
  '#9f7446',
  '#a06a45',
  '#bb855a',
  '#8b663f',
  '#b9884d',
  '#8d5c2d',
  '#b78a54',
  '#927044',
]);
const stoneColors = new Set([
  '#cbb78e',
  '#d4c19b',
  '#bda984',
  '#e0ccaa',
  '#c6b28e',
  '#b7a583',
  '#d5c29c',
  '#938b73',
  '#9a9480',
  '#aca491',
  '#c9b58e',
  '#b1a27f',
  '#c0ae88',
  '#cbb68e',
  '#bdad8c',
  '#baa98a',
]);

/** Original procedural meshes. Static geometry is merged by material before rendering. */
export class MeshKit {
  materials = new Map<string, T.MeshStandardMaterial>();
  geometries = new Map<string, T.BufferGeometry>();
  private stoneBump = surfaceTexture(false);
  private woodBump = surfaceTexture(true);
  private woodColor = surfaceTexture(true, true);
  private skinIndex = -1;
  private externalTextures: T.Texture[] = [];
  private stoneImage: T.Texture | null = null;
  private woodImage: T.Texture | null = null;
  applyTextures(stone: T.Texture | null, wood: T.Texture | null) {
    this.stoneImage = stone;
    this.woodImage = wood;
    this.externalTextures = [stone, wood].filter((t): t is T.Texture => !!t);
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
    const key = `box:${w}:${h}:${d}:${bevel}`;
    if (!this.geometries.has(key)) {
      if (stoneColors.has(color) && bevel >= 0.06 && Math.max(w, h, d) <= 3) {
        if (!this.geometries.has('sculpted-stone'))
          this.geometries.set('sculpted-stone', sculptedGeometry(masonryModel[0]!));
        this.geometries.set(key, this.geometries.get('sculpted-stone')!.clone().scale(w, h, d));
      } else
        this.geometries.set(
          key,
          bevel >= 0.06 ? chamferedBox(w, h, d, bevel) : new T.BoxGeometry(w, h, d).toNonIndexed(),
        );
      const low = new T.BoxGeometry(w, h, d);
      this.geometries.get(key)!.userData.lowGeometry = low;
      this.geometries.set(`low:${key}`, low);
    }
    return this.mesh(parent, this.geometries.get(key)!, color, x, y, z);
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
    this.cylinder(parent, x, y + scale * 1.5, z, 0.2 * scale, 0.3 * scale, scale * 3, '#70583b');
    if (!this.geometries.has('spruce')) {
      const high = spruceCrown(),
        low = spruceCrown(true);
      high.userData.lowGeometry = low;
      this.geometries.set('spruce', high);
      this.geometries.set('low:spruce', low);
    }
    const foliage = this.mesh(parent, this.geometries.get('spruce')!, '#ffffff', x, y + scale, z);
    foliage.scale.setScalar(scale * 1.35);
    (foliage.material as T.MeshStandardMaterial).vertexColors = true;
  }

  flag(parent: T.Object3D, x: number, y: number, z: number, blue = false, scale = 1) {
    this.cylinder(parent, x, y + 2 * scale, z, 0.05 * scale, 0.05 * scale, scale * 4, '#795b3c');
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
    // Original simple heraldic sun: no borrowed emblem.
    const crest = this.sphere(
      parent,
      x + 0.8 * scale,
      y + 3.3 * scale,
      z + 0.04,
      scale * 0.26,
      '#edd59b',
    );
    crest.scale.z = 0.1;
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
function surfaceTexture(wood: boolean, color = false) {
  const data = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const n = hash - Math.floor(hash),
        i = (y * 64 + x) * 4;
      const shade = color
        ? 202 + 25 * Math.sin(x * 0.56 + Math.sin(y * 0.12)) + n * 12
        : wood
          ? 110 + 35 * Math.sin(x * 0.75 + Math.sin(y * 0.12)) + n * 15
          : 110 + n * 50;
      data[i] = data[i + 1] = data[i + 2] = shade;
      data[i + 3] = 255;
    }
  const texture = new T.DataTexture(data, 64, 64);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
