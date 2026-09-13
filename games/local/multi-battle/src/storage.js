import { CARD_BY_ID, FAMILIES, PRICES } from './content.js';
import { encode, decode } from './shared.js';
import { VERSION } from './game.js';

export const SAVE_KEY = 'multi-battle.save.v1';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const integer = value => Number.isSafeInteger(value);
const big = value => typeof value === 'bigint' && value >= 0n;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, length) => typeof value === 'string' && value.length <= length;

function validateCard(card, seen) {
  check(object(card), '卡牌实例损坏');
  const d = CARD_BY_ID[card.defId];
  check(d && text(card.uid, 80) && card.uid.length > 0 && !seen.has(card.uid), '卡牌不存在或实例重复');
  seen.add(card.uid);
  check(big(card.level) && card.level >= 1n, '角色等级必须是正整数');
  check(integer(card.price) && card.price >= 1 && card.price <= PRICES[d.type], '商品价格损坏');
  check(Array.isArray(card.equipment) && card.equipment.length <= 2 && (d.type === 'character' || !card.equipment.length), '装备位置损坏');
  const ids = new Set();
  for (const item of card.equipment) {
    check(CARD_BY_ID[item?.defId]?.type === 'equipment' && !ids.has(item.defId), '装备类型或同名限制错误');
    ids.add(item.defId); validateCard(item, seen);
  }
  check(object(card.used) && Object.values(card.used).every(v=>integer(v)&&v>=0&&v<=100), '卡牌次数损坏');
  const p=card.prep;
  check(object(p)&&big(p.attack)&&big(p.health)&&big(p.shield)&&typeof p.deathSummon==='boolean', '准备属性损坏');
  check(Array.isArray(p.opening)&&p.opening.length<=500&&p.opening.every(k=>['cannon','firemark','starfall','offering'].includes(k)), '开场能力损坏');
}
function validateBoard(board, seen = new Set()) {
  check(Array.isArray(board)&&board.length===6, '战场必须有六格');
  for(const c of board) if(c!==null) {check(CARD_BY_ID[c?.defId]?.type==='character', '战场含非角色');validateCard(c,seen);}
}
function validateBattle(battle) {
  check(object(battle)&&[0,1,null].includes(battle.winner)&&integer(battle.actions)&&battle.actions>=0&&battle.actions<=60, '战斗结果损坏');
  check(Array.isArray(battle.remaining)&&battle.remaining.length===2&&battle.remaining.every(v=>integer(v)&&v>=0&&v<=6), '战斗幸存数损坏');
  check(Array.isArray(battle.frames)&&battle.frames.length>0&&battle.frames.length<=2000, '战斗记录损坏');
  for(const frame of battle.frames) {
    check(object(frame)&&text(frame.type,30)&&text(frame.text,2000)&&Array.isArray(frame.teams)&&frame.teams.length===2, '战斗帧损坏');
    for(let side=0;side<2;side++) {
      check(Array.isArray(frame.teams[side])&&frame.teams[side].length===6, '战斗格子损坏');
      for(const unit of frame.teams[side]) if(unit) {
        check(text(unit.uid,100)&&big(unit.level)&&unit.level>=0n&&big(unit.attack)&&typeof unit.health==='bigint'&&big(unit.maxHealth)&&big(unit.shield), '战斗属性损坏');
        check(CARD_BY_ID[unit.defId]?.type==='character'||['token.ember.ash_puppet','token.ember.decoy'].includes(unit.defId), '战斗角色未知');
      }
    }
  }
}
export function validateGame(game) {
  check(object(game)&&game.version===VERSION&&game.rulesVersion===1&&game.contentVersion===1, '存档版本不兼容；旧数据仍保留，可导出后重新开始');
  check(['prep','battle','result','ended'].includes(game.phase), '对局阶段损坏');
  check(integer(game.round)&&game.round>=1&&game.round<=18&&integer(game.rng)&&game.rng>=0&&game.rng<=0xffffffff, '回合或随机状态损坏');
  check(text(game.seedText,80)&&['standard','easy'].includes(game.difficulty), '种子或难度损坏');
  check(Array.isArray(game.players)&&game.players.length===8&&game.players[0]?.id==='human', '对局人数损坏');
  const seen=new Set(), playerIds=new Set();
  for(const p of game.players) {
    check(object(p)&&text(p.id,30)&&!playerIds.has(p.id)&&text(p.name,40)&&Object.hasOwn(FAMILIES,p.family), '玩家信息损坏');
    playerIds.add(p.id);
    check(integer(p.level)&&p.level>=1&&p.level<=5&&integer(p.hp)&&p.hp<=30&&p.hp>=-30&&integer(p.gold)&&p.gold>=0, '玩家资源损坏');
    check(integer(p.round)&&p.round>=1&&p.round<=game.round&&integer(p.wins)&&p.wins>=0&&p.wins<=18, '玩家回合损坏');
    check(integer(p.rng)&&p.rng>=0&&p.rng<=0xffffffff&&integer(p.botRng)&&p.botRng>=0&&p.botRng<=0xffffffff&&integer(p.nextId)&&p.nextId>0, '玩家随机状态损坏');
    check(integer(p.extraGold)&&p.extraGold>=0&&p.extraGold<=3&&typeof p.frozen==='boolean', '经济计数损坏');
    check(p.eliminatedRound===null||(integer(p.eliminatedRound)&&p.eliminatedRound>=1&&p.eliminatedRound<=game.round), '淘汰信息损坏');
    validateBoard(p.board,seen);
    check(Array.isArray(p.hand)&&p.hand.length<=10&&Array.isArray(p.shop)&&p.shop.length===5, '手牌或商店容量损坏');
    for(const c of p.hand) validateCard(c,seen);
    for(let i=0;i<5;i++) if(p.shop[i]) {
      validateCard(p.shop[i],seen);
      const d=CARD_BY_ID[p.shop[i].defId];
      check(d.type===(i<3?'character':i===3?'spell':'equipment')&&d.tier<=p.level, '商店品阶或类型非法');
    }
    if(p.lastBoard!==null) validateBoard(p.lastBoard);
    check(p.hp>0 ? p.round===game.round&&p.eliminatedRound===null : p.lastBoard!==null&&p.eliminatedRound!==null, '存活状态与回合记录不一致');
    check(Array.isArray(p.log)&&p.log.length<=40&&p.log.every(s=>text(s,2000)), '行动记录损坏');
  }
  check(Array.isArray(game.tieOrder)&&game.tieOrder.length===8&&new Set(game.tieOrder).size===8&&game.tieOrder.every(id=>playerIds.has(id)), '排名信息损坏');
  check(object(game.previousOpponents)&&Object.entries(game.previousOpponents).every(([a,b])=>playerIds.has(a)&&(playerIds.has(b)||b==='ghost')), '配对记录损坏');
  check(game.lastGhostId===null||playerIds.has(game.lastGhostId), '镜像轮转信息损坏');
  check(object(game.ghostCounts)&&Object.entries(game.ghostCounts).every(([id,n])=>playerIds.has(id)&&integer(n)&&n>=0&&n<=18), '镜像轮转次数损坏');
  check(game.opponentId===null||game.opponentId==='ghost'||playerIds.has(game.opponentId), '对手信息损坏');
  check(Array.isArray(game.pairs)&&game.pairs.length>=1&&game.pairs.length<=4, '本轮配对损坏');
  const paired=new Set();
  for(const pair of game.pairs) {
    check(Array.isArray(pair)&&pair.length===2&&pair[0]!==pair[1], '重复对战');
    for(const id of pair) {check((playerIds.has(id)||id==='ghost')&&!paired.has(id), '配对对象重复或未知');paired.add(id);}
  }
  if(game.ghost) {check(text(game.ghost.name,60)&&playerIds.has(game.ghost.sourceId), '镜像来源损坏');validateBoard(game.ghost.board);}
  if(game.battle) validateBattle(game.battle);
  if(game.phase==='battle') {
    check(game.battle&&Array.isArray(game.pendingResults)&&game.pendingResults.length===game.pairs.length, '战斗结算快照缺失');
    game.pendingResults.forEach((r,i)=>{
      check(r.leftId===game.pairs[i][0]&&r.rightId===game.pairs[i][1]&&[0,1,null].includes(r.winner)&&Array.isArray(r.remaining)&&r.remaining.length===2&&r.remaining.every(v=>integer(v)&&v>=0&&v<=6),'待结算结果损坏');
    });
  }
  if(game.lastResult) check([0,1,null].includes(game.lastResult.winner)&&integer(game.lastResult.damage)&&game.lastResult.damage>=0&&text(game.lastResult.opponentName,60), '上回合结果损坏');
  if(game.phase==='ended') check(integer(game.rank)&&game.rank>=1&&game.rank<=8,'最终名次损坏');
  return game;
}
export function exportGame(game) { return encode(validateGame(game)); }
export function importGame(raw) {
  check(typeof raw==='string'&&raw.length<=8*1024*1024, '存档文件过大或内容无效');
  try { return validateGame(decode(raw)); } catch(error) { throw new Error(`无法读取存档：${error.message}`); }
}
export function loadGame(storage) {
  let raw = null;
  try {
    raw=(storage ?? globalThis.localStorage).getItem(SAVE_KEY);
    return {game:raw?importGame(raw):null};
  } catch(error) { return {game:null,error:error.message,raw}; }
}
export function saveGame(game, storage) {
  try {(storage ?? globalThis.localStorage).setItem(SAVE_KEY,exportGame(game));return {ok:true};}
  catch(error) {return {ok:false,error:`未保存：${error.message}。请导出当前对局备份。`};}
}
