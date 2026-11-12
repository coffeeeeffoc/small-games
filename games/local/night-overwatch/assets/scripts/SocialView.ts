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
    // Keep every surface under the overlay so closing it removes all of its ink.
    this.h.plate(g,x+2,y+3,w-4,38,primary&&!disabled?C.amber:'#162c3e',disabled?C.line:primary?C.amber:C.mint,6);
    const label=this.h.button(id,text,x,y,w,44,parent),button=this.h.buttons.at(-1)!;
    button.disabled=disabled;button.visual={x:x+2,y:y+3,w:w-4,h:38,cut:6};
    label.color=col(disabled?C.dim:primary?'#fff0d0':C.white);label.isBold=true;label.fontSize=14;label.enableWrapText=false;label.overflow=Label.Overflow.SHRINK;
    return label;
  }
  updateBanner(){
    const h=this.h,o=h.online,notice=o?.notification&&performance.now()<o.notificationUntil?o.notification:undefined;
    const major=h.majorUpdate&&!o?.socialOpen&&!h.updatesOpen&&!h.modalKey.startsWith('online:')&&h.modalKey==='home';
    const visible=!!o&&!o.socialOpen&&!o.friendRemoval&&!h.updatesOpen&&!h.storageError;
    const key=[visible,notice?.id,o?.directUnread,o?.incomingFriends,major,h.w,h.h,h.lang,h.safe.top].join(':');
    if(key===this.bannerKey&&this.banner&&isValid(this.banner))return;
    this.bannerKey=key;this.discard(this.banner);this.banner=undefined;
    if(!visible||!notice&&!o!.directUnread&&!o!.incomingFriends&&!major)return;
    const n=this.banner=h.node('SocialNotice',h.globalControls),g=n.addComponent(Graphics);
    const w=Math.min(480,h.w-h.safe.left-h.safe.right-24),x=h.safe.left+(h.w-h.safe.left-h.safe.right-w)/2,y=Math.max(h.safe.top+52,(h.capsuleRect?.bottom||0)+6);
    if(notice||major){
      h.plate(g,x,y,w,76,'#102434',major?C.amber:C.mint,8);
      const caption=notice?`${notice.nickname} · ${h.t('私信','MESSAGE')}\n${notice.text}`:h.t('版本更新 · 私信体验与追踪平衡\n点此查看更新日志','UPDATE · PRIVATE CHAT & TRACKING BALANCE\nVIEW UPDATE LOG');
      h.label(n,caption,x+(w-148)/2+12,y+38,13,w-148,62,C.white).horizontalAlign=Label.HorizontalAlign.LEFT;
      this.button(n,g,notice?'social:reply':'social:updates',h.t(notice?'回复':'查看',notice?'REPLY':'VIEW'),x+w-128,y+16,76,false,true);
      this.button(n,g,'social:dismiss','×',x+w-48,y+16,44);
    }else {
      const text=h.t(`私信 ${o!.directUnread} · 好友申请 ${o!.incomingFriends}`,`MESSAGES ${o!.directUnread} · REQUESTS ${o!.incomingFriends}`);
      this.button(n,g,'social:inbox',text,x+w-230,y,230);
    }
  }
  renderRemoval(n:Node,g:Graphics){
    const h=this.h,o=h.online!,w=Math.min(420,h.w-h.safe.left-h.safe.right-64),x=(h.w-w)/2,y=(h.h-200)/2;
    h.panelFrame(g,x,y,w,200,C.amber,'#050f1de8');
    h.label(n,h.t('移除好友','REMOVE FRIEND'),x+w/2,y+28,20,w-32,36,C.white).isBold=true;
    h.label(n,h.t(`确定移除 ${playerLabel(o.friendRemoval!)}？\n聊天记录会保留，之后可重新申请好友。`,`Remove ${playerLabel(o.friendRemoval!)}?\nChat history is kept. You can add them again.`),x+w/2,y+94,14,w-36,80,C.dim);
    this.button(n,g,'social:removeCancel',h.t('取消','CANCEL'),x+16,y+146,(w-40)/2);
    this.button(n,g,'social:removeConfirm',h.t('确认移除','REMOVE'),x+24+(w-40)/2,y+146,(w-40)/2,false,true);
  }
  render(n:Node,initial=false){
    const h=this.h,o=h.online!,peer=o.chatPeer;
    const x=Math.max(32,Math.min(60,h.w*.05),h.safe.left+12,h.safe.right+12),w=h.w-x*2,top=Math.max(h.safe.top+8,(h.capsuleRect?.bottom||0)+6),bottom=h.h-h.safe.bottom-10,inputY=bottom-44;
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
    const body=this.body=h.node('DirectContent',n),g=h.node('DirectInk',body).addComponent(Graphics);
    body.setSiblingIndex(0);
    const button=(id:string,caption:string,bx:number,by:number,bw:number,disabled=false,primary=false,parent=body,ink=g)=>this.button(parent,ink,id,caption,bx,by,bw,disabled,primary);
    button('social:close','‹',x,top,44);
    const p=peer&&o.peer(playerId(peer))||peer,status=p?.status==='playing'?h.t('游戏中','PLAYING'):p?.status==='offline'?h.t('离线 · 可留言','OFFLINE · LEAVE A MESSAGE'):h.t('在线','ONLINE');
    const title=h.label(body,playerLabel(p||{}),x+50+(w-58)/2,top+14,16,w-58,26,C.white);title.enableWrapText=false;title.overflow=Label.Overflow.SHRINK;
    h.label(body,status,x+50+(w-58)/2,top+35,11,w-58,20,p?.status==='playing'?C.amber:p?.status==='offline'?C.dim:C.mint);
    const id=peer?playerId(peer):'',friend=o.social.friends.some(v=>playerId(v)===id),request=o.social.requests.find(v=>playerId(v)===id),cw=(w-12)/3;
    button('online:friendAction:'+(friend?'remove':request?.direction==='incoming'?'accept':request?'cancel':'request')+':'+id,h.t(friend?'移除好友':request?.direction==='incoming'?'同意好友':request?'取消申请':'添加好友',friend?'REMOVE FRIEND':request?.direction==='incoming'?'ACCEPT':request?'CANCEL REQUEST':'ADD FRIEND'),x,top+46,cw,o.socialBusy);
    button('online:invitePlayer:'+id,h.t('邀请对战','INVITE'),x+cw+6,top+46,cw,!p||!o.canInvite(p),true);
    button('social:older',h.t(o.conversationBefore?'更早消息':'刷新会话',o.conversationBefore?'OLDER':'REFRESH'),x+(cw+6)*2,top+46,cw,o.conversationLoading);
    const area={x,y:top+96,w,h:Math.max(44,inputY-top-124)},messages=o.visibleChat,font=h.w<700?13:16;
    const maxBubble=Math.min(620,w*.88);
    let total=0;const rows=messages.map(m=>{const bw=m.room?maxBubble:Math.min(maxBubble,Math.max(200,Array.from(m.text).length*font+32)),height=38+Math.max(1,Math.ceil(Array.from(m.text).length/Math.floor((bw-32)/font)))*(font+5)+(m.room?100:0);const row={y:total,height,bw};total+=height+12;return row;});
    const newest=messages.at(-1)?.id||'',oldOffset=h.listScroll.direct||0;
    if(this.lastMessage!==newest){h.listScroll.direct=Number.MAX_SAFE_INTEGER;this.lastMessage=newest;}
    else h.listScroll.direct=oldOffset;
    const list=h.listViewport(body,'direct',area,total);
    messages.forEach((m,i)=>{
      const row=rows[i],y=area.y+row.y-list.offset;if(y+row.height<area.y||y>area.y+area.h)return;
      const own=m.playerId===o.authenticatedId,bx=own?x+w-row.bw-12:x+4,bw=row.bw,textH=row.height-38-(m.room?100:0);
      h.rect(list.g,bx,y,bw,row.height,own?'#173b4fee':'#122736ee',own?'#578291':'#3c5668',8);
      h.label(list.n,(own?h.t('你','YOU'):m.nickname)+' · '+new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),bx+bw/2,y+16,11,bw-28,24,own?C.mint:C.dim).horizontalAlign=Label.HorizontalAlign.LEFT;
      h.label(list.n,m.text,bx+bw/2,y+30+textH/2,font,bw-28,textH,C.white).horizontalAlign=Label.HorizontalAlign.LEFT;
      if(m.room){
        const cardY=y+row.height-98,art=h.progressionArt.get('duel');
        h.rect(list.g,bx+12,cardY,bw-24,1,'#647a6444');
        if(art)h.coverImage(list.n,'DirectInvitationArt',art,bx+14,cardY+6,58,42);
        h.label(list.n,h.t('对战邀请 · 房间 ','INVITATION · ROOM ')+m.room.code,bx+80+(bw-94)/2,cardY+17,13,bw-94,24,C.amber).horizontalAlign=Label.HorizontalAlign.LEFT;
        h.label(list.n,h.t(m.room.canJoin?'等待加入':'已满或已关闭',m.room.canJoin?'WAITING FOR A PILOT':'FULL OR CLOSED'),bx+80+(bw-94)/2,cardY+38,11,bw-94,20,C.dim).horizontalAlign=Label.HorizontalAlign.LEFT;
        const caption=own?h.t('已发送邀请','INVITATION SENT'):h.t(m.room.canJoin?'加入对战 ›':'邀请已失效',m.room.canJoin?'JOIN BATTLE ›':'INVITATION CLOSED');
        button('online:chatJoin:'+m.id,caption,bx+bw-174,y+row.height-48,160,own||!m.room.canJoin||!!o.room||o.activity==='playing',true,list.n,list.g);
      }
    });list.finish();
    if(!messages.length)h.label(body,o.conversationLoading?h.t('正在读取会话…','LOADING…'):h.t('发送第一条消息 · 离线好友也能收到','SEND A MESSAGE · OFFLINE FRIENDS CAN READ LATER'),x+w/2,area.y+area.h/2,14,w-24,60,C.dim);
    h.label(body,o.socialStatus||o.chatStatus||h.t('私信仅双方可见 · 离线也可留言','PRIVATE · LEAVE A MESSAGE ANYTIME'),x+w/2,inputY-14,11,w-12,24,C.dim);
    h.inset(g,x,inputY,w-84,44);button('online:chatSend',h.t(o.chatSending?'发送中':'发送',o.chatSending?'SENDING':'SEND'),x+w-78,inputY,78,o.chatSending||!o.socialAvailable,true);
    if(this.composer&&this.composer.string!==o.chatDraft)this.composer.string=o.chatDraft;
  }
}
