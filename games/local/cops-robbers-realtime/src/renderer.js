import { drawRoleAvatar, getRoleAppearance } from "./role-appearance.js";
import { BODY_GAP, CAPTURE_RADIUS, roadDistance, isExitBlocked } from "./engine.js";

const W = 1000,
  H = 600;
const INK = "#29493f";
const BLUE = "#337fbc";
const FONT = '"Trebuchet MS", "Microsoft YaHei", sans-serif';

function round(ctx, x, y, w, h, r, fill, stroke, width = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function line(ctx, points, color, width = 2) {
  ctx.beginPath();
  points.forEach((p, i) =>
    i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function star(ctx, x, y, radius, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2,
      r = i % 2 ? radius * 0.46 : radius;
    const px = x + Math.cos(a) * r,
      py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

function tree(ctx, x, y, size, variant) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ellipse(ctx, 5, 12, 20, 8, "#8aaa862b");
  round(ctx, -3, -2, 6, 16, 2, "#a58162");
  ellipse(ctx, 0, -9, 20, 23, variant ? "#70a580" : "#83b68a", "#689278", 1.5);
  ellipse(ctx, -7, -18, 11, 11, variant ? "#91bd96" : "#acd09f");
  line(
    ctx,
    [
      [0, 6],
      [0, -12],
    ],
    "#5f8e6c",
    1.4,
  );
  line(
    ctx,
    [
      [0, -2],
      [8, -10],
    ],
    "#5f8e6c",
    1.4,
  );
  ctx.restore();
}

function house(ctx, x, y, variant) {
  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 7, 27, 44, 13, "#8aaa862b");
  round(ctx, -39, -20, 78, 50, 7, "#edf1ce", "#7c9980", 1.5);
  round(ctx, -39, -19, 78, 12, 4, "#ccd9b4");
  round(
    ctx,
    -43,
    -42,
    86,
    37,
    7,
    variant % 2 ? "#d68e6c" : "#9aada0",
    "#5c7768",
    2,
  );
  round(ctx, -38, -38, 76, 23, 4, variant % 2 ? "#e9ac83" : "#b9c8b6");
  for (let i = 0; i < 3; i++)
    line(
      ctx,
      [
        [-30 + i * 26, -36],
        [-30 + i * 26, -17],
      ],
      variant % 2 ? "#cc8e69" : "#9bad9c",
      1,
    );
  round(ctx, -29, 1, 17, 16, 3, "#7faaa1", "#6d9186", 1);
  line(
    ctx,
    [
      [-20, 2],
      [-20, 16],
    ],
    "#d9e9c9",
    2,
  );
  line(
    ctx,
    [
      [-28, 8],
      [-13, 8],
    ],
    "#d9e9c9",
    2,
  );
  round(ctx, 10, 0, 16, 29, 3, "#a4846b", "#7e8162", 1);
  ellipse(ctx, 21, 16, 1.5, 1.5, "#f8e5b1");
  round(ctx, 6, 27, 24, 5, 2, "#c5c5a5");
  round(ctx, 17, -52, 12, 19, 2, "#d9c1a0", "#8c9c7d", 1.5);
  round(ctx, 14, -54, 18, 5, 2, "#f0ddba");
  ctx.restore();
}

function bench(ctx, x, y, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  round(ctx, -21, -9, 42, 23, 5, "#91af8625");
  line(
    ctx,
    [
      [-14, 0],
      [-14, 14],
    ],
    "#77907b",
    3,
  );
  line(
    ctx,
    [
      [14, 0],
      [14, 14],
    ],
    "#77907b",
    3,
  );
  round(ctx, -23, -8, 46, 6, 2, "#c4a676", "#9c936d", 1);
  round(ctx, -23, 0, 46, 6, 2, "#d8bc8c", "#9c936d", 1);
  ctx.restore();
}

function flowers(ctx, x, y, variant) {
  ellipse(ctx, x, y, 29, 17, "#94b991");
  ellipse(ctx, x, y - 2, 25, 13, "#acc49b");
  for (let i = 0; i < 7; i++) {
    const px = x + Math.cos(i * 2.4) * (8 + i * 2),
      py = y + Math.sin(i * 2.4) * 8 - 4;
    ellipse(
      ctx,
      px,
      py,
      3.2,
      3.2,
      i % 3 === 0 ? "#f6de92" : variant ? "#f0ac91" : "#f6efe0",
    );
    ellipse(ctx, px, py, 1, 1, "#bb8d64");
  }
}

function buildMap(level) {
  const W = level.worldWidth || 1000, H = level.worldHeight || 600;
  const bg = document.createElement("canvas");
  bg.width = W * 2;
  bg.height = H * 2;
  const ctx = bg.getContext("2d");
  ctx.scale(2, 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = "#bdd3ab";
  ctx.fillRect(0, 0, W, H);
  round(ctx, 14, 14, W - 28, H - 28, 29, "#ccdec0", "#adc6a4", 1.5);
  round(ctx, 24, 24, W - 48, H - 48, 23, "#ccdec0", "#e5edce", 1);
  const distance = (x, y) =>
    Math.min(
      ...level.edges.map(([a, b]) =>
        segmentDistance(x, y, level.nodes[a], level.nodes[b]),
      ),
    );
  // ponytail: a fixed decoration lattice is enough for 48 small maps; author landmarks if a future map needs them.
  for (let y = 37; y < H - 25; y += 29)
    for (let x = 32; x < W - 25; x += 33) {
      const k = (x * 11 + y * 7 + (Number(level.id) || 1) * 13) % 19;
      if (distance(x, y) < 35) continue;
      ellipse(ctx, x + k / 3, y, 1.4, 0.9, k % 3 ? "#adc59c66" : "#eaf0ceaa");
      if (k < 4)
        line(
          ctx,
          [
            [x - 2, y + 1],
            [x, y - 3],
            [x + 2, y + 1],
          ],
          "#b2c8a3",
          1,
        );
    }
  const occupied = [];
  for (let gy = 0; gy < 5; gy++)
    for (let gx = 0; gx < 8; gx++) {
      const seed = (gx * 37 + gy * 53 + (Number(level.id) || 1) * 17) % 101;
      const x = 79 + gx * 120 + (seed % 13) - 6,
        y = 84 + gy * 105 + (seed % 17) - 8;
      const d = distance(x, y);
      if (d > 100 && seed % 4 === 0 && x < 910 && y > 83 && y < 507) {
        house(ctx, x, y, Math.floor(seed / 4));
        occupied.push({ x, y, r: 83 });
      } else if (
        d > 65 &&
        !occupied.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + 27)
      ) {
        if (seed % 5 < 2) tree(ctx, x, y, 0.8 + (seed % 4) * 0.08, seed % 2);
        else if (seed % 5 === 2) flowers(ctx, x, y, seed % 2);
        else if (d > 75 && seed % 5 === 3)
          bench(ctx, x, y, seed % 2 ? 0.08 : -0.08);
      }
    }
  const road = (color, width, offset = 0) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [a, b] of level.edges) {
      ctx.moveTo(level.nodes[a].x, level.nodes[a].y + offset);
      ctx.lineTo(level.nodes[b].x, level.nodes[b].y + offset);
    }
    ctx.stroke();
  };
  road("#839c8040", 62, 5);
  road("#b9b89a", 60);
  road("#f5ecd6", 56);
  road("#fffae9", 46);
  road("#efe4cb", 42);
  ctx.setLineDash([3, 8]);
  road("#fdf9eccc", 1.8);
  ctx.setLineDash([]);
  const degree = level.nodes.map(
    (_, i) => level.edges.filter((e) => e.includes(i)).length,
  );
  for (let i = 0; i < level.nodes.length; i++) {
    const node = level.nodes[i];
    ellipse(
      ctx,
      node.x,
      node.y,
      degree[i] > 2 ? 17 : 10,
      degree[i] > 2 ? 17 : 10,
      "#f4e9d1",
    );
    ellipse(ctx, node.x, node.y, 3, 3, "#d1c6aa");
    if (degree[i] < 3) continue;
    for (const edge of level.edges.filter((e) => e.includes(i))) {
      const other = level.nodes[edge[0] === i ? edge[1] : edge[0]];
      if (Math.hypot(other.x - node.x, other.y - node.y) < 105) continue;
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.rotate(Math.atan2(other.y - node.y, other.x - node.x));
      ctx.fillStyle = "#fffbed";
      for (let s = -2; s <= 2; s++)
        round(ctx, 34, s * 8 - 2.5, 13, 5, 1, "#fffbee");
      ctx.restore();
    }
  }
  // Tiny corner markings live outside the playable road bounds.
  ctx.save();
  ctx.translate(957, 548);
  ctx.strokeStyle = "#74947f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(-5, 4);
  ctx.lineTo(0, 1);
  ctx.lineTo(5, 4);
  ctx.closePath();
  ctx.stroke();
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#6f8e78";
  ctx.fillText("N", 0, -19);
  ctx.restore();
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#7d997d";
  ctx.fillText("NEIGHBORHOOD PATROL", 39, 559);
  return bg;
}

