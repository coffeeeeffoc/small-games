import { panelEndpoints } from '../shared/core/acoustics.js';

export function roomViewport(scene, width, height) {
  const scale = Math.min((width - 52) / scene.width, (height - 52) / scene.height);
  return { scale, x: (width - scene.width * scale) / 2, y: (height - scene.height * scale) / 2 };
}
export function roomPoint(point, view) {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}
function segmentDistance(point, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
}
export function hitObject(scene, point, view) {
  const target = roomPoint(point, view);
  const hits = [
    ...['source', 'listener'].map((id) => ({
      id,
      distance: Math.hypot(target.x - scene[id].x, target.y - scene[id].y),
    })),
    ...scene.panels.map((panel) => ({
      id: panel.id,
      distance: segmentDistance(target, ...panelEndpoints(panel)),
    })),
  ];
  hits.sort((a, b) => a.distance - b.distance);
  return hits[0]?.distance * view.scale <= 22 ? hits[0].id : null;
}
export function drawRoom(ctx, scene, geometry, selected, width, height, pathsVisible = true) {
  const view = roomViewport(scene, width, height);
  const screen = (point) => ({
    x: view.x + point.x * view.scale,
    y: view.y + point.y * view.scale,
  });
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#19271f';
  ctx.fillRect(0, 0, width, height);
  const line = (points, color, lineWidth = 1) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    points.forEach((point, index) => {
      const p = screen(point);
      if (index) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
  };
  for (let x = 0; x <= scene.width; x += 10)
    line(
      [
        { x, y: 0 },
        { x, y: scene.height },
      ],
      '#283b2e',
    );
  for (let y = 0; y <= scene.height; y += 10)
    line(
      [
        { x: 0, y },
        { x: scene.width, y },
      ],
      '#283b2e',
    );
  line(
    [
      { x: 0, y: 0 },
      { x: scene.width, y: 0 },
      { x: scene.width, y: scene.height },
      { x: 0, y: scene.height },
      { x: 0, y: 0 },
    ],
    '#64785e',
    2,
  );
  if (pathsVisible) {
    for (const path of geometry.paths)
      line(path.points, path.order === 0 ? '#8ab8dc99' : '#b7ee8130');
  }
  for (const panel of scene.panels) {
    if (panel.id === selected) line(panelEndpoints(panel), '#ffffff55', 13);
    line(panelEndpoints(panel), panel.type === 'absorber' ? '#e5b46c' : '#b7ee81', 6);
  }
  for (const [id, color, label] of [
    ['source', '#ed9b89', '声源'],
    ['listener', '#8ab8dc', '收音点'],
  ]) {
    const p = screen(scene[id]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, selected === id ? 16 : 12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (selected === id) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = '#e8efe5';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, p.x, p.y - 23);
  }
  return view;
}
