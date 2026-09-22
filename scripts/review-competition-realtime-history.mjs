import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const base = process.env.REVIEW_BASE || 'http://127.0.0.1:43010';
const out = new URL(`../outputs/independent-realtime-history${new URL(base).hostname === '127.0.0.1' ? '' : '-public'}/`, import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const report = { at: new Date().toISOString(), base, browser: browser.version(), checks: [], errors: [] };
const record = (name, evidence) => { report.checks.push({ name, evidence }); console.log(name, JSON.stringify(evidence)); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function player(game, who) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  // Observe the real Canvas paint calls without changing drawing, input or game state.
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, fillText = proto.fillText, clearRect = proto.clearRect;
    proto.clearRect = function (...args) { if (this.canvas.matches('[data-play]')) globalThis.__reviewPaint = []; return clearRect.apply(this, args); };
    proto.fillText = function (text, x, y, ...args) {
      if (this.canvas.matches('[data-play]')) {
        const transform = this.getTransform(), ratio = this.canvas.width / this.canvas.getBoundingClientRect().width;
        const width = this.measureText(text).width, size = Number(this.font.match(/([\d.]+)px/)?.[1] || 14);
        const start = this.textAlign === 'center' ? x - width / 2 : this.textAlign === 'right' ? x - width : x;
        (globalThis.__reviewPaint ||= []).push({ text: String(text), x: (start * transform.a + transform.e) / ratio,
          y: (y * transform.d + transform.f) / ratio, w: width * transform.a / ratio, h: size * transform.d / ratio });
      }
      return fillText.call(this, text, x, y, ...args);
    };
  });
  const p = { context, page, game, who, room: null, actions: [], images: [], board: null };
  page.on('pageerror', error => report.errors.push(`${game}/${who}: ${error.message}`));
  page.on('response', async response => {
    if (/assets\/competition\/.*webp/.test(response.url())) p.images.push({ url: new URL(response.url()).pathname, status: response.status() });
    if (!response.ok()) return;
    if (response.url().includes('/api/competition/v1/rooms')) {
      const body = await response.json().catch(() => null);
      if (body?.players && body.code) p.room = body;
    }
    if (response.url().includes('/api/competition/v1/boards/')) p.board = await response.json().catch(() => null);
  });
  page.on('request', request => {
    if (request.url().endsWith('/actions')) p.actions.push(JSON.parse(request.postData()));
  });
  await page.goto(`${base}/games/${game}/`);
  const response = await page.request.get(`${base}/games/${game}/competition.js`);
  const served = await response.body();
  const local = await readFile(new URL(`../apps/shell-web/dist/games/${game}/competition.js`, import.meta.url));
  assert(served.equals(local), 'running competition bundle must equal current gateway build');
  if (who === 'a') record(`${game}: current served bundle`, { sha256: createHash('sha256').update(served).digest('hex') });
  await page.getByRole('button', { name: '好友 PK · 全站榜', exact: true }).click();
  return p;
}
async function snap(p, name) {
  await p.page.screenshot({ path: fileURLToPath(new URL(`${p.game}-${p.who}-${name}.png`, out)) });
  await writeFile(new URL(`${p.game}-${p.who}-${name}.json`, out), JSON.stringify({ room: p.room, text: await p.page.locator('dialog[open]').innerText(), images: p.images }, null, 2));
}
async function tap(p, x, y, action = false) {
  const rect = await p.page.locator('[data-play]').boundingBox();
  assert(x >= 0 && x < rect.width && y >= 0 && y < rect.height, `visible tap ${x},${y} in ${rect.width}x${rect.height}`);
  const seq = p.room.seq;
  await p.page.mouse.click(rect.x + x, rect.y + y);
  if (action) await expect.poll(() => p.room.seq, { timeout: 20000 }).toBeGreaterThan(seq);
  else await p.page.waitForTimeout(40);
}
async function start(game) {
  const a = await player(game, 'a'), b = await player(game, 'b');
  await a.page.locator('[data-create]').click();
  await expect.poll(() => a.room?.code, { timeout: 20000 }).toBeTruthy();
  if (process.env.REVIEW_EDGES) {
    await a.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await a.page.locator('[data-share]').click();
    const invitation = await a.page.evaluate(() => navigator.clipboard.readText());
    assert.equal(new URL(invitation).searchParams.get('pk'), a.room.code);
    await b.page.goto(invitation);
    await expect(b.page.locator('[data-code]')).toHaveValue(a.room.code);
    record(`${game}: copied invitation received in second browser`, { pathname: new URL(invitation).pathname, code: a.room.code });
  } else await b.page.locator('[data-code]').fill(a.room.code);
  await b.page.locator('[data-join]').click();
  await expect.poll(() => b.room?.players.length, { timeout: 20000 }).toBe(2);
  assert.notEqual(a.room.players[a.room.you].id, b.room.players[b.room.you].id);
  await a.page.locator('[data-ready]').click();
  await b.page.locator('[data-ready]').click();
  await expect.poll(() => a.room?.status, { timeout: 20000 }).toBe('playing');
  await expect.poll(() => b.room?.status, { timeout: 20000 }).toBe('playing');
  record(`${game}: real identities create/join/ready`, { room: a.room.code, players: a.room.players.map(p => p.id), version: a.room.version });
  await snap(a, 'start'); await snap(b, 'start');
  return [a, b];
}
async function finish(players) {
  for (const p of players) await expect.poll(() => p.room?.status, { timeout: 150000 }).toBe('finished');
  assert.deepEqual(players[0].room.results, players[1].room.results);
  for (const p of players) {
    await snap(p, 'result');
    await p.page.getByRole('button', { name: '全站榜', exact: true }).click();
    await expect.poll(() => p.board).toBeTruthy();
    await snap(p, 'leaderboard');
    record(`${p.game}/${p.who}: common server result and leaderboard`, { results: p.room.results, board: p.board, actions: p.actions.length });
  }
  const previous = players[0].room.code;
  for (const p of players) {
    // A real refresh must restore persisted results and offer a direct replay action.
    await p.page.reload();
    await p.page.getByRole('button', { name: '好友 PK · 全站榜', exact: true }).click();
    const directRematch = p.page.locator('[data-details]').getByRole('button', { name: /^(再来一局|再次挑战)$/ });
    await expect(directRematch).toBeVisible({ timeout: 20000 });
    await snap(p, 'restored-result');
    await directRematch.click();
    await expect.poll(() => p.room.code).not.toBe(previous);
  }
  assert.equal(players[0].room.code, players[1].room.code);
  await expect.poll(() => players[0].room.players.length).toBe(2);
  record(`${players[0].game}: both clients rematch into same new room`, { previous, next: players[0].room.code });
  await players[0].page.getByRole('button', { name: '退出 PK', exact: true }).click();
}
async function history(players) {
  for (const p of players) {
    if (process.env.REVIEW_PLAY_LANDSCAPE && p.who === 'a') await p.page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => p.images.some(image => image.status === 200)).toBe(true);
    assert(!p.room.state.answer, 'server must not reveal historical answer before submission');
    for (let round = 1; round <= 5; round++) {
      await expect.poll(() => p.room.state.round).toBe(round);
      if (round === 1 && p.who === 'a') {
        const box = await p.page.locator('[data-play]').boundingBox();
        await tap(p, box.width * .75, 54, true);
        assert(p.room.state.hint, 'hint received from server');
        await snap(p, 'hint');
      }
      const box = await p.page.locator('[data-play]').boundingBox();
      const wide = box.width > 600 && box.height < 460;
      await tap(p, box.width * .25, 54); // Map tab, then a real Beijing-area map tap.
      const rect = { x: 10, y: 80, w: box.width - 20, h: Math.max(80, box.height - (wide ? 138 : 205)) };
      await tap(p, rect.x + rect.w / 2 + (116.4 - 20) * rect.w / 360, rect.y + rect.h / 2 - (39.9 - 15) * rect.h / 170);
      await tap(p, box.width / (wide ? 4 : 2), box.height - (wide ? 26 : 74));
      const columns = rect.h < 255 ? 6 : 3, rows = 12 / columns;
      const keyW = (box.width - 20 - (columns - 1) * 6) / columns;
      const keyH = Math.max(28, Math.min(48, (rect.h - 55) / rows - 5));
      for (const key of ['1', '9', '0', '0']) {
        const index = ['1','2','3','4','5','6','7','8','9','清空','0','退格'].indexOf(key);
        await tap(p, 10 + index % columns * (keyW + 6) + keyW / 2, 130 + Math.floor(index / columns) * (keyH + 5) + keyH / 2);
      }
      if (round === 1) await snap(p, 'year-input');
      await tap(p, box.width * (wide ? .75 : .5), box.height - 26, true);
      assert.equal(p.room.state.phase, 'revealed');
      assert.equal(p.room.state.answer.year !== undefined, true);
      if (round === 1 && p.who === 'a') assert.equal(p.room.state.answer.penalty, 500);
      record(`history/${p.who}: round ${round} server answer`, { score: p.room.state.answer.score, penalty: p.room.state.answer.penalty });
      if (round < 5) await tap(p, box.width / 2, box.height - 36, true);
    }
  }
}
function streetGeometry(state, width, height) {
  const nodes = state.map.nodes, minX = Math.min(...nodes.map(n => n.x)) - 55, minY = Math.min(...nodes.map(n => n.y)) - 65;
  const mapW = Math.max(...nodes.map(n => n.x)) + 55 - minX, mapH = Math.max(...nodes.map(n => n.y)) + 55 - minY;
  const bottom = Math.max(150, height - 106), scale = Math.max(.05, Math.min((width - 16) / mapW, (bottom - 40) / mapH));
  return { bottom, scale, x: (width - mapW * scale) / 2 - minX * scale, y: 40 + (bottom - 40 - mapH * scale) / 2 - minY * scale };
}
async function streetMove(p, cop, point) {
  if (p.room.state.finished) return;
  const box = await p.page.locator('[data-play]').boundingBox();
  const g = streetGeometry(p.room.state, box.width, box.height);
  const count = p.room.state.cops.length, bw = Math.min(84, (box.width - 24 - 6 * count) / (count + 1));
  const left = (box.width - (bw * (count + 1) + 6 * count)) / 2;
  await tap(p, left + cop * (bw + 6) + bw / 2, g.bottom + 56);
  // Actor selection has priority over roads; tap just below the officer's 44 px selection box.
  const seq = p.room.seq;
  await tap(p, g.x + point.x * g.scale, g.y + point.y * g.scale + Math.max(0, 23 - 20 * g.scale));
  await expect.poll(() => p.room.seq > seq || p.room.state.finished, { timeout: 20000 }).toBe(true);
}
async function street(players) {
  await Promise.all(players.map(async p => {
    const nodes = p.room.state.map.nodes;
    // Human-authored blockade: guard the two terminal approaches, chase with the third officer.
    await streetMove(p, 0, nodes.find(n => n.label === 'G4') || { x: 920, y: 410 });
    await streetMove(p, 1, nodes.find(n => n.label === 'C4') || { x: 360, y: 410 });
  }));
  const started = Date.now();
  while (players.some(p => !p.room.state.finished) && Date.now() - started < 125000) {
    await Promise.all(players.map(async p => {
      const robber = p.room.state.robbers.find(r => !r.caught && !r.escaped);
      if (robber && !p.room.state.finished) await streetMove(p, 2, robber);
    }));
    await wait(350);
  }
  for (const p of players) record(`street/${p.who}: actual canvas commands`, { phase: p.room.state.phase, caught: p.room.state.caught, elapsedMs: p.room.state.elapsedMs, actions: p.actions.length });
}
async function edges(players) {
  const [a, b] = players;
  const beforeSeq = a.room.seq;
  for (const action of [{ type: 'submit', score: 999999, elapsedMs: 1 }, a.game === 'cops-robbers-realtime' ? { type: 'move', cop: 99, x: 0, y: 0 } : { type: 'guess', point: { lat: 91, lng: 0 }, year: 0 }]) {
    const error = await a.page.evaluate(async ({ code, seq, action }) => {
      try { await globalThis.__competition.request(`/rooms/${code}/actions`, { body: JSON.stringify({ seq: seq + 1, action }) }); return null; }
      catch (error) { return error.code; }
    }, { code: a.room.code, seq: beforeSeq, action });
    assert.equal(error, 'ILLEGAL_ACTION');
  }
  record(`${a.game}: forged score and illegal operation rejected`, { unchangedSeq: a.room.seq === beforeSeq });
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await a.page.setViewportSize(viewport);
    await a.page.waitForTimeout(300);
    const canvas = await a.page.locator('[data-play]').boundingBox();
    await snap(a, `playing-${viewport.width}x${viewport.height}`);
    record(`${a.game}: viewport`, { viewport, canvas });
    await layoutCheck(a, `playing-${viewport.width}x${viewport.height}`);
    await a.page.getByRole('button', { name: '规则', exact: true }).click();
    await a.page.waitForTimeout(100);
    await snap(a, `rules-${viewport.width}x${viewport.height}`);
    await layoutCheck(a, `rules-${viewport.width}x${viewport.height}`);
    await a.page.getByRole('button', { name: '规则', exact: true }).click();
  }
  await a.page.setViewportSize({ width: 390, height: 844 });
  const code = a.room.code;
  await a.page.locator('dialog [data-game-fullscreen]').click();
  await a.page.waitForTimeout(300);
  const fullscreen = await a.page.evaluate(() => !!document.fullscreenElement);
  record(`${a.game}: actual fullscreen`, { fullscreen, roomUnchanged: code === a.room.code });
  if (fullscreen) await a.page.locator('dialog [data-game-fullscreen]').click();
  const before = a.room.state.elapsedMs, beforeServerTime = a.room.serverNow;
  await a.context.setOffline(true);
  await wait(2600);
  await snap(a, 'offline');
  const offlineText = await a.page.locator('dialog [data-status]').innerText();
  assert.match(offlineText, /网络|服务|不可用/);
  await a.context.setOffline(false);
  await expect.poll(() => a.page.locator('dialog [data-status]').innerText(), { timeout: 15000 }).not.toMatch(/网络|不可用/);
  assert(a.room.serverNow > beforeServerTime + 1500);
  if (a.game === 'cops-robbers-realtime') assert(a.room.state.elapsedMs > before + 1500);
  record(`${a.game}: offline recovery`, { offlineText, before, after: a.room.state.elapsedMs, roomUnchanged: code === a.room.code });
  await a.page.getByRole('button', { name: '退出 PK', exact: true }).click();
  await expect.poll(() => b.room.status).toBe('abandoned');
  await snap(b, 'opponent-left');
  await b.page.getByRole('button', { name: '再来一局', exact: true }).click();
  await expect.poll(() => b.room.code).not.toBe(code);
  record(`${a.game}: exit/rematch`, { previous: code, next: b.room.code, status: b.room.status });
  await b.page.getByRole('button', { name: '退出 PK', exact: true }).click();
}
async function layoutCheck(p, label) {
  const box = await p.page.locator('[data-play]').boundingBox();
  const paint = await p.page.evaluate(() => globalThis.__reviewPaint || []);
  const issues = [];
  if (p.game === 'cops-robbers-realtime') {
    for (const text of paint.filter(t => /^(留守|[123] 号|比赛无法暂停)/.test(t.text))) {
      if (text.y + text.h / 2 > box.height || text.y - text.h / 2 < 0) issues.push(`clipped control: ${text.text}`);
    }
  } else {
    const clue = paint.find(t => t.text.startsWith(p.room.state.clue.slice(0, 4)));
    const feedback = paint.find(t => t.text.startsWith('先观察线索'));
    if (clue && feedback && clue.x < feedback.x + feedback.w && feedback.x < clue.x + clue.w && Math.abs(clue.y - feedback.y) < (clue.h + feedback.h) / 2) issues.push('clue overlaps map feedback');
  }
  record(`${p.game}: painted layout ${label}`, { issues });
  if (process.env.REVIEW_LAYOUT_ASSERT) assert.deepEqual(issues, [], `${p.game}/${label}`);
}
async function outage(game) {
  const p = await player(game, 'outage');
  await p.page.locator('[data-create]').click();
  await expect.poll(() => p.room?.code, { timeout: 20000 }).toBeTruthy();
  const code = p.room.code, id = p.room.players[p.room.you].id;
  record('OUTAGE_READY: waiting for coordinator to suspend the real tunnel', { code, id });
  await expect.poll(() => p.page.locator('[data-status]').innerText(), { timeout: 90000 }).toMatch(/网络不可用|服务.*不可用/);
  await snap(p, 'tunnel-unavailable');
  record('OUTAGE_OBSERVED', { text: await p.page.locator('[data-status]').innerText(), code });
  await expect.poll(() => p.page.locator('[data-status]').innerText(), { timeout: 90000 }).toMatch(/等待双方准备/);
  assert.equal(p.room.code, code); assert.equal(p.room.players[p.room.you].id, id);
  await snap(p, 'tunnel-restored');
  record('OUTAGE_RECOVERED: same real room and identity', { code, id });
  await p.page.getByRole('button', { name: '退出 PK', exact: true }).click();
  await p.context.close();
}
try {
  const games = process.env.REVIEW_GAME ? [process.env.REVIEW_GAME] : process.env.REVIEW_OUTAGE ? ['vibeJam-myself-history-guess'] : ['vibeJam-myself-history-guess', 'cops-robbers-realtime'];
  for (const game of games) {
    if (process.env.REVIEW_OUTAGE) { await outage(game); continue; }
    const players = await start(game);
    if (process.env.REVIEW_EDGES) await edges(players);
    else { if (game === 'vibeJam-myself-history-guess') await history(players); else await street(players); await finish(players); }
    for (const p of players) await p.context.close();
  }
} catch (error) {
  report.errors.push(error.stack); process.exitCode = 1; console.error(error);
} finally {
  const name = process.env.REVIEW_OUTAGE ? 'outage' : process.env.REVIEW_EDGES ? 'edges' : 'main';
  await writeFile(new URL(`${name}-${process.env.REVIEW_GAME || 'all'}-report.json`, out), JSON.stringify(report, null, 2));
  await browser.close();
}
