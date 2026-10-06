// 弹球 Roguelite —— 微信小游戏 / 浏览器通用（Canvas 2D，零依赖）
// 调难度和手感改 CFG；平台相关代码全在 Plat 里，换 B 站只需改这一处
const CFG = { AD_ID: '', COLS: 7, HP_GROWTH: 1.3, PICK_EVERY: 3, FIRE_GAP: 0.07 };

const wxEnv = typeof wx !== 'undefined' && !!wx.createCanvas;
let W, H, TOP = 0, DPR = 1, canvas;
if (wxEnv) {
  canvas = wx.createCanvas();
  const si = wx.getSystemInfoSync();
  W = si.windowWidth; H = si.windowHeight; DPR = si.pixelRatio;
  TOP = (si.safeArea && si.safeArea.top) || 0;
} else {
  canvas = document.getElementById('c');
  W = Math.min(window.innerWidth, 480); H = window.innerHeight; DPR = window.devicePixelRatio || 1;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
}
canvas.width = W * DPR; canvas.height = H * DPR;
const ctx = canvas.getContext('2d');
ctx.scale(DPR, DPR);

const cell = W / CFG.COLS, R = cell * 0.14, SP = H * 1.3;
const y0 = TOP + 70, floorY = H - 70, topY = y0 - 10;
const ROWS = Math.floor((floorY - y0) / cell);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const col = hp => `hsl(${(200 + hp * 9) % 360},70%,55%)`;
const ctr = k => ({ x: k.c * cell + cell / 2, y: y0 + k.r * cell + cell / 2 });
const near = (a, b) => Math.abs(a.c - b.c) <= 1 && Math.abs(a.r - b.r) <= 1;

// ---------- 平台层：存档 / 激励视频 / 分享 ----------
const Plat = {
  save(k, v) { try { wxEnv ? wx.setStorageSync(k, v) : localStorage.setItem(k, v); } catch (e) {} },
  load(k) { try { return wxEnv ? wx.getStorageSync(k) : localStorage.getItem(k); } catch (e) { return null; } },
  rewardAd(ok) { // 填 CFG.AD_ID 后启用真实广告；为空则直接发奖励（方便调试）
    if (!wxEnv || !CFG.AD_ID) return ok();
    if (!this.ad) {
      this.ad = wx.createRewardedVideoAd({ adUnitId: CFG.AD_ID });
      this.ad.onClose(r => { if (r && r.isEnded && this.cb) this.cb(); });
    }
    this.cb = ok;
    this.ad.show().catch(() => this.ad.load().then(() => this.ad.show()));
  },
  share() { if (wxEnv) wx.shareAppMessage({ title: '这个弹球太上头了，来比一比！' }); },
};

// ---------- 强化池 ----------
const UPS = [
  { n: '分裂弹群', d: '球数 +2', f: () => S.n += 2 },
  { n: '重击', d: '每球伤害 +1', f: () => S.dmg += 1 },
  { n: '穿透', d: '每球可多穿透 1 块砖', f: () => S.pierce++ },
  { n: '爆裂', d: '命中时 15% 溅射周围（可叠加）', f: () => S.boom++ },
  { n: '闪电链', d: '命中时 20% 电击随机砖（可叠加）', f: () => S.zap++ },
  { n: '暴击', d: '暴击率 +15%，三倍伤害', f: () => S.crit++ },
];

