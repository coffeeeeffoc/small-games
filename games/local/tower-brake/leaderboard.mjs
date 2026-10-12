// Rendering adapter: transport, identity and bounded input upload belong to the shared client.
export function createLeaderboard({ gameId, moduleUrl, onStatus = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const labels = {
    local: '本地挑战',
    connecting: '连接排行榜…',
    recording: '成绩验证中',
    syncing: '正在同步成绩…',
    finished: '成绩已同步',
    unavailable: '离线挑战 · 不上传排行榜',
    practice: '试玩 / 好友挑战 · 不上传排行榜',
  };
  let recorder,
    services,
    request = 0,
    startGeneration = 0,
    current = 'endless';
  async function bounded(work, onTimeout = () => {}) {
    let timeout;
    try {
      return await Promise.race([
        work,
        new Promise((resolve) => {
          timeout = setTimeout(() => {
            onTimeout();
            resolve(null);
          }, 1500);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  const status = (value) => {
    onStatus(labels[value] || labels.local);
  };
  const ready = import(moduleUrl)
    .then(({ createGameServices, createRunRecorder }) => {
      services = createGameServices({ gameId });
      recorder = createRunRecorder(services, { onStatus: status });
    })
    .catch(() => status('unavailable'));
  async function show(board = current) {
    current = board;
    const token = ++request;
    document
      .querySelectorAll('[data-board]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.board === board)),
      );
    $('leaderboard-list').replaceChildren();
    $('leaderboard-status').textContent = '正在获取排行榜…';
    await bounded(ready);
    try {
      if (!services) throw new Error('offline');
      const [identity, data] = await Promise.all([
        services.identity(),
        services.leaderboard({ boardId: board }),
      ]);
      if (token !== request) return;
      $('leaderboard-identity').textContent =
        identity.kind === 'platform'
          ? `已登录 · ${identity.name || '玩家'}`
          : identity.kind === 'guest'
            ? '游客身份'
            : '未登录 · 开始挑战后使用游客身份';
      for (const row of data.top || []) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = `${row.rank}. ${row.name || '玩家'}`;
        const score = document.createElement('strong');
        score.textContent =
          board === 'campaign'
            ? `第 ${row.score} 关 · ${(Number(row.secondary || 0) / 1000).toFixed(1)} 秒`
            : `${row.score} ${gameId === 'cage-rescue' ? '人' : '层'}`;
        item.append(name, score);
        $('leaderboard-list').append(item);
      }
      $('leaderboard-status').textContent = data.top?.length
        ? '仅记录已验证的完整挑战'
        : '还没有成绩，来留下第一条纪录。';
      $('leaderboard-me').textContent = data.me
        ? `我的排名：${data.me.rank} · ${data.me.score}`
        : '完成挑战后查看自己的排名';
    } catch {
      if (token !== request) return;
      $('leaderboard-identity').textContent = '排行榜暂未连接';
      $('leaderboard-status').textContent = '暂时无法获取排行榜，稍后重试。本地挑战仍可继续。';
      $('leaderboard-me').textContent = '';
    }
  }
  return {
    show,
    async start(options) {
      const token = ++startGeneration;
      const work = (async () => {
        await ready;
        if (token !== startGeneration || !recorder) return null;
        const run = await recorder.start(options);
        return token === startGeneration ? run : null;
      })();
      return bounded(work, () => {
        if (token !== startGeneration) return;
        startGeneration++;
        recorder?.invalidate('startup timeout');
        status('unavailable');
      });
    },
    record(input, ticks = 1) {
      recorder?.record(input, ticks);
    },
    finish() {
      return recorder?.finish() ?? Promise.resolve(null);
    },
    invalidate(reason) {
      startGeneration++;
      recorder?.invalidate(reason);
    },
    close() {
      request++;
    },
  };
}
