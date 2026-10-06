import { distance } from './math.mjs';
import { getRoom } from './definition.mjs';
import { effect, notice } from './events.mjs';
import { spendInk } from './resources.mjs';
import { chooseReward, equipItem } from './growth.mjs';
import { useNova } from './player.mjs';
import { getNearbyInteractable, interactWith } from './world.mjs';

function drawBridge(state, bridgeId) {
  const bridge = getRoom(state).bridges.find((item) => item.id === bridgeId);
  if (!bridge) return { ok: false, message: '这里没有可绘制的桥' };
  if (bridge.drawn) return { ok: false, message: '墨桥已经画好了' };
  if (distance(state.player, bridge.from) > 125) return { ok: false, message: '先走近绘桥锚点' };
  if (!spendInk(state, bridge.cost, 'explore'))
    return {
      ok: false,
      message: `绘桥消耗 ${bridge.cost} 墨汁，需保留至少 ${state.definition.rules.minInkAfterSpend} 墨汁`,
    };
  bridge.drawn = true;
  state.stats.bridgesDrawn++;
  state.stats.drawn++;
  effect(state, 'draw', bridge.from.x, bridge.from.y, { to: bridge.to, radius: 90, life: 1.2 });
  return { ok: true, message: bridge.successMessage ?? bridge.rewardText ?? '墨桥已经成形' };
}
function buyEquipment(state, action) {
  const id = action.itemId ?? action.contractId;
  const offer = state.definition.shopItems.find((item) =>
    typeof item === 'string' ? item === id : item.id === id || item.itemId === id,
  );
  const itemId = typeof offer === 'string' ? offer : (offer?.itemId ?? offer?.id);
  const equipment = state.definition.equipment[itemId];
  const merchant = getRoom(state).objects.find((object) => object.kind === 'merchant');
  if (!merchant || distance(state.player, merchant) > 130)
    return { ok: false, message: '走近契约师才能签约' };
  if (!equipment || !offer) return { ok: false, message: '这里没有这份装备契约' };
  if ((state.equipment[itemId] ?? 0) >= (equipment.maxRank ?? 1))
    return { ok: false, message: '这件装备已达上限' };
  const price = (typeof offer === 'string' ? equipment.price : offer.price) ?? equipment.price;
  if (!spendInk(state, price, 'trade'))
    return {
      ok: false,
      message: `契约消耗 ${price} 墨汁，需保留至少 ${state.definition.rules.minInkAfterSpend} 墨汁`,
    };
  equipItem(state, itemId);
  state.stats.trades++;
  return { ok: true, message: state.message };
}
export function runCommand(state, action = {}) {
  if (action.type === 'chooseReward' && ['playing', 'won'].includes(state.status))
    return chooseReward(state, action.itemId);
  if (state.status !== 'playing') return { ok: false, message: '先开始一局冒险' };
  let result;
  if (action.type === 'nova') result = useNova(state);
  else if (action.type === 'draw') result = drawBridge(state, action.bridgeId);
  else if (action.type === 'buy') result = buyEquipment(state, action);
  else if (action.type === 'interact') {
    const room = getRoom(state),
      objectId = action.objectId ?? action.target ?? getNearbyInteractable(state)?.id;
    result = interactWith(
      state,
      [
        ...room.objects,
        ...room.portals,
        ...state.pickups.filter((pickup) => pickup.kind === 'gear'),
      ].find((object) => object.id === objectId),
    );
  } else result = { ok: false, message: '未知动作' };
  notice(state, result.message);
  return result;
}
