import world from './public/data/world.json' with { type: 'json' };
import { baseCities } from './src/cities.js';

const yearLabel = year => `${Number(year) < 0 ? '公元前' : '公元'} ${Math.abs(Number(year)) || '—'} 年`;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Pure Canvas input/rendering. The host supplies browser/platform image creation.
export function createRenderer({ createImage, assetBase = '' } = {}) {
  let buttons = [], rect, currentRound, mode = 'scene', previousMode = 'scene';
  let guess = null, digits = '', bce = false, yaw = 0.5, zoom = 1, mapZoom = 1, center = { lat: 15, lng: 20 };
  let imagePath, picture, imageReady = false, imageError = false, message = '';
  const reset = state => {
    if (currentRound === state.roundKey) return;
    currentRound = state.roundKey; mode = 'scene'; guess = null; digits = ''; bce = false;
    yaw = 0.5; zoom = 1; mapZoom = 1; center = { lat: 15, lng: 20 }; message = '';
  };
  function draw(ctx, w, h, state) {
    reset(state); buttons = []; ctx.save();
    ctx.fillStyle = '#f4efe4'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const text = (value, x, y, size = 14, color = '#243d33') => {
      ctx.fillStyle = color; ctx.font = `${size}px sans-serif`; ctx.fillText(String(value), x, y);
    };
    const wrap = (value, x, y, width, maxLines = 4, size = 14) => {
      let line = '', row = 0; ctx.font = `${size}px sans-serif`;
      const chars = [...String(value)];
      for (let i = 0; i < chars.length; i++) {
        if (ctx.measureText(line + chars[i]).width > width && line) {
          text(row === maxLines - 1 ? line.slice(0, -1) + '…' : line, x, y + row * (size + 6), size);
          if (++row >= maxLines) return;
          line = '';
        }
        line += chars[i];
      }
      if (line) text(line, x, y + row * (size + 6), size);
    };
    const button = (label, x, y, width, height, run, active = false) => {
      ctx.fillStyle = active ? '#244e40' : '#e4dece'; ctx.fillRect(x, y, width, height);
      ctx.textAlign = 'center'; text(label, x + width / 2, y + height / 2, 14, active ? '#fff9ec' : '#243d33'); ctx.textAlign = 'left';
      buttons.push({ x, y, w: width, h: height, run, label });
    };
    text(`第 ${state.round}/${state.total} 幕 · ${state.score} 分`, 10, 17);
    const wide = w > 600 && h < 460;
    const top = 80, bottom = h - (wide ? 58 : 125);
    rect = { x: 10, y: top, w: w - 20, h: Math.max(80, bottom - top) };
    if (state.phase === 'revealed') {
      const answer = state.answer;
      if (mode === 'answer-map') {
        drawMap();
        button('返回解说', 10, 36, w - 20, 36, () => { mode = 'scene'; });
      } else {
        button('对照地图', 10, 36, w - 20, 36, () => { mode = 'answer-map'; mapZoom = 1; });
        text(answer.place, 12, 100, 18);
        text(`${yearLabel(answer.year)} · 满分宽容 ±${answer.tolerance} 年`, 12, 131);
        text(`本幕 ${answer.score}/5000 · 提示扣 ${answer.penalty}`, 12, 158);
        text(`地点误差 ${Math.round(answer.distance)} 公里 · 年代误差 ${answer.years} 年`, 12, 186);
        wrap(answer.story, wide ? w/2 : 12, wide ? 100 : 218, wide ? w/2-16 : w - 24, wide ? 5 : Math.max(2, Math.floor((bottom - 225) / 20)));
      }
      if (!wide) wrap('AI 历史想象复原；年份为游戏设定。', 12, h - 89, w - 24, 1, 12);
      if (!state.finished) button('前往下一幕', 10, h - 60, w - 20, 48, () => ({ type: 'next' }), true);
      else wrap('五幕已完成，本局答题结束。', 12, h - 39, w - 24, 2);
      ctx.restore(); return;
    }
    button(mode === 'scene' ? '地图选点' : '观察场景', 10, 36, (w - 28) / 2, 36, () => { mode = mode === 'scene' ? 'map' : 'scene'; });
    button(state.hint ? '提示已扣 500' : '提示 −500', 18 + (w - 28) / 2, 36, (w - 28) / 2, 36,
      () => state.hint ? null : { type: 'hint' });
    if (mode === 'year') {
      const columns = rect.h < 255 ? 6 : 3, rows = 12 / columns;
      const keyW = (w - 20 - (columns - 1) * 6) / columns;
      const keyH = Math.max(28, Math.min(48, (rect.h - 55) / rows - 5));
      text(yearLabel((bce ? -1 : 1) * Number(digits)), 16, 101, 20);
      button(bce ? '改为公元' : '改为公元前', w - 142, 82, 130, 38, () => { bce = !bce; });
      ['1','2','3','4','5','6','7','8','9','清空','0','退格'].forEach((key, i) =>
        button(key, 10 + i % columns * (keyW + 6), 130 + Math.floor(i / columns) * (keyH + 5), keyW, keyH, () => {
          digits = key === '清空' ? '' : key === '退格' ? digits.slice(0, -1) : (digits + key).slice(0, 4);
        }));
    } else if (mode === 'map') drawMap();
    else {
      const imageRect = { ...rect, w: wide ? Math.floor(w*.6)-20 : rect.w, h: wide ? rect.h : Math.max(50, rect.h - (state.hint ? 132 : 80)) };
      if (state.image !== imagePath) {
        imagePath = state.image; imageReady = false; imageError = false;
        picture = createImage?.();
        if (picture) {
          const loading = picture;
          picture.onload = () => { if (picture === loading) imageReady = true; };
          picture.onerror = () => { if (picture === loading) imageError = true; };
          picture.src = `${assetBase}${assetBase && !assetBase.endsWith('/') ? '/' : ''}${imagePath}`;
        } else imageError = true;
      }
      ctx.fillStyle = '#203e36'; ctx.fillRect(imageRect.x, imageRect.y, imageRect.w, imageRect.h);
      if (imageReady) {
        const sh = picture.height / zoom, sw = Math.min(picture.width, sh * imageRect.w / imageRect.h);
        const sx = yaw * Math.max(0, picture.width - sw);
        ctx.drawImage(picture, sx, (picture.height - sh) / 2, sw, sh, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
      } else text(imageError ? '场景加载失败，点击画面重试' : '正在载入历史全景…', 18, top + 35, 14, '#fff9ec');
      buttons.push({ ...imageRect, run: () => { if (imageError) imagePath = null; else yaw = (yaw + 0.2) % 1; } });
      const controlsY = imageRect.y + imageRect.h - 38;
      [['向左', () => { yaw = clamp(yaw - 0.2, 0, 1); }], ['向右', () => { yaw = clamp(yaw + 0.2, 0, 1); }],
        [zoom === 1 ? '放大' : '还原', () => { zoom = zoom === 1 ? 2 : 1; }]].forEach(([label, run], i) =>
        button(label, 14 + i * 72, controlsY, 66, 34, run));
      const clueX=wide?Math.floor(w*.6):12, clueW=wide?w-clueX-12:w-24;
      wrap(state.clue, clueX, wide?96:imageRect.y + imageRect.h + 16, clueW, 3, 13);
      if (state.hint) wrap(state.hint, clueX, wide?164:imageRect.y + imageRect.h + 75, clueW, 3, 13);
    }
    const year = (bce ? -1 : 1) * Number(digits);
    const validYear = Number.isInteger(year) && year !== 0 && year >= -3000 && year <= 2026;
    if (!wide || message) text(message || (guess ? `已落点 ${guess.lat.toFixed(2)}°, ${guess.lng.toFixed(2)}°` : '先观察线索，再打开地图落点'), 12, wide?h-68:h - 110, 12);
    button(mode === 'year' ? '完成年代输入' : digits ? yearLabel(year) + ' · 修改' : '输入猜测年代', 10, h - (wide?48:96), wide?w/2-15:w - 20, 44, () => {
      if (mode === 'year') mode = previousMode;
      else { previousMode = mode; mode = 'year'; }
    });
    button('提交地点与年代', wide?w/2+5:10, h - 48, wide?w/2-15:w - 20, 44, () => {
      if (!guess || !validYear) { message = !guess ? '请先在地图落点' : '年代范围：公元前 3000 至公元 2026，无 0 年'; return null; }
      message = ''; return { type: 'guess', point: guess, year };
    }, true);
    ctx.restore();

    function drawMap() {
      ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
      ctx.fillStyle = '#c9dedb'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      const sx = rect.w / 360 * mapZoom, sy = rect.h / 170 * mapZoom;
      const project = (lng, lat) => [rect.x + rect.w / 2 + (lng - center.lng) * sx, rect.y + rect.h / 2 - (lat - center.lat) * sy];
      ctx.fillStyle = '#e8e1ce'; ctx.strokeStyle = '#8b9d91'; ctx.lineWidth = 0.6;
      for (const feature of world.features) {
        const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        for (const polygon of polygons) {
          ctx.beginPath();
          for (const ring of polygon) {
            ring.forEach(([lng, lat], i) => { const p = project(lng, lat); i ? ctx.lineTo(...p) : ctx.moveTo(...p); });
            ctx.closePath();
          }
          ctx.fill(); ctx.stroke();
        }
      }
      buttons.push({ ...rect, run: (x, y) => {
        if (state.phase === 'revealed') return null;
        guess = { lng: clamp(center.lng + (x - rect.x - rect.w / 2) / sx, -180, 180), lat: clamp(center.lat - (y - rect.y - rect.h / 2) / sy, -85, 85) };
        message = '';
      } });
      const used = [];
      for (const { name, lat, lng } of baseCities) {
        const [x, y] = project(lng, lat);
        if (x < 18 || x > w - 18 || y < top + 12 || y > bottom - 45 || used.some(p => Math.abs(p[0] - x) < 48 && Math.abs(p[1] - y) < 24)) continue;
        used.push([x, y]); ctx.fillStyle = '#355648'; ctx.fillRect(x - 2, y - 2, 4, 4); text(name.split(' / ')[0], x + 4, y, 11);
        buttons.push({ x: x - 12, y: y - 12, w: 35, h: 24, run: () => { if (state.phase !== 'revealed') guess = { lat, lng }; } });
      }
      const marker = (point, label, color) => {
        if (!point) return;
        const [x, y] = project(point.lng, point.lat); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); text(label, x + 9, y, 13, color);
      };
      marker(state.answer?.point || guess, '猜', '#ad422f'); marker(state.answer, '真', '#147052');
      ctx.restore();
      button('＋ 放大', 14, bottom - 39, 83, 34, () => { if (guess) center = { ...guess }; mapZoom = Math.min(16, mapZoom * 2); });
      button('− 缩小', 102, bottom - 39, 83, 34, () => { mapZoom = Math.max(1, mapZoom / 2); if (mapZoom === 1) center = { lat: 15, lng: 20 }; });
      text('Natural Earth', Math.max(192, w - 100), bottom - 20, 10);
    }
  }
  return { draw, tap(x, y, state) {
    reset(state);
    const hit = [...buttons].reverse().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return hit?.run(x, y) || null;
  } };
}