export function route(ctx, actor, selected) {
  if (!actor.destination) return;
  const points = [{ x: actor.x, y: actor.y }, ...(actor.routePoints || [])];
  if (points.length < 2) points.push(actor.destination);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(selected ? [8, 7] : [4, 9]);
  line(
    ctx,
    points.map((p) => [p.x, p.y]),
    selected ? "#438ed6a6" : "#438ed649",
    selected ? 3.5 : 2,
  );
  ctx.setLineDash([]);
  const { x, y } = actor.destination;
  ellipse(ctx, x, y, 11, 4, selected ? "#448bc942" : "#448bc922");
  line(
    ctx,
    [
      [x, y],
      [x, y - 24],
    ],
    selected ? "#36729b" : "#85a5b3",
    2,
  );
  ctx.beginPath();
  ctx.moveTo(x, y - 24);
  ctx.lineTo(x + 19, y - 19);
  ctx.lineTo(x, y - 13);
  ctx.closePath();
  ctx.fillStyle = selected ? "#337fbc" : "#9cbcc5";
  ctx.fill();
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff8df";
  ctx.fillText(String(actor.id + 1), x + 6, y - 19);
  ctx.restore();
}

function bubble(ctx, x, y, text, color = INK, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.font = `bold ${text.length > 3 ? 11 : 15}px ${FONT}`;
  const w = Math.max(25, ctx.measureText(text).width + 17);
  round(ctx, -w / 2, -23, w, 25, 9, "#fff9e8", color, 1.5);
  ctx.beginPath();
  ctx.moveTo(-4, 1);
  ctx.lineTo(1, 7);
  ctx.lineTo(5, 1);
  ctx.fillStyle = "#fff9e8";
  ctx.fill();
  line(
    ctx,
    [
      [-4, 2],
      [1, 7],
      [5, 2],
    ],
    color,
    1.5,
  );
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 0, -10);
  ctx.restore();
}

