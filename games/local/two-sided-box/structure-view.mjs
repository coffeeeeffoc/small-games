import { getSnapshot } from './engine.mjs';
import { BOX_HALF, FACE_IDS, FACE_DEFS } from './faces.mjs';
import { SHAFT_TRAVEL } from './geometry.mjs';
import { buildStructureModel } from './structure-model.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const add = (a, b) => a.map((value, i) => value + b[i]);
const mul = (a, value) => a.map((part) => part * value);
const TAU = Math.PI * 2;
function tint(hex, amount = 1) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${[16, 8, 0].map((shift) => Math.round(((value >> shift) & 255) * amount)).join(',')})`;
}

/** Both playable face projections and the orbitable inspector use one world model. */
export function createStructureViewer(canvas, options = {}) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法显示机关盒。');
  const mode = options.mode === 'face' ? 'face' : 'structure';
  let basisFace = 'front';
  let yaw = mode === 'face' ? 0 : -0.58;
  let pitch = mode === 'face' ? 0 : 0.35;
  let magnification = 1;
  let xray = true;
  let exploded = false;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let frame = 0;
  let disposed = false;
  let current = null;
  let model = null;
  let stateSignature = '';
  let pinchDistance = 0;
  let action = null;
  let selectedIndex = 0;
  const pointers = new Map();
  const listeners = [];
  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    mode === 'face'
      ? '当前观察窗的空间投影。拖动本面滑轴或点击挡位，轻点锁扣。方向键选择和调整，回车操作。'
      : '机关盒 3D 结构。拖动旋转，双指或滚轮缩放，方向键旋转。',
  );
  canvas.dataset.mode = mode;
  canvas.dataset.view = mode === 'face' ? 'front' : 'angled';

  function on(type, handler, eventOptions) {
    canvas.addEventListener(type, handler, eventOptions);
    listeners.push([type, handler, eventOptions]);
  }
  function rotatePoint(point) {
    const basis = FACE_DEFS[basisFace];
    const x = dot(point, basis.u);
    const y = dot(point, basis.v);
    const z = dot(point, basis.normal);
    if (mode === 'face') return [x, y, z];
    const tx = x * Math.cos(yaw) + z * Math.sin(yaw);
    const tz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [
      tx,
      y * Math.cos(pitch) - tz * Math.sin(pitch),
      y * Math.sin(pitch) + tz * Math.cos(pitch),
    ];
  }
  function project(point) {
    const [x, y, z] = rotatePoint(point);
    const perspective = mode === 'face' ? 1 : 2000 / (2000 - z);
    const scale =
      Math.max(
        0.01,
        mode === 'face'
          ? Math.min((width - 38) / (BOX_HALF * 2 + 22), (height - 76) / (BOX_HALF * 2 + 22))
          : Math.min((width - 30) / 980, (height - 82) / 930),
      ) *
      magnification *
      perspective;
    return { x: width / 2 + x * scale, y: height / 2 + 3 - y * scale, z, scale };
  }
  function queueRender() {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  }
  function rebuild() {
    if (!current || disposed) return;
    model = buildStructureModel(current.level, current.snapshot, current.ball, {
      xray,
      exploded,
      mode,
      face: basisFace,
    });
    canvas.dataset.xray = String(xray);
    canvas.dataset.exploded = String(exploded);
    canvas.dataset.geometryCount = String(model.items.length);
    canvas.dataset.faces = model.faces.join(',');
    for (const [key, value] of Object.entries(model.counts)) canvas.dataset[key] = String(value);
    selectedIndex = Math.min(selectedIndex, Math.max(0, model.controls.length - 1));
    queueRender();
  }
  function trace(points) {
    points.forEach((point, i) =>
      i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
    );
    context.closePath();
  }
  function drawItem(item, points, holes) {
    context.globalAlpha = item.alpha ?? 1;
    if (item.type === 'polygon' || item.type === 'line') {
      context.beginPath();
      points.forEach((point, i) =>
        i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
      );
      if (item.type === 'polygon') {
        context.closePath();
        holes?.forEach(trace);
        context.fillStyle = tint(item.fill, item.shade ?? 1);
        context.fill('evenodd');
      }
      context.strokeStyle = item.stroke;
      context.lineWidth = item.type === 'polygon' ? 0.65 : item.width;
      context.setLineDash(item.dash ?? []);
      context.stroke();
      context.setLineDash([]);
    } else if (item.type === 'sphere') {
      const point = points[0];
      const radius = Math.max(item.ball ? 3.5 : 1.6, item.radius * point.scale);
      const gradient = context.createRadialGradient(
        point.x - radius * 0.3,
        point.y - radius * 0.35,
        radius * 0.07,
        point.x,
        point.y,
        radius,
      );
      gradient.addColorStop(0, '#fff0c6');
      gradient.addColorStop(0.33, item.fill);
      gradient.addColorStop(1, tint(item.fill, 0.6));
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, TAU);
      context.fillStyle = gradient;
      context.fill();
      if (item.ball) {
        context.strokeStyle = '#ffdaa1';
        context.lineWidth = 1;
        context.stroke();
      }
    } else if (item.type === 'label') {
      if (item.face && rotatePoint(FACE_DEFS[item.face].normal)[2] < 0.04) return;
      const point = points[0];
      const fontSize = item.size ?? 11;
      context.font = `500 ${fontSize}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      if (item.pill) {
        const boxWidth = context.measureText(item.text).width + 10;
        context.fillStyle = 'rgba(19, 38, 30, .9)';
        context.fillRect(
          point.x - boxWidth / 2,
          point.y - fontSize / 2 - 3,
          boxWidth,
          fontSize + 6,
        );
      }
      context.fillStyle = item.color;
      context.fillText(item.text, point.x, point.y);
    }
  }
  function drawInteraction() {
    if (mode !== 'face' || !model) return;
    let highlight = null;
    if (action?.type === 'shaft') {
      const point = add(
        action.control.base,
        mul(action.control.slideAxis, (action.previewValue - action.control.min) * SHAFT_TRAVEL),
      );
      highlight = project(point);
    } else if (canvas.matches(':focus-visible') && model.controls[selectedIndex]) {
      const control = model.controls[selectedIndex];
      highlight = project(control.handle ?? control.point);
    }
    if (highlight) {
      context.globalAlpha = 1;
      context.strokeStyle = '#f5d398';
      context.lineWidth = 2;
      context.setLineDash([4, 3]);
      context.beginPath();
      context.arc(highlight.x, highlight.y, 21, 0, TAU);
      context.stroke();
      context.setLineDash([]);
    }
  }
  function render() {
    frame = 0;
    if (disposed || !width || !height) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, width, height);
    const backdrop = context.createRadialGradient(
      width * 0.5,
      height * 0.42,
      10,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.7,
    );
    backdrop.addColorStop(0, '#294a3d');
    backdrop.addColorStop(1, '#10271f');
    context.fillStyle = backdrop;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 0.5;
    context.strokeStyle = 'rgba(161, 185, 144, .065)';
    for (let x = 20; x < width; x += 28) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 20; y < height; y += 28) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    if (model) {
      const projectedItems = model.items
        .map((item) => {
          const points = item.points.map(project);
          return {
            item,
            points,
            holes: item.holes?.map((ring) => ring.map(project)),
            depth: points.reduce((sum, point) => sum + point.z, 0) / points.length,
          };
        })
        .sort((a, b) => a.depth - b.depth);
      const opaqueClosed = mode === 'structure' && !xray && !exploded;
      const draw = ({ item, points, holes }) => drawItem(item, points, holes);
      if (opaqueClosed) {
        // Closed opaque covers hide every internal component. Keep their own
        // face-mounted controls above the covers rather than relying on average
        // polygon depth, which is insufficient for intersecting projections.
        const facesCamera = (item) =>
          item.exteriorFace &&
          rotatePoint(FACE_DEFS[item.exteriorFace].normal)[2] > BOX_HALF / 2000;
        projectedItems.filter(({ item }) => item.shell && facesCamera(item)).forEach(draw);
        projectedItems
          .filter(({ item }) => !item.shell && !item.logical && facesCamera(item))
          .forEach(draw);
      } else projectedItems.forEach(draw);
      canvas.dataset.opaqueInteriorHidden = String(opaqueClosed);
    }
    drawInteraction();
    context.globalAlpha = 1;
    context.textBaseline = 'middle';
    context.font = '500 11px system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillStyle = '#d8cba8';
    context.fillText(
      mode === 'face'
        ? `${FACE_DEFS[basisFace].label} · 观察窗`
        : `${xray ? '透视外壳' : '实体外壳'}${exploded ? ' · 分层展开' : ''}`,
      14,
      20,
    );
    context.textAlign = 'right';
    context.fillStyle = '#9cb49d';
    context.fillText(`${Math.round(magnification * 100)}%`, width - 14, 20);
    context.textAlign = 'center';
    context.font = '10px system-ui, sans-serif';
    context.fillStyle = '#abbca2';
    const message =
      mode === 'face'
        ? action?.type === 'shaft'
          ? `松手将 ${action.control.id} 轴移到 ${['低', '中', '高'][action.previewValue] ?? action.previewValue}位`
          : model?.controls.length
            ? '拖动轴柄 / 点挡位 · 轻点锁扣'
            : '这一面没有可操作机关 · 查看其它已知面'
        : '实际孔位投影 · 虚线表示理想联锁';
    context.fillText(message, width / 2, height - 27);
    context.fillStyle = '#819f89';
    context.fillText(
      mode === 'face' ? '本面机关可操作 · 换个角度观察孔板' : '拖动旋转 · 双指 / 滚轮缩放',
      width / 2,
      height - 12,
    );
    canvas.dataset.yaw = String(Math.round(yaw * 1000) / 1000);
    canvas.dataset.pitch = String(Math.round(pitch * 1000) / 1000);
    canvas.dataset.zoom = String(Math.round(magnification * 1000) / 1000);
  }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(0, rect.width);
    height = Math.max(0, rect.height);
    ratio = Math.min(window.devicePixelRatio || 1, 3);
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    queueRender();
  }
  function zoom(delta) {
    if (!Number.isFinite(delta)) return;
    magnification = clamp(
      magnification * Math.exp(delta),
      mode === 'face' ? 0.85 : 0.65,
      mode === 'face' ? 1.5 : 2.2,
    );
    queueRender();
  }
  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function hitControl(point) {
    if (!model) return null;
    const hits = [];
    model.controls.forEach((control, index) => {
      const targets = control.type === 'shaft' ? control.notches : [{ point: control.point }];
      targets.forEach((target) => {
        const projected = project(target.point);
        const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
        if (Math.abs(projected.x - point.x) <= 22 && Math.abs(projected.y - point.y) <= 22)
          hits.push({ control, index, value: target.value, distance });
      });
    });
    return hits.sort((a, b) => a.distance - b.distance)[0] ?? null;
  }
  function valueAt(control, point) {
    const start = project(control.base);
    const next = project(add(control.base, mul(control.slideAxis, SHAFT_TRAVEL)));
    const dx = next.x - start.x;
    const dy = next.y - start.y;
    const value =
      control.min +
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1);
    return clamp(Math.round(value), control.min, control.max);
  }
  function pointerDistance() {
    const pair = [...pointers.values()].slice(0, 2);
    return pair.length === 2 ? Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) : 0;
  }
  on('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const point = localPoint(event);
    pointers.set(event.pointerId, point);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer may already be cancelled. */
    }
    pinchDistance = pointerDistance();
    canvas.dataset.dragging = 'true';
    if (pointers.size > 1) action = null;
    else if (mode === 'face') {
      const hit = hitControl(point);
      if (hit) {
        selectedIndex = hit.index;
        action = {
          type: hit.control.type,
          control: hit.control,
          pointerId: event.pointerId,
          start: point,
          moved: false,
          previewValue: hit.value ?? hit.control.value,
        };
      }
    }
    queueRender();
  });
  on('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    const point = localPoint(event);
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) {
      const distance = pointerDistance();
      if (pinchDistance > 0 && distance > 0) zoom(Math.log(distance / pinchDistance));
      pinchDistance = distance;
    } else if (mode === 'face') {
      if (action?.pointerId === event.pointerId) {
        action.moved ||= Math.hypot(point.x - action.start.x, point.y - action.start.y) > 7;
        if (action.type === 'shaft') action.previewValue = valueAt(action.control, point);
        queueRender();
      }
    } else {
      yaw = (yaw + (point.x - previous.x) * 0.009) % TAU;
      pitch = clamp(pitch + (point.y - previous.y) * 0.007, -1.45, 1.45);
      canvas.dataset.view = 'custom';
      queueRender();
    }
  });
  function stopPointer(event) {
    const completed =
      event.type === 'pointerup' && action?.pointerId === event.pointerId && pointers.size === 1
        ? action
        : null;
    action = null;
    pointers.delete(event.pointerId);
    pinchDistance = pointerDistance();
    canvas.dataset.dragging = String(pointers.size > 0);
    try {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* Capture may already be released. */
    }
    if (completed?.type === 'shaft')
      options.onShaft?.(completed.control.id, completed.previewValue);
    if (completed?.type === 'latch' && !completed.moved) options.onLatch?.(completed.control.id);
    queueRender();
  }
  on('pointerup', stopPointer);
  on('pointercancel', stopPointer);
  on('lostpointercapture', stopPointer);
  on(
    'wheel',
    (event) => {
      event.preventDefault();
      zoom(
        -event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1) * 0.0015,
      );
    },
    { passive: false },
  );
  on('keydown', (event) => {
    if (mode === 'face') {
      const controls = model?.controls ?? [];
      if (!controls.length) return;
      const selected = controls[selectedIndex];
      if (event.key === 'ArrowLeft')
        selectedIndex = (selectedIndex + controls.length - 1) % controls.length;
      else if (event.key === 'ArrowRight') selectedIndex = (selectedIndex + 1) % controls.length;
      else if (selected.type === 'shaft' && (event.key === 'ArrowUp' || event.key === 'ArrowDown'))
        options.onShaft?.(
          selected.id,
          clamp(selected.value + (event.key === 'ArrowUp' ? 1 : -1), selected.min, selected.max),
        );
      else if ((event.key === 'Enter' || event.key === ' ') && selected.type === 'latch')
        options.onLatch?.(selected.id);
      else return;
      event.preventDefault();
      queueRender();
      return;
    }
    const step = event.shiftKey ? 0.3 : 0.12;
    if (event.key === 'ArrowLeft') yaw -= step;
    else if (event.key === 'ArrowRight') yaw += step;
    else if (event.key === 'ArrowUp') pitch = clamp(pitch - step, -1.45, 1.45);
    else if (event.key === 'ArrowDown') pitch = clamp(pitch + step, -1.45, 1.45);
    else if (event.key === '+' || event.key === '=') zoom(0.13);
    else if (event.key === '-' || event.key === '_') zoom(-0.13);
    else if (event.key === 'Home' || event.key === '0') {
      setView('angled');
      magnification = 1;
    } else return;
    event.preventDefault();
    if (event.key.startsWith('Arrow')) canvas.dataset.view = 'custom';
    queueRender();
  });
  on('focus', queueRender);
  on('blur', () => {
    action = null;
    queueRender();
  });
  on('dblclick', () => {
    if (mode === 'structure') {
      magnification = 1;
      setView('angled');
    }
  });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  function setView(view) {
    if (mode === 'face') return;
    if (view === 'angled') {
      basisFace = 'front';
      yaw = -0.58;
      pitch = 0.35;
    } else if (FACE_IDS.includes(view)) {
      basisFace = view;
      yaw = 0;
      pitch = 0;
    } else return;
    canvas.dataset.view = view;
    queueRender();
  }
  return {
    update(level, state, ball) {
      if (disposed) return;
      const snapshot = getSnapshot(level, state);
      const position = ball ?? level.path[snapshot.ballPathIndex] ?? level.path[0];
      const signature = JSON.stringify([
        level.id,
        state.shafts,
        state.latches,
        state.released,
        state.completed,
        mode === 'face' ? state.side : null,
        position,
      ]);
      const geometryUnchanged = current?.level === level && stateSignature === signature;
      current = { level, snapshot, ball: [...position] };
      if (mode === 'face' && basisFace !== state.side) {
        basisFace = state.side;
        action = null;
        selectedIndex = 0;
        canvas.dataset.view = state.side;
      }
      if (geometryUnchanged) return;
      stateSignature = signature;
      canvas.dataset.level = level.id;
      canvas.dataset.side = state.side;
      canvas.dataset.ball = position.join(',');
      rebuild();
    },
    setXray(value) {
      xray = Boolean(value);
      rebuild();
    },
    setExploded(value) {
      exploded = Boolean(value);
      rebuild();
    },
    setView,
    zoom,
    resize,
    getSnapshot() {
      const controls = (model?.controls ?? []).map((control) =>
        control.type === 'shaft'
          ? {
              ...control,
              base: [...control.base],
              slideAxis: [...control.slideAxis],
              handle: project(control.handle),
              worldHandle: [...control.handle],
              notches: control.notches.map((notch) => ({
                value: notch.value,
                ...project(notch.point),
              })),
            }
          : { ...control, point: project(control.point), worldPoint: [...control.point] },
      );
      return {
        levelId: current?.level.id ?? null,
        snapshot: current ? JSON.parse(JSON.stringify(current.snapshot)) : null,
        ball: current?.ball ? [...current.ball] : null,
        camera: {
          yaw,
          pitch,
          magnification,
          face: basisFace,
          view: canvas.dataset.view,
          projection: mode === 'face' ? 'orthographic' : 'perspective',
        },
        mode,
        pointers: pointers.size,
        dragging: pointers.size > 0,
        preview:
          action?.type === 'shaft'
            ? { shaft: action.control.id, value: action.previewValue }
            : null,
        xray,
        exploded,
        counts: model ? { ...model.counts } : null,
        faces: model ? [...model.faces] : [],
        projected: {
          controls,
          shafts: controls.filter((control) => control.type === 'shaft'),
          latches: controls.filter((control) => control.type === 'latch'),
          ball: current?.ball ? project(current.ball) : null,
        },
      };
    },
    destroy() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      listeners.forEach(([type, handler, eventOptions]) =>
        canvas.removeEventListener(type, handler, eventOptions),
      );
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      for (const pointerId of pointers.keys()) {
        try {
          if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
        } catch {
          /* Already released. */
        }
      }
      pointers.clear();
      action = null;
      canvas.style.touchAction = previousTouchAction;
      canvas.dataset.dragging = 'false';
    },
  };
}
