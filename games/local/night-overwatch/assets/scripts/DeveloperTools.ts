import type {} from '../../scripts/dev-mode.js';
import type { Overwatch } from './Overwatch';
import { MISSIONS, type MissionId } from './core/MissionCatalog.ts';
import { GIFT_DURATION } from './Quartermaster.ts';

/** Package mode and server capability are independent; all asset writes use the normal journal. */
export function installDeveloperTools(game: Overwatch) {
  const scope = globalThis as unknown as Window;
  const dev = scope.SmallGamesDev;
  const enabled = () => scope.__SMALL_GAMES_BUILD__?.type === 'development' && dev?.isEnabled();
  if (!enabled()) return () => {};
  const ready = () => {
    if (!enabled()) throw Error('当前包未启用开发调试');
    if (game.sim.phase === 'playing' || game.online?.room || game.online?.active || game.online?.busy || game.quartermaster?.busy || game.quartermaster?.viewing)
      throw Error('请先正常结束当前行动、离开联机房间并等待操作完成');
    const q = game.quartermaster;
    if (!q) throw Error('军需服务尚未就绪');
    return q;
  };
  const adjust = async (field: 'coinsDelta' | 'xpDelta', value?: number) => {
    const q = ready();
    if (!Number.isSafeInteger(value) || Math.abs(value!) > 1e9) throw Error('请输入 ±1000000000 范围内的整数');
    if (!q.assets?.devToolsEnabled) throw Error('服务器未启用开发调试，请连接已启用开发能力的测试服');
    if (!await q.execute({ kind: 'dev-adjust', [field]: value })) throw Error(q.message[0] || '操作未完成');
  };
  const select = (id: MissionId, index: number) => {
    const q = ready();
    q.page = '';
    game.online?.show('');
    game.selectMission(id);
    game.hud.missionsOpen = id !== 'training-60';
    game.hud.missionPage = Math.floor(index / 3);
    game.hud.modalKey = 'rebuild';
  };
  // Previews below only change this page's presentation state; they never write assets or call the service.
  const drops = [[{ coins: 40 }], [{ coins: 80 }, { xp: 40 }, { item: 'power-match' }], [{ coins: 120 }, { xp: 60 }, { item: 'fragment:weapon' }, { item: 'drone-match' }], [{ coins: 300 }, { xp: 120 }, { item: 'fragment:weapon' }, { item: 'fragment:skill' }, { item: 'laser-24h' }]];
  const pages = ['modes', 'loadout', 'shop', 'supply', 'growth', 'tasks', 'inbox', 'warehouse', 'craft', 'receipts', 'checkin'] as const;
  const whole = (value: number | undefined, min: number, max: number) => {
    if (!Number.isInteger(value) || value! < min || value! > max) throw Error(`请输入 ${min}–${max} 的整数`);
    return value!;
  };
  const playing = () => {
    if (!enabled()) throw Error('当前包未启用开发调试');
    if (game.sim.phase !== 'playing' || game.online?.room || game.online?.active) throw Error('仅可在单人行动进行中使用');
  };
  // `dismiss` closes the modal panel at once: a timed preview would otherwise finish hidden behind it.
  const stopActions = dev.registerActions([
    { id: 'night-preview-crate', dismiss: true, label: '预览开箱动画（不改资产）', input: { label: '最高稀有度（0普通–3史诗）', min: 0, max: 3, step: 1, value: 3 }, run(value) {
      const q = ready(), tier = whole(value, 0, 3);
      q.gift = { packs: {}, drops: drops[tier], opened: true, started: Date.now(), duration: GIFT_DURATION, preview: true }; q.revision++;
    } },
    { id: 'night-preview-pending-crate', dismiss: true, label: '预览待开补给箱弹窗（不改资产）', run() {
      const q = ready(); q.gift = { packs: { 'pack:general:0': 2 }, drops: [], granted: [{ coins: 200 }, { xp: 80 }], opened: false, preview: true }; q.revision++;
    } },
    { id: 'night-preview-wheel', dismiss: true, label: '预览转盘旋转（不消耗次数）', run() {
      const q = ready(); if (q.page !== 'supply') q.show('supply'); q.wheelPreviewAt = q.wheelPressAt = Date.now(); q.revision++;
    } },
    { id: 'night-preview-news', dismiss: true, label: '插入演示公告（刷新资产后消失）', run() {
      const q = ready(); if (!q.assets) throw Error('请先连接军需服务');
      q.assets.announcements = [{ id: 'dev-preview-' + Date.now(), title: '演示公告', body: '这是一条仅本机可见的演示公告，用于检查首页走马灯与公告页排版。刷新服务端资产后自动消失。', createdAt: Date.now() }, ...q.assets.announcements];
      q.show(''); game.hud.modalKey = 'rebuild';
    } },
    { id: 'night-preview-update', dismiss: true, label: '模拟版本提示（下次检查版本后恢复）', input: { label: '0无更新 / 1建议更新 / 2必须更新', min: 0, max: 2, step: 1, value: 1 }, run(value) {
      ready(); const level = whole(value, 0, 2), online = game.online; if (!online) throw Error('联机服务尚未就绪');
      const current = online.release?.currentBuildId ?? null;
      online.release = { ...(online.release || { currentVersion: null, backendVersion: null }), currentBuildId: current, latestBuildId: level ? 'dev-preview-build' : current, update: (['none', 'optional', 'required'] as const)[level], canStartNewGames: level < 2, admissions: { ranked: level < 2, multiplayer: level < 2 }, action: 'reopen' } as NonNullable<typeof online.release>;
      online.revision++; game.hud.modalKey = 'rebuild';
    } },
    { id: 'night-page', dismiss: true, label: '跳转成长页面', input: { label: '1行动 2配置 3商店 4补给 5成长 6任务 7信箱 8仓库 9合成 10开箱记录 11签到', min: 1, max: pages.length, step: 1, value: 4 }, run(value) {
      const q = ready(); game.online?.show(''); game.hud.missionsOpen = false; q.show(pages[whole(value, 1, pages.length) - 1]);
    } },
    { id: 'night-win', dismiss: true, label: '立即通关当前行动（试玩结算）', run() { playing(); game.sim.completionTime ??= game.sim.time; game.sim.phase = 'success'; } },
    { id: 'night-fail', dismiss: true, label: '立即失败当前行动（试玩结算）', run() { playing(); game.sim.rescue.hp = 0; } },
    { id: 'night-coins', label: '调整测试金币', input: { label: '金币增减（负数扣减）', min: -1e9, max: 1e9, step: 1, value: 1000 }, run: value => adjust('coinsDelta', value) },
    { id: 'night-xp', label: '调整测试经验', input: { label: '经验增减（负数扣减）', min: -1e9, max: 1e9, step: 1, value: 200 }, run: value => adjust('xpDelta', value) },
    { id: 'night-mission', dismiss: true, label: '选择试玩关卡', input: { label: `关卡序号（1–${MISSIONS.length}）`, min: 1, max: MISSIONS.length, step: 1, value: 1 }, run(value) {
      if (!Number.isInteger(value) || value! < 1 || value! > MISSIONS.length) throw Error('关卡序号超出范围');
      select(MISSIONS[value! - 1].id, value! - 1);
    } },
    { id: 'night-training', dismiss: true, label: '选择火控热身', run: () => select('training-60', 0) },
    { id: 'night-assets-refresh', label: '刷新服务端资产', async run() {
      const q = ready(); await q.refresh(); if (q.message[0]) throw Error(q.message[0]);
    } },
    { id: 'night-assets-retry', label: '重试待确认操作', async run() {
      const q = ready();
      if (!q.pending) throw Error('没有待确认的操作');
      if (!await q.execute()) throw Error(q.message[0] || '操作未完成');
    } },
  ]);
  const stopSnapshot = dev.registerSnapshot(() => game.snapshot());
  return () => { stopActions(); stopSnapshot(); };
}
