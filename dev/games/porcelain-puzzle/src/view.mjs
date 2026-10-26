import { vesselCanvas, shardCanvas, imageFrom, canvas, tableCanvas } from './art.mjs';
import { vesselFor, WIDTH, HEIGHT, levelAt } from './content.mjs';
export class View {
  constructor(runtime) {
    this.runtime = runtime;
    this.cc = runtime.cc;
    this.cache = new Map();
    this.resources = new Map();
    this.textures = [];
    this.boardAssets = [];
    this.generation = 0;
    this.pieces = [];
    this.baby = null;
    this.effects = [];
    this.clock = 0;
    this.shake = 0;
    this.motion = true;
    this.stage = this.node(runtime.ui, 'Porcelain scene');
    this.resize();
  }
  node(parent = this.stage, name = 'art') {
    const n = new this.cc.Node(name);
    n.layer = this.cc.Layers.Enum.UI_2D;
    n.addComponent(this.cc.UITransform);
    parent.addChild(n);
    return n;
  }
  resize() {
    this.h = this.runtime.height;
    this.stage.setPosition(-195, this.h / 2);
    this.boardScale = Math.min(1, (this.h - 285) / 510);
    this.boardOrigin = { x: (390 - 350 * this.boardScale) / 2, y: 158 };
  }
  frame(key, source) {
    if (this.cache.has(key)) return this.cache.get(key);
    const image = new this.cc.ImageAsset(source),
      texture = new this.cc.Texture2D();
    texture.image = image;
    const frame = new this.cc.SpriteFrame();
    frame.texture = texture;
    this.cache.set(key, frame);
    this.resources.set(key, [frame, texture, image]);
    this.textures.push(frame, texture, image);
    return frame;
  }
  sprite(frame, x, y, w, h, parent = this.layer) {
    const n = this.node(parent);
    n.setPosition(x, -y);
    const s = n.addComponent(this.cc.Sprite);
    s.spriteFrame = frame;
    s.sizeMode = this.cc.Sprite.SizeMode.CUSTOM;
    n.getComponent(this.cc.UITransform).setContentSize(w, h);
    return n;
  }
  opacity(node, value) {
    let c = node.getComponent(this.cc.UIOpacity);
    if (!c) c = node.addComponent(this.cc.UIOpacity);
    c.opacity = value;
  }
  async initialize() {
    const [back, baby] = await Promise.all([
      imageFrom('./assets/atelier.png'),
      imageFrom('./assets/baby-atlas.png'),
    ]);
    this.back = this.frame('atelier', back);
    this.babyFrames = [];
    for (let i = 0; i < 12; i++) {
      const w = baby.width / 4,
        h = baby.height / 3,
        c = canvas(w, h);
      c.getContext('2d').drawImage(
        baby,
        (i % 4) * w,
        Math.floor(i / 4) * h + 4,
        w,
        h - 23,
        0,
        4,
        w,
        h - 23,
      );
      this.babyFrames.push(this.frame(`baby:${i}`, c));
    }
  }
  clear(kind) {
    this.generation++;
    if (this.layer) {
      this.layer.active = false;
      this.layer.removeFromParent();
      this.layer.destroy();
    }
    const retired = [];
    const vesselKeys = [...this.cache.keys()].filter((key) => key.startsWith('vessel-'));
    const expired = [
      ...this.boardAssets,
      ...vesselKeys.slice(0, Math.max(0, vesselKeys.length - 8)),
    ];
    for (const key of expired) {
      const assets = this.resources.get(key);
      if (assets) {
        retired.push(...assets);
        this.cache.delete(key);
        this.resources.delete(key);
      }
    }
    this.textures = this.textures.filter((asset) => !retired.includes(asset));
    if (retired.length)
      this.cc.director.once(this.cc.Director.EVENT_AFTER_DRAW, () => {
        for (const asset of retired) asset.destroy();
      });
    this.boardAssets = [];
    this.layer = this.node(this.stage, kind);
    this.pieces = [];
    this.board = null;
    this.baby = null;
    this.hero = null;
    this.effects = [];
    this.kind = kind;
    return this.generation;
  }
  background(soft = false) {
    const n = this.sprite(this.back, 195, this.h / 2, 390, this.h);
    if (soft) this.opacity(n, 75);
    return n;
  }
  async vessel(vessel, x, y, w = 230, parent = this.layer) {
    const key = vessel.id;
    let f = this.cache.get(key);
    if (!f) f = this.frame(key, await vesselCanvas(vessel));
    if (!parent.isValid) return null;
    return this.sprite(f, x, y, w, (w * HEIGHT) / WIDTH, parent);
  }
  babyAt(pose, x, y, size = 130) {
    this.baby = this.sprite(this.babyFrames[pose], x, y, size, size, this.layer);
    this.babyBase = { x, y, size };
    this.pose = pose;
    return this.baby;
  }
  babyPose(pose) {
    if (this.baby && this.pose !== pose) {
      this.pose = pose;
      this.baby.getComponent(this.cc.Sprite).spriteFrame = this.babyFrames[pose];
    }
  }
  async home(vessel) {
    const gen = this.clear('home');
    this.background();
    const shadow = canvas(240, 48),
      ctx = shadow.getContext('2d');
    ctx.scale(1, 0.2);
    const gradient = ctx.createRadialGradient(120, 120, 4, 120, 120, 115);
    gradient.addColorStop(0, '#493b2659');
    gradient.addColorStop(1, '#493b2600');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 240, 240);
    this.sprite(this.frame('home-contact-shadow', shadow), 202, this.h * 0.49 + 123, 132, 26);
    await this.vessel(vessel, 202, this.h * 0.49, 208);
    if (gen !== this.generation) return;
    this.babyAt(5, 81, this.h * 0.59, 139);
  }
  async gallery(items) {
    const gen = this.clear('gallery');
    this.background(true);
    const step = Math.min(103, (this.h - 350) / 4);
    const g = this.node(this.layer).addComponent(this.cc.Graphics);
    g.lineWidth = 38;
    g.strokeColor = this.hex('#d6ded5');
    g.moveTo(122, -150);
    for (let i = 1; i < items.length; i++) {
      const y = 150 + i * step;
      g.bezierCurveTo(
        i % 2 ? 270 : 120,
        -y + 70,
        i % 2 ? 120 : 270,
        -y + 45,
        i % 2 ? 268 : 122,
        -y,
      );
    }
    g.stroke();
    const group = this.node(this.layer);
    for (let i = 0; i < items.length; i++) {
      if (gen !== this.generation) return;
      const x = i % 2 ? 268 : 122,
        y = 150 + i * step;
      const disc = this.node(group).addComponent(this.cc.Graphics);
      disc.fillColor = this.hex('#e4d0a8');
      disc.ellipse(x, -y - 34, 46, 14);
      disc.fill();
      await this.vessel(items[i].vessel, x, y - 11, 65, group);
    }
  }
  hex(s, alpha = 255) {
    const n = parseInt(s.slice(1), 16);
    return new this.cc.Color(n >> 16, (n >> 8) & 255, n & 255, alpha);
  }
  async boardFor(state, puzzle) {
    const gen = this.clear('playing');
    this.sprite(this.frame(`table:${this.h}`, tableCanvas(this.h)), 195, this.h / 2, 390, this.h);
    const board = this.node(this.layer, 'Touch puzzle');
    this.board = board;
    board.setPosition(this.boardOrigin.x, -this.boardOrigin.y);
    board.setScale(this.boardScale, this.boardScale, 1);
    const texture = await vesselCanvas(vesselFor(levelAt(state.number)));
    if (gen !== this.generation) return;
    const guide = this.sprite(
      this.frame(vesselFor(levelAt(state.number)).id, texture),
      175,
      240,
      WIDTH,
      HEIGHT,
      board,
    );
    this.opacity(guide, 20);
    this.guide = guide;
    for (const p of puzzle.pieces) {
      const source = shardCanvas(texture, p, puzzle.silhouette),
        key = `${state.levelId}:shard:${p.id}`,
        sf = this.frame(key, source.image);
      this.boardAssets.push(key);
      const wrapper = this.node(board, `Shard ${p.id}`);
      const shadow = this.sprite(sf, source.x + 2, source.y + 4, source.w, source.h, wrapper);
      shadow.getComponent(this.cc.Sprite).color = this.hex('#4c4434', 55);
      const visual = this.sprite(sf, source.x, source.y, source.w, source.h, wrapper);
      this.pieces.push({ id: p.id, node: wrapper, visual, x: 0, y: 0 });
    }
    this.apply(state, true);
    for (const group of state.groups) this.raise(group);
    this.babyAt(5, 350, 128, 74);
    this.baby.active = false;
  }
  apply(state, immediate = false) {
    for (const p of this.pieces) {
      const group = state.groups.find((g) => g.pieces.includes(p.id));
      if (!group) continue;
      p.targetX = group.x;
      p.targetY = group.y;
      if (immediate) {
        p.x = group.x;
        p.y = group.y;
        p.node.setPosition(p.x, -p.y);
      }
    }
  }
  raise(group) {
    for (const p of this.pieces)
      if (group.pieces.includes(p.id)) p.node.setSiblingIndex(this.board.children.length - 1);
  }
  highlight(ids) {
    for (const p of this.pieces) {
      const s = p.visual.getComponent(this.cc.Sprite);
      s.color = ids.includes(p.id) ? this.hex('#ffdf97') : this.hex('#ffffff');
    }
  }
  showGuide(on) {
    if (this.guide) this.opacity(this.guide, on ? 255 : 20);
    for (const piece of this.pieces) piece.node.active = !on;
  }
  async prepareCeremony(state, mode = 'intro', compact = false) {
    const gen = this.clear(mode);
    this.background(true);
    const y = compact ? 143 : this.h * 0.52;
    this.babyAt(mode === 'win' ? 10 : 1, 195, y, compact ? 112 : 235);
    if (gen !== this.generation) return;
    const hero = await this.vessel(
      vesselFor(levelAt(state.number)),
      mode === 'win' ? 220 : 215,
      y + (compact ? 12 : 25),
      compact ? 46 : mode === 'win' ? 100 : 95,
    );
    if (gen !== this.generation) return;
    this.hero = hero;
    this.ceremonyAt = this.clock;
  }
  burst(x = 195, y = this.h * 0.45) {
    this.shake = this.motion ? 1 : 0;
    for (let i = 0; i < 14; i++) {
      const n = this.node(this.layer),
        g = n.addComponent(this.cc.Graphics);
      g.fillColor = this.hex(i % 2 ? '#d2a553' : '#fff6d8');
      g.circle(0, 0, 2 + (i % 3));
      g.fill();
      n.setPosition(x, -y);
      this.effects.push({
        n,
        x,
        y,
        vx: Math.cos(i * 2.4) * (35 + i * 4),
        vy: Math.sin(i * 2.4) * 90 - 30,
        life: 0,
      });
    }
  }
  update(dt) {
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt * 5);
    this.layer?.setPosition(
      this.shake * Math.sin(this.clock * 60) * 3,
      this.shake * Math.cos(this.clock * 51) * 2,
    );
    for (const p of this.pieces) {
      p.x += (p.targetX - p.x) * Math.min(1, dt * 24);
      p.y += (p.targetY - p.y) * Math.min(1, dt * 24);
      p.node.setPosition(p.x, -p.y);
    }
    if (this.baby && this.baby.active && this.babyBase) {
      const { x, y } = this.babyBase;
      const bob = this.motion ? Math.sin(this.clock * 2.5) * 2 : 0;
      this.baby.setPosition(x, -y + bob);
    }
    for (const e of this.effects) {
      e.life += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy += 120 * dt;
      e.n.setPosition(e.x, -e.y);
      this.opacity(e.n, Math.max(0, 255 * (1 - e.life / 0.7)));
      if (e.life > 0.7) e.n.destroy();
    }
    this.effects = this.effects.filter((e) => e.life <= 0.7);
  }
  ceremony(progress, mode) {
    if (!this.baby) return;
    const baseY = this.babyBase.y;
    if (mode === 'intro') {
      this.babyPose(progress < 0.25 ? 1 : progress < 0.53 ? 2 : progress < 0.68 ? 3 : 4);
      if (this.hero) {
        const lift =
          progress < 0.25
            ? 0
            : progress < 0.53
              ? (-(progress - 0.25) / 0.28) * 100
              : progress < 0.68
                ? -100 + ((progress - 0.53) / 0.15) * 210
                : 110;
        this.hero.setPosition(215, -baseY - 25 - lift);
        this.hero.active = progress < 0.68;
      }
      if (progress > 0.52 && progress < 0.68) this.baby.setScale(1.05, 0.95, 1);
      else this.baby.setScale(1, 1, 1);
    } else if (mode === 'travel') {
      this.babyPose(11);
      const x = 195 + progress * 260;
      this.babyBase.x = x;
      this.baby.setPosition(x, -baseY + Math.sin(progress * 30) * 8);
      if (this.hero) this.hero.active = false;
      this.layer.setPosition(-progress * 85, 0);
    } else {
      this.babyPose(10);
      this.baby.angle = this.motion ? Math.sin(progress * Math.PI * 2) * 4 : 0;
    }
  }
  toBoard(point) {
    return {
      x: (point.x - this.boardOrigin.x) / this.boardScale,
      y: (point.y - this.boardOrigin.y) / this.boardScale,
    };
  }
  dispose() {
    this.stage.destroy();
    for (const t of this.textures) t.destroy();
    this.cache.clear();
  }
}
