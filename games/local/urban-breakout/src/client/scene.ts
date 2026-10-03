import * as T from 'three';
import { ENEMIES } from '../content/levels.ts';
import { memberPosition, randomFor, supplyPosition } from '../core/geometry.ts';
import { HZ, PLAYER_Z, type GameState } from '../core/types.ts';
import { impactDelay } from './feedback.ts';

type Shape = 'box' | 'ball' | 'cylinder' | 'cone' | 'ring';
// Reusable instanced parts: silhouettes have helmets, visors, packs, guns and articulated limbs.
class Parts {
  meshes: Record<Shape, T.InstancedMesh>;
  counts: Record<Shape, number> = { box: 0, ball: 0, cylinder: 0, cone: 0, ring: 0 };
  dummy = new T.Object3D();
  color = new T.Color();
  constructor(scene: T.Scene) {
    const geometries = {
      box: new T.BoxGeometry(1, 1, 1),
      ball: new T.IcosahedronGeometry(0.5, 1),
      cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 8),
      cone: new T.ConeGeometry(0.5, 1, 6),
      ring: new T.TorusGeometry(0.5, 0.018, 4, 32),
    };
    const create = (geometry: T.BufferGeometry, capacity = 2200) => {
      const mesh = new T.InstancedMesh(geometry, new T.MeshLambertMaterial(), capacity);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    };
    this.meshes = {
      box: create(geometries.box),
      ball: create(geometries.ball),
      cylinder: create(geometries.cylinder),
      cone: create(geometries.cone),
      ring: create(geometries.ring, 96),
    };
  }
  reset() {
    for (const key of Object.keys(this.counts) as Shape[]) this.counts[key] = 0;
  }
  add(
    shape: Shape,
    color: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    ry = 0,
    rz = 0,
    rx = 0,
  ) {
    const i = this.counts[shape]++;
    if (i >= this.meshes[shape].instanceMatrix.count) return;
    const d = this.dummy;
    d.position.set(x, y, z);
    d.scale.set(sx, sy, sz);
    d.rotation.set(rx, ry, rz, 'YXZ');
    d.updateMatrix();
    this.meshes[shape].setMatrixAt(i, d.matrix);
    this.meshes[shape].setColorAt(i, this.color.setHex(color));
  }
  flush() {
    for (const key of Object.keys(this.meshes) as Shape[]) {
      const m = this.meshes[key];
      m.count = Math.min(m.instanceMatrix.count, this.counts[key]);
      if (!m.count) continue;
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, m.count * 16);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) {
        m.instanceColor.clearUpdateRanges();
        m.instanceColor.addUpdateRange(0, m.count * 3);
        m.instanceColor.needsUpdate = true;
      }
    }
  }
}
const C = {
  road: 0x536568,
  stripe: 0xe7dcbb,
  orange: 0xf5792b,
  white: 0xfff4db,
  dark: 0x243d48,
  purple: 0x8a5dcc,
  pink: 0xc17bed,
  gold: 0xffbe43,
};
export class StreetScene {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(48, 1, 0.1, 140);
  parts: Parts;
  width = 1;
  height = 1;
  signs: T.Sprite[] = [];
  streetSign: T.Sprite;
  resizeObserver: ResizeObserver;
  textures: T.Texture[] = [];
  last = { tick: -1, x: 0, enemies: new Map<string, { x: number; z: number }>() };
  previous = { x: 0, enemies: new Map<string, { x: number; z: number }>() };
  effectParts = 0;
  constructor(public container: HTMLElement) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0xb8c9c1);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', '老街三维战场');
    container.append(this.renderer.domElement);
    this.scene.fog = new T.Fog(0xb8c9c1, 43, 76);
    this.scene.add(new T.HemisphereLight(0xe6f7ff, 0x91744f, 2.25));
    const sun = new T.DirectionalLight(0xffebcd, 2.6);
    sun.position.set(-12, 22, 8);
    this.scene.add(sun);
    this.camera.position.set(0, 20, 24);
    this.camera.lookAt(0, 0, -2);
    this.parts = new Parts(this.scene);
    [
      '榕树街',
      '长乐面馆',
      '人民照相馆',
      '平安药房',
      '阿婆杂货',
      '春日书店',
      '小满便利',
      '修车铺',
    ].forEach((text, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 112;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = i % 2 ? '#e4bd75' : '#397b7a';
      ctx.fillRect(0, 0, 512, 112);
      ctx.strokeStyle = '#f8ebc8';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 96);
      ctx.fillStyle = '#fff8dc';
      ctx.font = 'bold 58px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, 256, 78);
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      this.textures.push(texture);
      const sign = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: true }));
      sign.scale.set(2.6, 0.57, 1);
      this.scene.add(sign);
      this.signs.push(sign);
    });
    const label = document.createElement('canvas');
    label.width = 512;
    label.height = 128;
    const ink = label.getContext('2d')!;
    ink.fillStyle = '#286265';
    ink.fillRect(0, 0, 512, 128);
    ink.strokeStyle = '#f4e9c8';
    ink.lineWidth = 5;
    ink.strokeRect(8, 8, 496, 112);
    ink.fillStyle = '#fff0ce';
    ink.font = 'bold 58px "Microsoft YaHei", sans-serif';
    ink.textAlign = 'center';
    ink.fillText('榕 树 街  ↑', 256, 73);
    ink.font = '20px sans-serif';
    ink.fillText('RONGSHU ST. / 救援通道', 256, 107);
    const texture = new T.CanvasTexture(label);
    texture.colorSpace = T.SRGBColorSpace;
    this.textures.push(texture);
    this.streetSign = new T.Sprite(new T.SpriteMaterial({ map: texture }));
    this.streetSign.scale.set(4, 1, 1);
    this.streetSign.position.set(0, 4.4, -21);
    this.scene.add(this.streetSign);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }
  resize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }
  project(x: number, z: number, y = 0) {
    const p = new T.Vector3(x, y, z).project(this.camera);
    return { x: ((p.x + 1) * this.width) / 2, y: ((1 - p.y) * this.height) / 2 };
  }
  actor(
    x: number,
    z: number,
    angle: number,
    phase: number,
    type: 'soldier' | 'walker' | 'runner' | 'shield' | 'boss',
    hit: boolean,
    weapon = 'rifle',
    variant = 0,
    action = 0,
    fall = 0,
  ) {
    const b = this.parts,
      soldier = type === 'soldier',
      runner = type === 'runner',
      shield = type === 'shield',
      boss = type === 'boss',
      scale =
        (boss ? 2.65 : soldier ? 1 : runner ? 0.94 : 0.94 + variant * 0.08) *
        (1 - Math.pow(fall, 4) * 0.95),
      width = runner ? 0.72 : shield ? 1.15 : 0.9 + variant * 0.1,
      skin = hit ? 0xffffff : runner ? 0xb55fc1 : [0x8a5dcc, 0x7860b3, 0x9963b6][variant],
      body = hit ? 0xffffff : soldier ? C.orange : boss ? 0x624890 : skin,
      cloth = hit ? 0xffffff : [0x3f7276, 0x8e555f, 0x857458][variant],
      stride = Math.sin(phase),
      bob = Math.abs(stride) * (runner ? 0.11 : 0.035),
      lean = runner ? 0.2 : 0,
      flinch = hit ? -0.12 : action * 0.13;
    const part = (
      shape: Shape,
      color: number,
      dx: number,
      y: number,
      dz: number,
      sx: number,
      sy: number,
      sz: number,
      rz = 0,
      rx = 0,
    ) => {
      if (soldier && y > 0.6) dz += action * 0.08;
      const pitch = fall * 1.5,
        originalY = y;
      y = y * Math.cos(pitch) + dz * Math.sin(pitch);
      dz = dz * Math.cos(pitch) - originalY * Math.sin(pitch);
      const px = (dx * Math.cos(angle) + dz * Math.sin(angle)) * scale,
        pz = (-dx * Math.sin(angle) + dz * Math.cos(angle)) * scale;
      b.add(
        shape,
        color,
        x + px,
        (y + bob) * scale,
        z + pz,
        sx * scale,
        sy * scale,
        sz * scale,
        angle,
        rz,
        rx - pitch,
      );
    };
    b.add('cylinder', 0x394e51, x + 0.08, 0.025, z + 0.08, 0.8 * scale, 0.035, 0.58 * scale);
    for (const side of [-1, 1]) {
      const swing = stride * side * (runner ? 0.38 : 0.15);
      part('box', C.dark, side * 0.17, 0.29, swing, 0.21, 0.43, 0.22, 0, swing);
      part(
        'box',
        soldier ? C.dark : 0x394050,
        side * 0.17,
        0.09,
        swing + (soldier ? -0.08 : 0.1),
        0.24,
        0.15,
        0.36,
      );
    }
    part(
      'ball',
      body,
      0,
      0.81,
      lean + flinch,
      soldier ? 0.68 : 0.88 * width,
      runner ? 0.7 : 0.8,
      0.55,
    );
    if (soldier) {
      part('box', C.white, 0, 0.81, -0.24, 0.36, 0.44, 0.12);
      part('box', C.dark, 0, 0.8, 0.28, 0.4, 0.5, 0.23);
      part('box', C.orange, 0, 0.83, 0.415, 0.27, 0.3, 0.05);
      part('ball', 0xf0c28e, 0, 1.24, -0.015, 0.4, 0.41, 0.4);
      part('cylinder', C.white, 0, 1.44, 0.015, 0.52, 0.26, 0.49);
      part('box', C.orange, 0, 1.52, -0.04, 0.11, 0.13, 0.42);
      part('box', C.dark, 0, 1.3, -0.21, 0.39, 0.14, 0.07);
      part('ball', C.white, -0.33, 0.86, -0.11, 0.27, 0.35, 0.31);
      part('ball', C.white, 0.33, 0.86, -0.11, 0.27, 0.35, 0.31);
      part(
        'box',
        weapon === 'grenade' ? C.gold : C.dark,
        0.25,
        0.8,
        -0.51 + action * 0.12,
        weapon === 'grenade' ? 0.24 : 0.14,
        0.19,
        0.66,
      );
      part(
        'box',
        0x7da7b0,
        0.25,
        0.81,
        -0.89 + action * 0.12,
        weapon === 'shotgun' ? 0.2 : 0.1,
        0.11,
        0.18,
      );
    } else {
      const headZ = lean + flinch + 0.09,
        headY = runner ? 1.15 : 1.27;
      part('ball', skin, 0, headY, headZ, runner ? 0.57 : 0.68, 0.62, 0.62);
      // Dark eye sockets, offset brows and two small teeth remain readable from above.
      for (const side of [-1, 1]) {
        part('ball', 0x433653, side * 0.17, headY + 0.05, headZ + 0.255, 0.25, 0.23, 0.13);
        part(
          'ball',
          runner ? 0xbdf389 : C.gold,
          side * 0.17,
          headY + 0.05,
          headZ + 0.31,
          0.13,
          side === 1 ? 0.17 : 0.12,
          0.08,
        );
        part('box', body, side * 0.17, headY + 0.18, headZ + 0.25, 0.27, 0.07, 0.14, side * 0.18);
        part('box', C.white, side * 0.085, headY - 0.16, headZ + 0.32, 0.065, 0.1, 0.05);
        const swing = stride * side * (runner ? 0.65 : 0.3) + action * 0.8;
        part(
          'ball',
          body,
          side * 0.43 * width,
          0.77,
          lean + swing * 0.22,
          runner ? 0.22 : 0.32,
          0.49,
          0.3,
          side * 0.15,
          swing,
        );
        part(
          'ball',
          skin,
          side * 0.48 * width,
          0.52 + Math.abs(swing) * 0.16,
          lean + 0.12 + swing * 0.4,
          runner ? 0.22 : 0.3,
          0.27,
          0.3,
        );
      }
      part('box', 0x352e48, 0, headY - 0.13, headZ + 0.29, 0.3, 0.13, 0.09);
      if (type === 'walker') {
        part('box', cloth, 0, 0.78, 0.25 + flinch, 0.59 * width, 0.48, 0.17);
        part('box', 0xb7b89e, 0.12, 0.87, 0.35 + flinch, 0.13, 0.13, 0.04);
        if (variant === 0) {
          part('ball', 0x35525f, 0, 1.49, headZ - 0.02, 0.73, 0.38, 0.65);
          part('box', 0x35525f, 0, 1.48, headZ + 0.31, 0.68, 0.08, 0.29);
        } else if (variant === 1) {
          part('cone', 0x513353, -0.12, 1.66, headZ - 0.04, 0.28, 0.29, 0.29, -0.2);
          part('box', 0xc39569, -0.22, 0.8, 0.35, 0.09, 0.5, 0.06, -0.15);
        } else {
          part('cylinder', 0xc3a16c, 0, 1.5, headZ, 0.76, 0.19, 0.68);
          part('box', 0xe0cba4, 0, 0.76, 0.35, 0.08, 0.48, 0.04);
        }
      }
      if (runner) {
        part('ball', 0x633d79, 0, 1.25, -0.11, 0.61, 0.6, 0.58);
        part('box', 0xbdde96, 0, 0.91, 0.46, 0.44, 0.13, 0.12);
        part('box', 0x7f9b73, 0.26, 0.9, -0.27, 0.14, 0.09, 0.65, 0, stride * 0.15);
        part('cone', C.pink, 0, 1.48, -0.1, 0.19, 0.4, 0.3, -0.2);
      }
      if (shield) {
        part('ball', 0x415e65, 0, 1.51, headZ - 0.07, 0.78, 0.4, 0.69);
        part('box', 0x819c98, 0, 1.43, headZ + 0.25, 0.73, 0.1, 0.2);
        part('box', 0x253e4c, -0.08, 0.72, 0.63, 1.04, 1.17, 0.17);
        part('box', 0x628b92, -0.08, 0.73, 0.73, 0.84, 0.95, 0.05);
        part('box', C.gold, -0.08, 0.73, 0.77, 0.17, 0.89, 0.04);
        for (const side of [-1, 1])
          part('ball', C.white, -0.08 + side * 0.36, 1.08, 0.78, 0.09, 0.09, 0.06);
      }
      if (boss) {
        for (const side of [-1, 1]) {
          part('ball', 0x354756, side * 0.47, 1.01, 0, 0.45, 0.45, 0.48);
          part('cone', C.gold, side * 0.49, 1.3, 0, 0.22, 0.49, 0.25, -side * 0.5);
          part('cone', C.pink, side * 0.24, 1.74, 0.02, 0.18, 0.36, 0.22, -side * 0.2);
        }
        part('box', 0x354756, 0, 0.83, 0.3, 0.66, 0.54, 0.16);
        part('ball', C.gold, 0, 0.86, 0.42, 0.26, 0.3, 0.12);
      }
    }
  }
  render(state: GameState, alpha: number, shake: boolean) {
    if (state.tick !== this.last.tick) {
      this.previous = state.tick < this.last.tick ? { x: state.x, enemies: new Map() } : this.last;
      this.last = {
        tick: state.tick,
        x: state.x,
        enemies: new Map(state.enemies.map((e) => [e.id, { x: e.x, z: e.z }])),
      };
    }
    const b = this.parts;
    b.reset();
    const time = (state.tick + alpha) / HZ,
      scroll = time * 1.75;
    b.add('cylinder', 0x536866, -4.6, 2.4, -21, 0.12, 4.8, 0.12);
    b.add('cylinder', 0x536866, 4.6, 2.4, -21, 0.12, 4.8, 0.12);
    b.add('box', 0x536866, 0, 4.4, -21, 9.2, 0.13, 0.13);
    b.add('box', 0x91a59b, 0, -0.22, -12, 80, 0.3, 100);
    b.add('box', C.road, 0, -0.05, -12, 10.6, 0.12, 100);
    for (const side of [-1, 1]) {
      b.add('box', 0xd1c6aa, side * 5.85, 0.07, -12, 1.1, 0.25, 90);
      b.add('box', 0xf4e7bc, side * 4.96, 0.015, -12, 0.08, 0.02, 90);
    }
    for (let i = 0; i < 16; i++) {
      const z = ((i * 4 + scroll) % 64) - 44;
      for (const x of [-1.65, 1.65]) b.add('box', C.stripe, x, 0.022, z, 0.09, 0.02, 1.6);
      if (i % 4 === 0)
        for (let k = -4; k < 5; k++) b.add('box', 0xbac2ac, k, 0.026, z, 0.54, 0.02, 1.8);
    }
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1,
        z = ((Math.floor(i / 2) * 12 + scroll) % 48) - 34;
      const x = side * 7.35,
        h = 4.1 + (i % 3);
      b.add('box', [0xcbac8c, 0x94aba6, 0xd8c5a4, 0xaab8a6][i % 4], x, h / 2, z, 3.3, h, 7.6);
      b.add('box', 0x647e78, x, h + 0.1, z, 3.55, 0.3, 7.9);
      b.add('box', 0x4a7375, side * 5.64, 1.08, z, 0.07, 1.9, 5.8);
      b.add('box', i % 2 ? 0xde804b : 0x3d8580, side * 5.25, 2.32, z, 0.9, 0.14, 6.2);
      for (let k = 0; k < 6; k++)
        b.add('box', C.white, side * 5.25, 2.34, z - 2.8 + k, 0.92, 0.15, 0.3);
      for (const dz of [-2.5, 0, 2.5]) {
        b.add('box', 0x42636c, side * 5.67, h - 1.1, z + dz, 0.05, 1.1, 1.2);
        b.add('box', 0xe7d7b4, side * 5.61, h - 1.1, z + dz, 0.04, 1.15, 0.08);
      }
      this.signs[i].position.set(side * 6.05, 2.92, z + 1.1);
      b.add('cylinder', 0x7d7358, side * 5.8, 1.2, z + 4.8, 0.15, 2.5, 0.15);
      b.add('ball', 0x67967c, side * 5.8, 3.0, z + 4.8, 1.8, 1.9, 1.7);
      b.add('ball', 0x84ac80, side * 5.5, 3.5, z + 4.6, 1.3, 1.2, 1.2);
    }
    // A stranded bus, curb-side bollards and red lanterns identify a lived-in street.
    const busZ = ((scroll + 18) % 65) - 37;
    b.add('box', 0xe5ad57, -6.3, 0.95, busZ, 1.1, 1.6, 3.7);
    b.add('box', 0x315763, -6.3, 1.35, busZ + 0.1, 1.15, 0.65, 2.6);
    for (const dz of [-1.3, 1.3]) b.add('cylinder', C.dark, -6.3, 0.32, busZ + dz, 1.3, 0.36, 0.55);
    for (const side of [-1, 1])
      for (let i = 0; i < 7; i++) {
        const z = ((i * 8 + scroll) % 56) - 40;
        b.add('cylinder', 0x586e69, side * 5.25, 0.3, z, 0.2, 0.6, 0.2);
      }
    for (const supply of state.supplies) {
      if (supply.status !== 'active') continue;
      const p = supplyPosition(supply, state.tick + alpha),
        active = state.focus === supply.config.id;
      b.add(
        'box',
        active ? 0xeaa347 : 0x91794d,
        supply.config.side * 3.7,
        0.035,
        7.3,
        1.45,
        0.05,
        4.3,
      );
      for (let i = 0; i < 3; i++)
        b.add(
          'cone',
          active ? 0xffe9a1 : 0xc8b075,
          supply.config.side * 3.7,
          0.09,
          5.5 + i * 1.2,
          0.45,
          0.06,
          0.65,
        );
      const rescue = supply.config.id.includes('rescue'),
        mechanism = supply.config.id === 'scaffold';
      b.add('box', C.dark, p.x, 0.25, p.z, 0.92, 0.5, 0.95);
      b.add('box', rescue ? 0x56aaa1 : C.gold, p.x, 0.67, p.z, 0.96, 0.62, 0.97);
      b.add('box', C.white, p.x, 0.7, p.z + 0.51, 0.14, 0.6, 0.04);
      b.add('box', C.white, p.x, 0.74, p.z + 0.53, 0.55, 0.12, 0.04);
      if (rescue) {
        this.actor(p.x + supply.config.side * 0.55, p.z - 1.5, 0, 0, 'soldier', false);
        for (let k = -1; k <= 1; k++)
          b.add('box', 0x6a7c79, p.x + k * 0.35, 0.85, p.z - 0.6, 0.06, 1.7, 0.08);
      }
      if (mechanism) {
        b.add('box', C.dark, p.x, 2.1, p.z, 0.14, 4, 0.14);
        b.add('box', C.gold, p.x / 2, 4, p.z, 5, 0.2, 0.3);
      }
    }
    const focused = state.supplies.find((s) => s.config.id === state.focus);
    for (const member of state.members.filter((m) => m.hp > 0)) {
      const p = memberPosition(state, member),
        target = focused ? supplyPosition(focused, state.tick) : null;
      const shot = state.effects.findLast(
        (e) => e.kind === 'shot' && state.tick - e.tick < 15 && e.memberId === member.id,
      );
      const aim = target ?? (shot ? { x: shot.toX!, z: shot.toZ! } : null),
        angle = aim ? Math.atan2(p.x - aim.x, p.z - aim.z) : 0;
      const flashing = state.effects.some(
        (e) => e.kind === 'hurt' && state.tick - e.tick < 3 && Math.abs(e.x - p.x) < 0.3,
      );
      this.actor(
        p.x + this.previous.x + (state.x - this.previous.x) * alpha - state.x,
        p.z,
        angle,
        time * 9 + member.id,
        'soldier',
        flashing,
        member.weapon,
        0,
        shot ? Math.max(0, 1 - (state.tick - shot.tick + alpha) / 5) : 0,
      );
    }
    for (const e of state.enemies) {
      const old = this.previous.enemies.get(e.id) ?? e;
      const cycle = (state.tick - e.born) % 210,
        look = randomFor(state.seed, `${e.id}:appearance`),
        attackAge = state.tick - (e.nextAttack - ENEMIES[e.kind].cooldown) + alpha;
      this.actor(
        old.x + (e.x - old.x) * alpha,
        old.z + (e.z - old.z) * alpha,
        0,
        time * (e.kind === 'runner' ? 15 : e.kind === 'shield' ? 5 : 7) + look * Math.PI * 2,
        e.kind,
        state.effects.some(
          (hit) =>
            hit.kind === 'hit' &&
            hit.entityId === e.id &&
            (state.tick - hit.tick + alpha) / HZ >= impactDelay(hit) &&
            (state.tick - hit.tick + alpha) / HZ < impactDelay(hit) + 0.07,
        ),
        'rifle',
        Math.floor(look * 3),
        attackAge >= 0 && attackAge < 8 ? Math.sin((attackAge / 8) * Math.PI) : 0,
      );
      if (e.kind === 'boss') {
        if (cycle >= 60 && cycle < 102)
          b.add('box', cycle % 8 < 4 ? 0xfc7046 : 0xbd563e, e.aimX, 0.048, 3.6, 2.7, 0.04, 13);
        if (cycle >= 140 && cycle < 182)
          b.add(
            'cylinder',
            cycle % 8 < 4 ? 0xf48450 : 0xbd563e,
            e.aimX,
            0.054,
            PLAYER_Z,
            4.3,
            0.055,
            4.3,
          );
      }
    }
    // A fixed visual budget does not change enemy counts or authoritative damage.
    let particles = 0;
    const fx = (...args: Parameters<Parts['add']>) => {
      if (particles >= 280) return;
      particles++;
      b.add(...args);
    };
    for (const e of state.effects.filter((e) => e.kind === 'death').slice(-12)) {
      const age = (state.tick - e.tick + alpha) / HZ - impactDelay(e);
      if (age >= 0.62) continue;
      const fall = Math.max(0, Math.min(1, age / 0.62)),
        dx = e.x - (e.fromX ?? e.x),
        dz = e.z - (e.fromZ ?? e.z + 1),
        length = Math.hypot(dx, dz) || 1;
      this.actor(
        e.x + (dx / length) * fall * 0.55,
        e.z + (dz / length) * fall * 0.55,
        0,
        0,
        e.enemyKind ?? 'walker',
        age >= 0 && age < 0.065,
        'rifle',
        Math.floor(randomFor(state.seed, `${e.entityId}:appearance`) * 3),
        0,
        fall,
      );
    }
    for (const e of state.effects.slice(-120)) {
      const age = (state.tick - e.tick + alpha) / HZ;
      if (e.kind === 'shot' && age < 0.34) {
        const dx = e.toX! - e.x,
          dz = e.toZ! - e.z,
          aim = Math.atan2(dx, dz),
          // The visual starts at the gun barrel; hitscan damage remains in the shared simulation.
          muzzleX = e.x + Math.sin(aim) * 0.95 - Math.cos(aim) * 0.25,
          muzzleZ = e.z + Math.cos(aim) * 0.95 + Math.sin(aim) * 0.25,
          travelX = e.toX! - muzzleX,
          travelZ = e.toZ! - muzzleZ,
          distance = Math.hypot(travelX, travelZ),
          direction = Math.atan2(travelX, travelZ),
          flight = Math.max(0.08, Math.min(0.24, distance / 65)),
          progress = age / flight,
          spread = e.weapon === 'shotgun';
        if (age < 0.065) {
          const flash = (1 - age / 0.065) * (spread ? 1.6 : 1.1);
          fx('ball', 0xfff3bb, muzzleX, 0.82, muzzleZ, 0.22 * flash, 0.22 * flash, 0.22 * flash);
          fx(
            'cone',
            C.gold,
            muzzleX + Math.sin(aim) * 0.15,
            0.82,
            muzzleZ + Math.cos(aim) * 0.15,
            0.2 * flash,
            0.38 * flash,
            0.2 * flash,
            aim,
            0,
            Math.PI / 2,
          );
        }
        if (e.weapon !== 'grenade' && age > 0.03 && age < 0.3) {
          fx(
            'cylinder',
            0xd7a45e,
            e.x - Math.cos(aim) * (0.3 + age * 1.5),
            0.7 + Math.sin(age * 10) * 0.38,
            e.z + Math.sin(aim) * 0.3 + age * 0.7,
            0.065,
            0.17,
            0.065,
            aim,
            age * 20,
            Math.PI / 2,
          );
        }
        if (e.weapon !== 'grenade' && progress < 1) {
          for (const offset of spread ? [-0.18, 0, 0.18] : [0]) {
            const angle = direction + offset,
              x = muzzleX + Math.sin(angle) * distance * progress,
              z = muzzleZ + Math.cos(angle) * distance * progress,
              length = spread ? 0.17 : 0.38,
              radius = spread ? 0.13 : 0.12;
            fx('cylinder', 0xffc452, x, 0.82, z, radius, length, radius, angle, 0, Math.PI / 2);
            fx(
              'cone',
              0xfff0af,
              x + Math.sin(angle) * length * 0.65,
              0.82,
              z + Math.cos(angle) * length * 0.65,
              radius,
              length * 0.45,
              radius,
              angle,
              0,
              Math.PI / 2,
            );
          }
        }
      }
      const impactAge = age - impactDelay(e);
      if (e.kind === 'hit' && impactAge >= 0 && impactAge < 0.22) {
        const t = impactAge / 0.22,
          metal = e.surface !== 'flesh',
          color = metal ? 0xffdc83 : 0xdfb0f2;
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5 + e.id;
          fx(
            metal ? 'cone' : 'ball',
            i === 0 ? 0xffffff : color,
            e.x + Math.cos(angle) * t * 0.65,
            0.85 + Math.sin(angle) * t * 0.5,
            e.z + Math.sin(angle) * t * 0.4,
            (1 - t) * 0.12,
            (1 - t) * (metal ? 0.32 : 0.18),
            (1 - t) * 0.12,
            angle,
            angle,
          );
        }
        if (t < 0.38) fx('ball', 0xfff5d8, e.x, 0.86, e.z, 0.27, 0.27, 0.22);
      }
      if (e.kind === 'death' && impactAge > 0.1 && impactAge < 0.75) {
        const t = (impactAge - 0.1) / 0.65;
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3 + e.id,
            size = (1 - t) * 0.28;
          fx(
            'ball',
            i % 2 ? C.pink : 0xbcabdf,
            e.x + Math.cos(angle) * t * 0.85,
            0.25 + t * (0.65 + i * 0.13),
            e.z + Math.sin(angle) * t * 0.85,
            size,
            size,
            size,
          );
        }
      }
      if (e.kind === 'blast' && age < 0.55) {
        const t = age / 0.55,
          skill = e.label?.startsWith('震荡'),
          radius = (skill ? 7 : 2.5) * Math.sqrt(t),
          color = skill ? 0x95eff2 : C.gold;
        fx('ring', color, e.x, 0.1, e.z, radius * 2, radius * 2, radius * 2, 0, 0, Math.PI / 2);
        if (age < 0.13)
          fx('ball', 0xffebbc, e.x, 0.6, e.z, (1 - t) * 1.2, (1 - t) * 1.3, (1 - t) * 1.2);
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI) / 5,
            size = (1 - t) * 0.28;
          fx(
            'ball',
            i % 2 ? color : 0xb6ada0,
            e.x + Math.cos(angle) * radius,
            0.15 + Math.sin(t * Math.PI) * (0.4 + (i % 3) * 0.35),
            e.z + Math.sin(angle) * radius,
            size,
            size,
            size,
          );
        }
      }
      if (e.kind === 'reward' && age < 0.9) {
        const t = age / 0.9,
          radius = 0.5 + t * 1.1;
        fx('ring', C.gold, e.x, 0.13, e.z, radius * 2, radius * 2, radius * 2, 0, 0, Math.PI / 2);
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4 + t * 2,
            size = (1 - t) * 0.16;
          fx(
            'cone',
            i % 2 ? C.gold : C.white,
            e.x + Math.cos(angle) * radius * 0.65,
            0.5 + t * 2.3 + (i % 2) * 0.2,
            e.z + Math.sin(angle) * radius * 0.65,
            size,
            size * 2,
            size,
            angle,
            t * 4,
          );
        }
      }
    }
    for (const p of state.projectiles) {
      const t = Math.min(1, (state.tick - p.born + alpha) / (p.land - p.born)),
        x = p.fromX + (p.toX - p.fromX) * t,
        z = p.fromZ + (p.toZ - p.fromZ) * t,
        y = 0.9 + Math.sin(t * Math.PI) * 3,
        spin = t * Math.PI * 4;
      b.add('ball', 0x496960, x, y, z, 0.32, 0.42, 0.32, 0, spin);
      b.add('cylinder', C.gold, x, y, z, 0.34, 0.13, 0.34, 0, spin);
      b.add(
        'box',
        0xe0e0c5,
        x - Math.sin(spin) * 0.23,
        y + Math.cos(spin) * 0.23,
        z,
        0.13,
        0.14,
        0.12,
        0,
        spin,
      );
    }
    const impulse = shake
      ? Math.min(
          0.12,
          state.effects.reduce((sum, e) => {
            const age = (state.tick - e.tick + alpha) / HZ;
            if (age >= 0.25) return sum;
            return (
              sum + (e.kind === 'hurt' ? 0.055 : e.kind === 'blast' ? 0.07 : 0) * (1 - age / 0.25)
            );
          }, 0),
        )
      : 0;
    this.camera.position.x = Math.sin(time * 83) * impulse;
    this.camera.position.y = 20 + Math.cos(time * 67) * impulse * 0.4;
    this.effectParts = particles;
    b.flush();
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as T.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
    });
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
