import { esc, amount } from './dom.mjs';

const statLabels = {
  attackDamage: '墨弹伤害',
  meleeDamage: '近战伤害',
  lifeSteal: '命中吸取',
  maxInk: '墨汁上限',
  novaDamage: '范围伤害',
  novaRadius: '范围半径',
  novaCooldown: '范围技能冷却',
  speed: '移动速度',
  dashCooldown: '闪避冷却',
  pickupRadius: '拾取范围',
  dropReturnRatio: '散墨回收',
};
function statValue(key, value) {
  if (['lifeSteal', 'dropReturnRatio'].includes(key)) return `${amount(value * 100)}%`;
  if (key.endsWith('Cooldown')) return `${amount(value)} 秒`;
  return amount(value);
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
  return `
    <span class="modal-kicker">YOUR LIVING INK</span>
    <h2 id="modal-title">让每一笔，更有力。</h2>
    <p>旅人 Lv.${state.progression.level} · 生命墨汁上限 ${amount(s.maxInk)}<br>
      以下数值已计算本局装备与升阶加成。</p>
    <div class="skill-summary">
      <span><b>${esc(definition.skills.shot.name)}</b>${amount(s.attackDamage)} 伤害 / ${amount(s.attackCost)} 墨</span>
      <span><b>${esc(definition.skills.melee.name)}</b>${amount(s.meleeDamage)} 伤害 / 免费</span>
      <span><b>${esc(definition.skills.nova.name)}</b>${amount(s.novaDamage)} 伤害 / ${amount(s.novaCost)} 墨</span>
      <span><b>${esc(definition.skills.dash.name)}</b>${amount(s.dashCooldown)} 秒冷却 / 免费</span>
      <span><b>攻击吸取</b>${amount(s.lifeSteal * 100)}% 实际伤害</span>
      <span><b>击杀恢复</b>${amount(s.killRestore)} 墨 / 次</span>
      <span><b>散墨回收</b>${amount(s.dropReturnRatio * 100)}% 技能消耗</span>
      <span><b>拾取范围</b>${amount(s.pickupRadius)}</span>
    </div>
    <div class="equipment-list">
      ${
        items.length
          ? items
              .map(
                (item) => `
        <article>
          <strong>${esc(item.name)} <span>${item.rank} / ${item.maxRank ?? 1} 阶</span></strong>
          <p>${esc(item.description)}</p>
        </article>`,
              )
              .join('')
          : '<p>尚未获得装备。击败墨灵升级，或探索场景中的装备匣。</p>'
      }
    </div>
    <button class="primary-button" data-close>带着成长，继续</button>`;
}
export function rewardView(state, engine) {
  const pending = state.pendingRewards[0],
    choices = engine.getRewardChoices(state);
  return `
    <span class="modal-kicker">A STRONGER STROKE · LV.${state.progression.level}</span>
    <h2 id="modal-title">${esc(pending.title || '选择这一笔的力量')}</h2>
    <p>选一件装备，即刻强化；已有装备可继续升阶。<br>
      战斗已暂停${state.pendingRewards.length > 1 ? ` · 还有 ${state.pendingRewards.length} 次选择` : ''}，刷新后保留本次选项。</p>
    <div class="reward-options">
      ${choices
        .map(
          (item) => `
        <button class="reward-option" data-reward="${esc(item.id)}">
          <span class="reward-rank">${item.rank ? '装备升阶' : '获得装备'} · ${item.rank} → ${item.nextRank} 阶</span>
          <strong>${esc(item.name)}</strong>
          <small>${esc(item.description)}</small>
          <span class="reward-preview">${rewardPreview(state, item, engine)}</span>
          <span class="reward-take">选择这份力量 →</span>
        </button>`,
        )
        .join('')}
    </div>
    <p class="reward-note">选定后继续战斗。墨滴与敌人在等待期间不会消散或行动。</p>`;
}
export function shopView(state, definition) {
  return `
    <span class="modal-kicker">THE NAMELESS SCRIBE</span>
    <h2 id="modal-title">以墨，换取成长。</h2>
    <p>交易也消耗生命墨汁。当前 <b>${amount(state.player.ink)}</b> 墨；装备与奖励共享升阶效果。</p>
    ${definition.shopItems
      .map((offer) => {
        const item = typeof offer === 'string' ? { id: offer } : offer;
        const id = item.itemId || item.id,
          equipment = definition.equipment[id] || item;
        const rank = state.equipment[id] || 0,
          price = item.price ?? equipment.price ?? 0,
          full = rank >= (equipment.maxRank ?? 1);
        const disabled = full || state.player.ink - price < definition.rules.minInkAfterSpend;
        return `
        <button class="shop-option" data-buy="${esc(id)}" ${disabled ? 'disabled' : ''}>
          <strong>${esc(equipment.name || id)}<span>${full ? '已满阶' : amount(price) + ' 墨'}</span></strong>
          <small>${esc(equipment.description || '')} · ${full ? `${rank} 阶` : `${rank} → ${rank + 1} 阶`}</small>
        </button>`;
      })
      .join('')}
    <p class="contract-tags" id="shop-message">留住足够墨汁，才能带着装备走出去。</p>
    <button class="secondary-button" data-close>收笔，继续前行</button>`;
}
