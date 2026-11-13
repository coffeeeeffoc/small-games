// Append a release entry at publication; keep prior IDs stable so major notices appear once.
export const UPDATE_LOG = [{
  id:'2026-11-14-social-reconnect',date:'2026-11-14',major:true,
  title:['公告、补偿与版本兼容升级','Better notices, compensation and update compatibility'],
  changes:[
    ['今后客户端与服务端可分批更新，已开始的对局可按开局时的规则继续并结算，减少发版对正在游玩的影响。','Future client and server releases can roll out separately. Matches in progress can finish and settle under the rules they started with, reducing disruption during updates.'],
    ['在「设置 → 游戏更新」可查看当前版本和最新版本。兼容的旧版本可继续游玩，需要更新时游戏会给出提示。','Check your installed and latest available versions in Settings → Game Updates. Supported older versions can still play, and the game will tell you when an update is needed.'],
    ['补偿可按受影响的登录时段发放。符合条件的玩家可在「信箱」领取奖励并查看明细，最新邮件排在最前。','Compensation can be sent to players who logged in during the affected period. Claim rewards and check the details in your Inbox, with newest mail first.'],
    ['维护、发版和活动通知可在首页滚动查看，也可打开「消息中心 → 公告」查看详情。','See maintenance, release and event notices on Home or open Messages → News for details.'],
    ['准备室可收起再展开。对战断线或退出后可在30秒内返回，超时由人机接管。结算后可留在原房再战。','Minimize and reopen the ready room. Rejoin within 30 seconds of disconnecting or leaving. A bot takes over after that. Rematch in the same room after results.'],
    ['单人关卡准备超时可重试。服务暂不可用时可离线开局，恢复联网后补结算奖励。','Retry if mission preparation times out. Start solo missions offline when the service is unavailable, and sync rewards when back online.'],
    ['首页可查看好友和在线玩家。私信支持快捷回复、离线留言和历史记录，可直接邀请好友约战。','See friends and online players from Home. Send match invites and private messages with quick replies, offline delivery and chat history.'],
    ['双人对战加入随机地图、昼夜和地面兵力。弹道显示更连贯，结算补充消灭统计，并优化真人胜率榜。','Duels vary the map, time of day and ground forces. Projectile visuals are smoother, results show takedowns, and the PvP leaderboard shows win rates.'],
    ['装备追踪持续20秒，结束后冷却90秒。电磁干扰持续15秒，冷却60秒。','Equipped tracking lasts 20 seconds with a 90-second cooldown afterward. EMP lasts 15 seconds with a 60-second cooldown.'],
    ['更新开箱动画和转盘样式，转盘和补给箱广告各限每日10次。优化手机横屏、选关滚动和步兵标记。','Updated crate animations and the prize wheel. Wheel and crate ads each have a daily limit of 10. Improved landscape layout, mission scrolling and infantry markers.'],
  ],
},{
  id:'2026-11-12-social-balance',date:'2026-11-12',major:true,
  title:['私信体验与追踪平衡','Private chat and tracking balance'],
  changes:[
    ['修复私信提醒残留；退出会话返回全部会话列表。','Message notices close cleanly; Back returns to all conversations.'],
    ['聊天两侧增加安全留白，优化消息气泡和邀请卡片。','More space around chat, clearer bubbles and invitation cards.'],
    ['移除好友前二次确认，暂时收起屏蔽和举报入口。','Confirm friend removal; block and report controls are temporarily hidden.'],
    ['二级页标题栏紧凑置顶；追踪技能持续20秒，结束后冷却90秒。','Compact page headers; tracking lasts 20s with a 90s cooldown afterward.'],
  ],
},{
  id:'2026-11-12-social',date:'2026-11-12',major:true,
  title:['好友、私信与留房再战','Friends, private messages and rematches'],
  changes:[
    ['在线名单新增状态点；好友列表可查看离线好友。','Online status indicators and a persistent friends list.'],
    ['全局私信提醒、快捷回复、离线留言和持久会话记录。','Global message notices, quick replies, offline delivery and conversation history.'],
    ['好友申请由对方确认；游戏中的玩家不能被邀请。','Friend requests require acceptance; busy players cannot be invited.'],
    ['真人对战结束保留房间，可与原队友再战或主动退出。','Stay after a human match, rematch with your partner or leave explicitly.'],
    ['设置中可查看更新日志；重大更新醒目提示。','Read update history in Settings, with prominent major update notices.'],
  ],
}] as const;
