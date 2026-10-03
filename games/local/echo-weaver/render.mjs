export const COLORS = ['#7bcbdc', '#e6c086', '#d39fca'];
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const localized = (item, key, locale) =>
  locale === 'zh' ? item[`${key}Zh`] || item[key] : item[key];
export const format = (value) => Number(value.toFixed(2)).toString();
const polyline = (points) => points.map((p) => p.join(',')).join(' ');
const pathLength = (points) =>
  points
    .slice(1)
    .reduce(
      (sum, point, i) => sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]),
      0,
    );
let animations = [];
function routePoints(x1, x2, y, option, maxLength) {
  const depth =
    option.reflections > 0 ? Math.min(61, 25 + (option.length / Math.max(1, maxLength)) * 36) : 0;
  if (option.reflections >= 3) {
    const left = x1 + 25;
    const right = x2 - 18;
    const folds = Math.min(10, option.reflections - 1);
    const points = [
      [x1, y],
      [left, y],
      [left, y + depth],
    ];
    for (let fold = 1; fold <= folds; fold++)
      points.push([
        left + ((right - left) * fold) / (folds + 1),
        y + depth * (fold % 2 ? 0.25 : 1),
      ]);
    return [...points, [right, y + depth], [right, y], [x2, y]];
  }
  return depth
    ? [
        [x1, y],
        [x1 + 25, y],
        [x1 + 25, y + depth],
        [x2 - 18, y + depth],
        [x2 - 18, y],
        [x2, y],
      ]
    : [
        [x1, y],
        [x2, y],
      ];
}
function pointAlong(points, fraction) {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let distance = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, fraction));
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? distance / lengths[i] : 0;
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * t,
        points[i][1] + (points[i + 1][1] - points[i][1]) * t,
      ];
    }
    distance -= lengths[i];
  }
  return points[0];
}
export function renderBoard(board, level, state, report, { locale = 'zh', phase = 'ready' } = {}) {
  const zh = locale === 'zh';
  const controls = board.querySelector('#scene-controls');
  const svg = board.querySelector('#scene');
  const focused = document.activeElement?.dataset?.control;
  const busy = phase === 'running' || phase === 'paused';
  const unit = zh ? '拍' : 'b';
  const button = ({ id, x, y, kind, caption, value, angle = 0, color, fixed = false }) =>
    `<${fixed ? 'div' : 'button'} ${fixed ? '' : `type="button" data-control="${id}" ${busy ? 'disabled' : ''} aria-label="${escapeHtml(caption)}"`} class="scene-button ${kind} ${fixed ? 'fixed' : ''}" style="left:${(x / 640) * 100}%;top:${(y / 590) * 100}%;--route-color:${color}">${kind === 'splitter' ? '<svg viewBox="0 0 28 28"><path d="M4 14h7m0 0 11-9M11 14h13M11 14l11 9"/><circle cx="10" cy="14" r="3" fill="currentColor"/></svg>' : kind === 'reflector' ? `<span class="mirror" style="transform:rotate(${angle}deg)"></span>` : `<span class="node-value">${escapeHtml(value)}</span>`}<span class="node-caption">${escapeHtml(caption)}</span></${fixed ? 'div' : 'button'}>`;
  let nodes = '';
  let paths = '';
  animations = [];
  report.echoes.forEach((echo, i) => {
    const route = level.routes[i];
    const y = [112, 292, 472][i];
    const color = COLORS[i];
    const stages = route.stages;
    const reflectors = stages.filter((s) => s.kind === 'reflector');
    const delays = stages.filter((s) => s.kind === 'delay');
    const endX = delays.length ? 472 : 496;
    const startX = 252;
    const width = (endX - startX) / Math.max(1, reflectors.length);
    const stageGeometries = new Map();
    let routePaths = '';
    reflectors.forEach((stage, j) => {
      const x1 = startX + j * width;
      const x2 = startX + (j + 1) * width;
      const choice = state.choices[stage.id] ?? stage.initial ?? 0;
      const selected = stage.options[choice];
      const maxLength = Math.max(...stage.options.map((o) => o.length));
      const points = routePoints(x1, x2, y, selected, maxLength);
      stageGeometries.set(stage.id, {
        points,
        stopDistance: selected.blocked ? pathLength(points) * 0.6 : null,
      });
      for (const option of stage.options) {
        if (option === selected) continue;
        routePaths += `<polyline class="route-path route-ghost" points="${polyline(routePoints(x1, x2, y, option, maxLength))}"/>`;
      }
      routePaths += `<polyline class="route-path route-track" stroke="${color}" points="${polyline(points)}"/><polyline class="route-path route-active" stroke="${color}" points="${polyline(points)}"/>`;
      if (selected.blocked || selected.loss >= 25) {
        const p = pointAlong(points, 0.6);
        routePaths += `<rect class="route-obstacle" x="${p[0] - 11}" y="${p[1] - 16}" width="22" height="32" rx="3"/><text class="route-label" text-anchor="middle" x="${p[0]}" y="${p[1] + 31}">${zh ? '吸音' : 'absorber'}</text>`;
      }
      const label = localized(selected, 'label', locale);
      nodes += button({
        id: stage.id,
        x: x1,
        y,
        kind: 'reflector',
        caption: label,
        color,
        angle: selected.reflections ? -40 : 8,
        fixed: stage.options.length < 2,
      });
    });
    delays.forEach((stage, j) => {
      const x = 482 + j * 36;
      const option = stage.options[state.choices[stage.id] ?? stage.initial ?? 0];
      stageGeometries.set(stage.id, {
        points: [
          [x, y],
          [x, y],
        ],
        stopDistance: option.blocked ? 0 : null,
      });
      routePaths += `<polyline class="route-path route-active" stroke="${color}" points="${endX},${y} 510,${y}"/>`;
      nodes += button({
        id: stage.id,
        x,
        y,
        kind: 'delay',
        caption: zh ? '延迟段' : 'delay',
        value: `+${format(option.delay / level.ticksPerBeat)}`,
        color,
        fixed: stage.options.length < 2,
      });
    });
    const ingress = [
      [150, 292],
      [181, 292],
      [208, y],
      [startX, y],
    ];
    const egress = [
      [delays.length ? 510 : endX, y],
      [531, y],
      [562, 292],
      [583, 292],
    ];
    let alreadyBlocked = false;
    const segments = echo.segments.map((segment) => {
      const geometry = stageGeometries.get(segment.stageId) || {
        points: [
          [startX, y],
          [endX, y],
        ],
        stopDistance: null,
      };
      const visual = { ...segment, ...geometry, suppressed: alreadyBlocked };
      alreadyBlocked ||= segment.blocked;
      return visual;
    });
    if (segments.length) {
      const first = segments[0];
      // Keep an absorber at the same authored point after ingress/egress are
      // included in the animated path. Its fraction of the full path changes.
      if (first.stopDistance !== null) first.stopDistance += pathLength(ingress);
      first.points = [...ingress, ...first.points.slice(1)];
      segments[segments.length - 1].points = [...segments.at(-1).points, ...egress];
      for (const segment of segments)
        segment.stopFraction =
          segment.stopDistance === null
            ? 1
            : segment.stopDistance / Math.max(0.01, pathLength(segment.points));
    }
    animations.push({
      id: echo.id,
      arrival: echo.arrival,
      segments,
      color,
      minEnergy: level.minEnergy,
    });
    paths += `<g style="--route-color:${color}"><path d="M207 ${y - 57}H518" stroke="#33484a" stroke-width=".7" stroke-dasharray="2 7"/><text x="211" y="${y - 71}" class="route-heading" fill="${color}">0${i + 1} · ${escapeHtml(zh ? '回声' : 'ECHO')}</text><text x="515" y="${y - 71}" text-anchor="end" class="route-duration">${format(echo.arrival / level.ticksPerBeat)} ${unit}</text><polyline class="route-path route-active" stroke="${color}" opacity=".35" points="${polyline(ingress)}"/>${routePaths}<polyline class="route-path route-active" stroke="${color}" points="${polyline(egress)}"/><circle id="particle-${echo.id}" class="route-dot" r="5" fill="${color}" opacity="0"/><circle id="arrival-${echo.id}" cx="${575 + i * 10}" cy="325" r="3" fill="${color}" opacity=".2"/></g>`;
  });
  const mode = level.splitter.modes[state.splitter];
  const splitterCaption = localized(mode, 'label', locale);
  nodes =
    button({
      id: 'splitter',
      x: 150,
      y: 292,
      kind: 'splitter',
      caption: splitterCaption,
      color: '#a0e7c8',
      fixed: level.splitter.modes.length < 2,
    }) + nodes;
  nodes += `<button type="button" data-emit class="scene-button source" style="left:${(58 / 640) * 100}%;top:${(292 / 590) * 100}%" aria-label="${zh ? '发出一次声音' : 'Emit one sound'}" ${busy ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6l-5 4H3zm13-3c4 3 4 7 0 10m-2-7c2 1 2 3 0 4"/></svg><span class="node-caption">${zh ? '声源' : 'source'}</span></button>`;
  const miniBeats =
    `<text x="58" y="354" text-anchor="middle" class="route-label">${zh ? '目标拍' : 'BEATS'}</text><path d="M58 388V494" stroke="#47605e" stroke-width="1"/>` +
    report.echoes
      .map(
        (echo, i) =>
          `<g id="mini-beat-${echo.id}" data-status="waiting"><circle id="mini-orb-${echo.id}" cx="58" cy="${[388, 441, 494][i]}" r="15" fill="#182d32" stroke="${COLORS[i]}"/><text id="mini-number-${echo.id}" x="58" y="${[388, 441, 494][i] + 4.5}" text-anchor="middle" fill="${COLORS[i]}" font-size="13" font-family="inherit">${format(echo.target / level.ticksPerBeat)}</text></g>`,
      )
      .join('');
  svg.innerHTML = `<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#4c6564" opacity=".32"/></pattern><pattern id="absorber-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#4e3832"/><path d="M0 0V6" stroke="#a9775e" stroke-width="2"/></pattern><filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="12" y="12" width="616" height="566" fill="url(#grid)"/><path d="M20 56V39h17M603 39h17v17M20 541v17h17M603 558h17v-17" stroke="#435d58" fill="none" stroke-width="1"/><path d="M58 292H151" stroke="#a0e7c8" stroke-width="2" opacity=".7"/><circle id="source-ring" cx="58" cy="292" r="30" fill="none" stroke="#a0e7c8" opacity=".13"/><text x="99" y="247" class="route-label" text-anchor="middle">${zh ? '一次发声' : 'ONE SOUND'}</text>${miniBeats}${paths}<circle class="receiver-ring" cx="587" cy="292" r="26"/><circle cx="587" cy="292" r="18" stroke="#729d82" fill="none" opacity=".5"/><text class="receiver-mark" x="587" y="298">◎</text><text class="receiver-label" x="587" y="351">${zh ? '接收器' : 'receiver'}</text><text x="28" y="571" class="route-label">${zh ? '声道时长以标注为准' : 'TIMING FOLLOWS MARKED CHANNEL LENGTHS'}</text>`;
  controls.innerHTML = nodes;
  board.dataset.level = level.id;
  board.dataset.status = phase;
  if (focused)
    controls.querySelector(`[data-control="${focused}"]`)?.focus({ preventScroll: true });
}
export function animateBoard(board, report, tick, active) {
  for (const route of animations) {
    const dot = board.querySelector(`#particle-${route.id}`);
    const segment = route.segments.find((s) => tick >= s.start && tick < s.end);
    if (active && segment && !segment.suppressed && tick < route.arrival) {
      const span = segment.end - segment.start;
      const hold = segment.delay ? Math.max(0, segment.delay - 0.2) : 0;
      const fraction = (tick - segment.start - hold) / Math.max(0.01, span - hold);
      const point = pointAlong(segment.points, Math.min(fraction, segment.stopFraction));
      let opacity = 1;
      if (segment.blocked) {
        const stoppedAt = segment.start + hold + segment.stopFraction * (span - hold);
        opacity = Math.max(0, 1 - Math.max(0, tick - stoppedAt) / 0.55);
      } else if (segment.status === 'weak') {
        const progress = Math.max(0, Math.min(1, fraction));
        const energy =
          segment.energyBefore + (segment.energyAfter - segment.energyBefore) * progress;
        opacity = Math.max(
          0,
          Math.min(1, energy / Math.max(route.minEnergy, segment.energyBefore, 0.01)),
        );
      }
      dot.setAttribute('cx', point[0]);
      dot.setAttribute('cy', point[1]);
      dot.setAttribute('opacity', String(opacity));
      dot.setAttribute('r', fraction < 0 ? String(4 + Math.sin(tick * 8) * 1) : '5');
    } else dot?.setAttribute('opacity', '0');
    const echo = report.echoes.find((e) => e.id === route.id);
    const hit = tick >= route.arrival && echo.status === 'on-time';
    const miss = tick >= Math.min(route.arrival, echo.target) && echo.status !== 'on-time';
    const audible = echo.status !== 'blocked' && echo.status !== 'weak';
    board
      .querySelector(`#arrival-${route.id}`)
      ?.setAttribute('opacity', tick >= route.arrival && audible ? (hit ? '1' : '.4') : '.2');
    board
      .querySelector(`#mini-beat-${route.id}`)
      ?.setAttribute('data-status', hit ? 'hit' : miss ? 'miss' : 'waiting');
    const orb = board.querySelector(`#mini-orb-${route.id}`);
    orb?.setAttribute('fill', hit ? route.color : '#182d32');
    orb?.setAttribute('opacity', miss ? '.45' : '1');
    orb?.setAttribute('stroke-dasharray', miss ? '2 3' : 'none');
    const number = board.querySelector(`#mini-number-${route.id}`);
    number?.setAttribute('fill', hit ? '#0e2526' : route.color);
    number?.setAttribute('opacity', miss ? '.6' : '1');
  }
  const ring = board.querySelector('#source-ring');
  ring?.setAttribute('r', active ? String(26 + Math.min(1, tick) * 30) : '30');
  ring?.setAttribute('opacity', active ? String(Math.max(0, 0.6 - tick * 0.6)) : '.13');
}