// ---------- 游戏状态 ----------
let S, best = Number(Plat.load('best')) || 0;
function reset() {
  S = { st: 'aim', turn: 0, score: 0, n: 3, dmg: 1, pierce: 0, boom: 0, zap: 0, crit: 0,
    lx: W / 2, nx: null, ang: null, vx: 0, vy: 0, balls: [], bricks: [], parts: [], texts: [], bolts: [],
    shake: 0, ts: 1, queue: 0, timer: 0, revived: false, cards: [] };
  for (let i = 0; i < 3; i++) pushRow();
}
function pushRow() {
  S.bricks.forEach(k => k.r++);
  const pc = Math.floor(Math.random() * CFG.COLS); // 每行必有一个 +1 球
  for (let c = 0; c < CFG.COLS; c++) {
    if (c === pc) { S.bricks.push({ c, r: 0, t: 'ball' }); continue; }
    if (Math.random() < 0.55) {
      const hp = Math.max(1, Math.round((1 + S.turn * CFG.HP_GROWTH) * (0.7 + Math.random() * 0.8)));
      S.bricks.push({ c, r: 0, hp, max: hp, t: Math.random() < 0.08 ? 'bomb' : 'b' });
    }
  }
}
function fire() {
  S.st = 'fire'; S.queue = S.n; S.timer = 0; S.nx = null; S.ts = 1;
  S.vx = Math.cos(S.ang) * SP; S.vy = Math.sin(S.ang) * SP;
}
function endTurn() {
  S.turn++; S.lx = S.nx; pushRow();
  S.bricks = S.bricks.filter(k => k.t !== 'ball' || k.r < ROWS);
  if (S.bricks.some(k => k.t !== 'ball' && k.r >= ROWS)) {
    S.st = 'over';
    if (S.score > best) { best = S.score; Plat.save('best', best); }
    return;
  }
  if (S.turn % CFG.PICK_EVERY === 0) { S.cards = UPS.slice().sort(() => Math.random() - .5).slice(0, 3); S.st = 'pick'; }
  else S.st = 'aim';
}

// ---------- 战斗 ----------
function hurt(k, d) {
  if (k.dead || k.t === 'ball') return;
  if (Math.random() < S.crit * 0.15) {
    d *= 3; const c = ctr(k);
    S.texts.push({ x: c.x, y: c.y, s: d + '!', l: .6 }); S.shake = Math.min(S.shake + 4, 10);
  }
  k.hp -= d;
  if (k.hp <= 0) kill(k);
}
function kill(k) {
  k.dead = true; S.bricks.splice(S.bricks.indexOf(k), 1); S.score++;
  const c = ctr(k);
  for (let i = 0; i < 8; i++) S.parts.push({ x: c.x, y: c.y, vx: (Math.random() - .5) * 300, vy: (Math.random() - .8) * 300, l: .5, c: col(k.max) });
  S.shake = Math.min(S.shake + 2, 10);
  if (k.t === 'bomb') S.bricks.slice().forEach(o => near(k, o) && hurt(o, Math.ceil(k.max * .6)));
}
function onHit(k) {
  hurt(k, S.dmg);
  if (S.boom && Math.random() < .15 * S.boom) {
    S.bricks.slice().forEach(o => o !== k && near(k, o) && hurt(o, S.dmg));
    S.shake = Math.min(S.shake + 3, 10);
  }
  if (S.zap && Math.random() < .2 * S.zap) {
    const t = S.bricks.filter(o => o.t !== 'ball' && !o.dead);
    if (t.length) {
      const o = t[Math.random() * t.length | 0], a = ctr(k), b = ctr(o);
      S.bolts.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, l: .15 }); hurt(o, S.dmg * 2);
    }
  }
}
function stepBall(b, d) {
  b.x += b.vx * d; b.y += b.vy * d;
  if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); } else if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); }
  if (b.y < topY + R) { b.y = topY + R; b.vy = Math.abs(b.vy); }
  if (b.vy > 0 && b.y >= floorY - R) { b.done = true; if (S.nx === null) S.nx = clamp(b.x, R, W - R); return; }
  let skipTouch = false;
  for (const k of S.bricks.slice()) {
    if (k.dead) continue;
    const bx = k.c * cell, by = y0 + k.r * cell;
    if (k.t === 'ball') { // 拾取 +1
      if (Math.hypot(b.x - bx - cell / 2, b.y - by - cell / 2) < R + cell * .22) { k.dead = true; S.bricks.splice(S.bricks.indexOf(k), 1); S.n++; }
      continue;
    }
    const cx = clamp(b.x, bx + 2, bx + cell - 2), cy = clamp(b.y, by + 2, by + cell - 2);
    const dx = b.x - cx, dy = b.y - cy;
    if (dx * dx + dy * dy >= R * R) continue;
    if (k === b.skip) { skipTouch = true; continue; }
    onHit(k);
    if (b.pierce > 0) { b.pierce--; b.skip = k; continue; }
    const len = Math.hypot(dx, dy) || 1;
    b.x = cx + dx / len * R; b.y = cy + dy / len * R;
    if (Math.abs(dx) > Math.abs(dy)) b.vx = (dx < 0 ? -1 : 1) * Math.abs(b.vx);
    else b.vy = (dy < 0 ? -1 : 1) * Math.abs(b.vy);
    break;
  }
  if (!skipTouch) b.skip = null;
  // 防止球几乎水平飞行卡住
  if (Math.abs(b.vy) < SP * .15) { b.vy = (b.vy < 0 ? -1 : 1) * SP * .15; b.vx = Math.sign(b.vx || 1) * Math.sqrt(SP * SP - b.vy * b.vy); }
}
function update(dt) {
  S.shake *= .85;
  S.parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.l -= dt; });
  S.parts = S.parts.filter(p => p.l > 0);
  S.texts.forEach(t => { t.y -= 40 * dt; t.l -= dt; }); S.texts = S.texts.filter(t => t.l > 0);
  S.bolts.forEach(b => b.l -= dt); S.bolts = S.bolts.filter(b => b.l > 0);
  if (S.st !== 'fire') return;
  const d = dt * S.ts;
  S.timer -= d;
  if (S.queue > 0 && S.timer <= 0) {
    S.balls.push({ x: S.lx, y: floorY - R, vx: S.vx, vy: S.vy, pierce: S.pierce, skip: null });
    S.queue--; S.timer = CFG.FIRE_GAP;
  }
  const steps = Math.ceil(SP * d / (R * .8));
  for (const b of S.balls) for (let i = 0; i < steps && !b.done; i++) stepBall(b, d / steps);
  S.balls = S.balls.filter(b => !b.done);
  if (S.queue === 0 && S.balls.length === 0) endTurn();
}