function guardRange(ctx, game, cop, selected) {
  ctx.save();
  ctx.beginPath();
  for (let id = 0; id < game.graph.edges.length; id++) {
    const { a, b, length } = game.graph.edges[id];
    const start = game.graph.nodes[a],
      end = game.graph.nodes[b];
    const fromA = CAPTURE_RADIUS - roadDistance(game, cop, { edge: id, t: 0 });
    const fromB = CAPTURE_RADIUS - roadDistance(game, cop, { edge: id, t: 1 });
    const spans = [];
    if (fromA > 0) spans.push([0, Math.min(length, fromA)]);
    if (fromB > 0) spans.push([Math.max(0, length - fromB), length]);
    if (cop.edge === id)
      spans.push([
        Math.max(0, cop.t * length - CAPTURE_RADIUS),
        Math.min(length, cop.t * length + CAPTURE_RADIUS),
      ]);
    for (const [lo, hi] of spans) {
      ctx.moveTo(
        start.x + ((end.x - start.x) * lo) / length,
        start.y + ((end.y - start.y) * lo) / length,
      );
      ctx.lineTo(
        start.x + ((end.x - start.x) * hi) / length,
        start.y + ((end.y - start.y) * hi) / length,
      );
    }
  }
  ctx.strokeStyle = selected ? "#4699cc35" : "#4699cc20";
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.setLineDash([2, 7]);
  ctx.strokeStyle = selected ? "#3986b775" : "#3986b73a";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function exitAngle(level, node) {
  const point = level.nodes[node];
  const links = level.edges.filter((edge) => edge.includes(node));
  if (links.length === 1) {
    const other = level.nodes[links[0].find((id) => id !== node)];
    return Math.atan2(point.y - other.y, point.x - other.x);
  }
  const sides = [point.x, (level.worldWidth || W) - point.x, point.y, (level.worldHeight || H) - point.y];
  return [Math.PI, 0, -Math.PI / 2, Math.PI / 2][
    sides.indexOf(Math.min(...sides))
  ];
}

function exitLabels(level, top) {
  const placed = [];
  // ponytail: eight nearby positions fit these grid maps; author sign offsets if future exits overlap.
  return (level.exits || []).map((node) => {
    const point = level.nodes[node];
    const candidates = [
      [0, 58],
      [0, -58],
      [112, 0],
      [-112, 0],
      [112, 75],
      [-112, 75],
      [112, -75],
      [-112, -75],
    ].map(([dx, dy]) => ({
      x: Math.max(82, Math.min((level.worldWidth || W) - 82, point.x + dx)),
      y: Math.max(top + 23, Math.min((level.worldHeight || H) - 48, point.y + dy)),
    }));
    const score = (candidate) => {
      const roadClearance = Math.min(
        ...level.edges.map(([a, b]) => {
          const start = level.nodes[a],
            end = level.nodes[b];
          const dx = end.x - start.x,
            dy = end.y - start.y;
          return (
            segmentDistance(candidate.x, candidate.y, start, end) -
            (Math.abs(dy) * 75 + Math.abs(dx) * 22) / Math.hypot(dx, dy)
          );
        }),
      );
      const overlap = placed.some(
        (other) =>
          Math.abs(other.x - candidate.x) < 158 &&
          Math.abs(other.y - candidate.y) < 51,
      );
      return (
        Math.min(roadClearance, 70) -
        (overlap ? 200 : 0) -
        Math.hypot(candidate.x - point.x, candidate.y - point.y) * 0.08
      );
    };
    candidates.sort((a, b) => score(b) - score(a));
    placed.push(candidates[0]);
    return candidates[0];
  });
}

function exitMarker(ctx, game, exit, index, label, t) {
  const blocked = isExitBlocked(game, exit);
  const nearby = game.robbers.filter(
    (robber) =>
      !robber.caught &&
      !robber.escaped &&
      roadDistance(game, robber, exit) < 180,
  );
  const escaped = game.robbers.some(
    (robber) => robber.escaped && robber.exitTarget === exit.node,
  );
  const progress = Math.max(
    0,
    ...nearby
      .filter((robber) => robber.exitTarget === exit.node)
      .map((robber) => robber.escapeProgress || 0),
  );
  const danger = !blocked && nearby.length > 0;
  const color = blocked ? "#357eb0" : danger || escaped ? "#c84f38" : "#c87837";
  ctx.save();
  line(
    ctx,
    [
      [exit.x, exit.y],
      [label.x, label.y],
    ],
    `${color}77`,
    1.5,
  );
  ctx.translate(exit.x, exit.y);
  ellipse(
    ctx,
    0,
    0,
    36,
    36,
    danger ? `rgba(215,78,44,${0.15 + Math.sin(t * 8) * 0.06})` : `${color}18`,
    color,
    2,
  );
  if (progress > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, 40, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.strokeStyle = "#d6422d";
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.rotate(exitAngle(game.level, exit.node));
  round(ctx, -19, -27, 42, 54, 8, blocked ? "#d5e9ec" : "#ffe1a8");
  for (const y of [-31, 19]) {
    round(ctx, -13, y, 26, 12, 3, color, "#fff6df", 2);
    line(
      ctx,
      [
        [-6, y + 2],
        [-1, y + 10],
      ],
      "#ffefd2",
      3,
    );
    line(
      ctx,
      [
        [4, y + 2],
        [9, y + 10],
      ],
      "#ffefd2",
      3,
    );
  }
  if (blocked) {
    round(ctx, -6, -26, 12, 52, 3, color, "#fff6df", 2);
    for (let y = -21; y < 23; y += 12)
      line(
        ctx,
        [
          [-4, y],
          [4, y + 5],
        ],
        "#eef8ec",
        3,
      );
  } else {
    line(
      ctx,
      [
        [-13, 0],
        [24, 0],
      ],
      color,
      5,
    );
    line(
      ctx,
      [
        [13, -10],
        [24, 0],
        [13, 10],
      ],
      color,
      5,
    );
  }
  ctx.restore();
  ctx.save();
  const status = escaped
    ? "已逃脱"
    : progress > 0
      ? `翻越中 ${Math.max(0, (1 - progress) * game.exitHoldSeconds).toFixed(1)}s`
      : blocked
        ? "已封锁"
        : danger
          ? "突围队逼近！"
          : "出口开放";
  round(
    ctx,
    label.x - 75,
    label.y - 22,
    150,
    44,
    9,
    blocked ? "#eaf4ee" : danger || escaped ? "#ffe8db" : "#fff6df",
    color,
    2,
  );
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText(
    `逃脱口 ${String.fromCharCode(65 + index)}`,
    label.x,
    label.y - 8,
  );
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(status, label.x, label.y + 10);
  ctx.restore();
}

export function actorBody(ctx, actor, cop, selected, t, salute, caughtAge, celebrating, escapedAge) {
  const role = cop ? "cop" : "robber", {color} = getRoleAppearance(role);
  const stride = actor.moving ? Math.sin(t * 16 + actor.id * 2) * 5 : 0;
  ctx.save(); ctx.translate(actor.x, actor.y);
  if(actor.caught) ctx.globalAlpha = Math.max(0,1-Math.max(0,caughtAge-.65)/.7);
  else if(actor.escaped) ctx.globalAlpha = Math.max(0,1-escapedAge/.9);
  ellipse(ctx,0,6,19,7,"#43594735");
  if(selected) ellipse(ctx,0,0,30,21,"#fff9e955",color,4);
  line(ctx,[[-9,-5],[-10-stride,7]],color,7); line(ctx,[[9,-5],[10+stride,7]],color,7);
  drawRoleAvatar(ctx,role,-23,-52-Math.abs(stride)*.4,46);
  ellipse(ctx,22,-49,10,10,"#fff9e9",color,2);
  ctx.font=`bold 12px ${FONT}`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle=color;ctx.fillText(String(actor.id+1),22,-49);
  if(actor.caught) bubble(ctx,0,-75,"合围！",color,.9);
  else if(actor.escaped) bubble(ctx,0,-75,"突围！",color,.9);
  else if(actor.escapeProgress>0) bubble(ctx,0,-75,"冲线！",color,.9);
  else if(salute) bubble(ctx,0,-75,"收到！",color,.8);
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let width = 1,
    height = 1,
    dpr = 1,
    scale = 1,
    ox = 0,
    oy = 0,
    labelTop = 34;
  let cachedLevel = null,
    background = null,
    labels = [],
    lastTime = -1;
  const orders = new Map(),
    captures = new Map(),
    escapes = new Map();
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsW = Math.round(width * dpr),
      pixelsH = Math.round(height * dpr);
    if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
      canvas.width = pixelsW;
      canvas.height = pixelsH;
    }
    const W = cachedLevel?.worldWidth || 1000, H = cachedLevel?.worldHeight || 600;
    scale = Math.min(width / W, height / H);
    ox = (width - W * scale) / 2;
    oy = (height - H * scale) / 2;
    const hud = canvas.parentElement?.querySelector(".board-top");
    labelTop = Math.max(
      34,
      ((hud ? hud.getBoundingClientRect().bottom - rect.top : 0) + 8 - oy) /
        scale,
    );
    if (cachedLevel) labels = exitLabels(cachedLevel, labelTop);
  }
  resize();
  const observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - ox) / scale,
      y: (clientY - rect.top - oy) / scale,
    };
  }
  function toScreen({ x, y }) {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ox + x * scale, y: rect.top + oy + y * scale };
  }
  function draw(
    game,
    {
      selected = 0,
      preview = null,
      pointer = null,
      hover = null,
      captureHint = null,
      practiceTarget = false,
      reducedMotion = false,
      now = performance.now(),
    } = {},
  ) {
    if (!game?.level) return;
    if (cachedLevel !== game.level || game.time < lastTime) {
      cachedLevel = game.level;
      resize();
      background = buildMap(game.level);
      labels = exitLabels(game.level, labelTop);
      orders.clear();
      captures.clear();
      escapes.clear();
    }
    lastTime = game.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ccdec0";
    ctx.fillRect(0, 0, width, height);
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.drawImage(background, 0, 0, game.level.worldWidth || W, game.level.worldHeight || H);
    const seconds = now / 1000,
      t = reducedMotion ? 0 : game.time || 0;
    (game.exits || []).forEach((exit, index) =>
      exitMarker(ctx, game, exit, index, labels[index], t),
    );
    for (const cop of game.cops) {
      const key = cop.destination
        ? `${cop.destination.x.toFixed(1)},${cop.destination.y.toFixed(1)}`
        : "";
      if (orders.get(cop.id)?.key !== key)
        orders.set(cop.id, { key, at: key ? seconds : -99 });
      guardRange(ctx, game, cop, cop.id === selected);
      route(ctx, cop, game.playerRole !== "robber" && cop.id === selected);
    }
    if (game.playerRole === "robber") for (const robber of game.robbers) route(ctx, robber, robber.id === selected);
    if (captureHint && game.phase !== "ready" && game.phase !== "won") {
      const { robber, gap } = captureHint;
      ellipse(ctx, robber.x, robber.y, 31, 23, null, "#bd6c37", 2);
      if (gap) {
        ctx.save();
        ctx.setLineDash([9, 7]);
        line(ctx, [[gap.from.x, gap.from.y], [gap.to.x, gap.to.y]], "#dd6c31", 10);
        ctx.restore();
      }
    }
    if (practiceTarget) {
      ellipse(ctx, 500, 300, 36, 36, "#d5ecff88", BLUE, 3);
      bubble(ctx, 500, 235, "点这里推进", BLUE, 1);
    }
    if (preview?.length) {
      ctx.save();
      ctx.setLineDash([7, 6]);
      line(
        ctx,
        preview.map((p) => [p.x, p.y]),
        "#327ab9",
        3.5,
      );
      ctx.setLineDash([]);
      const dest = preview.at(-1);
      ellipse(ctx, dest.x, dest.y, 15, 15, "#fff8dfaa", "#327ab9", 2);
      ellipse(ctx, dest.x, dest.y, 4, 4, "#327ab9");
      ctx.restore();
    } else if (pointer && game.phase === "playing")
      ellipse(ctx, pointer.x, pointer.y, 8, 8, "#fff9e544", "#487a6a66", 1.5);
    if (hover) {
      const { actor, cop } = hover;
      const color = getRoleAppearance(cop ? game.playerRole : game.playerRole === "robber" ? "cop" : "robber").color;
      ellipse(ctx, actor.x, actor.y, 30, 19, cop ? "#327ab922" : "#c8643522", color, 3);
      bubble(ctx, actor.x, actor.y < 150 ? actor.y + 65 : actor.y - 70,
        cop ? `${actor.id + 1} 号 · 点击选中 / 拖动` : "对方队员 · 点击道路包抄", color, 0.8);
    }
    for (const robber of game.robbers) {
      if (robber.caught && !captures.has(robber.id))
        captures.set(robber.id, seconds);
      if (robber.escaped && !escapes.has(robber.id))
        escapes.set(robber.id, seconds);
      if (!robber.caught && !robber.escaped && robber.capture > 0) {
        ellipse(ctx, robber.x, robber.y, 25, 25, "#edaa6133", "#edb17b66", 3);
        ctx.beginPath();
        ctx.arc(
          robber.x,
          robber.y,
          25,
          -Math.PI / 2,
          -Math.PI / 2 + Math.min(1, robber.capture) * Math.PI * 2,
        );
        ctx.strokeStyle = "#d67746";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
    const actors = [
      ...game.cops.map((actor) => ({ actor, cop: true })),
      ...game.robbers.map((actor) => ({ actor, cop: false })),
    ];
    actors.sort((a, b) => a.actor.y - b.actor.y);
    for (const { actor, cop } of actors) {
      const caughtAge = actor.caught ? seconds - captures.get(actor.id) : 0;
      const escapedAge = actor.escaped ? seconds - escapes.get(actor.id) : 0;
      if (actor.caught && caughtAge > 1.35) continue;
      if (actor.escaped && escapedAge > 0.9) continue;
      const salute =
        cop &&
        game.phase === "playing" &&
        seconds - (orders.get(actor.id)?.at ?? -99) < 0.6;
      const neighbours =
        cop || actor.caught || actor.escaped
          ? []
          : game.robbers.filter(
              (other) =>
                !other.caught &&
                !other.escaped &&
                Math.hypot(other.x - actor.x, other.y - actor.y) < 28,
            );
      const offset =
        neighbours.length > 1
          ? (neighbours.findIndex((other) => other.id === actor.id) -
              (neighbours.length - 1) / 2) *
            16
          : 0;
      let displayed = offset
        ? {
            ...actor,
            x: actor.x + offset,
            y: actor.y + Math.abs(offset) * 0.18,
          }
        : actor;
      if (actor.escaped) {
        const angle = exitAngle(game.level, actor.exitTarget);
        const distance = reducedMotion ? 0 : escapedAge * 115;
        displayed = {
          ...displayed,
          x: displayed.x + Math.cos(angle) * distance,
          y: displayed.y + Math.sin(angle) * distance,
          angle,
          moving: !reducedMotion,
          capture: 0,
          escapeProgress: 0,
          emotion: "escaped",
        };
      } else if (game.phase !== "playing")
        displayed = { ...displayed, moving: false };
      actorBody(
        ctx,
        displayed,
        cop,
        cop === (game.playerRole !== "robber") && actor.id === selected,
        t + (actor.escaped && !reducedMotion ? escapedAge : 0),
        salute,
        caughtAge,
        cop && game.phase === "won",
        escapedAge,
      );
    }
  }
  return {
    draw,
    toWorld,
    toScreen,
    resize,
    destroy() {
      observer?.disconnect();
      orders.clear();
      captures.clear();
      escapes.clear();
    },
  };
}
