// All game-specific debug permissions are granted by the shared developer mode.
// Mutating operations receive an isolated trial, never the live save or session.
import { hasPlacement } from './engine.mjs';

export const DEV_PERMISSIONS = Object.freeze({
  inspect: '读取游戏快照',
  levels: '试玩任意关卡',
  solution: '读取参考解法',
  undo: '补充试玩撤销',
  restart: '重置当前试玩',
  board: '清空试玩棋盘',
  parameters: '调整试玩参数',
  extensions: '注册扩展调试动作',
});
const copy = value => structuredClone(value);
const integer = (value, label, min = 0, max = 999) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label}须为 ${min}—${max} 的整数`);
  return value;
};

export function withTrialParameters(state, values) {
  if (!state || state.mode !== 'level') throw new Error('请先选择试玩关卡');
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('参数须为对象');
  const allowed = ['undoRemaining', 'groupLimit', 'discardBudget', 'goalLines'];
  for (const key of Object.keys(values)) if (!allowed.includes(key)) throw new RangeError(`未知试玩参数：${key}`);
  const next = copy(state);
  if (values.undoRemaining !== undefined) next.undoRemaining = integer(values.undoRemaining, '撤销次数');
  if (values.goalLines !== undefined) next.config.goal.lines = integer(values.goalLines, '目标清线', 1);
  if (values.discardBudget !== undefined) next.config.discardBudget = integer(values.discardBudget, '舍弃预算');
  if (values.groupLimit !== undefined) {
    next.config.maxGroups = integer(values.groupLimit, '组数限制', next.group);
    // Extra groups repeat deterministic stock only inside this trial config.
    const required = next.config.maxGroups + (next.config.continuationGroups ?? 2);
    while (next.config.candidates.length < required) next.config.candidates.push(copy(next.config.candidates.at(-1)));
  }
  if (Object.keys(values).some(key => key !== 'undoRemaining')) { delete next._undo; next.canUndo = false; }
  const limit = next.config.maxGroups + (next.continued ? next.config.continuationGroups ?? 2 : 0);
  const extraStock = next.status === 'lost' && next.reason === 'groups-exhausted' && values.groupLimit !== undefined && next.completedGroups < limit;
  const restoredBudget = next.status === 'lost' && next.reason === 'discard-budget' && values.discardBudget !== undefined && next.stats.discardedCells <= next.config.discardBudget && next.completedGroups < limit;
  if (extraStock || restoredBudget) {
    next.status = 'playing'; next.reason = null; next.lastEvent = null;
    if (next.placedInGroup === 2) {
      next.group++; next.used=[]; next.placedInGroup=0;
      next.candidates=copy(next.config.candidates[next.group-1]);
    }
    if (!hasPlacement(next)) { next.status='lost'; next.reason='no-placement'; }
  }
  return next;
}

export function createDeveloperAPI({ isEnabled, getSnapshot, getState, isolate, update, beginLevel, restart, openLevels, openSolution, registerActions }) {
  function authorize(permission) {
    if (!isEnabled() || !Object.hasOwn(DEV_PERMISSIONS, permission)) throw new Error('此操作仅在开发模式可用');
  }
  function mutate(permission, operation) {
    authorize(permission);
    if (getState()?.mode !== 'level') throw new Error('请先选择试玩关卡，在线对局不能调试');
    // Validate on a copy before changing the live context or entering trial mode.
    const next = operation(copy(getState()));
    isolate();
    update(next);
    return api.snapshot();
  }
  const api = Object.freeze({
    get permissions() { authorize('inspect'); return { ...DEV_PERMISSIONS }; },
    snapshot() { authorize('inspect'); return copy(getSnapshot()); },
    level(id) { authorize('levels'); beginLevel(integer(id, '关卡', 1)); return api.snapshot(); },
    solution() { authorize('solution'); return copy(getState()?.mode === 'level' ? getState().config.solution || [] : []); },
    refillUndo(count = 9) { return mutate('undo', state => withTrialParameters(state, { undoRemaining: count })); },
    restart() { authorize('restart'); if (getState()?.mode !== 'level') throw new Error('请先选择试玩关卡'); isolate(); restart(); return api.snapshot(); },
    clearBoard() { return mutate('board', state => {
      state.board.fill(0); state.starBoard.fill(false); state.lastEvent = null;
      if (state.status === 'lost' && state.reason === 'no-placement') { state.status = 'playing'; state.reason = null; }
      // An old undo must not reintroduce a pre-debug board.
      delete state._undo; state.canUndo = false;
      return state;
    }); },
    setParameters(values) { return mutate('parameters', state => withTrialParameters(state, values)); },
    registerActions(actions) {
      authorize('extensions');
      if (!Array.isArray(actions)) throw new TypeError('扩展动作须为数组');
      const safe = actions.map(action => {
        if (!action || typeof action.id !== 'string' || !action.id || typeof action.label !== 'string' || typeof action.run !== 'function') throw new TypeError('扩展动作须提供 id、label 与 run');
        const permission = action.permission || 'extensions';
        authorize(permission);
        return { id: action.id, label: action.label, run: () => { authorize(permission); return action.run(api); } };
      });
      return registerActions(safe);
    },
  });
  api.registerActions([
    { id: 'three-choose-two-levels', label: '试玩任意关卡', permission: 'levels', run: openLevels },
    { id: 'three-choose-two-solution', label: '查看参考解法', permission: 'solution', run: openSolution },
    { id: 'three-choose-two-undo', label: '补充撤销 · 9 次', permission: 'undo', run: () => api.refillUndo() },
    { id: 'three-choose-two-restart', label: '重置当前试玩', permission: 'restart', run: () => api.restart() },
    { id: 'three-choose-two-board', label: '清空试玩棋盘', permission: 'board', run: () => api.clearBoard() },
  ]);
  return api;
}