// ---------- 绘制 ----------
function txt(s, x, y, sz, c, al) {
  ctx.font = `bold ${sz}px sans-serif`; ctx.fillStyle = c; ctx.textAlign = al || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
const card = i => ({ x: 30, y: H / 2 - 150 + i * 100, w: W - 60, h: 84 });
const btn = i => ({ x: 40, y: H / 2 - 10 + i * 70, w: W - 80, h: 56 });
function box(r, c) { ctx.fillStyle = c; ctx.fillRect(r.x, r.y, r.w, r.h); }
function draw() {
  ctx.fillStyle = '#14172b'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (S.shake > .3) ctx.translate((Math.random() - .5) * S.shake, (Math.random() - .5) * S.shake);
  for (const k of S.bricks) {
    const x = k.c * cell, y = y0 + k.r * cell;
    if (k.t === 'ball') {
      ctx.fillStyle = '#3ddc84'; ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * .22, 0, 6.3); ctx.fill();
      txt('+1', x + cell / 2, y + cell / 2, cell * .22, '#14172b'); continue;
    }
    ctx.fillStyle = col(k.hp); ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
    if (k.t === 'bomb') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(x + 5, y + 5, cell - 10, cell - 10); }
    txt(Math.ceil(k.hp), x + cell / 2, y + cell / 2, cell * .34, '#fff');
  }
  ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 3;
  S.bolts.forEach(b => { ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); });
  S.parts.forEach(p => { ctx.globalAlpha = Math.min(1, p.l * 2); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 5, 5); });
  ctx.globalAlpha = 1;
  S.texts.forEach(t => txt(t.s, t.x, t.y, cell * .4, '#ffe66d'));
  // 地面、发射点、瞄准线
  ctx.fillStyle = '#2a2f55'; ctx.fillRect(0, floorY, W, 3);
  const lx = S.st === 'fire' ? S.nx : S.lx;
  ctx.fillStyle = '#fff';
  if (lx !== null) { ctx.beginPath(); ctx.arc(lx, floorY - R, R, 0, 6.3); ctx.fill(); }
  if (S.st === 'aim') txt('x' + S.n, S.lx, floorY + 22, 16, '#aab');
  if (S.st === 'aim' && S.ang !== null) {
    let x = S.lx, y = floorY - R, dx = Math.cos(S.ang), dy = Math.sin(S.ang);
    for (let i = 0; i < 45; i++) {
      x += dx * 14; y += dy * 14;
      if (x < 0 || x > W) dx = -dx;
      if (y < topY) break;
      ctx.globalAlpha = 1 - i / 50; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 6.3); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  S.balls.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 6.3); ctx.fill(); });
  ctx.restore();
  // HUD
  txt('回合 ' + (S.turn + 1), 16, TOP + 30, 18, '#fff', 'left');
  txt('得分 ' + S.score + '  最高 ' + best, W - 16, TOP + 30, 16, '#aab', 'right');
  if (S.st === 'fire') txt('点击加速', W / 2, floorY + 22, 14, '#667');
  if (S.st === 'pick') {
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 0, W, H);
    txt('选择强化', W / 2, H / 2 - 190, 26, '#fff');
    S.cards.forEach((u, i) => {
      const r = card(i); box(r, '#2f3a8f');
      txt(u.n, W / 2, r.y + 28, 22, '#ffe66d'); txt(u.d, W / 2, r.y + 60, 15, '#dde');
    });
  }
  if (S.st === 'over') {
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(0, 0, W, H);
    txt('GAME OVER', W / 2, H / 2 - 110, 32, '#ff6b6b');
    txt('得分 ' + S.score + '   最高 ' + best, W / 2, H / 2 - 60, 18, '#fff');
    if (!S.revived) { box(btn(0), '#e8590c'); txt('看视频复活', W / 2, btn(0).y + 28, 20, '#fff'); }
    box(btn(1), '#2f3a8f'); txt('再来一把', W / 2, btn(1).y + 28, 20, '#fff');
    box(btn(2), '#1f8f4f'); txt('分享给好友', W / 2, btn(2).y + 28, 20, '#fff');
  }
}

