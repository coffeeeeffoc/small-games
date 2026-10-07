import { assertHostCapabilities, HostError, gameManifestSchema } from '@coffeeeeffoc/game-contract';
import manifest from './manifest.json';
import { LEVEL_DATA } from '../levels-data.js';
import { LEVEL_ROUTE as route } from '../level-order.js';
import { registerLevels } from '../levels.js';
import '../render.js';

export const wulongCityManifest = gameManifestSchema.parse(manifest);
export const defaultWulongCityEnvelope = {
  gameId: 'wulong-city', schemaVersion: 1, revision: 1,
  payload: { levelIds: [...route.order] },
};

/** Native Canvas entry. All level rules, route, records and artwork are shared with the preview. */
export const wulongCityCanvasDefinition = {
  manifest: wulongCityManifest,
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (host.session.gameId !== manifest.gameId)
      throw new HostError({ code: 'INVALID_INPUT', message: 'Wulong session identity mismatch' });
    const envelope = await host.content.load();
    if (envelope.gameId !== manifest.gameId || envelope.schemaVersion !== 1 ||
        JSON.stringify(envelope.payload?.levelIds) !== JSON.stringify(route.order))
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Unsupported Wulong level catalog' });
    const ctx = target.canvas.getContext('2d');
    if (!ctx) throw new HostError({ code: 'UNAVAILABLE', message: 'Canvas 2D is unavailable' });
    // Older native 2D contexts omit roundRect while retaining the standard path primitives.
    if (!ctx.roundRect) ctx.roundRect = function(x, y, w, h, radius = 0) {
      const r = Math.min(Number(radius) || 0, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + r, y); this.lineTo(x + w - r, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r); this.lineTo(x + w, y + h - r);
      this.quadraticCurveTo(x + w, y + h, x + w - r, y + h); this.lineTo(x + r, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r); this.lineTo(x, y + r);
      this.quadraticCurveTo(x, y, x + r, y); this.closePath();
    };
    let s = null, page = 'home', disposed = false, suspended = false, run = 0;
    let savedLevel = route.order[0], sound = true, hintStep = 0, chapter = 0, recordPage = 0;
    let unlocked = new Set([route.order[0]]), records = {}, version = null, saveWork = Promise.resolve();
    let buttons = [], drag = null, last = Date.now(), notice = '';
    const held = new Map(), assets = {}, levels = {}, zones = new Map(), voices = new Map();
    try {
      const saved = await host.storage.read('wulong-city-v1');
      const restored = route.restore(saved?.value);
      version = saved?.version ?? null;
      unlocked = restored.unlockedLevels; records = restored.records;
      savedLevel = restored.level; sound = restored.sound;
    } catch { /* Storage is optional at runtime; the current session remains playable. */ }
    const art = globalThis.WulongArt.create(ctx, () => s, assets);
    const { C, rect, line, ellipse, text, actor, background } = art;
    if (target.createSound) for (const kind of ['tap', 'win']) {
      try { voices.set(kind, target.createSound(`assets/audio/${kind}.wav`, { volume: 0.32 })); }
      catch { /* Optional platform audio never blocks play. */ }
    }
    const tone = (frequency = 420) => { if (sound) voices.get(frequency >= 700 ? 'win' : 'tap')?.play(); };
    const W = {
      ...art, levels, frameZones: zones,
      add: (id, level) => { levels[id] = level; },
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      near: (x, range = 65) => Math.abs(s.p.x - x) < range,
      say: (value) => { if (s) s.feedback = value; }, tone,
      hit(id, label, x, y, w, h, click, move, up) {
        const minimum = 44 / (sceneScale() * target.canvas.width / 390);
        const width = Math.max(w, minimum), height = Math.max(h, minimum);
        zones.set(id, { id, label, x: Math.max(0, Math.min(480 - width, x - (width - w) / 2)),
          y: Math.max(0, Math.min(490 - height, y - (height - h) / 2)), w: width, h: height, click, move, up });
      },
      win() {
        if (s.won) return;
        s.won = true; s.finishAt = s.t + 1.1; s.p.vx = 0;
        clearInput(); tone(730); W.say(LEVEL_DATA[s.id].joke);
        records[s.id] = LEVEL_DATA[s.id].record;
        route.unlockNext(unlocked, s.id); save();
      },
    };
    registerLevels(W);
    for (const id of route.order) if (!levels[id] || !LEVEL_DATA[id])
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: `Missing Wulong level ${id}` });

    function save() {
      const value = { orderVersion: 2, level: s?.id ?? savedLevel, sound,
        unlocked: route.frontier(unlocked), unlockedLevels: route.order.filter(id => unlocked.has(id)),
        records: { ...records } };
      saveWork = saveWork.then(async () => {
        try { version = (await host.storage.write('wulong-city-v1', value, version)).version; }
        catch { notice = '进度暂存于本次游戏'; }
      });
    }
    function clearInput() {
      held.clear();
      if (drag) { levels[s.id]?.cancel?.(s); drag = null; }
      for (const voice of voices.values()) voice.stop();
    }
    function show(next) { clearInput(); page = next; last = Date.now(); render(); }
    function start(id) {
      if (!levels[id] || !unlocked.has(id)) return;
      clearInput(); run++; hintStep = 0; savedLevel = id;
      s = { id, run, t: 0, p: { x: 65, y: 436, vx: 0, vy: 0, dir: 1, grounded: true },
        won: false, feedback: '', ...levels[id].init() };
      W.s = s; W.say(LEVEL_DATA[id].intro); zones.clear(); page = 'play'; save(); render();
    }
    const logicalHeight = () => Math.max(700, target.canvas.height * 390 / target.canvas.width);
    const sceneScale = () => Math.min(358 / 480, (logicalHeight() - 360) / 520);
    const sceneBox = () => {
      const scale = sceneScale();
      return { x: (390 - 480 * scale) / 2, y: 137, scale, h: 520 * scale };
    };
    function button(label, x, y, w, h, runAction, options = {}) {
      const primary = options.primary;
      const control = options.control;
      const radius = options.pause || options.back || control === 'jump' ? Math.min(w, h) / 2 : control ? 22 : 18;
      const teal = control === 'left' || control === 'right';
      rect(x, y + 4, w, h, teal ? '#153e43' : primary ? '#a96a29' : '#a78b60', radius, null);
      const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, teal ? '#529e93' : primary ? '#ffdc7a' : '#fff4d4');
      gradient.addColorStop(1, teal ? '#246b68' : primary ? '#edac33' : '#efdeb7');
      rect(x, y, w, h, options.disabled ? '#ded7c4' : gradient, radius, teal ? '#85b6a4' : primary ? '#ffe6aa' : '#d6b779');
      if (options.back) {
        art.poly([[x+w/2+5,y+h/2-11],[x+w/2-7,y+h/2],[x+w/2+5,y+h/2+11],
          [x+w/2+5,y+h/2+4],[x+w/2+13,y+h/2+4],[x+w/2+13,y+h/2-4],[x+w/2+5,y+h/2-4]], '#23484a', null);
      } else if (options.pause) {
        rect(x + w / 2 - 9, y + h / 2 - 10, 6, 20, C.ink, 1, null);
        rect(x + w / 2 + 3, y + h / 2 - 10, 6, 20, C.ink, 1, null);
      } else if (control) {
        const cx = x + w / 2, cy = y + h / 2 - (control === 'jump' ? 8 : 0);
        ctx.save(); ctx.translate(cx, cy);
        if (control === 'right') ctx.scale(-1, 1);
        if (control === 'jump') ctx.rotate(Math.PI / 2);
        art.poly([[8,-15],[-10,0],[8,15],[8,6],[21,6],[21,-6],[8,-6]], teal ? '#fff0cc' : '#86571a', null);
        ctx.restore();
        if (control === 'jump') text('跳跃', cx, y + h - 20, 12, '#6b481b');
      } else text(label, x + w / 2, y + h / 2, options.size ?? 17, primary ? '#614217' : '#23484a');
      const minimum = 44 * 390 / target.canvas.width;
      const touchW = Math.max(w, minimum), touchH = Math.max(h, minimum);
      buttons.push({ label, x: x - (touchW - w) / 2, y: y - (touchH - h) / 2,
        w: touchW, h: touchH, run: runAction, ...options });
    }
    function paragraph(value, x, y, width, size = 15, color = '#606855', max = 4) {
      ctx.font = `${size}px sans-serif`;
      let row = '', lines = 0;
      for (const character of String(value)) {
        if (ctx.measureText(row + character).width > width) {
          text(row, x, y + lines * (size + 10), size, color, 'left');
          if (++lines >= max) return;
          row = '';
        }
        row += character;
      }
      if (row) text(row, x, y + lines * (size + 10), size, color, 'left');
    }
    function heading(title, subtitle = '乌龙城 · 奇遇记') {
      button('返回', 20, 51, 46, 46, () => show(page === 'hint' ? 'play' : 'home'), { back: true });
      rect(86, 41, 285, 77, '#f9efd4', 23, '#b69458');
      text(subtitle, 211, 62, 12, '#968157');
      text(title, 211, 95, 26, '#385849');
    }
    function drawHome(h) {
      const titleY = Math.min(120, Math.max(72, h * 0.14));
      line(85, titleY, 305, titleY, '#eadba98c', 1);
      text('总差一点才正常', 195, titleY + 17, 13, '#22494b');
      line(85, titleY + 34, 305, titleY + 34, '#eadba98c', 1);
      text('乌龙城', 195, titleY + 79, 68, '#173f46');
      rect(108, titleY + 130, 174, 28, '#224c4eba', 14, '#ffe0a065');
      text('小岔的百日奇遇', 195, titleY + 144, 13, '#fff1cd');
      rect(107, h - 234, 176, 31, '#163f49d9', 16, '#e3c78e77');
      text(`已归档 ${Object.keys(records).length} / ${route.order.length}`, 195, h - 218, 12, '#fff0ce');
      button(Object.keys(records).length ? '继续奇遇' : '开始奇遇', 28, h - 185, 334, 62, () => {
        if (s && !s.won) show('play');
        else start(s?.won ? route.next(s.id) || s.id : savedLevel);
      }, { primary: true, size: 23 });
      button('选择关卡', 28, h - 107, 160, 51, () => { chapter = Math.floor((route.number(savedLevel) - 1) / 10); show('levels'); });
      button('奇遇手记', 202, h - 107, 160, 51, () => show('records'));
    }
    function drawLevels(h) {
      heading('选择关卡');
      const count = Math.ceil(route.order.length / 10);
      text(`第 ${chapter + 1} 章`, 195, 170, 21, '#45694f');
      text(`${chapter * 10 + 1} — ${Math.min((chapter + 1) * 10, route.order.length)}`, 195, 204, 14, '#968157');
      route.order.slice(chapter * 10, chapter * 10 + 10).forEach((id, index) => {
        const col = index % 5, row = Math.floor(index / 5), x = 30 + col * 67, y = 248 + row * 98;
        const done = Boolean(records[id]), enabled = unlocked.has(id);
        button(String(route.number(id)).padStart(2, '0'), x, y, 58, 74,
          () => start(id), { primary: enabled && id === savedLevel, disabled: !enabled, size: 20 });
        text(done ? '已完成' : enabled ? '可探索' : '锁', x + 29, y + 59, 10, '#536b5d');
      });
      button('上一章', 25, h - 110, 100, 49, () => { chapter = Math.max(0, chapter - 1); render(); }, { disabled: chapter === 0, size: 15 });
      text(`${chapter + 1} / ${count}`, 195, h - 85, 15, '#74705b');
      button('下一章', 265, h - 110, 100, 49, () => { chapter = Math.min(count - 1, chapter + 1); render(); }, { disabled: chapter === count - 1, size: 15 });
    }
    function drawPlay(h) {
      const box = sceneBox(), data = LEVEL_DATA[s.id];
      rect(75, 14, 240, 62, '#fff0d4', 18, '#b69458');
      button('返回', 14, 23, 46, 46, () => show('home'), { back: true });
      text(`奇遇 ${String(route.number(s.id)).padStart(2, '0')} / ${route.order.length}`, 195, 31, 12, '#968157');
      button('暂停', 330, 23, 46, 46, () => show('pause'), { pause: true });
      text(data.title, 195, 57, 17, '#385849');
      rect(40, 90, 310, 34, '#fff1d2e6', 17, '#d5b377');
      paragraph(data.goal, 53, 107, 284, 12, '#6d715a', 1);
      ctx.save(); rect(box.x, box.y, 480 * box.scale, box.h, '#e7dfc4', 20, '#a58b5d');
      ctx.beginPath(); ctx.roundRect(box.x, box.y, 480 * box.scale, box.h, 20); ctx.clip();
      ctx.translate(box.x, box.y); ctx.scale(box.scale, box.scale);
      zones.clear(); levels[s.id].draw(s);
      if (!s.hideActor) actor(s.p.x, s.p.y, s.p.dir, 1, s.id === 3 ? 'grab' : 'normal');
      ctx.restore();
      rect(14, box.y + box.h + 13, 362, 66, '#fff1d2e6', 15, '#b69458');
      paragraph(s.feedback, 28, box.y + box.h + 34, 334, 12, '#686c54', 2);
      const controlsY = h - 109;
      button('向左', 14, controlsY, 65, 70, () => { if (!target.onPointer) s.p.x = Math.max(22, s.p.x - 25); }, { control: 'left' });
      button('向右', 90, controlsY, 65, 70, () => { if (!target.onPointer) s.p.x = Math.min(458, s.p.x + 25); }, { control: 'right' });
      button('跳跃', 296, controlsY - 5, 80, 80, jump, { primary: true, control: 'jump' });
      button('提示', 208, controlsY + 6, 53, 59, () => show('hint'), { size: 14 });
      text(notice, 25, h - 38, 12, '#b46740', 'left');
    }
    function drawPause(h) {
      heading('歇一小会儿', '城市可以等你');
      if (assets.pause) ctx.drawImage(assets.pause, 96, 155, 198, 153);
      button('继续探索', 40, 333, 310, 59, () => show('play'), { primary: true, size: 22 });
      button('重新来过', 40, 413, 310, 53, () => start(s.id));
      button('返回主页', 40, 487, 310, 53, () => show('home'));
      button(sound ? '音效：开' : '音效：关', 105, h - 118, 180, 50, () => { sound = !sound; save(); render(); });
    }
    function drawHint(h) {
      heading('换个角度看看');
      if (assets.hint) ctx.drawImage(assets.hint, 116, 134, 158, 90);
      text(`提示 ${hintStep + 1} / 3`, 195, 233, 15, '#a47c43');
      rect(29, 247, 332, 227, '#f5ead0', 22, '#b69458');
      paragraph(LEVEL_DATA[s.id].hints[hintStep], 52, 291, 286, 18, '#45614f', 6);
      button('回去试试', 41, h - 218, 308, 58, () => show('play'), { primary: true, size: 21 });
      button(hintStep < 2 ? '再明确一点' : '重新看第一条', 70, h - 140, 250, 50,
        () => { hintStep = (hintStep + 1) % 3; render(); });
    }
    function drawRecords(h) {
      heading('奇遇手记');
      const completed = route.order.filter(id => records[id]);
      text(`已归档 ${completed.length} / ${route.order.length}`, 195, 167, 16, '#968157');
      if (assets.journal) ctx.drawImage(assets.journal, 75, 194, 240, 109);
      if (!completed.length) { text('每段奇遇，都值得记下来', 195, 342, 18, '#6d715a'); text('完成第一关，翻开手记', 195, 383, 14, '#968157'); }
      const perPage = Math.max(1, Math.floor((h - 430) / 100));
      completed.slice(recordPage * perPage, (recordPage + 1) * perPage).forEach((id, index) => {
        const y = 330 + index * 100;
        rect(24, y, 342, 84, '#f6edd8', 17, '#b69458');
        text(`${String(route.number(id)).padStart(2, '0')} · ${LEVEL_DATA[id].title}`, 39, y + 24, 15, '#385849', 'left');
        paragraph(LEVEL_DATA[id].record, 39, y + 51, 304, 12, '#6d715a', 2);
      });
      if (completed.length > perPage) {
        button('上一页', 25, h - 105, 110, 48, () => { recordPage = Math.max(0, recordPage - 1); render(); }, { disabled: recordPage === 0, size: 15 });
        button('下一页', 255, h - 105, 110, 48, () => { recordPage = Math.min(Math.ceil(completed.length / perPage) - 1, recordPage + 1); render(); },
          { disabled: (recordPage + 1) * perPage >= completed.length, size: 15 });
      }
    }
    function drawResult(h) {
      rect(36, 65, 318, 115, '#fff0d4', 25, '#b69458');
      text('乌龙解决啦！', 195, 101, 29, '#385849');
      text(`奇遇 ${String(route.number(s.id)).padStart(2, '0')}`, 195, 149, 14, '#968157');
      if (assets.result) ctx.drawImage(assets.result, 93, 207, 204, 146);
      else { ellipse(195, 285, 71, 71, '#dbab58', '#956b35'); text('妙', 195, 284, 36, '#fff1cc'); }
      rect(28, 365, 334, Math.min(151, h - 580), '#fff0d4e6', 22, '#b69458');
      paragraph(LEVEL_DATA[s.id].joke, 48, 391, 294, 18, '#45614f', 3);
      const next = route.next(s.id);
      button(next ? '下一关 →' : '返回奇遇地图', 40, h - 194, 310, 60,
        () => next ? start(next) : show('levels'), { primary: true, size: 22 });
      button('再玩一次', 40, h - 110, 148, 52, () => start(s.id));
      button('返回主页', 201, h - 110, 148, 52, () => show('home'));
    }
    function render() {
      if (disposed) return;
      const h = logicalHeight(), scale = target.canvas.width / 390;
      ctx.save(); ctx.setTransform(scale, 0, 0, scale, 0, 0); buttons = [];
      rect(0, 0, 390, h, '#153d47', 0, null);
      if (assets.city) ctx.drawImage(assets.city, 0, 0, 390, h);
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, page === 'home' ? '#ffffff18' : '#113c4666');
      gradient.addColorStop(1, page === 'home' ? '#142d3880' : '#142d38c4');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 390, h);
      if (page === 'play') {
        const paperY = sceneBox().y + sceneBox().h + 10;
        rect(0, paperY, 390, h - paperY, '#fff0cf', 0, null);
      }
      ctx.save(); ctx.beginPath(); ctx.roundRect(9, 9, 372, h - 18, 27);
      ctx.strokeStyle = '#b8a479'; ctx.lineWidth = 1.65; ctx.stroke(); ctx.restore();
      if (['levels', 'pause', 'hint', 'records'].includes(page))
        rect(15, 134, 360, h - 166, '#f6ebd3f2', 25, '#b99761');
      ({ home: drawHome, levels: drawLevels, play: drawPlay, pause: drawPause,
        hint: drawHint, records: drawRecords, result: drawResult })[page](h);
      ctx.restore();
    }
    function jump() {
      if (page !== 'play' || s.won || levels[s.id].jump?.(s) === false) return;
      if (s.p.grounded && !s.locked) { s.p.vy = -410; s.p.grounded = false; tone(340); }
    }
    function physics(dt) {
      const p = s.p, axis = Number([...held.values()].includes('right')) - Number([...held.values()].includes('left'));
      p.vx = s.locked || s.won ? 0 : axis * 145;
      if (axis && !s.locked && !s.won) p.dir = axis;
      if (s.manual) return;
      const solids = [...(levels[s.id].floor === false ? [] : [{ x: -50, y: 436, w: 580, h: 100 }]), ...(levels[s.id].platforms?.(s) || [])];
      p.x += p.vx * dt;
      for (const q of solids) if (q.solid && p.y > q.y + 7 && p.y - 52 < q.y + q.h && p.x + 12 > q.x && p.x - 12 < q.x + q.w)
        p.x = p.vx > 0 ? q.x - 12 : p.vx < 0 ? q.x + q.w + 12 : p.x;
      p.x = Math.max(22, Math.min(458, p.x));
      const old = p.y; p.vy += 1050 * dt; p.y += p.vy * dt; p.grounded = false;
      for (const q of solids) if (p.vy >= 0 && old <= q.y + 4 && p.y >= q.y && p.x + 10 > q.x && p.x - 10 < q.x + q.w) {
        p.y = q.y; p.vy = 0; p.grounded = true;
      }
    }
    const contains = (item, x, y) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h;
    function pointer(event) {
      if (disposed || suspended) return;
      const x = event.x * 390 / target.canvas.width, y = event.y * 390 / target.canvas.width;
      if (event.phase === 'down') {
        const item = [...buttons].reverse().find(b => !b.disabled && contains(b, x, y));
        if (item) {
          if (item.control && page === 'play' && !s.won) {
            held.set(event.pointerId, item.control); if (item.control === 'jump') jump();
          } else held.set(event.pointerId, item);
          return;
        }
        if (page !== 'play' || s.won || drag) return;
        const box = sceneBox(), px = (x - box.x) / box.scale, py = (y - box.y) / box.scale;
        const candidates = [...zones.values()].reverse().filter(z => contains(z, px, py));
        let zone = candidates[0];
        if (zone?.id.includes('-note-')) zone = candidates.filter(z => z.id.includes('-note-'))
          .sort((a, b) => Math.hypot(px - a.x - a.w / 2, py - a.y - a.h / 2) - Math.hypot(px - b.x - b.w / 2, py - b.y - b.h / 2))[0];
        if (zone) { drag = { zone, pointerId: event.pointerId, x: px, y: py, run, moved: false }; tone(); }
      } else if (event.phase === 'move') {
        if (!drag || drag.pointerId !== event.pointerId || drag.run !== run || page !== 'play') return;
        const box = sceneBox(), px = (x - box.x) / box.scale, py = (y - box.y) / box.scale;
        if (Math.hypot(px - drag.x, py - drag.y) > 4) drag.moved = true;
        if (drag.moved) drag.zone.move?.(px, py);
        render();
      } else {
        const item = held.get(event.pointerId); held.delete(event.pointerId);
        if (drag?.pointerId === event.pointerId) {
          const active = drag; drag = null;
          if (event.phase === 'cancel') levels[s.id]?.cancel?.(s);
          else if (active.run === run && page === 'play') { if (!active.moved) active.zone.click?.(); active.zone.up?.(); }
        }
        if (event.phase === 'up' && item && typeof item === 'object' && contains(item, x, y)) { item.run(); tone(); }
        render();
      }
    }
    const stopInput = target.onPointer ? target.onPointer(pointer) : target.onTap((x, y) => {
      pointer({ phase: 'down', x, y, pointerId: 0 }); pointer({ phase: 'up', x, y, pointerId: 0 });
    });
    const timer = setInterval(() => {
      const now = Date.now(), dt = Math.min((now - last) / 1000, 1 / 30); last = now;
      if (disposed || suspended || page !== 'play' || !s) return;
      s.t += dt;
      if (!s.won) { physics(dt); levels[s.id].update?.(s, dt); }
      else if (s.t > s.finishAt) show('result');
      render();
    }, 1000 / 30);
    for (const [name, filename] of [['city', 'city-scene.webp'], ['room', 'room-scene.webp'], ['actor', 'xiaocha.png'],
      ['pause', 'pause-illustration.webp'], ['hint', 'hint-illustration.webp'], ['journal', 'journal-illustration.webp'], ['result', 'result-illustration.webp']])
      target.loadImage?.(`assets/art/${filename}`).then(image => {
        if (!disposed) { assets[name] = image; render(); }
      }).catch(() => { /* Shared procedural art remains usable if optional artwork fails. */ });
    render();
    return {
      pause() { suspended = true; clearInput(); if (page === 'play') { page = 'pause'; render(); } },
      resume() { suspended = false; last = Date.now(); render(); },
      async dispose() {
        if (disposed) return;
        disposed = true; clearInput(); clearInterval(timer); stopInput();
        for (const voice of voices.values()) voice.dispose();
        await saveWork;
        ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
      },
    };
  },
};
