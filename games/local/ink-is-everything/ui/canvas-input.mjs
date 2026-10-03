import { dist } from './dom.mjs';

/** Scene gestures: aim/shoot, tap routing, and a cancellable bridge stroke. */
export function bindCanvasInput({
  canvas,
  renderer,
  controls: c,
  getState,
  getRoom,
  active,
  navigation,
  perform,
  feedback,
}) {
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (!active() || c.canvasPointer !== null) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const point = renderer.screenToWorld(event.clientX, event.clientY),
      state = getState(),
      room = getRoom(state);
    const capture = () => {
      c.canvasPointer = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
    };
    if (event.button === 2) {
      c.aimPoint = point;
      c.canvasMelee = true;
      c.meleeQueued = true;
      capture();
      return;
    }
    if (event.button !== 0) return;
    const bridge = room.bridges.find((b) => !b.drawn && dist(point, b.from) < 57);
    if (bridge && dist(state.player, bridge.from) <= 125) {
      c.drawBridge = bridge;
      c.drawStroke = [point];
      capture();
      navigation.reset();
      return;
    }
    if (c.drawMode) {
      feedback(bridge ? '先走近笔尖锚点。' : '从裂隙这一侧的笔尖锚点拖到对岸圆点。', true);
      return;
    }
    const enemy = state.enemies.filter((e) => e.hp > 0).find((e) => dist(point, e) < e.r + 35);
    if (enemy || (event.pointerType === 'mouse' && (event.shiftKey || c.keys.has('shift')))) {
      c.lockedEnemy = enemy?.id;
      c.aimPoint = point;
      c.canvasFire = true;
      c.fireQueued = true;
      capture();
      return;
    }
    const object = [...room.objects.filter((o) => !o.used), ...room.portals].find(
      (o) => dist(point, o) < o.r + 35,
    );
    if (object) {
      if (dist(state.player, object) < 106) perform({ type: 'interact', objectId: object.id });
      else navigation.walkTo(object, object);
      return;
    }
    navigation.walkTo(point);
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    if (c.drawStroke && c.canvasPointer === event.pointerId) {
      if (dist(c.drawStroke.at(-1), point) > 3) c.drawStroke.push(point);
      return;
    }
    if (active() && (event.pointerType === 'mouse' || c.canvasPointer === event.pointerId))
      c.aimPoint = point;
  });
  function release(event, cancelled) {
    if (event.pointerId !== c.canvasPointer) return;
    if (c.drawStroke && c.drawBridge && !cancelled) {
      const end = renderer.screenToWorld(event.clientX, event.clientY);
      const length = c.drawStroke.slice(1).reduce((sum, p, i) => sum + dist(p, c.drawStroke[i]), 0);
      if (
        dist(end, c.drawBridge.to) < 60 &&
        length > dist(c.drawBridge.from, c.drawBridge.to) * 0.65
      )
        perform({ type: 'draw', bridgeId: c.drawBridge.id });
      else feedback('笔迹没有连到对岸，未消耗墨汁。再试一次。');
    }
    c.drawStroke = null;
    c.drawBridge = null;
    c.canvasFire = false;
    c.canvasMelee = false;
    c.canvasPointer = null;
    if (cancelled) {
      c.fireQueued = false;
      c.meleeQueued = false;
    }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', (event) => release(event, false));
  for (const type of ['pointercancel', 'lostpointercapture'])
    canvas.addEventListener(type, (event) => release(event, true));
}
