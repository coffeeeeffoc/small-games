import type {} from '../../scripts/dev-mode.js';
import type { Overwatch } from './Overwatch';
import { MISSIONS, type MissionId } from './core/MissionCatalog.ts';

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
  const stopActions = dev.registerActions([
    { id: 'night-coins', label: '调整测试金币', input: { label: '金币增减（负数扣减）', min: -1e9, max: 1e9, step: 1, value: 1000 }, run: value => adjust('coinsDelta', value) },
    { id: 'night-xp', label: '调整测试经验', input: { label: '经验增减（负数扣减）', min: -1e9, max: 1e9, step: 1, value: 200 }, run: value => adjust('xpDelta', value) },
    { id: 'night-mission', label: '选择试玩任务', input: { label: `任务序号（1–${MISSIONS.length}）`, min: 1, max: MISSIONS.length, step: 1, value: 1 }, run(value) {
      if (!Number.isInteger(value) || value! < 1 || value! > MISSIONS.length) throw Error('任务序号超出范围');
      select(MISSIONS[value! - 1].id, value! - 1);
    } },
    { id: 'night-training', label: '选择火控热身', run: () => select('training-60', 0) },
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
