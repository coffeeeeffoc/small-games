import { draw, table, terrainDecorations, W, H } from './render.mjs';
import { arenaRadius, physics } from './core.mjs';

const identity = () => [1, 0, 0, 1, 0, 0];
const transform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function clipHalfPlane(polygon, nx, ny, edge) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = edge - nx * a[0] - ny * a[1],
      db = edge - nx * b[0] - ny * b[1];
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}
function clippedSegment(a, b, clips) {
  let from = 0,
    to = 1;
  for (const polygon of clips) {
    const sign = Math.sign(
      polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0),
    );
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length];
      const ca = cross(p, q, a) * sign,
        cb = cross(p, q, b) * sign;
      if (ca < 0 && cb < 0) return null;
      if (ca < 0) from = Math.max(from, ca / (ca - cb));
      if (cb < 0) to = Math.min(to, ca / (ca - cb));
    }
  }
  return from > to
    ? null
    : [
        [a[0] + (b[0] - a[0]) * from, a[1] + (b[1] - a[1]) * from],
        [a[0] + (b[0] - a[0]) * to, a[1] + (b[1] - a[1]) * to],
      ];
}

/** Retained Cocos sprites + Graphics. Canvas is used only to bake individual static art/text,
 * never to render or upload a whole gameplay frame. Layout/rules remain shared with native. */