// ---------- 输入 ----------
const hit = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function aim(x, y) {
  const dx = x - S.lx, dy = y - (floorY - R);
  if (dy > -20) { S.ang = null; return; } // 往下拖 = 取消
  S.ang = clamp(Math.atan2(dy, dx), -Math.PI + .15, -.15);
}
function onTouch(type, x, y) {
  if (S.st === 'aim') {
    if (type === 'end') { if (S.ang !== null) fire(); S.ang = null; } else aim(x, y);
  } else if (type !== 'start') return;
  else if (S.st === 'fire') S.ts = 2.5;
  else if (S.st === 'pick') {
    const i = [0, 1, 2].find(i => hit(card(i), x, y));
    if (i !== undefined) { S.cards[i].f(); S.st = 'aim'; }
  } else if (S.st === 'over') {
    const i = [0, 1, 2].find(i => hit(btn(i), x, y));
    if (i === 0 && !S.revived) Plat.rewardAd(() => { S.revived = true; S.bricks = S.bricks.filter(k => k.r < ROWS - 3); S.st = 'aim'; });
    else if (i === 1) reset();
    else if (i === 2) Plat.share();
  }
}
if (wxEnv) {
  const t = e => e.touches[0];
  wx.onTouchStart(e => onTouch('start', t(e).clientX, t(e).clientY));
  wx.onTouchMove(e => onTouch('move', t(e).clientX, t(e).clientY));
  wx.onTouchEnd(() => onTouch('end'));
  wx.showShareMenu && wx.showShareMenu({});
} else {
  const p = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let down = false;
  canvas.addEventListener('pointerdown', e => { down = true; onTouch('start', ...p(e)); });
  canvas.addEventListener('pointermove', e => { if (down) onTouch('move', ...p(e)); });
  window.addEventListener('pointerup', () => { if (down) onTouch('end'); down = false; });
}

// ---------- 主循环 ----------
reset();
let last = 0;
function loop(t) {
  const dt = Math.min((t - last) / 1000 || .016, 1 / 30); last = t;
  update(dt); draw(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
