// Append a release entry at publication; keep prior IDs stable so major notices appear once.
export const UPDATE_LOG = [{
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