export function createCocosRenderer({ cc, root }) {
  const origin = new cc.Node('Top left');
  origin.layer = cc.Layers.Enum.UI_2D;
  origin.setPosition(-W / 2, H / 2);
  root.addChild(origin);
  const sprites = [],
    vectors = [],
    terrains = [],
    textures = new Map();
  const language = document.documentElement.lang || 'zh-CN';
  const measureCanvas = document.createElement('canvas');
  measureCanvas.lang = language;
  const measure = measureCanvas.getContext('2d');
  let spriteIndex = 0,
    vectorIndex = 0,
    terrainIndex = 0,
    order = 0,
    graphic = null;
  let bytes = 0,
    uploads = 0,
    disposed = false,
    frame = 0;
  let state, stack, paths, current;
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  function color(value, alpha = 1) {
    let rgba;
    if (value.startsWith('rgba')) rgba = value.match(/[\d.]+/g).map(Number);
    else {
      let hex = value.slice(1);
      if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
      rgba = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      rgba.push(hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1);
    }
    return new cc.Color(rgba[0], rgba[1], rgba[2], Math.round(255 * rgba[3] * alpha));
  }
  function node(name) {
    const n = new cc.Node(name);
    n.layer = cc.Layers.Enum.UI_2D;
    n.addComponent(cc.UITransform);
    origin.addChild(n);
    return n;
  }
  function graphics() {
    if (graphic) return graphic;
    let item = vectors[vectorIndex++];
    if (!item) {
      const n = node('Paths');
      item = n.addComponent(cc.Graphics);
      vectors.push(item);
    }
    item.node.active = true;
    item.node.setSiblingIndex(order++);
    item.clear();
    item.lineCap = cc.Graphics.LineCap.ROUND;
    item.lineJoin = cc.Graphics.LineJoin.ROUND;
    graphic = item;
    return item;
  }
  function release(asset) {
    asset.sf.destroy();
    asset.texture.destroy();
    asset.image.destroy();
    bytes -= asset.bytes;
  }
  function getAsset(key, bake, sourceWidth, sourceHeight) {
    let asset = textures.get(key);
    if (!asset) {
      const canvas = document.createElement('canvas');
      // Detached canvas otherwise loses the page locale and changes CJK serif fallback.
      canvas.lang = language;
      canvas.width = Math.ceil(sourceWidth * ratio);
      canvas.height = Math.ceil(sourceHeight * ratio);
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      bake(ctx);
      const image = new cc.ImageAsset(canvas),
        texture = new cc.Texture2D();
      texture.image = image;
      const sf = new cc.SpriteFrame();
      sf.texture = texture;
      asset = { sf, texture, image, bytes: canvas.width * canvas.height * 4 };
      textures.set(key, asset);
      bytes += asset.bytes;
      uploads++;
    }
    asset.frame = frame;
    return asset;
  }
  function child(parent, name) {
    const n = node(name);
    n.setParent(parent);
    return n;
  }
  function mask(parent, name) {
    const n = child(parent, name),
      m = n.addComponent(cc.MaskComponent);
    m.type = cc.MaskComponent.Type.GRAPHICS_STENCIL;
    return m;
  }
  function polygonMask(m, points) {
    const g = m.subComp;
    g.clear();
    g.fillColor = new cc.Color(255, 255, 255, 255);
    g.moveTo(points[0][0], -points[0][1]);
    for (const p of points.slice(1)) g.lineTo(p[0], -p[1]);
    g.close();
    g.fill();
  }
  const painter = {
    isCocosPainter: true,
    save() {
      stack.push({ ...state, matrix: [...state.matrix], clips: [...state.clips] });
    },
    restore() {
      state = stack.pop();
    },
    translate(x, y) {
      const m = state.matrix;
      [m[4], m[5]] = transform(m, x, y);
    },
    scale(x, y) {
      const m = state.matrix;
      m[0] *= x;
      m[1] *= x;
      m[2] *= y;
      m[3] *= y;
    },
    rotate(a) {
      const m = state.matrix,
        c = Math.cos(a),
        s = Math.sin(a),
        [a0, a1, a2, a3] = m;
      m[0] = a0 * c + a2 * s;
      m[1] = a1 * c + a3 * s;
      m[2] = -a0 * s + a2 * c;
      m[3] = -a1 * s + a3 * c;
    },
    clearRect() {},
    beginPath() {
      paths = [];
      current = null;
    },
    moveTo(x, y) {
      current = [transform(state.matrix, x, y)];
      paths.push(current);
    },
    lineTo(x, y) {
      if (!current) this.moveTo(x, y);
      else current.push(transform(state.matrix, x, y));
    },
    closePath() {
      if (current?.length) current.push(current[0]);
    },
    quadraticCurveTo(cx, cy, x, y) {
      const a = current.at(-1),
        b = transform(state.matrix, cx, cy),
        d = transform(state.matrix, x, y);
      for (let i = 1; i <= 8; i++) {
        const t = i / 8,
          u = 1 - t;
        current.push([
          u * u * a[0] + 2 * u * t * b[0] + t * t * d[0],
          u * u * a[1] + 2 * u * t * b[1] + t * t * d[1],
        ]);
      }
    },
    arc(x, y, r, start, end, anticlockwise = false) {
      let span = end - start;
      if (anticlockwise && span > 0) span -= Math.PI * 2;
      if (!anticlockwise && span < 0) span += Math.PI * 2;
      const steps = Math.max(8, Math.ceil(Math.abs(span) * Math.sqrt(Math.max(r, 1)) * 1.6));
      for (let i = 0; i <= steps; i++) {
        const a = start + (span * i) / steps;
        this.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
    },
    clip() {
      if (current?.length) state.clips.push(current.slice());
    },
    setLineDash(dash) {
      state.dash = dash;
    },
    fillRect(x, y, w, h) {
      this.beginPath();
      this.moveTo(x, y);
      this.lineTo(x + w, y);
      this.lineTo(x + w, y + h);
      this.lineTo(x, y + h);
      this.closePath();
      this.fill();
    },
    fill() {
      const g = graphics();
      g.fillColor = color(state.fillStyle, state.globalAlpha);
      for (const path of paths) {
        if (!path.length) continue;
        g.moveTo(path[0][0], -path[0][1]);
        for (const p of path.slice(1)) g.lineTo(p[0], -p[1]);
        g.close();
        g.fill();
      }
    },
    stroke() {
      const g = graphics();
      g.strokeColor = color(state.strokeStyle, state.globalAlpha);
      g.lineWidth = state.lineWidth * Math.hypot(state.matrix[0], state.matrix[1]);
      for (const path of paths) {
        if (path.length < 2) continue;
        if (!state.dash.length && !state.clips.length) {
          g.moveTo(path[0][0], -path[0][1]);
          for (const p of path.slice(1)) g.lineTo(p[0], -p[1]);
          g.stroke();
          continue;
        }
        let dashIndex = 0,
          used = 0;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1],
            b = path[i],
            length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          let at = 0;
          while (at < length) {
            const end = state.dash.length
              ? Math.min(length, at + state.dash[dashIndex] - used)
              : length;
            if (dashIndex % 2 === 0) {
              const p = [
                a[0] + ((b[0] - a[0]) * at) / length,
                a[1] + ((b[1] - a[1]) * at) / length,
              ];
              const q = [
                a[0] + ((b[0] - a[0]) * end) / length,
                a[1] + ((b[1] - a[1]) * end) / length,
              ];
              const line = clippedSegment(p, q, state.clips);
              if (line) {
                g.moveTo(line[0][0], -line[0][1]);
                g.lineTo(line[1][0], -line[1][1]);
                g.stroke();
              }
            }
            used += end - at;
            at = end;
            if (state.dash.length && used >= state.dash[dashIndex] - 0.0001) {
              dashIndex = (dashIndex + 1) % state.dash.length;
              used = 0;
            }
          }
        }
      }
    },
    art(key, x, y, w, h, bake, sourceWidth = w, sourceHeight = h) {
      graphic = null;
      const asset = getAsset(key, bake, sourceWidth, sourceHeight);
      let sprite = sprites[spriteIndex++];
      if (!sprite) {
        sprite = node('Art').addComponent(cc.Sprite);
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        sprites.push(sprite);
      }
      sprite.node.active = true;
      sprite.node.name = key.startsWith('button:') ? key : key.slice(0, 50);
      sprite.node.setSiblingIndex(order++);
      sprite.spriteFrame = asset.sf;
      sprite.color = new cc.Color(255, 255, 255, Math.round(255 * state.globalAlpha));
      const m = state.matrix,
        p = transform(m, x + w / 2, y + h / 2);
      sprite.node.setPosition(p[0], -p[1]);
      sprite.node.setScale(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]), 1);
      sprite.node.angle = (-Math.atan2(m[1], m[0]) * 180) / Math.PI;
      sprite.node.getComponent(cc.UITransform).setContentSize(w, h);
    },
    terrain(value, x, y, scale) {
      graphic = null;
      let item = terrains[terrainIndex++];
      if (!item) {
        const group = node('Terrain');
        const gap = mask(group, 'Cut edges');
        const wood = child(gap.node, 'Wood').addComponent(cc.Sprite);
        wood.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        const round = mask(gap.node, 'Terrain circle');
        const decorations = child(round.node, 'Ice and pillars').addComponent(cc.Sprite);
        decorations.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        const rim = child(gap.node, 'Edge').addComponent(cc.Graphics);
        item = { group, gap, wood, round, decorations, rim };
        terrains.push(item);
      }
      item.group.active = true;
      item.group.setSiblingIndex(order++);
      item.group.setPosition(x, -y);
      item.group.setScale(scale, scale, 1);
      const radius = arenaRadius(value),
        R = physics.radius,
        pad = 38,
        extent = R + pad;
      const wood = getAsset(
        'terrain-wood',
        (ctx) => table(ctx, extent, extent, R),
        extent * 2,
        extent * 2,
      );
      item.wood.spriteFrame = wood.sf;
      item.wood.node.getComponent(cc.UITransform).setContentSize(extent * 2, extent * 2);
      item.wood.node.setScale(radius / R, radius / R, 1);
      let polygon = [
        [-1000, -1000],
        [1000, -1000],
        [1000, 1000],
        [-1000, 1000],
      ];
      for (const gap of value.gaps ?? [])
        polygon = clipHalfPlane(
          polygon,
          Math.cos(gap.angle),
          Math.sin(gap.angle),
          Math.max(0, radius - gap.depth),
        );
      polygonMask(item.gap, polygon);
      const circle = [];
      for (let i = 0; i < 128; i++) {
        const a = (i * Math.PI) / 64,
          r = Math.max(0, radius - 2 / scale);
        circle.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      polygonMask(item.round, circle);
      const key = JSON.stringify(['decorations', value.ice, value.obstacles]);
      const decoration = getAsset(
        key,
        (ctx) => terrainDecorations(ctx, value, extent, extent, 1),
        extent * 2,
        extent * 2,
      );
      item.decorations.spriteFrame = decoration.sf;
      item.decorations.node.getComponent(cc.UITransform).setContentSize(extent * 2, extent * 2);
      const g = item.rim;
      g.clear();
      g.strokeColor = color('#f4cb87');
      g.lineWidth = 3 / scale;
      for (const gap of value.gaps ?? []) {
        const edge = Math.max(0, radius - gap.depth),
          half = Math.sqrt(radius * radius - edge * edge);
        const nx = Math.cos(gap.angle),
          ny = Math.sin(gap.angle);
        g.moveTo(nx * edge - ny * half, -ny * edge - nx * half);
        g.lineTo(nx * edge + ny * half, -ny * edge + nx * half);
        g.stroke();
      }
    },
    text(str, x, y, size, tint, font) {
      const value = String(str),
        css = `bold ${size}px ${font}`;
      measure.font = css;
      const w = Math.ceil(measure.measureText(value).width + 8),
        h = Math.ceil(size * 2 + 8);
      this.art(`text:${css}:${tint}:${value}`, x - w / 2, y - h / 2, w, h, (ctx) => {
        ctx.font = css;
        ctx.fillStyle = tint;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value, w / 2, h / 2);
      });
    },
  };
  for (const name of ['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'lineCap'])
    Object.defineProperty(painter, name, {
      get: () => state[name],
      set: (value) => {
        state[name] = value;
      },
    });
  return {
    draw(app) {
      if (disposed) return [];
      frame++;
      spriteIndex = vectorIndex = terrainIndex = order = 0;
      graphic = null;
      state = {
        matrix: identity(),
        clips: [],
        dash: [],
        globalAlpha: 1,
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
      };
      stack = [];
      paths = [];
      current = null;
      const buttons = draw(painter, app);
      for (const sprite of sprites.slice(spriteIndex)) {
        sprite.node.active = false;
        sprite.spriteFrame = null;
      }
      for (const vector of vectors.slice(vectorIndex)) vector.node.active = false;
      for (const item of terrains.slice(terrainIndex)) {
        item.group.active = false;
        item.wood.spriteFrame = null;
        item.decorations.spriteFrame = null;
      }
      // Bound cached level art and dynamic text; never evict resources used by this frame.
      if (bytes > 32 * 1024 * 1024)
        for (const [key, asset] of textures) {
          if (asset.frame === frame) continue;
          release(asset);
          textures.delete(key);
          if (bytes < 24 * 1024 * 1024) break;
        }
      return buttons;
    },
    stats() {
      return {
        engine: cc.VERSION,
        sprites: spriteIndex + terrainIndex * 2,
        graphics: vectorIndex,
        terrains: terrainIndex,
        textures: textures.size,
        bytes,
        uploads,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      origin.destroy();
      for (const asset of textures.values()) release(asset);
      textures.clear();
    },
  };
}
