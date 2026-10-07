import { esc, amount } from './dom.mjs';

const statLabels = {
  attackDamage: '墨弹伤害',
  meleeDamage: '近战伤害',
  lifeSteal: '命中吸取',
  maxInk: '墨汁上限',
  novaDamage: '范围伤害',
  novaRadius: '范围半径',
  novaCooldown: '技能冷却',
  speed: '移动速度',
  dashCooldown: '闪避冷却',
  pickupRadius: '拾取范围',
  dropReturnRatio: '散墨回收',
};
function statValue(key, value) {
  if (['lifeSteal', 'dropReturnRatio'].includes(key)) return `${amount(value * 100)}%`;
  return key.endsWith('Cooldown') ? `${amount(value)} 秒` : amount(value);
}
function rewardPreview(state, item, engine) {
  const before = engine.getPlayerStats(state);
  const after = engine.getPlayerStats({
    ...state,
    equipment: { ...state.equipment, [item.id]: item.nextRank },
  });
  return Object.keys(item.modifiers)
    .filter((key) => statLabels[key])
    .map(
      (key) =>
        `<span>${statLabels[key]} <b>${statValue(key, before[key])} → ${statValue(key, after[key])}</b></span>`,
    )
    .join('');
}
export function equipmentView(state, definition, engine) {
  const s = engine.getPlayerStats(state),
    items = engine.getEquipmentSummary(state);
  return `<span class="modal-kicker">旅人 Lv.${state.progression.level}</span><h2 id="modal-title">这一笔的力量</h2><p>生命墨汁上限 ${amount(s.maxInk)} · 已计入装备加成</p><div class="skill-summary"><span><b>${esc(definition.skills.shot.name)} · 远程</b>${amount(s.attackDamage)} 伤害 / ${amount(s.attackCost)} 墨</span><span><b>${esc(definition.skills.melee.name)} · 近战</b>${amount(s.meleeDamage)} 伤害 / 免费吸墨</span><span><b>${esc(definition.skills.nova.name)}</b>${amount(s.novaDamage)} 伤害 / ${amount(s.novaCost)} 墨</span><span><b>${esc(definition.skills.dash.name)}</b>${amount(s.dashCooldown)} 秒冷却 / 免费</span></div><div class="equipment-list">${items.length ? items.map((item) => `<article><strong>${esc(item.name)} <span>${item.rank}/${item.maxRank ?? 1} 阶</span></strong><p>${esc(item.description)}</p></article>`).join('') : '<p class="equipment-empty">探索金色装备刻印，或击败墨灵升级。</p>'}</div><details class="equipment-detail"><summary>回墨与回收数值</summary><p>命中吸取 ${amount(s.lifeSteal * 100)}% 实际伤害 · 击杀恢复 ${amount(s.killRestore)} 墨<br>散墨回收 ${amount(s.dropReturnRatio * 100)}% 技能消耗 · 拾取范围 ${amount(s.pickupRadius)}</p></details><div class="modal-actions"><button class="primary-button" data-close>继续旅程</button></div>`;
}
export function rewardView(state, engine) {
  const pending = state.pendingRewards[0],
    choices = engine.getRewardChoices(state);
  return `<span class="modal-kicker">可选装备 · Lv.${state.progression.level}${state.pendingRewards.length > 1 ? ` · ${state.pendingRewards.length} 次待选` : ''}</span><h2 id="modal-title">${esc(pending.title || '选择这一笔的力量')}</h2><p>选择一件，即刻强化 · 已有装备可升阶</p><div class="reward-options">${choices.map((item) => `<button class="reward-option" data-reward="${esc(item.id)}"><span class="reward-rank">${item.rank ? '升阶' : '新装备'} · ${item.nextRank} 阶</span><strong>${esc(item.name)}</strong><small>${esc(item.description)}</small><span class="reward-preview">${rewardPreview(state, item, engine)}</span><span class="reward-take">落下这一笔 →</span></button>`).join('')}</div><div class="modal-actions reward-actions"><button class="secondary-button" data-close>${state.status === 'won' ? '返回结算' : '稍后选择，继续战斗'}</button></div>`;
}
export function shopView(state, definition) {
  return `<span class="modal-kicker">无名契约师</span><h2 id="modal-title">以墨换成长</h2><p>当前 ${amount(state.player.ink)} 墨 · 交易消耗生命墨汁</p><div class="shop-list">${definition.shopItems
    .map((offer) => {
      const item = typeof offer === 'string' ? { id: offer } : offer;
      const id = item.itemId || item.id,
        equipment = definition.equipment[id] || item;
      const rank = state.equipment[id] || 0,
        price = item.price ?? equipment.price ?? 0;
      const full = rank >= (equipment.maxRank ?? 1);
      const disabled = full || state.player.ink - price < definition.rules.minInkAfterSpend;
      return `<button class="shop-option" data-buy="${esc(id)}" ${disabled ? 'disabled' : ''}><strong>${esc(equipment.name || id)}<span>${full ? '已满阶' : `${amount(price)} 墨`}</span></strong><small>${esc(equipment.description || '')} · ${full ? `${rank} 阶` : `${rank} → ${rank + 1} 阶`}</small></button>`;
    })
    .join(
      '',
    )}</div><p class="contract-tags" id="shop-message">留些墨汁，带着成长走出去。</p><div class="modal-actions"><button class="primary-button" data-close>继续前行</button></div>`;
}
