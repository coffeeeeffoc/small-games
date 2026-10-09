import { assertHostCapabilities, HostError, gameManifestSchema } from '@coffeeeeffoc/game-contract';
import manifest from './manifest.json';
import { createLevel, createEndless, place, placeIssuedGroup, undo, canPlace, hasPlacement, previewPlacement,
  continueLevel, finishEndless, getStars } from '../src/engine.mjs';
import { LEVELS, CHAPTERS, getLevel } from '../src/levels.mjs';
import { SHAPE_BY_ID } from '../src/shapes.mjs';
import * as progression from '../src/progress.mjs';
import '../competition.js';
import { createOnlineClient } from '../src/client.mjs';
import { createNativeFeedback } from './feedback.mjs';

export const threeChooseTwoManifest = gameManifestSchema.parse(manifest);
export const defaultThreeChooseTwoEnvelope = {
  gameId: 'three-choose-two', schemaVersion: 1, revision: 1,
  payload: { levelIds: LEVELS.map(level => level.id) },
};

/** DOM-free native renderer. The exact same engine and catalog power H5 and native play. */
export const threeChooseTwoCanvasDefinition = {
  manifest: threeChooseTwoManifest,
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (host.session.gameId !== manifest.gameId)
      throw new HostError({ code: 'INVALID_INPUT', message: 'Three choose two session identity mismatch' });
    const content = await host.content.load();
    if (content.gameId !== manifest.gameId || content.schemaVersion !== 1 ||
      !Number.isInteger(content.revision) || content.revision < 1 ||
      JSON.stringify(content.payload?.levelIds) !== JSON.stringify(defaultThreeChooseTwoEnvelope.payload.levelIds))
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Unsupported three choose two level catalog' });
    const ctx = target.canvas.getContext('2d');
    if (!ctx) throw new HostError({ code: 'UNAVAILABLE', message: 'Canvas 2D is unavailable' });

    let page = 'home', previousSettingsPage = 'home', previousHelpPage = 'home', state = null, disposed = false, suspended = false;
    let buttons = [], slots = [], drag = null, held = null, selectedSlot = null;
    let levelChapter = 0, notice = '', noticeUntil = 0, flash = null, adBusy = false;
    let inputLockedUntil = 0;
    let storageVersion = null, saveWork = Promise.resolve(), lastSize = '', nativeRunId = '', pendingReward = null;
    let onlineSession = null, onlineRecovery = null, onlineBusy = false, onlineError = '';
    let pendingActions = [], pendingFinish = false, gameEpoch = 0, ranking = null, rankingBusy = false, rankingError = '', rankingPage = 0, rankingScope = 'top';
    const configured = globalThis.__COMPETITION_CONFIG__ ?? {};
    const platform = configured.platform ?? (globalThis.wx ? 'wechat' : globalThis.bl ? 'bilibili' : null);
    const nativeSdk = platform === 'wechat' ? globalThis.wx : platform === 'bilibili' ? globalThis.bl : null;
    const onlineConfigured = Boolean(nativeSdk && configured.apiUrl && configured.appId);
    const online = onlineConfigured ? createOnlineClient({ ...configured, platform }, nativeSdk) : null;
    let progress = progression.createProgress();
    try {
      const saved = await host.storage.read(progression.STORAGE_KEY);
      storageVersion = saved?.version ?? null;
      if (saved?.value && typeof saved.value === 'object') {
        const value = saved.value;
        progress = progression.readProgress({ getItem: () => JSON.stringify(value) });
        state = progression.resumeState(progress);
        nativeRunId = typeof value.native?.runId === 'string' ? value.native.runId : '';
        pendingReward = value.native?.pendingReward ?? null;
        const recovery = value.native?.online;
        if (recovery && typeof recovery.id === 'string' && Number.isSafeInteger(recovery.seq)) {
          onlineRecovery = { id: recovery.id, seq: recovery.seq };
          pendingActions = Array.isArray(recovery.pendingActions) ? recovery.pendingActions : recovery.pendingAction ? [{ ...recovery.pendingAction, seq: recovery.pendingAction.baseSeq + 1 }] : []; pendingFinish = recovery.pendingFinish === true;
        }
      }
    } catch { notice = '进度暂存于本次游戏'; noticeUntil = Date.now() + 6000; }
    const feedback = createNativeFeedback(target, nativeSdk, () => progress.settings);

    const palette = () => progress.settings.highContrast
      ? ['#B64324', '#007F6D', '#987000', '#627CB0', '#708E3A'] : ['#ED806B', '#73BF94', '#F2CB58', '#91A9C0', '#ACBC73'];
    const ink = '#244D39', muted = '#526C55', paper = '#F7F2E8', soft = '#FFF3DA';
    const art = {};
    const endlessName = () => state?.variant === 'refill' ? '立即补位' : '三选二';
    function view() {
      const height = Math.max(700, Math.min(1000, target.canvas.height * 390 / target.canvas.width));
      const scale = Math.min(target.canvas.width / 390, target.canvas.height / height);
      return { width: 390, height, scale, left: (target.canvas.width - 390 * scale) / 2,
        top: (target.canvas.height - height * scale) / 2 };
    }
    function layout() {
      const h = view().height;
      const extra = state?.mode === 'level' && (state.config?.goal?.cross || state.config?.goal?.multi || state.config?.discardBudget !== undefined) ? 24 : 0;
      const size = Math.min(352, h - 338 - extra);
      const y = 170 + extra - Math.max(0, 844 - h) * .12;
      const x = (390 - size) / 2, padding = 8, pitch = (size - padding * 2) / 8;
      return { x, y, size, innerX: x + padding, innerY: y + padding, pitch,
        slotY: y + size + 52, slotHeight: Math.min(128, h - 82 - (y + size + 52)) };
    }
    function round(x, y, w, h, r = 16, fill = soft, stroke = null) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius); ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h); ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius); ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); }
    }
    function text(value, x, y, size = 16, color = ink, align = 'center', weight = 600) {
      ctx.font = `${weight} ${size}px sans-serif`; ctx.fillStyle = color;
      ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(String(value), x, y);
    }
    function paragraph(value, x, y, width = 330, size = 15, color = muted, max = 5) {
      ctx.font = `${size}px sans-serif`;
      let line = '', row = 0;
      for (const char of String(value)) {
        if (char === '\n' || ctx.measureText(line + char).width > width) {
          text(line, x, y + row * (size + 10), size, color, 'left', 400);
          if (++row >= max) return;
          line = ''; if (char === '\n') continue;
        }
        line += char;
      }
      if (line) text(line, x, y + row * (size + 10), size, color, 'left', 400);
    }
    function button(label, x, y, w, h, action, options = {}) {
      const primary = options.primary;
      round(x, y + 4, w, h, options.radius ?? 18, options.disabled ? '#BAC2B0' : primary ? '#AE604C' : '#BCA982');
      round(x, y, w, h, options.radius ?? 18, options.disabled ? '#DAD3BF' : primary ? gradient(y, h, '#F59C7E', '#DF765E') : gradient(y, h, '#FFF8E4', '#E5D2AE'),
        options.outline ? '#BBC6B6' : '#FFF0CE');
      if (options.pause) {
        ctx.fillStyle = ink; ctx.fillRect(x + 15, y + 12, 5, 19); ctx.fillRect(x + 26, y + 12, 5, 19);
        text(label, x + w / 2, y + h - 7, 9, ink);
      } else {
        const labelX = options.align === 'left' ? x + 22 : x + w / 2;
        const align = options.align === 'left' ? 'left' : 'center';
        text(label, labelX, y + h / 2 - (options.subtitle ? 12 : 0), options.size ?? 17,
          options.disabled ? '#90988C' : primary ? '#FFFFFF' : ink, align);
        if (options.subtitle) text(options.subtitle, labelX, y + h / 2 + 16, 12,
          primary ? '#E0E9DB' : muted, align, 400);
      }
      const minimum = 44 / view().scale;
      buttons.push({ label, x: x - Math.max(0, minimum - w) / 2,
        y: y - Math.max(0, minimum - h) / 2, w: Math.max(w, minimum), h: Math.max(h, minimum),
        action, disabled: options.disabled });
    }
    function title(label, back = 'home') {
      button('返回', 20, 22, 52, 46, () => show(back), { size: 12, radius: 15 });
      text(label, 210, 46, 20);
    }
    function star(x, y, radius, color) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + Math.PI * i / 5, r = i % 2 ? radius * .46 : radius;
        const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    function gradient(y, height, top, bottom) {
      const paint = ctx.createLinearGradient(0, y, 0, y + height);
      paint.addColorStop(0, top); paint.addColorStop(1, bottom); return paint;
    }
    function block(x, y, size, color, mark = false, alpha = 1) {
      ctx.save(); ctx.globalAlpha = alpha;
      round(x, y + 2, size, size, 5, color, '#52634866');
      round(x + 1, y, size - 2, size - 2, 5, color);
      round(x + 1, y, size - 2, size - 2, 5, gradient(y, size, '#FFFFFF55', '#314C381E'));
      round(x + 2.5, y + 2, size - 5, size - 6, 4, null, '#FFFFFF38');
      if (mark) star(x + size / 2, y + size / 2, size * .25, '#FFF9DB');
      ctx.restore();
    }
    function piece(candidate, x, y, pitch, alpha = 1) {
      const shape = SHAPE_BY_ID[candidate.shapeId]; if (!shape) return;
      const color = palette()[Math.abs(Number(candidate.color ?? 1) - 1) % palette().length];
      shape.cells.forEach(([dx, dy]) => block(x + dx * pitch, y + dy * pitch,
        Math.max(6, pitch - 3), color, candidate.stars?.some(([sx, sy]) => sx === dx && sy === dy), alpha));
    }
    function track(name, properties = {}) {
      if (host.session.capabilities.includes('telemetry'))
        void host.telemetry.track(`three-choose-two.${name}`, properties).catch(() => {});
    }
    function sound(kind) {
      if (!suspended) feedback.sound(kind);
    }
    function stopSounds() { feedback.setActive(false); }
    function say(value, duration = 2600) {
      notice = value; noticeUntil = Date.now() + duration; render();
    }
    function clearInput() { drag = null; held = null; selectedSlot = null; }
    function persist() {
      progress = progression.saveCurrentGame(progress,
        !onlineSession && state && ['playing', 'lost'].includes(state.status) ? state : null);
      let value;
      progression.saveProgress({ setItem(_key, json) { value = JSON.parse(json); } }, progress);
      const savedOnline = onlineSession ?? onlineRecovery;
      value.native = { runId: nativeRunId, pendingReward, online: savedOnline
        ? { id: savedOnline.id, seq: savedOnline.seq, pendingActions: JSON.parse(JSON.stringify(pendingActions)), pendingFinish } : null };
      saveWork = saveWork.then(async () => {
        try { storageVersion = (await host.storage.write(progression.STORAGE_KEY, value, storageVersion)).version; }
        catch { notice = '进度暂存于本次游戏'; noticeUntil = Date.now() + 5000; }
      });
      return saveWork;
    }
    function show(next) {
      clearInput(); page = next; stopSounds();
      if (next === 'pause' || next === 'home') persist();
      render();
    }
    function showHelp() { previousHelpPage = page; show('help'); }
    function exitLocalGame() {
      if (!state || onlineSession) return;
      // Returning home keeps a resumable puzzle. Explicitly exiting abandons
      // only this local run; ranked recovery and its pending queue stay intact.
      state = null; nativeRunId = ''; pendingReward = null;
      flash = null; inputLockedUntil = 0; notice = '';
      show('home');
    }
    function startLevel(id) {
      if (!getLevel(id) || !progression.isLevelUnlocked(progress, id)) return;
      state = createLevel(id); nativeRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      gameEpoch++; onlineSession = null; onlineBusy = false; onlineError = '';
      pendingReward = null; clearInput(); page = 'game'; notice = ''; flash = null;
      inputLockedUntil = 0;
      track('start', { mode: 'level', levelId: id }); persist(); render();
    }
    function startPractice(variant = 'classic') {
      state = createEndless(`${Date.now()}-${Math.random().toString(36).slice(2)}`, { ranked: false, variant });
      gameEpoch++; onlineSession = null; onlineBusy = false; onlineError = '';
      nativeRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingReward = null; clearInput(); page = 'game'; notice = ''; flash = null;
      inputLockedUntil = 0;
      track('start', { mode: 'practice' }); persist(); render();
    }
    function complete() {
      clearInput(); page = 'result';
      feedback.setActive(false);
      if (state.mode === 'level' && state.status === 'won') {
        progress = progression.recordLevelResult(progress, state);
        sound('win');
      } else if (state.mode === 'endless' && !onlineSession) {
        progress = progression.recordEndlessResult(progress, state);
      }
      track('finish', { mode: state.mode, score: state.score, status: state.status, reason: state.reason });
      persist(); render();
    }
    function activeOnline(epoch, id) {
      return !disposed && epoch === gameEpoch && (!id || onlineSession?.id === id);
    }
    function rebuildIssuedState(session) {
      let rebuilt = session.state;
      pendingActions = pendingActions.filter(action => action.seq > session.seq);
      const verified = [];
      for (const action of pendingActions) {
        if (action.seq !== session.seq + verified.length + 1 || action.group !== rebuilt.group ||
          !canPlace(rebuilt, action.slot, action.x, action.y)) break;
        const next = placeIssuedGroup(rebuilt, action.slot, action.x, action.y);
        if (next === rebuilt) break;
        rebuilt = next; verified.push(action);
      }
      pendingActions = verified;
      state = pendingFinish && rebuilt.status === 'playing' ? finishEndless(rebuilt) : rebuilt;
    }
    function acceptOnline(session, rebuild = false) {
      onlineSession = session; onlineRecovery = { id: session.id, seq: session.seq };
      if (rebuild) rebuildIssuedState(session);
      else if (!pendingActions.length) state = session.state;
      if (session.status === 'finished') { pendingActions = []; pendingFinish = false; state = session.state; }
      clearInput();
      if (state.status !== 'playing' && (['game', 'pause', 'result'].includes(page) || page === 'help' && previousHelpPage === 'game'))
        page = suspended ? 'pause' : 'result';
      persist(); render();
    }
    async function startOnline() {
      if (!online || onlineBusy) return;
      const epoch = ++gameEpoch;
      onlineBusy = true; onlineError = ''; render();
      try {
        const session = onlineRecovery ? await online.restore(onlineRecovery.id) : await online.create();
        if (!activeOnline(epoch)) return;
        onlineSession = session; rebuildIssuedState(session);
        if (page === 'endless') page = suspended ? 'pause' : state.status === 'playing' ? 'game' : 'result';
        acceptOnline(session);
      } catch (error) { if (activeOnline(epoch)) { onlineError = error.message; render(); } }
      finally {
        if (activeOnline(epoch)) { onlineBusy = false; render(); if (onlineSession && (pendingActions.length || pendingFinish)) void flushOnline(); }
      }
    }
    function placementFeedback() {
      const event = state.lastEvent;
      if (event?.lines) {
        flash = { rows: event.rows, cols: event.cols, until: Date.now() + 300 };
        sound('clear'); notice = `${event.lines > 1 ? `${event.lines}线同消` : '漂亮消除'}  +${event.scoreDelta}`;
        if (state.combo > 1) notice += ` · 连续消除${state.combo}次`;
        noticeUntil = Date.now() + 1800;
      } else {
        sound('place');
        if (event?.discarded) { notice = `余下的${SHAPE_BY_ID[event.discarded.shapeId]?.name ?? '积木'}已丢弃`; noticeUntil = Date.now() + 1800; }
      }
      if (event?.lines || event?.discarded) inputLockedUntil = Date.now() + 300;
    }
    function rankedPlace(slot, x, y) {
      if (pendingFinish || state.waitingNextGroup || !canPlace(state, slot, x, y)) return;
      pendingActions.push({ seq: onlineSession.seq + pendingActions.length + 1, group: state.group, slot, x, y });
      state = placeIssuedGroup(state, slot, x, y); clearInput(); placementFeedback(); persist(); render();
      if (state.status !== 'playing') page = suspended ? 'pause' : 'result';
      void flushOnline();
    }
    async function flushOnline() {
      if (!onlineSession || onlineBusy) return;
      const epoch = gameEpoch, id = onlineSession.id;
      onlineBusy = true; onlineError = ''; render();
      try {
        while (pendingActions.length) {
          const action = pendingActions[0];
          const response = await online.place({ ...onlineSession, seq: action.seq - 1, state: { group: action.group } }, action.slot, action.x, action.y);
          if (!activeOnline(epoch, id)) return;
          pendingActions.shift(); acceptOnline(response);
        }
        if (pendingFinish || onlineSession.status === 'finished' || state.status !== 'playing') {
          const response = onlineSession.status === 'finished' ? onlineSession : await online.finish(onlineSession);
          if (!activeOnline(epoch, id)) return;
          pendingFinish = false; acceptOnline(response);
        }
      } catch (error) {
        if (!activeOnline(epoch, id)) return;
        onlineError = error.message || '网络不可用，本组可以继续，下一组等待连接';
        if (['ILLEGAL_ACTION', 'SEQUENCE_CONFLICT', 'ACTION_CONFLICT', 'GROUP_CONFLICT'].includes(error.code)) {
          try {
            const response = await online.restore(id);
            if (!activeOnline(epoch, id)) return;
            pendingActions = []; acceptOnline(response, true);
            if (pendingFinish && response.status !== 'finished') {
              const finished = await online.finish(response);
              if (!activeOnline(epoch, id)) return;
              pendingFinish = false; onlineError = ''; acceptOnline(finished);
            } else onlineError = '对局已从服务端恢复，请重新连接后继续';
          } catch { /* Keep the queue until its server status can be checked. */ }
        }
      } finally {
        if (activeOnline(epoch, id)) { onlineBusy = false; persist(); render(); }
      }
    }
    function endOnline() {
      if (!onlineSession || pendingFinish) return;
      pendingFinish = true;
      if (state.status === 'playing') state = finishEndless(state);
      page = 'result'; clearInput(); persist(); render(); void flushOnline();
    }
    async function reconnectOnline() {
      if (!online || !onlineSession || onlineBusy) return;
      const epoch = gameEpoch, id = onlineSession.id;
      onlineBusy = true; onlineError = ''; render();
      try {
        const session = await online.restore(id);
        if (!activeOnline(epoch, id)) return;
        acceptOnline(session, true);
      } catch (error) { if (activeOnline(epoch, id)) onlineError = error.message; }
      finally {
        if (activeOnline(epoch, id)) {
          onlineBusy = false; persist(); render();
          if (!onlineError && (pendingActions.length || pendingFinish)) void flushOnline();
        }
      }
    }
    function newOnline() {
      if (onlineBusy) return;
      gameEpoch++; onlineSession = null; onlineRecovery = null; pendingActions = []; pendingFinish = false;
      state = null; page = 'endless'; startOnline();
    }
    async function loadRanking() {
      page = 'ranking'; rankingPage = 0; rankingScope = 'top'; clearInput(); rankingError = '';
      if (!online || rankingBusy) { render(); return; }
      rankingBusy = true; render();
      try { ranking = await online.board(); }
      catch (error) { rankingError = error.message; }
      finally { rankingBusy = false; if (!disposed) render(); }
    }
    function placePiece(slot, x, y) {
      if (suspended || page !== 'game' || !state || state.status !== 'playing' || Date.now() < inputLockedUntil) return;
      if (onlineSession) { void rankedPlace(slot, x, y); return; }
      const next = place(state, slot, x, y);
      if (next === state) { sound('invalid'); say('这里放不下，换个位置试试'); return; }
      state = next; selectedSlot = null;
      const event = state.lastEvent;
      if (event?.lines) {
        flash = { rows: event.rows, cols: event.cols, until: Date.now() + 300 };
        sound('clear');
        notice = `${event.lines > 1 ? `${event.lines}线同消` : '漂亮消除'}  +${event.scoreDelta}`;
        if (state.combo > 1) notice += ` · 连续消除${state.combo}次`;
        noticeUntil = Date.now() + 1800;
      } else {
        sound('place');
        if (event?.discarded) {
          notice = `余下的${SHAPE_BY_ID[event.discarded.shapeId]?.name ?? '积木'}已丢弃`;
          noticeUntil = Date.now() + 1800;
        }
      }
      if (event?.lines || event?.discarded) inputLockedUntil = Date.now() + 300;
      persist(); if (state.status !== 'playing') complete(); else render();
    }
    function undoMove() {
      const next = undo(state);
      if (next === state) return;
      state = next; page = 'game'; flash = null; inputLockedUntil = 0; clearInput(); sound('undo');
      notice = '已恢复上一步棋盘和候选'; noticeUntil = Date.now() + 2000; persist(); render();
    }
    async function rewardContinue() {
      if (adBusy || disposed || !state || state.reason !== 'groups-exhausted') return;
      const epoch = gameEpoch, runId = nativeRunId;
      const rewardId = `three-choose-two:${runId}:continue`;
      const currentRun = () => !disposed && gameEpoch === epoch && nativeRunId === runId && state;
      adBusy = true; render();
      try {
        const outcome = await host.ads.offer({ id: rewardId, reward: { levelId: state.levelId, groups: 2 } });
        if (!currentRun()) return;
        if (outcome.status === 'completed') {
          pendingReward = { id: rewardId, runId, completed: true };
          await persist();
          if (!currentRun()) return;
          const next = continueLevel(state, rewardId);
          if (next !== state) { state = next; page = suspended ? 'pause' : 'game'; notice = '已增加2组，继续试试'; noticeUntil = Date.now() + 2500; }
          pendingReward = null; await persist();
        } else say(outcome.status === 'dismissed' ? '已取消，本局未消耗续局次数' : '广告暂不可用，可免费重开');
      } catch { if (!disposed) say('广告暂不可用，可免费重开'); }
      finally { adBusy = false; if (!disposed) render(); }
    }
    function drawHome(h) {
      round(24, 28, 87, 38, 15, soft); star(43, 47, 15, '#E8BE55');
      text(progression.totalStars(progress), 79, 47, 18);
      button('设置', 316, 24, 50, 44, () => { previousSettingsPage = 'home'; show('settings'); }, { size: 12, radius: 16 });
      const compressed = Math.max(0, 844 - h), titleY = 114 - compressed * .1;
      const logoHeight = 200 - compressed * .3;
      if (art.logo) ctx.drawImage(art.logo, (390 - logoHeight * 1.5) / 2, 72, logoHeight * 1.5, logoHeight);
      else { text('三块', 195, titleY, 48, ink, 'center', 900); text('选两块', 195, titleY + 54, 54, ink, 'center', 900); }
      const heroHeight = 282 - compressed * .71, heroY = 228 - compressed * .35;
      if (art.hero) ctx.drawImage(art.hero, (390 - heroHeight * 1.334) / 2, heroY, heroHeight * 1.334, heroHeight);
      else { piece({shapeId:'l3-nw', color:1}, 112, heroY + 25, 42); piece({shapeId:'square2', color:2}, 208, heroY + 38, 42); }
      const current = Math.min(LEVELS.length, state?.status !== 'won' ? Number(state?.levelId) || progress.unlocked : progress.unlocked);
      const currentTitle = (state?.mode === 'level' && state.levelId === current ? state.config?.title : null) ?? getLevel(current).title;
      round(46, h - 346, 298, 38, 15, soft);
      text(state?.mode === 'endless' && state.status === 'playing' ? endlessName()+' · '+state.score+' 分'
        : '第 '+String(current).padStart(2,'0')+' 关 · '+currentTitle, 195, h - 327, 15);
      button(state?.mode === 'endless' && state.status === 'playing' ? '继续游戏' : '继续闯关', 24, h - 291, 342, 63, () => {
        if (state?.status === 'playing') show('game'); else if (state?.status === 'lost' && state.mode === 'level') show('result'); else startLevel(current);
      }, { primary: true, size: 24 });
      button('选关', 24, h - 210, 163, 65, () => { levelChapter = Math.floor((progress.unlocked - 1) / 10); show('levels'); }, { size: 20 });
      button('无尽挑战', 201, h - 210, 165, 65, () => show('endless'), { size: 20 });
      button('排行榜', 83, h - 101, 100, 48, () => { void loadRanking(); }, { size: 14 });
      button('玩法提示', 207, h - 101, 100, 48, showHelp, { size: 14 });
    }
    function drawLevels(h) {
      title('选关');
      const total = progression.totalStars(progress);
      text(`已获 ${total} 星 · 已解锁 ${progress.unlocked} / ${LEVELS.length}`, 195, 97, 12, ink);
      round(93, 140, 204, 58, 13, '#967444');
      round(93, 136, 204, 58, 13, gradient(136, 58, '#EBCB9A', '#CDA570'), '#F6DBAB');
      text(CHAPTERS[levelChapter].title, 195, 164, 24, '#593D22', 'center', 900);
      const rowGap = Math.min(151, (h - 390) / 2);
      LEVELS.slice(levelChapter * 10, levelChapter * 10 + 10).forEach((level, index) => {
        const x = 22 + (index % 5) * 71, y = 240 + Math.floor(index / 5) * rowGap;
        const enabled = progression.isLevelUnlocked(progress, level.id), record = progress.records[level.id];
        button(String(level.id).padStart(2, '0'), x, y, 61, 73, () => startLevel(level.id),
          { primary: enabled && level.id === progress.unlocked, disabled: !enabled, size: 24 });
        if (record?.stars) for (let i = 0; i < 3; i++) star(x + 16 + i * 15, y + 59, 6, i < record.stars ? '#E8BE55' : '#C5CBBB');
        else if (!enabled) {
          round(x + 25, y + 53, 12, 10, 3, '#81765B');
          round(x + 27, y + 47, 8, 10, 4, null, '#81765B');
        }
      });
      button('上一章', 25, h - 90, 108, 46, () => { levelChapter--; render(); }, { disabled: levelChapter === 0, size: 14 });
      text(`${levelChapter + 1} / 3`, 195, h - 67, 14, ink);
      button('下一章', 257, h - 90, 108, 46, () => { levelChapter++; render(); }, { disabled: levelChapter === 2, size: 14 });
    }
    function drawGame(h) {
      const b = layout(), level = state.mode === 'level' ? state.config ?? getLevel(state.levelId) : null;
      button('首页', 20, 22, 52, 46, () => show('home'), { size: 12, radius: 15 });
      text(level ? `第 ${String(state.levelId).padStart(2, '0')} 关` : onlineSession ? '无尽排位' : endlessName(), 195, 46, 18);
      button('暂停', 324, 22, 46, 46, () => show('pause'), { pause: true, radius: 15 });
      round(25, 94, 163, 58, 12, gradient(94, 58, '#FFF8E6', '#EBD8B6'), '#FFF4D8');
      round(201, 94, 164, 58, 12, gradient(94, 58, '#FFF8E6', '#EBD8B6'), '#FFF4D8');
      text(level ? '清线' : '当前积分', 106, 107, 11, ink);
      text(level ? `${state.stats.lines} / ${level.goal.lines}` : state.score.toLocaleString(), 106, 134, 26, ink, 'center', 900);
      text(state.variant === 'refill' ? '已放积木' : level ? '当前组数' : '已完成组数', 283, 107, 11, ink);
      text(level ? `${state.group} / ${level.maxGroups + (state.continued ? 2 : 0)}` : state.variant === 'refill' ? state.stats.placements : state.completedGroups,
        283, 134, 25, ink, 'center', 900);
      if (level?.goal.cross) text(`交叉消除 ${Math.min(state.stats.crossClears, level.goal.cross)} / ${level.goal.cross}`, 195, 174, 12, ink);
      else if (level?.goal.multi) text(`多线同消 ${Math.min(state.stats.multiClears, level.goal.multi)} / ${level.goal.multi}`, 195, 174, 12, ink);
      else if (level?.discardBudget !== undefined) text(`弃格 ${state.stats.discardedCells} / ${level.discardBudget}`, 195, 174, 12, ink);
      round(b.x, b.y + 5, b.size, b.size, 17, '#B6A384');
      round(b.x, b.y, b.size, b.size, 17, gradient(b.y, b.size, '#FCEAC9', '#CBB087'), '#FFF9E7');
      round(b.innerX - 2, b.innerY - 2, b.pitch * 8 + 4, b.pitch * 8 + 4, 6,
        progress.settings.highContrast ? '#FAF7F1' : '#F3EEE5', '#AA916F');
      ctx.beginPath();
      for (let i = 1; i < 8; i++) {
        const gx = b.innerX - 1 + i * b.pitch, gy = b.innerY - 1 + i * b.pitch;
        ctx.moveTo(gx, b.innerY - 1); ctx.lineTo(gx, b.innerY - 1 + b.pitch * 8);
        ctx.moveTo(b.innerX - 1, gy); ctx.lineTo(b.innerX - 1 + b.pitch * 8, gy);
      }
      ctx.strokeStyle = progress.settings.highContrast ? '#BCB5A7' : '#D6CEC0';
      ctx.lineWidth = progress.settings.highContrast ? 1.2 : .8; ctx.stroke();
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const index = y * 8 + x, px = b.innerX + x * b.pitch, py = b.innerY + y * b.pitch;
        if (state.board[index]) {
          round(px, py + 3, b.pitch - 2, b.pitch - 2, 5, '#5547354D');
          block(px, py, b.pitch - 2, palette()[Math.abs(state.board[index] - 1) % palette().length], state.starBoard?.[index]);
        }
        if (!progress.settings.reducedFlash && flash && Date.now() < flash.until && (flash.rows.includes(y) || flash.cols.includes(x)))
          round(px, py, b.pitch - 5, b.pitch - 5, 6, '#FFFFFFB3');
      }
      if (drag) {
        const preview = previewPlacement(state, drag.slot, drag.cellX, drag.cellY);
        const shape = SHAPE_BY_ID[state.candidates[drag.slot].shapeId];
        for (const [x, y] of shape.cells) {
          const col = drag.cellX + x, row = drag.cellY + y;
          if (col >= 0 && col < 8 && row >= 0 && row < 8)
            round(b.innerX + col * b.pitch, b.innerY + row * b.pitch, b.pitch - 5, b.pitch - 5, 5,
              preview.valid ? '#A8D9B8AA' : '#EBC0A9CC', preview.valid ? '#2F8A72' : '#B64324');
        }
        if (preview.valid) {
          preview.rows.forEach(row => round(b.innerX, b.innerY + row * b.pitch, b.pitch * 8 - 5, b.pitch - 5, 5, null, '#2F8A72'));
          preview.cols.forEach(col => round(b.innerX + col * b.pitch, b.innerY, b.pitch - 5, b.pitch * 8 - 5, 5, null, '#2F8A72'));
        }
      }
      text(state.variant === 'refill' ? '放一块，原位补一块' : state.placedInGroup ? '再放一块，剩下的自动丢弃' : '放下两块，剩下的自动丢弃', 195, b.y + b.size + 29, 13, muted);
      state.candidates.forEach((candidate, slot) => {
        const x = 22 + slot * 121, y = b.slotY, w = 104, height = b.slotHeight;
        const used = state.used.includes(slot), selectable = !used && hasPlacement(state, slot);
        round(x, y + 4, w, height, 19, '#B7A989');
        round(x, y, w, height, 19, used ? '#DED9C3' : gradient(y, height, '#FFF7E1', '#E6D6B3'), selectedSlot === slot ? '#183C34' : '#FFF7E2');
        round(x + 4, y + 4, w - 8, height - 8, 15, null, '#FFF7E2');
        slots.push({ slot, x, y, w, h: height, used });
        if (used) { text('已放下', x + w / 2, y + height / 2, 13, muted); return; }
        const shape = SHAPE_BY_ID[candidate.shapeId];
        const pitch = Math.min(33, 88 / shape.width, (height - 24) / shape.height);
        piece(candidate, x + (w - shape.width * pitch + 3) / 2,
          y + (height - shape.height * pitch + 3) / 2 - 5, pitch, drag?.slot === slot ? .25 : 1);
        if (!selectable) text('暂时放不下', x + w / 2, y + height - 12, 10, muted, 'center', 400);
      });
      if (drag) piece(state.candidates[drag.slot], drag.x - b.pitch / 2, drag.y - 54 - b.pitch / 2, b.pitch, .85);
      if (state.mode === 'level') button(`撤销 · ${state.undoRemaining}`, 22, h - 77, 142, 48, undoMove,
        { disabled: !state.canUndo || !state.undoRemaining || Date.now() < inputLockedUntil, size: 14, radius: 13 });
      else if (onlineError) button('重新连接', 22, h - 77, 162, 48, () => { void reconnectOnline(); }, { size: 14, radius: 13 });
      else text(onlineSession ? pendingActions.length ? '待确认 · 成绩尚未结算' : '服务端确认计分' : '离线练习 · 不参与排位', 22, h - 53, 11, muted, 'left', 400);
      button('提示', 274, h - 77, 94, 48, showHelp, { size: 14, radius: 13 });
      if ((onlineBusy || onlineError) && (state.waitingNextGroup || pendingFinish)) {
        round(34, b.y + b.size / 2 - 45, 322, 105, 18, '#F7F2E8F2', '#AABDA8');
        text(onlineBusy ? '正在确认落子…' : '本组已完成，等待连接下一组', 195, b.y + b.size / 2 - 18, 16);
        if (onlineError) button('重新连接', 113, b.y + b.size / 2 + 4, 164, 46, () => { void reconnectOnline(); }, { primary: true, size: 14 });
      }
    }
    function drawPause(h) {
      title('暂停', 'game');
      const panelY = 256 - Math.max(0, 844 - h) * .25;
      text('慢慢想，不着急。', 195, 164 - Math.max(0, 844 - h) * .15, 28, ink, 'center', 800);
      text('当前棋盘已保存', 195, 203 - Math.max(0, 844 - h) * .15, 14, muted, 'center', 400);
      round(30, panelY, 330, 202 - Math.max(0, 844 - h) * .24, 23, soft);
      toggle('音效', 'sound', panelY + 18); toggle('高对比色', 'highContrast', panelY + 82);
      if (h >= 800) button('更多设置', 52, panelY + 151, 286, 46, () => { previousSettingsPage = 'pause'; show('settings'); }, { outline: true, size: 14 });
      button('继续游戏', 30, h - 289, 330, 58, () => show(state.status === 'playing' ? 'game' : 'result'), { primary: true, size: 19 });
      if (onlineSession) button('结束本局', 30, h - 216, 330, 58, () => { void endOnline(); }, { disabled: pendingFinish, size: 19 });
      else button('重新开始', 30, h - 216, 330, 58, () => state.mode === 'level' ? startLevel(state.levelId) : startPractice(state.variant), { size: 19 });
      if (!onlineSession && state.mode === 'level')
        button('退出关卡', 30, h - 143, 330, 48, exitLocalGame,
          { size: 16, subtitle: '清除本局，保留闯关进度' });
      else if (!onlineSession) {
        button('结束练习', 30, h - 143, 159, 48, () => { state = finishEndless(state); complete(); }, { size: 15 });
        button('退出练习', 201, h - 143, 159, 48, exitLocalGame, { size: 15 });
      }
      if (onlineError) button('重新连接', 105, h - 143, 180, 48, () => { void reconnectOnline(); }, { size: 15 });
      button('返回首页', 105, h - 82, 180, 48, () => show('home'), { size: 15 });
    }
    function toggle(label, key, y) {
      text(label, 53, y + 20, 16, ink, 'left');
      const enabled = key === 'reducedFlash' ? !progress.settings[key] : progress.settings[key];
      if (key === 'reducedFlash') text('开启时，消除会出现亮光', 53, y + 43, 10, muted, 'left', 400);
      button(enabled ? '开' : '关', 270, y, 68, 46,
        () => { progress.settings[key] = !progress.settings[key]; feedback.settingsChanged(); persist(); render(); },
        { primary: enabled, outline: !enabled, radius: 23, size: 15 });
    }
    function drawSettings(h) {
      title('设置', previousSettingsPage);
      round(30, 139, 330, 377, 23, soft);
      toggle('音效', 'sound', 156); toggle('音乐', 'music', 225); toggle('振动', 'vibration', 294);
      toggle('高对比色', 'highContrast', 363); toggle('消除闪光', 'reducedFlash', 432);
      button('玩法说明', 30, 544, 330, 51, showHelp, { size: 17 });
      if (h > 780) paragraph(`设置自动保存。${onlineConfigured ? '在线排位使用平台真实登录与服务端确认计分。' : '原生排位尚未配置，练习纪录只保存在本机。'}`, 43, 636, 305, 13, muted, 3);
      button(previousSettingsPage === 'pause' ? '返回暂停' : '返回首页', 30, h - 95, 330, 54,
        () => show(previousSettingsPage), { primary: true });
    }
    function drawHelp(h) {
      title('玩法提示', previousHelpPage);
      text('放好每一块，留点空间。', 195, 138, 24, ink, 'center', 800);
      round(30, 188, 330, 354, 23, soft);
      paragraph('拖动积木，看落点预览，松手放下。填满一行或一列即可消除。\n\n三选二：放两块，弃一块。\n立即补位：放一块，补一块，另两块保留。\n\n关卡有3次撤销；无尽不可撤销。', 51, 222, 288, 15, ink, 10);
      if (previousHelpPage === 'game' && state?.mode === 'level')
        paragraph(state.config?.hint ?? getLevel(state.levelId).hint ?? '先留出空间，再决定要舍弃哪一块。', 43, 582, 303, 14, muted, 3);
      button(previousHelpPage === 'game' ? '回去试试' : previousHelpPage === 'settings' ? '返回设置' : '返回首页',
        30, h - 117, 330, 58, () => show(previousHelpPage === 'game' && state?.status !== 'playing' ? 'result' : previousHelpPage), { primary: true });
    }
    function drawEndless(h) {
      title('无尽挑战');
      const compact = h < 800, y = 100, firstHeight = compact ? 252 : 300;
      round(25, y + 5, 340, firstHeight, 25, '#809A6C'); round(25, y, 340, firstHeight, 25, '#C8DFB9', '#F6FFE2');
      text('三选二', 195, y + 36, 29, ink, 'center', 900);
      text('放下两块，舍弃一块', 195, y + 69, 14);
      const pitch = compact ? 22 : 27, artY = y + 88;
      piece({shapeId:'l3-nw',color:1}, 88, artY, pitch); piece({shapeId:'square2',color:2}, 171, artY, pitch);
      piece({shapeId:'v2',color:3}, 266, artY, pitch, .4);
      text('本地最高 '+progress.practiceBest.toLocaleString(), 195, y + firstHeight - 115, 11, muted);
      button('开始练习', 48, y + firstHeight - 96, 294, 49, () => startPractice(), { primary:true, size:18 });
      if (onlineConfigured) button(onlineBusy ? '正在连接…' : onlineRecovery ? '恢复在线对局' : '在线挑战',
        105, y + firstHeight - 42, 180, 38, () => { void startOnline(); }, { disabled: onlineBusy, size:13 });
      else text('本地练习 · 随时开始', 195, y + firstHeight - 19, 11, muted);
      const secondY = y + firstHeight + 23, secondHeight = compact ? 226 : 263;
      round(25, secondY + 5, 340, secondHeight, 25, '#BFA675'); round(25, secondY, 340, secondHeight, 25, '#F7E6B9', '#FFF9E5');
      text('立即补位', 195, secondY + 34, 29, ink, 'center', 900); text('放一块，补一块', 195, secondY + 67, 14);
      piece({shapeId:'l3-nw',color:1}, 102, secondY + 87, pitch); piece({shapeId:'square2',color:3}, 235, secondY + 87, pitch);
      text('→', 195, secondY + 110, 30, '#638B5D');
      text('本地最高 '+progress.refillBest.toLocaleString(), 195, secondY + secondHeight - 79, 11, muted);
      button('开始挑战', 48, secondY + secondHeight - 60, 294, 49, () => startPractice('refill'), {primary:true, size:18});
      if (onlineError) paragraph(onlineError, 40, h - 46, 310, 12, '#A84B31', 2);
    }
    function drawRanking(h) {
      title('排行榜');
      if (onlineConfigured) {
        text('全站最高单局', 195, 117, 27, ink, 'center', 800);
        text('同分并列 · 只展示真实校验成绩', 195, 155, 12, muted);
        if (rankingBusy) text('正在连接排行榜…', 195, 265, 19);
        else if (rankingError) {
          paragraph(rankingError, 43, 235, 305, 15, muted, 4);
          button('重试连接', 70, 366, 250, 51, () => { void loadRanking(); }, { primary: true });
        } else if (!ranking?.top?.length) {
          text('第一份好成绩，等你留下。', 195, 272, 23);
          text('当前规则还没有已校验的上榜成绩', 195, 321, 13, muted);
          button('开始在线排位', 30, 394, 330, 58, () => show('endless'), { primary: true });
        } else {
          const perPage = Math.max(3, Math.floor((h - 389) / 57));
          const entries = rankingScope === 'around' ? ranking.around ?? [] : ranking.top;
          button('前100名', 25, 176, 159, 44, () => { rankingScope = 'top'; rankingPage = 0; render(); }, { primary: rankingScope === 'top', size: 13 });
          button('附近名次', 206, 176, 159, 44, () => { rankingScope = 'around'; rankingPage = 0; render(); }, { primary: rankingScope === 'around', disabled: !ranking.me, size: 13 });
          entries.slice(rankingPage * perPage, (rankingPage + 1) * perPage).forEach((entry, index) => {
            const y = 234 + index * 57; round(25, y, 340, 50, 13, soft);
            text(entry.rank, 47, y + 25, 17);
            text(String(entry.name || '新玩家').slice(0, 12), 78, y + 17, 14, ink, 'left');
            text(entry.platform === 'wechat' ? '微信' : entry.platform === 'bilibili' ? 'B站' : entry.platform, 78, y + 37, 10, muted, 'left');
            text(Number(entry.score).toLocaleString(), 343, y + 25, 18, ink, 'right');
          });
          const pages = Math.ceil(entries.length / perPage);
          if (pages > 1) {
            button('上一页', 25, h - 177, 92, 44, () => { rankingPage--; render(); }, { disabled: rankingPage === 0, size: 13 });
            text(`${rankingPage + 1} / ${pages}`, 195, h - 155, 13, muted);
            button('下一页', 273, h - 177, 92, 44, () => { rankingPage++; render(); }, { disabled: rankingPage >= pages - 1, size: 13 });
          }
        }
        if (!rankingBusy && !rankingError) text(ranking?.me ? `我的名次 ${ranking.me.rank} · 最高 ${ranking.me.score} 分`
          : ranking?.reason || '完成一局在线排位后上榜', 195, h - 116, 12, muted);
        if (ranking?.updatedAt) text(`更新 ${new Date(ranking.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, 195, h - 96, 10, muted, 'center', 400);
        button('返回首页', 105, h - 75, 180, 48, () => show('home'), { size: 15 });
        return;
      }
      text('原生排位未配置', 195, 186, 27, ink, 'center', 800);
      paragraph('正式排位需要平台真实登录和服务端会话。当前可完整游玩关卡与离线无尽练习。', 43, 251, 303, 16, muted, 4);
      round(30, 382, 330, 110, 20, soft);
      text('个人练习纪录', 195, 415, 13, muted);
      text(progress.practiceBest.toLocaleString(), 195, 458, 32, ink, 'center', 800);
      text('离线练习成绩不入榜', 195, 534, 13, muted);
      button('开始无尽练习', 30, h - 178, 330, 58, startPractice, { primary: true });
      button('返回首页', 30, h - 103, 330, 50, () => show('home'));
    }
    function shareResult() {
      if (!nativeSdk?.shareAppMessage) { say('当前平台暂不支持成绩分享'); return; }
      const settlement = onlineSession?.settlement;
      const rankingText = settlement?.status === 'verified' && Number.isInteger(settlement.rank)
        ? ` · 全站第${settlement.rank}名` : onlineSession ? ' · 在线成绩' : ' · 离线练习';
      try {
        nativeSdk.shareAppMessage({ title: `三块选两块：${state.score}分 · 单步最多${state.stats.maxLines}线${rankingText}`,
          query: 'game=three-choose-two', fail() { if (!disposed) say('分享暂不可用'); } });
      } catch { say('分享暂不可用'); }
    }
    function drawResult(h) {
      const won = state.status === 'won', level = state.mode === 'level';
      const levelConfig = level ? state.config ?? getLevel(state.levelId) : null;
      text(level ? won ? '关卡完成' : '再试一次' : onlineSession ? '排位结束' : endlessName()+'结束', 195, 73, 14, muted);
      const metricsY = level ? h - (won ? 375 : 435) : Math.min(426, h - 390);
      const headingY = metricsY - 78, centerY = Math.max(143, metricsY - 221);
      const radius = Math.min(106, centerY - 98, Math.max(24, headingY - centerY - 20)), trophyScale = radius / 106;
      round(195 - radius, centerY - radius, radius * 2, radius * 2, radius, '#E8EBDC');
      if (won) {
        const count = getStars(state);
        star(195, centerY - 8 * trophyScale, 42 * trophyScale, count >= 1 ? '#E8BE55' : '#C5CBBB');
        star(195 - 76 * trophyScale, centerY + 43 * trophyScale, 23 * trophyScale, count >= 2 ? '#E8BE55' : '#C5CBBB');
        star(195 + 76 * trophyScale, centerY + 43 * trophyScale, 23 * trophyScale, count >= 3 ? '#E8BE55' : '#C5CBBB');
      } else text(level ? '↶' : state.score.toLocaleString(), 195, centerY, Math.min(level ? 77 : 43, radius * .75), ink, 'center', 800);
      text(won ? '好选择，漂亮！' : level ? '留点空间，再来。' : '每一步都有收获', 195, headingY, 27, ink, 'center', 800);
      const reasons = { 'no-placement': '剩余积木都没有合法位置', 'groups-exhausted': '组数用完，目标还差一点', 'discard-budget': '弃格已超过本关预算', ended: '本局练习已主动结束' };
      const settlement = onlineSession?.settlement;
      const rankingStatus = onlineSession ? pendingActions.length || pendingFinish ? '等待联网确认 · 成绩尚未结算' : onlineError ? '网络中断，成绩尚未确认' : onlineBusy ? '成绩校验中…'
        : settlement?.status === 'verified' ? `成绩已校验${settlement.rank ? ` · 全站第${settlement.rank}名` : ''}`
        : settlement?.status === 'pending-review' ? '成绩待复核，暂未计入榜单' : '本局成绩未进入公开榜'
        : '离线练习成绩不参与排位';
      text(level ? won ? `第 ${String(state.levelId).padStart(2, '0')} 关 · ${levelConfig.title ?? getLevel(state.levelId).title}${state.continued ? ' · 续局完成' : ''}` : reasons[state.reason] ?? '再换一种取舍试试' : rankingStatus,
        195, metricsY - 38, 14, muted);
      round(30, metricsY, 330, level ? 98 : 154, 20, soft);
      text(level ? '使用组数' : '总清线数', 110, metricsY + 24, 12, muted);
      text(level ? `${Math.ceil(state.stats.placements / 2)} / ${(levelConfig.maxGroups ?? getLevel(state.levelId).maxGroups) + (state.continued ? 2 : 0)}` : state.stats.lines, 110, metricsY + 57, 24);
      text(level ? '消除线数' : '最高单步消线', 280, metricsY + 24, 12, muted);
      text(level ? state.stats.lines : state.stats.maxLines, 280, metricsY + 57, 24);
      if (!level) {
        text('最大连续消除', 110, metricsY + 96, 12, muted); text(state.stats.maxCombo, 110, metricsY + 128, 24);
        text(state.variant === 'refill' ? '已放积木' : '已完成组数', 280, metricsY + 96, 12, muted); text(state.variant === 'refill' ? state.stats.placements : state.completedGroups, 280, metricsY + 128, 24);
        const unsettled = Boolean(onlineSession && (onlineBusy || pendingActions.length || pendingFinish));
        button(unsettled ? '等待成绩确认' : '再玩一次', 30, h - 226, 330, 50,
          () => onlineSession ? newOnline() : startPractice(state.variant), { primary: true, disabled: unsettled, size: 18 });
        button(onlineError ? '重新连接并校验' : state.variant === 'refill' ? '切换玩法' : '查看排行榜', 30, h - 164, 330, 48,
          () => { if (onlineError) void reconnectOnline(); else if (state.variant === 'refill') show('endless'); else void loadRanking(); }, { size: 16 });
        button('分享成绩', 30, h - 102, 159, 48, shareResult, { disabled: unsettled, size: 14 });
        button('返回首页', 201, h - 102, 159, 48, () => show('home'), { size: 14 });
        return;
      }
      if (level && !won && state.canUndo && state.undoRemaining)
        button(`撤销上一步 · ${state.undoRemaining}`, 30, h - 319, 330, 50, undoMove, { primary: true, size: 16 });
      if (level && !won && state.reason === 'groups-exhausted' && !state.continued &&
        content.payload?.advertisingConfigured === true &&
        host.session.capabilities.includes('advertising') && host.session.adAuthority !== 'none')
        button(adBusy ? '广告加载中' : '观看广告 · 增加2组', 30, h - 254, 330, 50, rewardContinue,
          { primary: true, disabled: adBusy, size: 16 });
      if (won && state.levelId < LEVELS.length)
        button('下一关', 30, h - 221, 330, 58, () => startLevel(state.levelId + 1), { primary: true, size: 19 });
      else if (won) button('返回选关', 30, h - 221, 330, 58, () => show('levels'), { primary: true, size: 19 });
      if (onlineSession) button(onlineError ? '重新连接并校验' : '查看排行榜', 30, h - 221, 330, 58,
        () => { if (onlineError) void reconnectOnline(); else void loadRanking(); }, { size: 17 });
      const unsettled = Boolean(onlineSession && (onlineBusy || pendingActions.length || pendingFinish));
      button(unsettled ? '等待成绩确认' : '再玩一次', 30, h - 147, 330, 58, () => level ? startLevel(state.levelId) : onlineSession ? newOnline() : startPractice(state.variant), { primary: !won, disabled: unsettled, size: 19 });
      button('返回首页', 105, h - 78, 180, 46, () => show('home'), { size: 14 });
    }
    function render() {
      if (disposed) return;
      feedback.setActive(page === 'game' && !suspended);
      const v = view(); buttons = []; slots = [];
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = paper;
      ctx.fillRect(0, 0, target.canvas.width, target.canvas.height);
      ctx.setTransform(v.scale, 0, 0, v.scale, v.left, v.top);
      if (art.garden) ctx.drawImage(art.garden, 0, 0, 390, v.height);
      else { ctx.fillStyle = '#C4E2DC'; ctx.fillRect(0, 0, 390, v.height); }
      ctx.fillStyle = ['home','endless','levels','game'].includes(page) ? '#FFF8E808' : '#FFF8E8B8';
      ctx.fillRect(0, 0, 390, v.height);
      ({ home: drawHome, levels: drawLevels, game: drawGame, pause: drawPause, result: drawResult,
        settings: drawSettings, ranking: drawRanking, endless: drawEndless, help: drawHelp })[page](v.height);
      if (notice && Date.now() < noticeUntil) {
        const y = page === 'game' ? layout().y + layout().size + 5 : v.height - 23;
        round(25, y - 12, 340, 27, 13, '#F7F2E8F0'); text(notice, 195, y + 1, 11, '#557060');
      }
      ctx.restore();
    }
    const contains = (item, x, y) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h;
    function updateDrag(x, y) {
      const b = layout(); drag.x = x; drag.y = y;
      drag.cellX = Math.floor((x - b.innerX) / b.pitch);
      drag.cellY = Math.floor((y - 54 - b.innerY) / b.pitch);
    }
    function pointer(event) {
      if (disposed || suspended || adBusy) return;
      const v = view(), x = (event.x - v.left) / v.scale, y = (event.y - v.top) / v.scale;
      if (event.phase === 'down') {
        if (drag || held) return;
        const item = [...buttons].reverse().find(candidate => contains(candidate, x, y));
        if (item) { if (!item.disabled) held = { item, pointerId: event.pointerId }; return; }
        if (page === 'game' && state?.status === 'playing' && (!onlineSession || !pendingFinish) && !state.waitingNextGroup && Date.now() >= inputLockedUntil) {
          const slot = slots.find(candidate => !candidate.used && contains(candidate, x, y));
          if (slot) {
            drag = { slot: slot.slot, pointerId: event.pointerId, x, y, startX: x, startY: y, moved: false };
            updateDrag(x, y); selectedSlot = slot.slot; sound('tap'); render();
          }
        }
      } else if (event.phase === 'move') {
        if (drag?.pointerId !== event.pointerId) return;
        if (Math.hypot(x - drag.startX, y - drag.startY) > 5) drag.moved = true;
        updateDrag(x, y); render();
      } else {
        if (held?.pointerId === event.pointerId) {
          const active = held; held = null;
          if (event.phase === 'up' && contains(active.item, x, y)) { sound('tap'); active.item.action(); }
        }
        if (drag?.pointerId === event.pointerId) {
          updateDrag(x, y); const active = drag; drag = null;
          if (event.phase === 'up' && active.moved) placePiece(active.slot, active.cellX, active.cellY);
          else if (event.phase === 'cancel') selectedSlot = null;
          render();
        }
      }
    }
    const stopInput = target.onPointer ? target.onPointer(pointer) : target.onTap((screenX, screenY) => {
      if (disposed || suspended || adBusy) return;
      const v = view(), x = (screenX - v.left) / v.scale, y = (screenY - v.top) / v.scale;
      const buttonHit = [...buttons].reverse().find(item => !item.disabled && contains(item, x, y));
      if (buttonHit) { sound('tap'); buttonHit.action(); return; }
      if (page !== 'game' || state?.status !== 'playing' || (onlineSession && pendingFinish) || state.waitingNextGroup || Date.now() < inputLockedUntil) return;
      const candidate = slots.find(item => !item.used && contains(item, x, y));
      if (candidate) { selectedSlot = candidate.slot; render(); return; }
      if (selectedSlot !== null) {
        const b = layout(); placePiece(selectedSlot, Math.floor((x - b.innerX) / b.pitch), Math.floor((y - b.innerY) / b.pitch));
      }
    });
    if (pendingReward?.completed && pendingReward.runId === nativeRunId && state) {
      const next = continueLevel(state, pendingReward.id);
      if (next !== state) state = next;
      pendingReward = null; persist();
    }
    const timer = setInterval(() => {
      if (disposed || suspended) return;
      const size = `${target.canvas.width}:${target.canvas.height}`;
      if (size !== lastSize || flash || (inputLockedUntil && Date.now() >= inputLockedUntil) || (notice && Date.now() >= noticeUntil)) {
        if (size !== lastSize) clearInput();
        lastSize = size;
        if (flash && Date.now() >= flash.until) flash = null;
        if (inputLockedUntil && Date.now() >= inputLockedUntil) inputLockedUntil = 0;
        if (notice && Date.now() >= noticeUntil) notice = '';
        render();
      }
    }, 30);
    render();
    for (const name of ['garden', 'hero', 'logo']) {
      target.loadImage?.('assets/art/'+name+'.png').then(image => { if (!disposed) { art[name] = image; render(); } }).catch(() => {});
    }
    return {
      pause() {
        if (disposed) return;
        suspended = true; clearInput(); stopSounds();
        if (page === 'game' || page === 'help' && previousHelpPage === 'game' && state) page = 'pause';
        persist(); render();
      },
      resume() { if (!disposed) { suspended = false; clearInput(); render(); } },
      async dispose() {
        if (disposed) return;
        disposed = true;
        clearInput(); stopSounds(); clearInterval(timer); stopInput();
        await persist();
        feedback.dispose();
        ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
      },
    };
  },
};
