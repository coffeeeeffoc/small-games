import * as cc from 'cc';
import { Batch, rgb, disposeMeshNode } from './Geometry.ts';
import { material } from './Materials.ts';
import {
  sampleRoute,
  lanePosition,
  segmentInfo,
  hash,
  waveAt,
  WAVE_SPACING,
  GAP,
} from './core/route.ts';
import { visibleObstacles, visibleCoins, RULES } from './core/simulation.ts';
import type { Run } from './core/simulation.ts';

const SKY = new cc.Color(186, 209, 212, 255);
const radians = 180 / Math.PI;
class Runner {
  root: cc.Node;
  joints = new Map<string, cc.Node>();
  time = 0;
  constructor(parent: cc.Node, art: any, mat: cc.Material, thief = false) {
    this.root = new cc.Node(thief ? 'Orange thief' : 'Blue runner');
    parent.addChild(this.root);
    for (const bone of art.rig) {
      const n = new cc.Node(bone.name);
      (bone.parent ? this.joints.get(bone.parent)! : this.root).addChild(n);
      n.setPosition(...bone.position);
      this.joints.set(bone.name, n);
      const b = new Batch();
      const mesh = thief ? JSON.parse(JSON.stringify(bone.mesh)) : bone.mesh;
      if (thief)
        for (let i = 0; i < mesh.colors.length; i += 4) {
          const [r, g, v] = mesh.colors.slice(i, i + 3);
          if (v > g * 1.25 && g > r * 1.3) {
            mesh.colors[i] = 0.88;
            mesh.colors[i + 1] = 0.33;
            mesh.colors[i + 2] = 0.075;
          }
        }
      b.add(mesh);
      b.node(bone.name + ' mesh', n, mat);
    }
  }
  pose(time: number, speed: number, action: string, height: number, thief = false, lost = false) {
    this.time = time;
    const phase = time * speed * 1.55;
    const swing = Math.sin(phase);
    const hips = this.joints.get('hips')!;
    hips.setPosition(0, 0.91 + (action === 'run' ? Math.abs(Math.sin(phase)) * 0.035 : 0), 0);
    for (const n of this.joints.values()) n.setRotationFromEuler(0, 0, 0);
    this.joints
      .get('spine')!
      .setRotationFromEuler(
        15 + Math.max(0, speed - RULES.startSpeed) * 0.6,
        Math.sin(phase) * 3,
        Math.sin(phase) * 2,
      );
    for (const side of ['L', 'R']) {
      const v = side === 'L' ? swing : -swing;
      this.joints.get('thigh' + side)!.setRotationFromEuler(v * 37, 0, 0);
      this.joints.get('shin' + side)!.setRotationFromEuler(Math.max(0, -v) * 67, 0, 0);
      this.joints.get('arm' + side)!.setRotationFromEuler(-v * 40, 0, side === 'L' ? 5 : -5);
      this.joints.get('fore' + side)!.setRotationFromEuler(-50 - Math.max(0, v) * 18, 0, 0);
      this.joints.get('foot' + side)!.setRotationFromEuler(-v * 14, 0, 0);
    }
    if (action === 'jump') {
      this.joints.get('thighL')!.setRotationFromEuler(-40, 0, 0);
      this.joints.get('thighR')!.setRotationFromEuler(15, 0, 0);
      this.joints.get('shinL')!.setRotationFromEuler(65, 0, 0);
      this.joints.get('shinR')!.setRotationFromEuler(80, 0, 0);
      this.joints.get('armL')!.setRotationFromEuler(-65, 0, 15);
      this.joints.get('armR')!.setRotationFromEuler(-40, 0, -20);
    }
    if (action === 'slide') {
      hips.setPosition(0, 0.4, 0);
      this.joints.get('spine')!.setRotationFromEuler(-65, 0, 0);
      for (const side of ['L', 'R']) {
        this.joints.get('thigh' + side)!.setRotationFromEuler(-65, 0, 0);
        this.joints.get('shin' + side)!.setRotationFromEuler(15, 0, 0);
        this.joints.get('arm' + side)!.setRotationFromEuler(20, 0, side === 'L' ? 20 : -20);
      }
    }
    if (thief) {
      this.joints.get('head')!.setRotationFromEuler(0, Math.sin(time * 0.65) > 0.85 ? -65 : 0, 0);
    }
    if (lost) {
      hips.setPosition(0, 0.48, 0);
      this.joints.get('spine')!.setRotationFromEuler(48, 0, 0);
      this.joints.get('thighL')!.setRotationFromEuler(-70, 0, 0);
      this.joints.get('shinL')!.setRotationFromEuler(95, 0, 0);
      this.joints.get('thighR')!.setRotationFromEuler(15, 0, 0);
    }
  }
}
export class World {
  root: cc.Node;
  camera: cc.Camera;
  chunks = new Map<number, cc.Node>();
  objects = new Map<string, cc.Node>();
  meshes = new Map<string, cc.Mesh>();
  contactMesh: cc.Mesh;
  playerShadow: cc.Node;
  thiefShadow: cc.Node;
  solid: cc.Material;
  facade: cc.Material;
  road: cc.Material;
  shadow: cc.Material;
  player: Runner;
  thief: Runner;
  thiefLaneVisual = 1;
  origin = 0;
  seed = 0;
  departure = '';
  cameraReady = false;
  art: any;
  scene: cc.Scene;
  constructor(scene: cc.Scene, art: any, texture: cc.Texture2D) {
    this.scene = scene;
    this.art = art;
    this.solid = material('city-solid');
    this.facade = material('city-facade', texture);
    this.road = material('city-road');
    this.shadow = material('city-shadow');
    this.root = new cc.Node('City world');
    scene.addChild(this.root);
    const cam = new cc.Node('Follow camera');
    scene.addChild(cam);
    this.camera = cam.addComponent(cc.Camera);
    this.camera.projection = cc.Camera.ProjectionType.PERSPECTIVE;
    this.camera.fov = 57;
    this.camera.near = 0.15;
    this.camera.far = 190;
    this.camera.visibility = cc.Layers.Enum.DEFAULT;
    this.camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = SKY;
    this.player = new Runner(this.root, art, this.solid);
    this.thief = new Runner(this.root, art, this.solid, true);
    const contact = new Batch();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2,
        b = ((i + 1) / 20) * Math.PI * 2;
      contact.quad(
        [
          [0, 0, 0],
          [Math.cos(a), 0, Math.sin(a)],
          [Math.cos(b), 0, Math.sin(b)],
          [0, 0, 0],
        ],
        [0.12, 0.17, 0.15, 0.22],
        [0, 1, 0],
      );
    }
    this.contactMesh = cc.utils.createMesh(contact.data as any, undefined, {
      calculateBounds: true,
    });
    this.playerShadow = this.contact(this.root, 0.48, 0.28);
    this.thiefShadow = this.contact(this.root, 0.48, 0.28);
    for (const [name, data] of Object.entries(art.meshes)) {
      const mesh = name === 'barrel' ? JSON.parse(JSON.stringify(data)) : data;
      if (name === 'barrel')
        for (let i = 1; i < mesh.positions.length; i += 3) mesh.positions[i] -= 0.35;
      this.meshes.set(name, cc.utils.createMesh(mesh as any, undefined, { calculateBounds: true }));
    }
  }
  contact(parent: cc.Node, x: number, z: number) {
    const n = new cc.Node('Contact shadow');
    parent.addChild(n);
    n.setScale(x, 1, z);
    n.setPosition(0, 0.028, 0);
    const r = n.addComponent(cc.MeshRenderer);
    r.setMaterial(this.shadow, 0);
    r.mesh = this.contactMesh;
    return n;
  }
  reset(run: Run) {
    for (const n of this.chunks.values()) disposeMeshNode(n);
    this.chunks.clear();
    for (const n of this.objects.values()) this.releaseObject(n);
    this.objects.clear();
    this.seed = run.seed;
    this.departure = run.departure;
    this.cameraReady = false;
    this.thiefLaneVisual = 1;
  }
  chunk(index: number, run: Run) {
    const parent = new cc.Node('Street ' + index);
    this.root.addChild(parent);
    const start = index * 40;
    const gaps = [];
    for (
      let wave = Math.max(0, Math.floor((start - GAP.length - 38) / WAVE_SPACING));
      38 + wave * WAVE_SPACING < start + 40 + GAP.length;
      wave++
    ) {
      gaps.push(...waveAt(wave, run.seed, run.departure).filter((o) => o.type === 'gap'));
    }
    const solids = new Batch(),
      facades = new Batch(),
      road = new Batch(),
      shadows = new Batch();
    const point = (s: number, offset: number, dy = 0) => {
      const p = sampleRoute(s, run.seed, run.departure);
      return [p.x + Math.cos(p.heading) * offset, p.y + dy, p.z - Math.sin(p.heading) * offset];
    };
    for (let s = start; s < start + 40; s += 2) {
      const a = sampleRoute(s, run.seed, run.departure),
        b = sampleRoute(s + 2, run.seed, run.departure);
      const color = rgb(
        a.district === 'market' ? '#b7a284' : a.district === 'alley' ? '#a9a79c' : '#b8ad96',
      );
      for (const lane of [0, 1, 2]) {
        const hole = gaps.find(
          (o) => o.lane === lane && s >= o.at - GAP.length / 2 && s < o.at + GAP.length / 2,
        );
        const center = 1 - lane,
          left = center - GAP.width / 2,
          right = center + GAP.width / 2;
        const bands = hole
          ? [
              [center - 0.5, left],
              [right, center + 0.5],
            ]
          : [[center - 0.5, center + 0.5]];
        for (const [lo, hi] of bands) {
          road.quad(
            [
              point(s, (lo * a.width) / 3),
              point(s, (hi * a.width) / 3),
              point(s + 2, (hi * b.width) / 3),
              point(s + 2, (lo * b.width) / 3),
            ],
            color,
            [0, 1, 0],
            [
              (lo * a.width) / 3,
              s,
              (hi * a.width) / 3,
              s,
              (hi * b.width) / 3,
              s + 2,
              (lo * b.width) / 3,
              s + 2,
            ],
          );
        }
        if (!hole) continue;
        const edge = (at: number, lateral: number, depth = 0) =>
          point(at, lateral * sampleRoute(at, run.seed, run.departure).laneWidth, depth);
        solids.quad(
          [
            edge(s, left, -GAP.depth),
            edge(s, right, -GAP.depth),
            edge(s + 2, right, -GAP.depth),
            edge(s + 2, left, -GAP.depth),
          ],
          rgb('#101719'),
          [0, 1, 0],
        );
        for (const side of [left, right]) {
          for (let layer = 0; layer < 3; layer++)
            solids.quad(
              [
                edge(s, side, (-layer * GAP.depth) / 3),
                edge(s + 2, side, (-layer * GAP.depth) / 3),
                edge(s + 2, side, (-(layer + 1) * GAP.depth) / 3),
                edge(s, side, (-(layer + 1) * GAP.depth) / 3),
              ],
              rgb(['#70583f', '#3d332b', '#171d1e'][layer]),
              [side === left ? 1 : -1, 0, 0],
            );
          for (let z = s; z < s + 2; z += 0.5) {
            const lip = edge(z + 0.25, side);
            solids.box(lip[0], lip[1] - 0.04, lip[2], 0.16, 0.17, 0.44, rgb('#b6aa90'), a.heading);
          }
        }
        for (const z of [s, s + 2]) {
          if (Math.abs(z - hole.at) !== GAP.length / 2) continue;
          for (let layer = 0; layer < 3; layer++)
            solids.quad(
              [
                edge(z, left, (-layer * GAP.depth) / 3),
                edge(z, right, (-layer * GAP.depth) / 3),
                edge(z, right, (-(layer + 1) * GAP.depth) / 3),
                edge(z, left, (-(layer + 1) * GAP.depth) / 3),
              ],
              rgb(['#927654', '#4b3b2b', '#1a2020'][layer]),
              [0, 0, z < hole.at ? 1 : -1],
            );
          for (let k = 0; k < 6; k++) {
            const lip = edge(z, left + (GAP.width * (k + 0.5)) / 6);
            const rough = hash(hole.wave * 31 + k, run.seed);
            solids.box(
              lip[0],
              lip[1] - 0.06,
              lip[2],
              (a.laneWidth * GAP.width) / 6 - 0.025,
              0.18 + rough * 0.08,
              0.2 + rough * 0.12,
              rgb(k % 2 ? '#b4a487' : '#c9b99a'),
              a.heading,
            );
          }
          for (const side of [-1, 1]) {
            const marker = edge(z + (z < hole.at ? -0.3 : 0.3), center + side * 0.34);
            solids.box(
              marker[0],
              marker[1] + 0.025,
              marker[2],
              0.45,
              0.04,
              0.24,
              rgb('#e5b63e'),
              a.heading,
            );
            solids.box(
              marker[0],
              marker[1] + 0.049,
              marker[2],
              0.12,
              0.01,
              0.25,
              rgb('#302e26'),
              a.heading,
            );
          }
        }
      }
      for (const side of [-1, 1]) {
        solids.quad(
          [
            point(s, side * (a.width / 2 + 0.02), 0.1),
            point(s, side * (a.width / 2 + 1.1), 0.1),
            point(s + 2, side * (b.width / 2 + 1.1), 0.1),
            point(s + 2, side * (b.width / 2 + 0.02), 0.1),
          ],
          rgb('#bdb7a4'),
          [0, 1, 0],
        );
        solids.quad(
          [
            point(s, (side * a.width) / 2, 0.025),
            point(s, side * (a.width / 2 + 0.1), 0.025),
            point(s + 2, side * (b.width / 2 + 0.1), 0.025),
            point(s + 2, (side * b.width) / 2, 0.025),
          ],
          rgb('#e1d8bc'),
          [0, 1, 0],
        );
      }
      if (a.split > 0.58) {
        solids.quad(
          [
            point(s, -0.8, 0.38),
            point(s, 0.8, 0.38),
            point(s + 2, 0.8, 0.38),
            point(s + 2, -0.8, 0.38),
          ],
          rgb('#d2c8ae'),
          [0, 1, 0],
        );
        solids.quad(
          [
            point(s, -0.8, 0),
            point(s, -0.8, 0.38),
            point(s + 2, -0.8, 0.38),
            point(s + 2, -0.8, 0),
          ],
          rgb('#8a8c73'),
          [-1, 0, 0],
        );
        solids.quad(
          [point(s, 0.8, 0.38), point(s, 0.8, 0), point(s + 2, 0.8, 0), point(s + 2, 0.8, 0.38)],
          rgb('#8a8c73'),
          [1, 0, 0],
        );
      }
    }
    for (let s = start + 5; s < start + 40; s += 10) {
      const p = sampleRoute(s, run.seed, run.departure),
        info = segmentInfo(p.index, run.seed, run.departure);
      const yaw = p.heading;
      for (const side of [-1, 1]) {
        const r = hash(Math.floor(s) * 7 + side, run.seed),
          variant = Math.floor(r * 6);
        const height = 8.7 + hash(Math.floor(s) * 9 + side, run.seed) * 4.4;
        const length = 9.5,
          front = p.width / 2 + 1.35,
          depth = 5.8;
        const q = point(s, side * (front + depth / 2));
        const wall = rgb(
          ['#cfbea0', '#d3ac8b', '#afafa0', '#cabb8e', '#a9b8a7', '#d6cbb4'][variant],
        );
        solids.box(q[0], p.y + height / 2, q[2], depth, height, length, wall, yaw);
        for (const dy of [0.25, height / 3, (height * 2) / 3, height]) {
          const e = point(s, side * (front + depth / 2 - 0.12));
          solids.box(e[0], p.y + dy, e[2], depth + 0.3, 0.16, length + 0.08, rgb('#dbd1b9'), yaw);
        }
        const roof = point(s, side * (front + depth / 2));
        solids.box(
          roof[0],
          p.y + height + 0.18,
          roof[2],
          depth + 0.5,
          0.3,
          length + 0.4,
          rgb('#9d573c'),
          yaw,
        );
        for (let k = -2; k <= 2; k++) {
          const tile = point(s + k * 1.9, side * (front + depth / 2));
          solids.box(
            tile[0],
            p.y + height + 0.37,
            tile[2],
            depth + 0.46,
            0.1,
            0.14,
            rgb('#b66c49'),
            yaw,
          );
        }
        // Front wall is a true plane on a 3D building, with separate physical trim and props.
        const wallPoint = (along: number) => [
          p.x + Math.cos(yaw) * side * (front - 0.025) + Math.sin(yaw) * along,
          p.y,
          p.z - Math.sin(yaw) * side * (front - 0.025) + Math.cos(yaw) * along,
        ];
        const a = wallPoint(-length / 2),
          b = wallPoint(length / 2);
        const col = variant % 3,
          row = Math.floor(variant / 3);
        const u0 = (col + 0.008) / 3,
          u1 = (col + 1 - 0.008) / 3,
          v0 = 1 - (row + 1 - 0.006) / 2,
          v1 = 1 - (row + 0.006) / 2;
        facades.quad(
          [
            [a[0], p.y, a[2]],
            [b[0], p.y, b[2]],
            [b[0], p.y + height, b[2]],
            [a[0], p.y + height, a[2]],
          ],
          [1, 1, 1, 1],
          [-side * Math.cos(yaw), 0, side * Math.sin(yaw)],
          [u0, v0, u1, v0, u1, v1, u0, v1],
        );
        if (r > 0.25) {
          const aw = point(s, side * (front - 0.55));
          for (let k = 0; k < 6; k++) {
            const ap = point(s - 2.25 + k * 0.9, side * (front - 0.55));
            solids.box(
              ap[0],
              p.y + 2.55,
              ap[2],
              1.25,
              0.11,
              0.9,
              rgb(k % 2 ? '#ded4b6' : variant % 2 ? '#8e4937' : '#375b4e'),
              yaw,
            );
            const fringe = point(s - 2.25 + k * 0.9, side * (front - 1.18));
            solids.box(
              fringe[0],
              p.y + 2.38,
              fringe[2],
              0.08,
              0.32,
              0.88,
              rgb(k % 2 ? '#e2d8bd' : '#375b4e'),
              yaw,
            );
          }
        }
        const ac = point(s + 2.8, side * (front - 0.22));
        solids.add(this.art.meshes.aircon, ac[0], p.y + 3.8, ac[2], 1, yaw - (side * Math.PI) / 2);
        const pot = point(s - 3.8, side * (p.width / 2 + 0.65));
        solids.add(this.art.meshes.pot, pot[0], p.y + 0.1, pot[2], 1.4, yaw);
        const prop = point(s + 3.5, side * (p.width / 2 + 0.68));
        const propName =
          p.district === 'market' && r > 0.35
            ? 'stall'
            : r > 0.75
              ? 'bench'
              : r > 0.45
                ? 'tree'
                : 'lamp';
        solids.add(
          this.art.meshes[propName],
          prop[0],
          p.y + 0.1,
          prop[2],
          propName === 'stall' ? 0.75 : 1,
          yaw - (side * Math.PI) / 2,
        );
        const shadeA = point(s - 4, (side * p.width) / 2, 0.012),
          shadeB = point(s + 4, (side * p.width) / 2, 0.012);
        const shadeC = point(s + 5, side * (p.width / 2 - 1.35), 0.012),
          shadeD = point(s - 3, side * (p.width / 2 - 1.35), 0.012);
        if (!gaps.some((o) => Math.abs(o.at - s) < 7))
          shadows.quad([shadeA, shadeB, shadeC, shadeD], [0.15, 0.2, 0.19, 0.18], [0, 1, 0]);
      }
      if (p.split > 0.65) {
        solids.add(this.art.meshes.pot, p.x, p.y + 0.38, p.z, 0.9, yaw);
      }
      // Occasional overhead street wires are world geometry, never fixed screen decorations.
      if (Math.floor(s / 10) % 4 === 1) {
        for (let k = 0; k < 10; k++) {
          const t0 = k / 10,
            t1 = (k + 1) / 10;
          const a = point(s, (t0 - 0.5) * (p.width + 3), 6.8 - Math.sin(t0 * Math.PI) * 0.65);
          const b = point(s, (t1 - 0.5) * (p.width + 3), 6.8 - Math.sin(t1 * Math.PI) * 0.65);
          solids.box(
            (a[0] + b[0]) / 2,
            (a[1] + b[1]) / 2,
            (a[2] + b[2]) / 2,
            (p.width + 3) / 10,
            0.025,
            0.025,
            rgb('#383f38'),
            yaw,
          );
        }
      }
      if (info.landmark && Math.floor(s) % 80 < 10) {
        const q = point(s, p.width / 2 + 6);
        solids.box(q[0], p.y + 9, q[2], 3.5, 18, 3.5, rgb('#c9bc98'), yaw);
        for (const h of [12, 15, 18])
          solids.box(q[0], p.y + h, q[2], 5, 0.35, 5, rgb('#875039'), yaw);
      }
    }
    road.node('Paved road', parent, this.road);
    solids.node('Architecture and props', parent, this.solid);
    facades.node('Shop facades', parent, this.facade);
    shadows.node('Street shadows', parent, this.shadow);
    return parent;
  }
  object(id: string, type: string) {
    let n = this.objects.get(id);
    if (n) return n;
    n = new cc.Node(type + ' ' + id);
    this.root.addChild(n);
    const r = n.addComponent(cc.MeshRenderer);
    r.setMaterial(this.solid, 0);
    r.mesh = this.meshes.get(type)!;
    if (type !== 'coin' && type !== 'barrel') this.contact(n, type === 'beam' ? 1.3 : 0.7, 0.6);
    this.objects.set(id, n);
    return n;
  }
  releaseObject(n: cc.Node) {
    n.destroy();
  }
  update(run: Run, dt: number, home = false, reducedMotion = false) {
    if (run.seed !== this.seed || run.departure !== this.departure) this.reset(run);
    const first = Math.floor((run.s - 36) / 40),
      last = Math.floor((run.s + 150) / 40);
    for (let i = first; i <= last; i++)
      if (!this.chunks.has(i)) this.chunks.set(i, this.chunk(i, run));
    for (const [i, n] of this.chunks)
      if (i < first || i > last) {
        disposeMeshNode(n);
        this.chunks.delete(i);
      }
    const active = new Set<string>();
    for (const o of visibleObstacles(run)) {
      if (o.type === 'gap') continue; // Trenches belong to the cut road mesh and share its lifetime.
      active.add(o.id);
      const p = sampleRoute(o.at, run.seed, run.departure);
      const at = lanePosition(
        o.at,
        o.lane + o.offset / (p.laneWidth + p.split * 1.7),
        run.seed,
        run.departure,
      );
      const n = this.object(o.id, o.type);
      if (o.fullWidth) n.setScale((p.laneWidth + 0.08) / (o.type === 'beam' ? 2.3 : 1.9), 1, 1);
      n.setPosition(at.x, at.y, at.z);
      n.setRotationFromEuler(0, at.heading * radians, 0);
      if (o.type === 'barrel') {
        n.setPosition(at.x, at.y + 0.37, at.z);
        n.setRotationFromEuler(0, at.heading * radians, run.elapsed * 160);
      }
    }
    for (const c of visibleCoins(run)) {
      active.add(c.id);
      const p = lanePosition(c.at, c.lane, run.seed, run.departure),
        n = this.object(c.id, 'coin');
      n.setPosition(p.x, p.y + 0.65 + Math.sin(run.elapsed * 3 + c.at) * 0.08, p.z);
      n.setRotationFromEuler(0, run.elapsed * 100 + c.at * 17, 0);
      n.setScale(0.8, 0.8, 0.8);
    }
    for (const [id, n] of this.objects)
      if (!active.has(id)) {
        this.releaseObject(n);
        this.objects.delete(id);
      }
    const p = lanePosition(run.s, run.laneVisual, run.seed, run.departure);
    this.playerShadow.setPosition(p.x, p.y + 0.028, p.z);
    this.playerShadow.setScale(
      0.48 / (1 + run.jumpHeight * 0.2),
      1,
      0.28 / (1 + run.jumpHeight * 0.2),
    );
    this.player.root.setPosition(p.x, p.y + run.jumpHeight, p.z);
    this.player.root.setRotationFromEuler(0, p.heading * radians, 0);
    this.player.pose(
      run.elapsed,
      run.speed,
      run.action,
      run.jumpHeight,
      false,
      run.phase === 'lost',
    );
    const ts = run.s + run.thiefDistance,
      tp = sampleRoute(ts, run.seed, run.departure);
    let thiefLane =
      tp.split > 0.4
        ? segmentInfo(tp.index, run.seed, run.departure).riskSide
        : 1 + Math.sin(run.elapsed * 0.6) * 0.55;
    const solidAhead = run.obstacles.find(
      (o) =>
        o.at > ts - 3 &&
        o.at < ts + 12 &&
        ['crate', 'cart'].includes(o.type) &&
        Math.abs(o.lane - thiefLane) < 0.8,
    );
    if (solidAhead && tp.split < 0.1) {
      const safe = [0, 1, 2].find(
        (lane) => !run.obstacles.some((o) => Math.abs(o.at - solidAhead.at) < 1 && o.lane === lane),
      );
      if (safe !== undefined) thiefLane = safe;
    }
    this.thiefLaneVisual += (thiefLane - this.thiefLaneVisual) * (1 - Math.exp(-dt * 7));
    const t = lanePosition(ts, this.thiefLaneVisual, run.seed, run.departure);
    const next = run.obstacles.find(
      (o) => o.at > ts - 2 && o.at < ts + 3 && Math.abs(o.lane - thiefLane) < 0.7,
    );
    let action = 'run',
      jump = 0;
    if (next && ['barrier', 'gap', 'barrel'].includes(next.type)) {
      action = 'jump';
      jump = Math.max(0, Math.sin(((3 - (next.at - ts)) / 5) * Math.PI)) * 1.4;
    }
    if (next?.type === 'beam') action = 'slide';
    this.thiefShadow.setPosition(t.x, t.y + 0.028, t.z);
    this.thief.root.setPosition(t.x, t.y + jump, t.z);
    this.thief.root.setRotationFromEuler(0, t.heading * radians, 0);
    this.thief.pose(run.elapsed + 0.33, run.speed, action, jump, true);
    const origin = Math.floor(run.s / 400) * 400,
      delta = origin - this.origin;
    if (delta && this.cameraReady) {
      const c = this.camera.node.position;
      this.camera.node.setPosition(c.x, c.y, c.z - delta);
    }
    this.origin = origin;
    this.root.setPosition(0, 0, -this.origin);
    const back = sampleRoute(run.s - (home ? 6.5 : 6.0), run.seed, run.departure);
    const current = sampleRoute(run.s, run.seed, run.departure);
    const follow = (1 - run.laneVisual) * (current.laneWidth + current.split * 1.7) * 0.88;
    const ahead = sampleRoute(run.s + 10, run.seed, run.departure);
    const sway =
      !reducedMotion && !home && run.phase === 'running'
        ? Math.sin(run.elapsed * run.speed * 1.55) * 0.025
        : 0;
    const desired = new cc.Vec3(
      back.x + Math.cos(back.heading) * follow,
      back.y + (home ? 3.2 : 3.65) + sway,
      back.z - Math.sin(back.heading) * follow - this.origin,
    );
    const camera = this.camera.node;
    if (!this.cameraReady) {
      camera.setPosition(desired);
      this.cameraReady = true;
    } else {
      const v = new cc.Vec3();
      cc.Vec3.lerp(v, camera.position, desired, 1 - Math.exp(-dt * 12));
      camera.setPosition(v);
    }
    camera.lookAt(
      new cc.Vec3(
        ahead.x + Math.cos(ahead.heading) * follow,
        ahead.y + 1.15,
        ahead.z - Math.sin(ahead.heading) * follow - this.origin,
      ),
    );
    this.camera.fov =
      reducedMotion || home ? 57 : 60 + Math.max(0, run.speed - RULES.startSpeed) * 0.65;
  }
  stats() {
    return {
      chunks: this.chunks.size,
      objects: this.objects.size,
      renderers: this.root.getComponentsInChildren(cc.MeshRenderer).length,
    };
  }
  destroy() {
    for (const n of this.chunks.values()) disposeMeshNode(n);
    for (const r of [this.player, this.thief]) disposeMeshNode(r.root);
    for (const n of this.objects.values()) {
      this.releaseObject(n);
    }
    this.contactMesh.destroy();
    for (const m of this.meshes.values()) m.destroy();
    this.camera.node.destroy();
    this.root.destroy();
    for (const m of [this.solid, this.facade, this.road, this.shadow]) m.destroy();
  }
}
