import * as cc from '../vendor/cocos/cc.js';
import { Batch, rgb, disposeMeshNode } from './Geometry.js';
import { material } from './Materials.js';
import {
  sampleRoute,
  lanePosition,
  segmentInfo,
  hash,
  waveAt,
  WAVE_SPACING,
  GAP,
} from './core/route.js';
import { visibleObstacles, visibleCoins, RULES } from './core/simulation.js';
                                                

const SKY = new cc.Color(166, 207, 225, 255);
const DISTRICT_STYLE = {
  'old-town': { facades: [0, 1], height: 9, road: '#c7b99b', tint: [1, 0.96, 0.88, 1] },
  alley: { facades: [2, 4], height: 5.6, road: '#8e9ba3', tint: [0.65, 0.73, 0.8, 1] },
  market: { facades: [3, 5], height: 7, road: '#c59b75', tint: [1, 0.88, 0.71, 1] },
};
const radians = 180 / Math.PI;
class Runner {
  root         ;
  joints = new Map                 ();
  time = 0;
  constructor(parent         , art     , mat             , thief = false) {
    this.root = new cc.Node(thief ? 'Orange thief' : 'Blue runner');
    parent.addChild(this.root);
    for (const bone of art.rig) {
      const n = new cc.Node(bone.name);
      (bone.parent ? this.joints.get(bone.parent)  : this.root).addChild(n);
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
  pose(time        , speed        , action        , height        , thief = false, lost = false) {
    this.time = time;
    const phase = time * (9.5 + speed * 0.35);
    const swing = Math.sin(phase);
    const hips = this.joints.get('hips') ;
    hips.setPosition(0, 0.91 + (action === 'run' ? Math.abs(Math.sin(phase)) * 0.025 : 0), 0);
    for (const n of this.joints.values()) n.setRotationFromEuler(0, 0, 0);
    this.joints
      .get('spine') 
      .setRotationFromEuler(
        9 + Math.max(0, speed - RULES.startSpeed) * 0.35,
        Math.sin(phase) * 5,
        Math.sin(phase) * 1.5,
      );
    for (const side of ['L', 'R']) {
      const v = side === 'L' ? swing : -swing;
      this.joints.get('thigh' + side) .setRotationFromEuler(v * 32 - 4, 0, 0);
      this.joints.get('shin' + side) .setRotationFromEuler(8 + Math.max(0, -v) * 60, 0, 0);
      this.joints.get('arm' + side) .setRotationFromEuler(-v * 28, 0, side === 'L' ? 7 : -7);
      this.joints.get('fore' + side) .setRotationFromEuler(-65 - Math.max(0, v) * 12, 0, 0);
      this.joints.get('foot' + side) .setRotationFromEuler(-v * 14, 0, 0);
    }
    if (action === 'jump') {
      this.joints.get('thighL') .setRotationFromEuler(-40, 0, 0);
      this.joints.get('thighR') .setRotationFromEuler(15, 0, 0);
      this.joints.get('shinL') .setRotationFromEuler(65, 0, 0);
      this.joints.get('shinR') .setRotationFromEuler(80, 0, 0);
      this.joints.get('armL') .setRotationFromEuler(-65, 0, 15);
      this.joints.get('armR') .setRotationFromEuler(-40, 0, -20);
    }
    if (action === 'slide') {
      hips.setPosition(0, 0.4, 0);
      this.joints.get('spine') .setRotationFromEuler(-65, 0, 0);
      for (const side of ['L', 'R']) {
        this.joints.get('thigh' + side) .setRotationFromEuler(-65, 0, 0);
        this.joints.get('shin' + side) .setRotationFromEuler(15, 0, 0);
        this.joints.get('arm' + side) .setRotationFromEuler(20, 0, side === 'L' ? 20 : -20);
      }
    }
    if (thief) {
      this.joints.get('head') .setRotationFromEuler(0, Math.sin(time * 0.65) > 0.85 ? -65 : 0, 0);
    }
    if (action === 'idle') {
      hips.setPosition(0, 0.90 + Math.sin(time * 1.6) * 0.006, 0);
      this.joints.get('spine') .setRotationFromEuler(5, -8, -3);
      this.joints.get('head') .setRotationFromEuler(-3, 18, 0);
      this.joints.get('thighL') .setRotationFromEuler(-12, 0, -3);
      this.joints.get('thighR') .setRotationFromEuler(9, 0, 3);
      this.joints.get('shinL') .setRotationFromEuler(12, 0, 0);
      this.joints.get('shinR') .setRotationFromEuler(8, 0, 0);
      this.joints.get('armL') .setRotationFromEuler(-18, 0, 8);
      this.joints.get('armR') .setRotationFromEuler(15, 0, -8);
      this.joints.get('foreL') .setRotationFromEuler(-65, 0, 0);
      this.joints.get('foreR') .setRotationFromEuler(-35, 0, 0);
    }
    if (lost) {
      hips.setPosition(0, 0.48, 0);
      this.joints.get('spine') .setRotationFromEuler(48, 0, 0);
      this.joints.get('thighL') .setRotationFromEuler(-70, 0, 0);
      this.joints.get('shinL') .setRotationFromEuler(95, 0, 0);
      this.joints.get('thighR') .setRotationFromEuler(15, 0, 0);
    }
  }
}
export class World {
  root         ;
  camera           ;
  chunks = new Map                 ();
  objects = new Map                 ();
  meshes = new Map                 ();
  contactMesh         ;
  playerShadow         ;
  thiefShadow         ;
  solid             ;
  facade             ;
  road             ;
  shadow             ;
  player        ;
  thief        ;
  thiefLaneVisual = 1;
  origin = 0;
  seed = 0;
  departure = '';
  cameraReady = false;
  homeTime = 0;
  art     ;
  scene          ;
  constructor(scene          , art     , texture              ) {
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
    this.contactMesh = cc.utils.createMesh(contact.data       , undefined, {
      calculateBounds: true,
    });
    this.playerShadow = this.contact(this.root, 0.48, 0.28);
    this.thiefShadow = this.contact(this.root, 0.48, 0.28);
    for (const [name, data] of Object.entries(art.meshes)) {
      const mesh = name === 'barrel' ? JSON.parse(JSON.stringify(data)) : data;
      if (name === 'barrel')
        for (let i = 1; i < mesh.positions.length; i += 3) mesh.positions[i] -= 0.35;
      this.meshes.set(name, cc.utils.createMesh(mesh       , undefined, { calculateBounds: true }));
    }
  }
  contact(parent         , x        , z        ) {
    const n = new cc.Node('Contact shadow');
    parent.addChild(n);
    n.setScale(x, 1, z);
    n.setPosition(0, 0.028, 0);
    const r = n.addComponent(cc.MeshRenderer);
    r.setMaterial(this.shadow, 0);
    r.mesh = this.contactMesh;
    return n;
  }
  reset(run     ) {
    for (const n of this.chunks.values()) disposeMeshNode(n);
    this.chunks.clear();
    for (const n of this.objects.values()) this.releaseObject(n);
    this.objects.clear();
    this.seed = run.seed;
    this.departure = run.departure;
    this.cameraReady = false;
    this.thiefLaneVisual = 1;
  }
  chunk(index        , run     ) {
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
    const point = (s        , offset        , dy = 0) => {
      const p = sampleRoute(s, run.seed, run.departure);
      return [p.x + Math.cos(p.heading) * offset, p.y + dy, p.z - Math.sin(p.heading) * offset];
    };
    for (let s = start; s < start + 40; s += 2) {
      const a = sampleRoute(s, run.seed, run.departure),
        b = sampleRoute(s + 2, run.seed, run.departure);
      const color = rgb(DISTRICT_STYLE[a.district].road);
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
        const edge = (at        , lateral        , depth = 0) =>
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
      const style = DISTRICT_STYLE[p.district];
      for (const side of [-1, 1]) {
        const r = hash(Math.floor(s) * 7 + side, run.seed),
          variant = style.facades[Math.floor(r * style.facades.length)];
        const height = style.height + hash(Math.floor(s) * 9 + side, run.seed) * 2.8;
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
        const wallPoint = (along        ) => [
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
          style.tint,
          [-side * Math.cos(yaw), 0, side * Math.sin(yaw)],
          [u0, v0, u1, v0, u1, v1, u0, v1],
        );
        if (p.district !== 'alley' && (p.district === 'market' || r > 0.25)) {
          for (let k = 0; k < 6; k++) {
            const ap = point(s - 2.25 + k * 0.9, side * (front - 0.55));
            solids.box(
              ap[0],
              p.y + 2.55,
              ap[2],
              1.25,
              0.11,
              0.9,
              rgb(k % 2 ? '#ebd39b' : p.district === 'market' ? '#bd4b32' : '#375b4e'),
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
              rgb(k % 2 ? '#ebd39b' : p.district === 'market' ? '#bd4b32' : '#375b4e'),
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
          p.district === 'market'
            ? 'stall'
            : p.district === 'alley'
              ? r > 0.5
                ? 'bin'
                : 'pot'
              : r > 0.5
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
        const detail = (along, offset, y, w, h, d, color) => {
          const q = point(s + along, side * offset, y);
          solids.box(q[0], q[1], q[2], w, h, d, rgb(color), yaw);
        };
        if (p.district === 'old-town') {
          for (const along of [-4.2, 0, 4.2]) {
            detail(along, front - 0.65, 1.5, 0.34, 3, 0.34, '#e5d6b3');
            detail(along, front - 0.65, 0.17, 0.55, 0.34, 0.55, '#b3a68c');
            detail(along, front - 0.65, 2.9, 0.55, 0.24, 0.55, '#f0e0bb');
          }
          detail(0, front - 0.55, 3.15, 1.4, 0.3, 9.8, '#e1cda5');
          detail(-2.6, front - 0.95, 4.5, 1.3, 1.7, 0.18, '#d2b77a');
          detail(-2.6, front - 0.95, 4.5, 1.1, 1.48, 0.21, r > 0.5 ? '#315c50' : '#994832');
          for (const y of [4.15, 4.5, 4.85])
            detail(-2.6, front - 0.95, y, 0.58, 0.09, 0.23, '#eed9a4');
        } else if (p.district === 'alley') {
          detail(0, front - 0.4, 3.15, 1, 0.2, 3.6, '#6f797c');
          detail(0, front - 0.92, 3.9, 0.07, 0.07, 3.6, '#374b50');
          for (let along = -1.6; along <= 1.6; along += 0.4)
            detail(along, front - 0.92, 3.54, 0.06, 0.7, 0.06, '#374b50');
          detail(2.8, front - 0.15, 1.1, 0.1, 2.1, 0.13, '#687e83');
        } else {
          detail(-0.8, front - 0.5, 0.62, 0.85, 0.65, 2.5, '#876039');
          for (let n = 0; n < 12; n++)
            detail(
              -1.8 + (n % 6) * 0.4,
              front - 0.55 + Math.floor(n / 6) * 0.3,
              1.02,
              0.3,
              0.25,
              0.31,
              ['#e6a332', '#729542', '#bd5036'][n % 3],
            );
        }
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
      // High decorations stay above the obstacle-reading corridor.
      if (Math.floor(s / 10) % 2 === 0 && p.district !== 'old-town') {
        const height = p.district === 'alley' ? 5.8 : 6.1;
        const rope = point(s, 0, height);
        solids.box(rope[0], rope[1], rope[2], p.width + 2.6, 0.035, 0.035, rgb('#495352'), yaw);
        for (let k = 0; k < 7; k++) {
          const offset = (k - 3) * (p.width / 8);
          const color = rgb(
            (p.district === 'alley'
              ? ['#b9cbd1', '#5f8396', '#e3d7be']
              : ['#d35737', '#e3b83e', '#408b79'])[k % 3],
          );
          const topLeft = point(s, offset - 0.34, height - 0.02);
          const topRight = point(s, offset + 0.34, height - 0.02);
          const bottomLeft = point(
            s,
            p.district === 'alley' ? offset - 0.34 : offset,
            height - 0.8,
          );
          const bottomRight = point(
            s,
            p.district === 'alley' ? offset + 0.34 : offset,
            height - 0.8,
          );
          solids.quad([topLeft, topRight, bottomRight, bottomLeft], color, [0, 0, -1]);
        }
      } else if (Math.floor(s / 10) % 4 === 1) {
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
  obstacleMesh(type        , district        , variant        ) {
    const key = `${district}/${type}/${variant}`;
    if (this.meshes.has(key)) return this.meshes.get(key) ;
    const b = new Batch();
    const source = this.art.meshes[type];
    const tint =
      district === 'alley'
        ? [0.75, 0.87, 0.96]
        : district === 'market'
          ? [1.1, 0.96, 0.7]
          : [1, 1, 1];
    const mesh = {
      ...source,
      colors: source.colors.map((c, i) =>
        i % 4 === 3 ? c : Math.min(1, c * tint[i % 4] * (type === 'barrel' && variant ? 0.78 : 1)),
      ),
    };
    b.add(mesh, 0, type === 'barrel' ? -0.35 : 0);
    const accent = district === 'alley' ? '#759499' : district === 'market' ? '#ce6034' : '#a76235';
    const box = (x, y, z, w, h, d, color) => b.box(x, y, z, w, h, d, rgb(color));
    if (type === 'barrier') {
      if (district === 'alley') {
        for (const y of [0.22, 0.4]) box(0, y, 0, 1.7, 0.14, 0.44, variant ? '#8d785c' : '#b29b74');
      } else if (district === 'market') {
        for (const x of [-0.6, 0, 0.6])
          box(x, 0.28, 0, 0.5, 0.4, 0.4, variant ? '#bc7649' : '#7b8d55');
      }
      for (let i = 0; i < 5; i++)
        box((i - 2) * 0.35, 0.59, 0, 0.17, 0.27, 0.18, (i + variant) % 2 ? '#f1d9a1' : accent);
    } else if (type === 'beam') {
      for (let i = 0; i < 5; i++)
        box(
          (i - 2) * 0.4,
          1.63,
          0,
          0.36,
          0.7,
          0.2,
          district === 'alley'
            ? ['#d7d4bd', '#688c9e', '#ab7762'][(i + variant) % 3]
            : (i + variant) % 2
              ? '#e6cc91'
              : accent,
        );
      if (district === 'market') box(0, 2.05, 0, 2.08, 0.12, 0.38, variant ? '#d6b45a' : '#a85435');
    } else if (type === 'crate' || type === 'cart') {
      const width = type === 'crate' ? 0.82 : 1.6;
      if (district === 'alley') {
        // Cloth covers reuse the loaded silhouette so parcels still read as dodge-only obstacles.
        box(
          0,
          type === 'crate' ? 0.48 : 1.08,
          0,
          type === 'crate' ? 0.98 : 1.64,
          type === 'crate' ? 0.94 : 0.45,
          0.94,
          variant ? '#b49c7a' : '#809b9b',
        );
        box(0, 1.47, 0, width, 0.91, 0.84, variant ? '#78929b' : '#c6b18c');
      } else if (district === 'market') {
        for (const y of [0.3, 0.65, 1.15, 1.65])
          for (const z of [-0.47, 0.47])
            box(
              0,
              y + (type === 'cart' ? 0.28 : 0),
              z,
              width,
              0.11,
              0.025,
              variant ? '#698c47' : '#ba723c',
            );
      }
      for (const z of [-0.44, 0.44]) {
        box(0, 1.45, z, width, 0.24, 0.035, variant ? accent : '#d5bd8a');
        for (const x of [-width * 0.3, width * 0.3]) box(x, 1.42, z, 0.045, 0.9, 0.045, '#e3cc9b');
      }
      if (district === 'market') {
        for (let i = 0; i < 6; i++)
          box(
            (((i % 3) - 1) * width) / 3,
            type === 'crate' ? 1.88 : 2.06,
            (Math.floor(i / 3) - 0.5) * 0.34,
            width / 4,
            0.14,
            0.25,
            variant ? '#7eac4b' : '#e6a13c',
          );
      }
    }
    const result = cc.utils.createMesh(b.data       , undefined, { calculateBounds: true });
    this.meshes.set(key, result);
    return result;
  }
  object(id        , type        , district = 'old-town', variant = 0) {
    let n = this.objects.get(id);
    if (n) return n;
    n = new cc.Node(type + ' ' + id);
    this.root.addChild(n);
    const r = n.addComponent(cc.MeshRenderer);
    r.setMaterial(this.solid, 0);
    r.mesh = type === 'coin' ? this.meshes.get(type)  : this.obstacleMesh(type, district, variant);
    if (type !== 'coin' && type !== 'barrel') this.contact(n, type === 'beam' ? 1.3 : 0.7, 0.6);
    this.objects.set(id, n);
    return n;
  }
  releaseObject(n         ) {
    n.destroy();
  }
  update(run     , dt        , home = false, reducedMotion = false) {
    if (home && !reducedMotion) this.homeTime += dt;
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
    const active = new Set        ();
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
      const n = this.object(o.id, o.type, p.district, o.wave % 2);
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
    if (home) {
      this.player.root.setRotationFromEuler(0, p.heading * radians + 145, 0);
      this.player.pose(this.homeTime, 0, 'idle', 0);
      const heading = p.heading;
      const local = (x        , y        , z        ) => new cc.Vec3(
        p.x + Math.cos(heading) * x + Math.sin(heading) * z,
        p.y + y,
        p.z - Math.sin(heading) * x + Math.cos(heading) * z - this.origin,
      );
      const compact = cc.view.getDesignResolutionSize().height < 740;
      this.camera.node.setPosition(local(1.2, 1.75, compact ? -6.5 : -5.4));
      this.camera.node.lookAt(local(0.35, compact ? 0.6 : 0.95, 2.0));
      this.camera.fov = 48;
      this.cameraReady = false;
      return;
    }
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
