// Append a release entry at publication; keep prior IDs stable so major notices appear once.
export const UPDATE_LOG = [{
  id:'2026-11-14-social-reconnect',date:'2026-11-14',major:true,
  title:['1.1.0','1.1.0'],
  changes:[
    ['首页新增好友与在线玩家，可发私信、离线留言和邀请对战。','Find friends and online players on Home. Send private messages, leave offline messages, and invite players to duel.'],
    ['双人对战随机地图、昼夜和地面兵力；30 秒内可重连，结算后可留房再战。弹道更连贯，新增消灭统计并优化胜率榜。','Duels vary maps, time of day and ground forces. Rejoin within 30 seconds or rematch in the same room after results. Smoother projectiles, takedown stats and an improved win-rate leaderboard.'],
    ['首页看公告，信箱领补偿。兼容版本可继续游玩，更新时已开局的对战可照常结算。','Read announcements on Home and claim compensation in the Inbox. Compatible versions stay playable, and matches in progress can finish during updates.'],
    ['单人关卡准备超时可重试；服务暂不可用时可离线开局，联网后补结算。','Retry solo mission setup after a timeout, or start offline and sync rewards after reconnecting.'],
    ['追踪 20 秒／冷却 90 秒，电磁干扰 15 秒／冷却 60 秒。优化横屏、选关、开箱和转盘；转盘与补给箱广告各每日 10 次。','Tracking: 20s with a 90s cooldown. EMP: 15s with a 60s cooldown. Improved landscape layout, mission selection, crates and wheel. Wheel and crate ads: 10 per day each.'],
  ],
}] as const;
