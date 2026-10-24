import { createGameServices, createRunRecorder } from './game-services.js';
import { shareChallenge } from './publishing.js';
let services,
  recorder,
  controller,
  available = false,
  generation = 0,
  signature = '';
const controls = document.createElement('div');
controls.id = 'tower-accessibility';
controls.setAttribute('aria-label', '穿云落星操作');
const style = document.createElement('style');
style.textContent =
  '#tower-accessibility{position:fixed;inset:0;pointer-events:none;z-index:5}#tower-accessibility button{position:absolute;opacity:0;pointer-events:none}#tower-accessibility button:focus-visible{opacity:1;pointer-events:auto;background:#17344b;color:#fff5dc;border:2px solid #f4d493;border-radius:12px;font:16px sans-serif}';
document.head.append(style);
document.addEventListener('DOMContentLoaded', () => document.body.append(controls));
const messages = {
  local: '本地挑战',
  unavailable: '离线挑战',
  recording: '成绩验证中',
  finished: '成绩已同步',
  practice: '试玩 / 好友挑战',
};
globalThis.__towerHost = {
  get available() {
    return available;
  },
  connect(value) {
    controller = value;
    if (globalThis.__COMPETITION_CONFIG__?.enabled === false) return;
    services = createGameServices({ gameId: 'tower-brake', ruleVersion: value.version });
    recorder = createRunRecorder(services, { onStatus: value.status });
    services
      .metadata()
      .then(() => {
        available = true;
      })
      .catch(() => {
        available = false;
      });
  },
  start(options) {
    ++generation;
    return recorder?.start(options) ?? Promise.resolve(null);
  },
  record(input, ticks) {
    recorder?.record(input, ticks);
  },
  finish() {
    return recorder?.finish();
  },
  invalidate(reason) {
    ++generation;
    recorder?.invalidate(reason);
  },
  async leaderboard(boardId) {
    try {
      const data = await services.leaderboard({ boardId });
      return (
        (data.top || [])
          .slice(0, 8)
          .map(
            (row) =>
              `${row.rank}. ${String(row.name || '玩家').slice(0, 18)}  ${row.score}${boardId === 'campaign' ? '关' : '层'}`,
          )
          .join('\n\n') || '还没有成绩，来留下第一段旅程。'
      );
    } catch {
      available = false;
      return '航行榜暂未连接\n本地挑战可以继续。';
    }
  },
  async share(level, score) {
    const outcome = await shareChallenge({
      title: '穿云落星',
      text: `我在这段航线获得了${score}分，试试你的刹车时机！`,
      params: { challenge: 'tower-v1', level, targetScore: score },
    });
    return (
      { shared: '已打开系统分享', copied: '挑战链接已复制', cancelled: '已取消分享' }[
        outcome.status
      ] || '浏览器暂不支持分享'
    );
  },
  sync(snapshot) {
    document.body.dataset.screen = snapshot.screen;
    document.body.dataset.ready = String(snapshot.assetReady);
    const canvas = document.getElementById('GameCanvas');
    if (!canvas) return;
    canvas.setAttribute(
      'aria-label',
      `穿云落星，${snapshot.environment.name}，${messages[snapshot.rankStatus] || '本地挑战'}`,
    );
    const rect = canvas.getBoundingClientRect(),
      scale = Math.min(rect.width / snapshot.width, rect.height / snapshot.height);
    const x = rect.x + (rect.width - snapshot.width * scale) / 2,
      y = rect.y + (rect.height - snapshot.height * scale) / 2;
    const next = JSON.stringify([snapshot.screen, snapshot.controls, x, y, scale]);
    if (next === signature) return;
    signature = next;
    const old = new Map([...controls.children].map((node) => [node.dataset.control, node]));
    for (const c of snapshot.controls) {
      let button = old.get(c.id);
      old.delete(c.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.control = c.id;
        button.onclick = () => controller.action(c.id);
        controls.append(button);
      }
      button.textContent = c.label;
      button.disabled = c.disabled;
      Object.assign(button.style, {
        left: `${x + c.x * scale}px`,
        top: `${y + c.y * scale}px`,
        width: `${c.w * scale}px`,
        height: `${c.h * scale}px`,
      });
    }
    for (const button of old.values()) button.remove();
    document.getElementById('tower-loading')?.remove();
  },
};
