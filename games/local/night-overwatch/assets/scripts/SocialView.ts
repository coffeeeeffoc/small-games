import { EditBox, Graphics, Label, Node, UITransform, isValid } from 'cc';
import type { HUD } from './HUD';
import { C, col } from './HudTheme';
import { playerId, playerLabel } from './Online';

/** The conversation covers the current page without changing its navigation or battle state. */
export class SocialView {
  private banner?:Node;
  private bannerKey='';
  private body?:Node;
  private composer?:EditBox;
  private stamp='';
  private lastMessage='';
  private h:HUD;
  constructor(h:HUD){this.h=h;}
  private discard(node?:Node){
    if(!node||!isValid(node))return;
    this.h.buttons=this.h.buttons.filter(b=>{for(let p:Node|null=b.label.node;p;p=p.parent)if(p===node)return false;return true;});node.destroy();
  }
  private button(parent:Node,g:Graphics,id:string,text:string,x:number,y:number,w:number,disabled=false,primary=false){
    // Dynamic overlays own their ink; modal skin surfaces outlive each refresh.
    const label=this.h.menuButton(parent,g,id,text,x,y,w,'secondary','',44,disabled);
    if(primary){this.h.rect(g,x+2,y+4,w-4,36,disabled?'#242d35':'#4a3d24',C.amber,3);label.color=col(C.white);label.isBold=true;}
    return label;
  }
  updateBanner(){
    const h=this.h,o=h.online,notice=o?.notification&&performance.now()<o.notificationUntil?o.notification:undefined;
    const major=h.majorUpdate&&!o?.socialOpen&&!h.updatesOpen&&!h.modalKey.startsWith('online:')&&h.modalKey==='home';
    const visible=!!o&&!o.socialOpen&&!h.updatesOpen&&!h.storageError;
    const key=[visible,notice?.id,o?.directUnread,o?.incomingFriends,major,h.w,h.h,h.lang,h.safe.top].join(':');
    if(key===this.bannerKey&&this.banner&&isValid(this.banner))return;
    this.bannerKey=key;this.discard(this.banner);this.banner=undefined;
    if(!visible||!notice&&!o!.directUnread&&!o!.incomingFriends&&!major)return;
    const n=this.banner=h.node('SocialNotice',h.globalControls),g=n.addComponent(Graphics);
    const w=Math.min(480,h.w-h.safe.left-h.safe.right-24),x=h.safe.left+(h.w-h.safe.left-h.safe.right-w)/2,y=Math.max(h.safe.top+52,(h.capsuleRect?.bottom||0)+6);
    if(notice||major){
      h.panelFrame(g,x,y,w,76,major?C.amber:C.mint,'#050f1df5',false);
      const caption=notice?`${notice.nickname} · ${h.t('私信','MESSAGE')}\n${notice.text}`:h.t('重大更新 · 好友、私信与留房再战\n点此查看更新日志','MAJOR UPDATE · FRIENDS, MESSAGES & REMATCH\nVIEW UPDATE LOG');
      h.label(n,caption,x+(w-148)/2+12,y+38,13,w-148,62,C.white).horizontalAlign=Label.HorizontalAlign.LEFT;
      this.button(n,g,notice?'social:reply':'social:updates',h.t(notice?'回复':'查看',notice?'REPLY':'VIEW'),x+w-128,y+16,76,false,true);
      h.menuButton(n,g,'social:dismiss','×',x+w-48,y+16,44,'secondary','',44);
    }else {
      const text=h.t(`私信 ${o!.directUnread} · 好友申请 ${o!.incomingFriends}`,`MESSAGES ${o!.directUnread} · REQUESTS ${o!.incomingFriends}`);
      h.menuButton(n,g,'social:inbox',text,x+w-230,y,230,'secondary','',44);
    }
  }
  render(n:Node,initial=false){
    const h=this.h,o=h.online!,peer=o.chatPeer;
    const x=h.safe.left+12,w=h.w-h.safe.left-h.safe.right-24,top=Math.max(h.safe.top+8,(h.capsuleRect?.bottom||0)+6),bottom=h.h-h.safe.bottom-10,inputY=bottom-44;
    if(initial){
      h.rect(n.addComponent(Graphics),0,0,h.w,h.h,'#050f1df0');
      const field=h.node('DirectComposer',n),fw=w-84;
      field.active=false;field.setPosition(x+fw/2-h.w/2,h.h/2-inputY-22);field.getComponent(UITransform)!.setContentSize(fw-16,44);
      const edit=this.composer=field.addComponent(EditBox);edit.textLabel=h.label(field,'',h.w/2,h.h/2,16,fw-20,42);
      edit.placeholderLabel=h.label(field,h.t('回复这位玩家…','Reply to this pilot…'),h.w/2,h.h/2,13,fw-20,42,C.dim);
      edit.inputMode=EditBox.InputMode.SINGLE_LINE;edit.maxLength=240;edit.string=o.chatDraft;
      for(const label of [edit.textLabel,edit.placeholderLabel]){label.node.getComponent(UITransform)!.setAnchorPoint(0,1);label.horizontalAlign=Label.HorizontalAlign.LEFT;label.verticalAlign=Label.VerticalAlign.CENTER;}
      field.on(EditBox.EventType.TEXT_CHANGED,()=>{o.chatDraft=edit.string;});field.active=true;
      this.lastMessage='';this.stamp='';
    }
    const stamp=`${o.revision}:${o.chatRevision}:${h.listScroll.direct||0}:${h.w}:${h.h}`;
    if(stamp===this.stamp)return;this.stamp=stamp;this.discard(this.body);
    h.listAreas=h.listAreas.filter(a=>a.key!=='direct');
    const body=this.body=h.node('DirectContent',n),g=body.addComponent(Graphics);
    body.setSiblingIndex(0);
    const button=(id:string,caption:string,bx:number,by:number,bw:number,disabled=false,primary=false,parent=body,ink=g)=>this.button(parent,ink,id,caption,bx,by,bw,disabled,primary);
    button('social:close','‹',x,top,44);
    const p=peer&&o.peer(playerId(peer))||peer,status=p?.status==='playing'?h.t('游戏中','PLAYING'):p?.status==='offline'?h.t('离线 · 可留言','OFFLINE · LEAVE A MESSAGE'):h.t('在线','ONLINE');
    const title=h.label(body,playerLabel(p||{})+' · '+status,x+50+(w-58)/2,top+22,16,w-58,36,p?.status==='playing'?C.amber:p?.status==='offline'?C.dim:C.mint);title.enableWrapText=false;title.overflow=Label.Overflow.SHRINK;
    const id=peer?playerId(peer):'',friend=o.social.friends.some(v=>playerId(v)===id),request=o.social.requests.find(v=>playerId(v)===id),cw=(w-18)/4;
    button('online:friendAction:'+(friend?'remove':request?.direction==='incoming'?'accept':request?'cancel':'request')+':'+id,h.t(friend?'删除好友':request?.direction==='incoming'?'同意好友':request?'取消申请':'添加好友',friend?'UNFRIEND':request?.direction==='incoming'?'ACCEPT':request?'CANCEL':'ADD FRIEND'),x,top+46,cw,o.socialBusy);
    button('online:invitePlayer:'+id,h.t('邀请对战','INVITE'),x+cw+6,top+46,cw,!p||!o.canInvite(p));
    button('online:chatBlock:'+id,h.t(o.blockedPlayers.has(id)?'取消屏蔽':'屏蔽',o.blockedPlayers.has(id)?'UNBLOCK':'BLOCK'),x+(cw+6)*2,top+46,cw);
    button('social:older',h.t(o.conversationBefore?'更早消息':'刷新会话',o.conversationBefore?'OLDER':'REFRESH'),x+(cw+6)*3,top+46,cw,o.conversationLoading);
    const area={x,y:top+96,w,h:Math.max(44,inputY-top-124)},messages=o.visibleChat,font=h.w<700?13:16;
    let total=0;const rows=messages.map(m=>{const height=52+Math.max(1,Math.ceil(Array.from(m.text).length/Math.max(12,Math.floor((w-120)/font))))*(font+4)+(m.room?48:0);const row={y:total,height};total+=height+8;return row;});
    const newest=messages.at(-1)?.id||'',oldOffset=h.listScroll.direct||0;
    if(this.lastMessage!==newest){h.listScroll.direct=Number.MAX_SAFE_INTEGER;this.lastMessage=newest;}
    else h.listScroll.direct=oldOffset;
    const list=h.listViewport(body,'direct',area,total);
    messages.forEach((m,i)=>{
      const row=rows[i],y=area.y+row.y-list.offset;if(y+row.height<area.y||y>area.y+area.h)return;
      const own=m.playerId===o.authenticatedId;
      h.rect(list.g,x+4,y,w-12,row.height,own?'#174358ee':'#142b3bee','#456477',6);
      h.label(list.n,(own?h.t('你','YOU'):m.nickname)+' · '+new Date(m.at).toLocaleString(),x+12+(w-98)/2,y+14,11,w-98,24,own?C.mint:C.dim).horizontalAlign=Label.HorizontalAlign.LEFT;
      h.label(list.n,m.text,x+14+(w-104)/2,y+32+(row.height-44-(m.room?48:0))/2,font,w-104,row.height-44-(m.room?48:0),C.white).horizontalAlign=Label.HorizontalAlign.LEFT;
      if(!own)button('online:chatReport:'+m.id,h.t('举报','REPORT'),x+w-82,y+12,68,false,false,list.n,list.g);
      if(m.room)button('online:chatJoin:'+m.id,h.t(m.room.canJoin?'加入邀请对战':'邀请已失效',m.room.canJoin?'JOIN INVITATION':'INVITATION CLOSED'),x+12,y+row.height-48,w-32,!m.room.canJoin||!!o.room||o.activity==='playing',true,list.n,list.g);
    });list.finish();
    if(!messages.length)h.label(body,o.conversationLoading?h.t('正在读取会话…','LOADING…'):h.t('发送第一条消息 · 离线好友也能收到','SEND A MESSAGE · OFFLINE FRIENDS CAN READ LATER'),x+w/2,area.y+area.h/2,14,w-24,60,C.dim);
    h.label(body,o.socialStatus||o.chatStatus||h.t('私信仅双方可见 · 历史保存在服务端 · 联机对战继续','PRIVATE HISTORY ON SERVER · ONLINE BATTLE CONTINUES'),x+w/2,inputY-14,11,w-12,24,C.dim);
    h.inset(g,x,inputY,w-84,44);button('online:chatSend',h.t(o.chatSending?'发送中':'发送',o.chatSending?'SENDING':'SEND'),x+w-78,inputY,78,o.chatSending||!o.socialAvailable,true);
    if(this.composer&&this.composer.string!==o.chatDraft)this.composer.string=o.chatDraft;
  }
}
