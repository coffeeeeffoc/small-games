import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIRECTIONS, EYE, MARKS, roomPosition } from '../core/model.ts';
import type { Box, Level, Run, Settings, Target, Theme } from '../core/model.ts';

const palettes: Record<
  Theme,
  { wall: string; floor: string; accent: string; trim: string; sky: string }
> = {
  home: { wall: '#adc0b3', floor: '#cbb494', accent: '#b58b52', trim: '#315757', sky: '#d6e1d8' },
  garden: { wall: '#547956', floor: '#c8c1a2', accent: '#b7daaa', trim: '#41695e', sky: '#bed5c8' },
  light: { wall: '#233b49', floor: '#405363', accent: '#6be8e0', trim: '#9dc8cb', sky: '#162c39' },
  mirror: { wall: '#657d82', floor: '#b7c6c2', accent: '#e6cc9b', trim: '#304d57', sky: '#b6cbd1' },
  cosmos: { wall: '#172b48', floor: '#637186', accent: '#aad9ec', trim: '#c1b286', sky: '#13233f' },
};
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.055, 110);
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private staticMeshes: THREE.Mesh[] = [];
  private mirrors: Reflector[] = [];
  private gates: THREE.Mesh[] = [];
  private plaques = new Map<string, THREE.Mesh>();
  private arrows = new Map<string, THREE.Mesh>();
  private markSignature = '';
  private reflecting = false;
  private frameReflections = 0;
  private resizeObserver: ResizeObserver;
  private cube = new THREE.BoxGeometry(1, 1, 1);
  private plane = new THREE.PlaneGeometry(1, 1);
  private cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  private sphere = new THREE.SphereGeometry(1, 16, 10);
  constructor(
    public canvas: HTMLCanvasElement,
    private level: Level,
    boxes: Box[],
    private targets: Target[],
    private settings: Settings,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.quality === 'high',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'low' ? 1 : 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    const palette = palettes[level.theme];
    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.Fog(palette.sky, 24, 65);
    this.scene.add(new THREE.HemisphereLight('#ecf4ee', '#59635a', 2.25));
    const sun = new THREE.DirectionalLight('#fff1ce', 2.1);
    sun.position.set(8, 14, 5);
    this.scene.add(sun);
    [this.cube, this.plane, this.cylinder, this.sphere].forEach((g) => this.geometries.add(g));
    for (const box of boxes) {
      if (box.furniture) continue;
      const r = level.rooms.find((r) => r.id === box.room)!,
        p = palettes[r.theme],
        height = r.theme === 'garden' ? 2.7 : 3.5;
      const mesh = this.box(
        box.x,
        height / 2,
        box.z,
        box.w,
        height,
        box.d,
        this.mat(
          box.gate ? '#ba985e' : p.wall,
          box.gate ? '' : r.theme === 'garden' ? 'hedge' : 'wall',
        ),
        !box.gate,
      );
      if (box.gate) {
        mesh.userData.gate = box.gate;
        this.gates.push(mesh);
      } else {
        this.box(box.x, 0.14, box.z, box.w + 0.035, 0.28, box.d + 0.035, this.mat(p.trim));
        this.box(box.x, height - 0.08, box.z, box.w + 0.06, 0.16, box.d + 0.06, this.mat(p.trim));
      }
    }
    for (const r of level.rooms) {
      const { x, z } = roomPosition(r),
        p = palettes[r.theme];
      this.box(x, -0.12, z, 6.15, 0.24, 6.15, this.mat(p.floor, 'floor'));
      this.box(
        x,
        0.008,
        z,
        2.6,
        0.012,
        2.6,
        this.mat(r.theme === 'home' ? '#687e76' : p.trim, 'rug'),
      );
      if (r.theme !== 'garden')
        this.box(x, 3.6, z, 6.2, 0.2, 6.2, this.mat(r.theme === 'cosmos' ? '#172b48' : p.wall));
      if (r.theme === 'home') {
        this.box(x, 3.18, z, 0.7, 0.12, 0.7, this.mat('#fff1bc', '', true));
        for (const off of [-2.8, 2.8]) this.box(x + off, 3.12, z, 0.12, 0.18, 6, this.mat(p.trim));
      }
      if (r.theme === 'light')
        for (let i = 0; i <= r.variant; i++)
          this.box(
            x - 0.5 + i * 0.5,
            3.25,
            z,
            0.11,
            0.08,
            4.7,
            this.mat(
              this.level.id === 10 ? '#efc978' : ['#79e9d2', '#efc978', '#b4b1fa'][r.variant],
              '',
              true,
            ),
          );
      if (r.theme === 'mirror') {
        for (const off of [-2.5, 2.5])
          this.box(x + off, 0.018, z, 0.09, 0.022, 5.7, this.mat(p.accent));
        this.box(x, 3.25, z, 1.6, 0.06, 1.6, this.mat('#eee5c9', '', true));
      }
      if (r.theme === 'cosmos') {
        this.box(x, 3.47, z, 5.9, 0.018, 5.9, this.mat('#ffffff', 'stars', true));
        for (const off of [-2.7, 2.7])
          this.box(x + off, 0.02, z, 0.045, 0.02, 5.5, this.mat(p.accent, '', true));
      }
      this.decorate(r.theme, r.landmark, r.variant, x, z);
    }
    for (const e of level.edges) {
      const a = roomPosition(level.rooms.find((r) => r.id === e.a)!),
        b = roomPosition(level.rooms.find((r) => r.id === e.b)!);
      const p = palettes[level.rooms.find((r) => r.id === e.a)!.theme],
        h = a.z === b.z;
      this.box(
        (a.x + b.x) / 2,
        -0.1,
        (a.z + b.z) / 2,
        h ? 2.1 : 2.3,
        0.2,
        h ? 2.3 : 2.1,
        this.mat(p.floor, 'floor'),
      );
      if (level.theme !== 'garden')
        this.box(
          (a.x + b.x) / 2,
          3.5,
          (a.z + b.z) / 2,
          h ? 2.1 : 2.3,
          0.2,
          h ? 2.3 : 2.1,
          this.mat(p.wall),
        );
    }
    for (const t of targets) this.target(t);
    this.mergeStatic();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }
  private texture(kind: string) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    if (kind === 'floor') {
      ctx.fillStyle = '#e9e7de';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillRect(128, 128, 128, 128);
      ctx.strokeStyle = '#adada1';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
    } else if (kind === 'wall') {
      ctx.fillStyle = '#e3e7e0';
      ctx.fillRect(0, 180, 256, 76);
      ctx.strokeStyle = '#ccd2cc';
      ctx.lineWidth = 2;
      ctx.strokeRect(14, 15, 228, 156);
      ctx.strokeRect(20, 21, 216, 144);
      ctx.fillRect(0, 174, 256, 5);
    } else if (kind === 'rug') {
      ctx.strokeStyle = '#c7cbb5';
      ctx.lineWidth = 5;
      ctx.strokeRect(12, 12, 232, 232);
      ctx.strokeRect(23, 23, 210, 210);
      ctx.translate(128, 128);
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-35, -35, 70, 70);
    } else if (kind === 'hedge') {
      ctx.fillStyle = '#8ead86';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = i % 2 ? '#b7ce9d' : '#789571';
        ctx.beginPath();
        ctx.ellipse((i * 79) % 256, (i * 53) % 256, 9, 4, i, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'stars' || kind.startsWith('planet-')) {
      const glow = ctx.createRadialGradient(75, 75, 1, 110, 120, 170);
      glow.addColorStop(0, '#476782');
      glow.addColorStop(1, '#12213c');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 105; i++) {
        ctx.fillStyle = i % 7 ? '#adbacf' : '#ffddaa';
        ctx.beginPath();
        ctx.arc((i * 67 + 7) % 256, (i * 101 + 3) % 256, i % 9 === 0 ? 1.5 : 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (kind.startsWith('planet-')) {
        const variant = Number(kind.at(-1));
        const planet = ctx.createRadialGradient(105, 101, 2, 137, 132, 64);
        planet.addColorStop(0, ['#f2dbac', '#a9e3e5', '#ebba94'][variant]);
        planet.addColorStop(1, '#21354c');
        ctx.fillStyle = planet;
        ctx.beginPath();
        ctx.arc(128, 128, 57, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ['#e6d0a1', '#6ea8b6', '#b87756'][variant];
        ctx.lineWidth = variant === 0 ? 7 : 3;
        ctx.beginPath();
        ctx.ellipse(128, 129, variant === 0 ? 86 : 50, 18, -0.35, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (kind === 'window' || kind.startsWith('art')) {
      ctx.fillStyle = kind === 'window' ? '#94bfcb' : '#e2d3b1';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#b6cbbb';
      ctx.beginPath();
      ctx.moveTo(0, 175);
      ctx.lineTo(70, 120);
      ctx.lineTo(140, 190);
      ctx.lineTo(195, 135);
      ctx.lineTo(256, 190);
      ctx.lineTo(256, 256);
      ctx.lineTo(0, 256);
      ctx.fill();
      ctx.fillStyle = '#628e86';
      ctx.beginPath();
      ctx.moveTo(0, 230);
      ctx.quadraticCurveTo(160, 90, 256, 245);
      ctx.lineTo(256, 256);
      ctx.lineTo(0, 256);
      ctx.fill();
      ctx.fillStyle = '#f4deb1';
      ctx.beginPath();
      ctx.arc(175, 60, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#354f48';
      ctx.lineWidth = kind === 'window' ? 9 : 13;
      ctx.strokeRect(3, 3, 250, 250);
      if (kind === 'window') {
        ctx.beginPath();
        ctx.moveTo(128, 0);
        ctx.lineTo(128, 256);
        ctx.moveTo(0, 138);
        ctx.lineTo(256, 138);
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    return texture;
  }
  private mat(color: string, texture = '', emissive = false) {
    const key = `${color}:${texture}:${emissive}`;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        emissive
          ? new THREE.MeshBasicMaterial({ color, map: texture ? this.texture(texture) : null })
          : new THREE.MeshStandardMaterial({
              color,
              map: texture ? this.texture(texture) : null,
              roughness: 0.88,
            }),
      );
    return this.materials.get(key)!;
  }
  private mesh(
    g: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    staticMesh = true,
  ) {
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    this.scene.add(mesh);
    if (staticMesh) this.staticMeshes.push(mesh);
    return mesh;
  }
  private box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    staticMesh = true,
  ) {
    return this.mesh(this.cube, m, x, y, z, w, h, d, staticMesh);
  }
  private label(text: string, color = '#ecdfb8', background = '#263e3c') {
    const key = `label:${text}:${color}:${background}`;
    if (this.materials.has(key)) return this.materials.get(key)!;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, 488, 232);
    ctx.fillStyle = color;
    ctx.font = 'bold 52px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((line, i) =>
      ctx.fillText(line, 256, 128 + (i - (lines.length - 1) / 2) * 72, 462),
    );
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(tex);
    const material = new THREE.MeshBasicMaterial({ map: tex });
    this.materials.set(key, material);
    return material;
  }
  private panel(
    t: Target,
    material: THREE.Material,
    w: number,
    h: number,
    y = t.y,
    staticMesh = true,
  ) {
    const mesh = this.mesh(this.plane, material, t.x, y, t.z, w, h, 1, staticMesh);
    mesh.rotation.y = (-t.dir * Math.PI) / 2;
    return mesh;
  }
  private target(t: Target) {
    const r = this.level.rooms.find((r) => r.id === t.room)!,
      p = palettes[r.theme],
      dir = DIRECTIONS[t.dir];
    if (t.kind === 'anchor') {
      this.plaques.set(
        t.id,
        this.panel(t, this.label('＋\n标记', '#dbe4cc'), 0.42, 0.27, 1.38, false),
      );
      return;
    }
    if (t.kind === 'opening' || t.kind === 'mirror') {
      const h = dir.x === 0;
      for (const sign of [-1, 1])
        this.box(
          t.x + (h ? sign * 1.23 : 0),
          1.4,
          t.z + (h ? 0 : sign * 1.23),
          h ? 0.16 : 0.24,
          2.8,
          h ? 0.24 : 0.16,
          this.mat(p.trim),
        );
      this.box(t.x, 2.83, t.z, h ? 2.5 : 0.25, 0.18, h ? 0.25 : 2.5, this.mat(p.accent));
      this.box(t.x, 3.17, t.z, h ? 2.32 : 0.19, 0.48, h ? 0.19 : 2.32, this.mat(p.wall));
      this.panel(
        { ...t, x: t.x - dir.x * 0.02, z: t.z - dir.z * 0.02 },
        this.label(['○', '△', '▥'][r.variant], p.accent),
        0.36,
        0.19,
        2.85,
      );
      if (t.kind === 'mirror') {
        const g = new THREE.PlaneGeometry(2.16, 2.68);
        this.geometries.add(g);
        const mirror = new Reflector(g, {
          color: '#d1dce1',
          textureWidth: this.settings.quality === 'low' ? 256 : 512,
          textureHeight: this.settings.quality === 'low' ? 256 : 512,
          clipBias: 0.003,
          multisample: 0,
        });
        mirror.position.set(t.x + dir.x * 0.01, 1.38, t.z + dir.z * 0.01);
        mirror.rotation.y = (-t.dir * Math.PI) / 2;
        const original = mirror.onBeforeRender;
        mirror.onBeforeRender = (...args) => {
          if (this.reflecting || this.frameReflections >= 2) return;
          this.reflecting = true;
          this.frameReflections++;
          const visibility = this.mirrors.map((m) => m.visible);
          // A single reflection bounce: hide other reflectors behind their solid backing during the offscreen pass.
          this.mirrors.forEach((m) => {
            if (m !== mirror) m.visible = false;
          });
          try {
            original.apply(mirror, args);
          } finally {
            this.mirrors.forEach((m, i) => (m.visible = visibility[i]));
            this.reflecting = false;
          }
        };
        this.scene.add(mirror);
        this.mirrors.push(mirror);
        this.panel(
          { ...t, x: t.x - dir.x * 0.025, z: t.z - dir.z * 0.025 },
          this.label('轻触检查', '#e7d7a9', p.trim),
          0.75,
          0.19,
          0.3,
        );
      }
    } else if (t.kind === 'exit') {
      this.panel(t, this.label('归 途\n靠近 · 检查', '#fff0c9', '#3d675d'), 1.9, 1.12);
      const h = dir.x === 0;
      for (const sign of [-1, 1])
        this.box(
          t.x + (h ? sign * 1.05 : 0),
          1.5,
          t.z + (h ? 0 : sign * 1.05),
          0.09,
          2.9,
          0.09,
          this.mat('#ffdf92', '', true),
        );
    } else if (t.kind === 'switch') {
      this.panel(t, this.label(`◇\n${t.label}`, '#ffe6a5', '#375452'), 0.9, 0.6);
      const lamp = this.mesh(
        this.sphere,
        this.mat('#e8c479', '', true),
        t.x - dir.x * 0.12,
        2.15,
        t.z - dir.z * 0.12,
        0.12,
        0.12,
        0.12,
        false,
      );
      lamp.userData.switchId = t.switchId;
      this.gates.push(lamp);
    }
  }
  private decorate(theme: Theme, name: string, variant: number, x: number, z: number) {
    const p = palettes[theme],
      wood = this.mat('#685848'),
      stone = this.mat('#b9c9b5'),
      cx = x - 2.1,
      cz = z - 2.1;
    // Solid furnishings have matching footprints in geometry.ts; the center and all door approaches stay clear.
    if (theme === 'home') {
      if (name.includes('钟')) {
        this.box(cx, 1.05, cz, 0.65, 2.1, 0.48, wood);
        const face = this.mesh(
          this.cylinder,
          this.mat('#eee2b9'),
          cx,
          1.7,
          cz + 0.26,
          0.25,
          0.045,
          0.25,
        );
        face.rotation.x = Math.PI / 2;
        this.box(cx, 1.8, cz + 0.3, 0.026, 0.17, 0.025, this.mat('#253b3a'));
        this.box(cx + 0.07, 1.7, cz + 0.3, 0.14, 0.026, 0.025, this.mat('#253b3a'));
        this.mesh(this.sphere, this.mat('#c6a462'), cx, 0.65, cz + 0.25, 0.09, 0.16, 0.045);
      } else if (name.includes('书')) {
        this.box(cx, 1.05, cz, 1, 2.1, 0.5, wood);
        for (let i = 0; i < 18; i++)
          this.box(
            cx - 0.38 + (i % 6) * 0.15,
            0.35 + Math.floor(i / 6) * 0.57,
            cz + 0.28,
            0.1,
            0.41 + (i % 3) * 0.045,
            0.2,
            this.mat(['#95ad9d', '#d8bc86', '#995f51'][i % 3]),
          );
      } else {
        this.box(cx, 0.47, cz, 0.9, 0.1, 0.7, wood);
        for (const off of [-0.32, 0.32]) this.box(cx + off, 0.22, cz, 0.08, 0.45, 0.55, wood);
        this.mesh(this.sphere, this.mat('#80a08d'), cx, 0.84, cz, 0.23, 0.3, 0.23);
      }
    } else if (theme === 'garden') {
      if (name.includes('喷泉')) {
        this.mesh(this.cylinder, stone, cx, 0.22, cz, 0.64, 0.44, 0.64);
        this.mesh(this.cylinder, this.mat('#709eac'), cx, 0.45, cz, 0.52, 0.03, 0.52);
        this.mesh(this.cylinder, stone, cx, 0.85, cz, 0.13, 1, 0.13);
        this.mesh(this.sphere, this.mat('#b5d9d7'), cx, 1.4, cz, 0.27, 0.12, 0.27);
      } else if (name.includes('雕像') || name.includes('石雕')) {
        if (variant === 1) this.mesh(this.cylinder, stone, cx, 0.3, cz, 0.46, 0.6, 0.46);
        else this.box(cx, 0.3, cz, 0.85, 0.6, 0.85, stone);
        this.mesh(this.cylinder, stone, cx, 1, cz, 0.24, 0.8, 0.24);
        this.mesh(this.sphere, stone, cx, 1.65, cz, 0.29, 0.33, 0.29);
      } else {
        this.box(cx, 0.2, cz, 0.8, 0.4, 0.8, this.mat('#b08969'));
        for (let i = 0; i < 4; i++)
          this.mesh(
            this.sphere,
            this.mat(['#8aa471', '#ced69d', '#a3b490'][i % 3]),
            cx + Math.sin(i * 2) * 0.22,
            0.65 + i * 0.13,
            cz + Math.cos(i * 2) * 0.22,
            0.28,
            0.3,
            0.28,
          );
        if (variant === 1)
          for (let i = 0; i < 5; i++)
            this.mesh(
              this.sphere,
              this.mat('#f1ead0'),
              cx + Math.sin(i * 1.3) * 0.28,
              1.2,
              cz + Math.cos(i * 1.3) * 0.28,
              0.12,
              0.055,
              0.12,
            );
      }
      const bench = this.box(x + 2.25, 0.48, z - 2, 1.1, 0.13, 0.5, wood);
      bench.rotation.y = (variant * Math.PI) / 2;
      this.box(x + 2.25, 0.23, z - 2, 0.6, 0.4, 0.35, stone);
    } else if (theme === 'light') {
      this.box(cx, 0.8, cz, 0.65, 1.6, 0.65, this.mat(p.trim));
      for (let i = 0; i <= variant; i++)
        this.mesh(
          variant === 1 ? this.sphere : this.cube,
          this.mat(
            this.level.id === 10 ? '#f7cc71' : ['#71e3ce', '#f7cc71', '#beb6f5'][variant],
            '',
            true,
          ),
          cx,
          0.5 + i * 0.48,
          cz + 0.38,
          0.32,
          0.16,
          0.1,
        );
    } else if (theme === 'mirror') {
      this.mesh(this.cylinder, this.mat(p.trim), cx, 0.4, cz, 0.46, 0.8, 0.46);
      const sculpture = this.mesh(
        this.cube,
        this.mat(variant ? '#d0ad73' : '#adccbf'),
        cx,
        1.2,
        cz,
        0.5,
        0.5,
        0.5,
      );
      sculpture.rotation.set(0.35, 0.55, 0.25);
    } else {
      this.mesh(this.cylinder, this.mat('#344c6b'), cx, 0.5, cz, 0.43, 1, 0.43);
      this.mesh(
        this.sphere,
        this.mat(['#cfb78b', '#8dbcca', '#cc9071'][variant], '', true),
        cx,
        1.35,
        cz,
        0.4,
        0.4,
        0.4,
      );
      if (variant === 0) {
        const g = new THREE.TorusGeometry(0.59, 0.025, 6, 40);
        this.geometries.add(g);
        const ring = this.mesh(g, this.mat('#decaa7'), cx, 1.35, cz, 1, 1, 1);
        ring.rotation.x = 1.05;
      }
    }
    const t: Target = {
      id: '',
      room: '',
      kind: 'anchor',
      dir: 0,
      x: x + 1.95,
      z: z - 2.88,
      y: 1.95,
      label: '',
    };
    this.panel(
      t,
      theme === 'cosmos'
        ? this.mat('#ffffff', `planet-${variant}`, true)
        : theme === 'home'
          ? this.mat('#ffffff', name.includes('窗') ? 'window' : 'art', true)
          : this.label(theme === 'garden' ? ['叶影', '白花', '石庭'][variant] : name, p.accent),
      1.1,
      1.35,
    );
    if (theme === 'cosmos')
      this.panel(
        { ...t, z: t.z + 0.012 },
        this.label(['环星', '海蓝', '赤砂'][variant], p.accent),
        0.7,
        0.2,
        1.28,
      );
  }
  private mergeStatic() {
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const mesh of this.staticMeshes) {
      mesh.updateMatrix();
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrix),
        m = mesh.material as THREE.Material;
      const group = groups.get(m) ?? [];
      group.push(g);
      groups.set(m, group);
      this.scene.remove(mesh);
    }
    for (const [material, parts] of groups) {
      const g = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      if (g) {
        this.geometries.add(g);
        this.scene.add(new THREE.Mesh(g, material));
      }
    }
    this.staticMeshes = [];
  }
  private syncMarks(run: Run) {
    const signature = JSON.stringify(run.marks);
    if (signature === this.markSignature) return;
    this.markSignature = signature;
    this.arrows.forEach((a) => this.scene.remove(a));
    this.arrows.clear();
    for (const [id, plaque] of this.plaques) {
      const mark = run.marks[id];
      plaque.material = mark
        ? this.label(
            `${MARKS[mark.kind].symbol}\n${MARKS[mark.kind].label}`,
            MARKS[mark.kind].color,
          )
        : this.label('＋\n标记', '#dbe4cc');
      if (mark?.kind === 'arrow') {
        const t = this.targets.find((t) => t.id === id)!,
          d = DIRECTIONS[t.dir];
        let geo = [...this.geometries].find((g) => g.name === 'mark-arrow');
        if (!geo) {
          const shape = new THREE.Shape();
          shape.moveTo(0, -0.42);
          shape.lineTo(0.23, -0.06);
          shape.lineTo(0.085, -0.06);
          shape.lineTo(0.085, 0.38);
          shape.lineTo(-0.085, 0.38);
          shape.lineTo(-0.085, -0.06);
          shape.lineTo(-0.23, -0.06);
          shape.closePath();
          geo = new THREE.ShapeGeometry(shape);
          geo.name = 'mark-arrow';
          this.geometries.add(geo);
        }
        const arrow = this.mesh(
          geo,
          this.mat('#f3d17a', '', true),
          t.x - d.x * 0.65,
          0.03,
          t.z - d.z * 0.65,
          1,
          1,
          1,
          false,
        );
        arrow.rotation.set(-Math.PI / 2, 0, (-mark.direction * Math.PI) / 2 + Math.PI);
        this.arrows.set(id, arrow);
      }
    }
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
  }
  render(run: Run) {
    this.camera.position.set(run.x, EYE, run.z);
    this.camera.rotation.set(run.pitch, run.yaw, 0, 'YXZ');
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.syncMarks(run);
    for (const gate of this.gates) {
      if (gate.userData.gate) gate.visible = !run.activated.includes(gate.userData.gate);
      else
        gate.material = this.mat(
          run.activated.includes(gate.userData.switchId) ? '#9bf0b3' : '#e8c479',
          '',
          true,
        );
    }
    this.frameReflections = 0;
    const near = [...this.mirrors]
      .filter((m) => m.position.distanceTo(this.camera.position) < 15)
      .sort(
        (a, b) =>
          a.position.distanceToSquared(this.camera.position) -
          b.position.distanceToSquared(this.camera.position),
      )
      .slice(0, 2);
    this.mirrors.forEach((m) => {
      m.visible = near.includes(m);
    });
    this.renderer.render(this.scene, this.camera);
  }
  metrics() {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      reflections: this.frameReflections,
    };
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.mirrors.forEach((m) => m.dispose());
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.scene.clear();
  }
}
