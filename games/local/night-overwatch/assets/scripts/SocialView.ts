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
  private box={x:0,y:0,w:400,h:320};
  constructor(h:HUD){this.h=h;}
  private discard(node?:Node){
    if(!node||!isValid(node))return;
    this.h.buttons=this.h.buttons.filter(b=>{for(let p:Node|null=b.label.node;p;p=p.parent)if(p===node)return false;return true;});node.destroy();
  }
  private button(parent:Node,g:Graphics,id:string,text:string,x:number,y:number,w:number,disabled=false,primary=false){
    return this.h.dialogButton(parent,g,id,text,x,y,w,primary?'primary':'secondary','',44,disabled);
  }

  updateBanner(){
    const h=this.h,o=h.online,notice=o?.notification&&performance.now()<o.notificationUntil?o.notification:undefined;
    const major=h.majorUpdate&&!h.updatesOpen;
    const visible=!!o&&!o.socialOpen&&!o.friendRemoval&&!h.updatesOpen&&!h.storageError;
    const key=[visible,notice?.id,o?.directUnread,o?.incomingFriends,o?.chatRetryPending,major,o?.updateNotice,h.w,h.h,h.lang,h.safe.top,h.modalKey].join(':');
    if(key===this.bannerKey&&this.banner&&isValid(this.banner))return;
    this.bannerKey=key;this.discard(this.banner);this.banner=undefined;
    if(!visible||!notice&&!o!.directUnread&&!o!.incomingFriends&&!o!.chatRetryPending&&!((major||o!.updateNotice)&&h.modalKey==='home'))return;
    const n=this.banner=h.node('SocialNotice',h.globalControls),g=n.addComponent(Graphics);
    const right=h.w-h.safe.right-16,top=Math.max(h.safe.top+52,(h.capsuleRect?.bottom||0)+8);
    // Version news belongs to the corner; direct messages keep their own speech bubble.
    if((major||o!.updateNotice)&&h.modalKey==='home'){
      const w=140,x=right-w,y=top;
      h.rect(g,x,y+6,w,32,'#0b1c2de8','#365269',9);
      g.fillColor=col('#ee6a62');g.circle(x+13-h.w/2,h.h/2-y-22,3.5);g.fill();
      h.button(o!.updateNotice?'online:version':'social:updates',h.t(o!.updateNotice?'发现新版本':'更新日志',o!.updateNotice?'NEW VERSION':'WHAT’S NEW'),x+22,y,w-22,44,n).fontSize=12;
    }
    if(notice){
      const w=Math.min(340,h.w-h.safe.left-h.safe.right-32),x=right-w,y=top+((major||o!.updateNotice)&&h.modalKey==='home'?46:0);
      h.rect(g,x-2,y+4,w+4,80,'#020a1466',undefined,15);
      h.rect(g,x,y,w,76,'#315e77fa','#99c8da',13);
      g.fillColor=col('#315e77');g.moveTo(x+24-h.w/2,h.h/2-y-74);g.lineTo(x+24-h.w/2,h.h/2-y-85);g.lineTo(x+38-h.w/2,h.h/2-y-74);g.close();g.fill();
      h.controlIcon(g,'message',x+24,y+23,20,C.mint);
      h.label(n,notice.nickname,x+44+(w-96)/2,y+22,13,w-96,24,C.mint).horizontalAlign=Label.HorizontalAlign.LEFT;
      const preview=h.label(n,notice.text,x+16+(w-68)/2,y+51,13,w-68,26,C.white);preview.enableWrapText=false;preview.overflow=Label.Overflow.SHRINK;preview.horizontalAlign=Label.HorizontalAlign.LEFT;
      h.button('social:reply','',x,y,w-48,76,n).node.name=h.t('打开私信','OPEN MESSAGE');
      h.dialogButton(n,g,'social:dismiss','',x+w-48,y+4,44,'quiet','close');
    }else if(o!.directUnread||o!.incomingFriends||o!.chatRetryPending){
      const w=148,x=right-w,y=h.h-h.safe.bottom-54;
      h.rect(g,x,y+3,w,38,'#153147f5','#52798d',19);
      h.controlIcon(g,'message',x+22,y+22,18,C.mint);
      h.button('social:inbox',h.t(o!.chatRetryPending?'消息待重试':o!.directUnread?`未读消息 ${o!.directUnread}`:`好友申请 ${o!.incomingFriends}`,o!.chatRetryPending?'RETRY MESSAGE':o!.directUnread?`MESSAGES ${o!.directUnread}`:`REQUESTS ${o!.incomingFriends}`),x+38,y,w-38,44,n).fontSize=12;
    }
  }

  renderRemoval(n:Node,g:Graphics){
    const h=this.h,o=h.online!;
    const {x,y,w,h:height}=h.dialog(n,g,{width:420,height:210,title:h.t('移除好友','REMOVE FRIEND'),close:'social:removeClose'});
    h.label(n,h.t(`确定移除 ${playerLabel(o.friendRemoval!)}？\n聊天记录会保留，之后可重新申请好友。`,`Remove ${playerLabel(o.friendRemoval!)}?\nChat history is kept.`),x+w/2,y+101,14,w-40,76,C.dim);
    this.button(n,g,'social:removeCancel',h.t('取消','CANCEL'),x+16,y+height-56,(w-40)/2);
    this.button(n,g,'social:removeConfirm',h.t('确认移除','REMOVE'),x+24+(w-40)/2,y+height-56,(w-40)/2,false,true);
  }

  render(n:Node,initial=false){
    const h=this.h,o=h.online!,peer=o.chatPeer;
    if(initial)this.box=h.dialog(n,n.addComponent(Graphics),{width:400,height:330,position:'right',close:'social:close',dim:'#03091244',background:'#29485bfa'});
    const {x,y,w,h:height}=this.box,top=y+4,bottom=y+height-12,inputY=bottom-44;
    if(initial){
      const field=h.node('DirectComposer',n),fw=w-104;
      field.active=false;field.setPosition(x+12+fw/2-h.w/2,h.h/2-inputY-22);field.getComponent(UITransform)!.setContentSize(fw-16,44);
      const edit=this.composer=field.addComponent(EditBox);edit.textLabel=h.label(field,'',h.w/2,h.h/2,16,fw-20,42);
      edit.placeholderLabel=h.label(field,h.t('回复这位玩家…','Reply to this pilot…'),h.w/2,h.h/2,13,fw-20,42,'#c8dfe8');
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
    const p=peer&&o.peer(playerId(peer))||peer;
    const title=h.label(body,p?.nickname||p?.name||h.t('私信','MESSAGE'),x+18+(w-82)/2,top+19,16,w-82,26,C.white);title.enableWrapText=false;title.horizontalAlign=Label.HorizontalAlign.LEFT;title.overflow=Label.Overflow.SHRINK;title.isBold=true;
    h.label(body,playerId(p||{})?playerLabel(p||{}).split(' ').at(-1)!+' · '+h.t(p?.status==='offline'?'离线留言':'私信',p?.status==='offline'?'OFFLINE MESSAGE':'PRIVATE'):h.t('私信','PRIVATE'),x+18+(w-82)/2,top+38,10,w-82,18,'#d0e6ef').horizontalAlign=Label.HorizontalAlign.LEFT;
    const history=!!o.conversationBefore||o.conversationFailed;
    if(history)button('social:older',h.t(o.conversationBefore?'更早消息':'重新读取',o.conversationBefore?'OLDER MESSAGES':'RETRY'),x+12,top+52,w-24,o.conversationLoading);
    const area={x:x+12,y:top+(history?100:58),w:w-24,h:Math.max(44,inputY-top-(history?128:86))},messages=o.visibleChat,font=13;
    const maxBubble=area.w-16;
    let total=0;const rows=messages.map(m=>{const bw=m.room?maxBubble:Math.min(maxBubble,Math.max(200,Array.from(m.text).length*font+32)),height=38+Math.max(1,Math.ceil(Array.from(m.text).length/Math.floor((bw-32)/font)))*(font+5)+(m.room?100:0);const row={y:total,height,bw};total+=height+12;return row;});
    const newest=messages.at(-1)?.id||'',oldOffset=h.listScroll.direct||0;
    if(this.lastMessage!==newest){h.listScroll.direct=Number.MAX_SAFE_INTEGER;this.lastMessage=newest;}
    else h.listScroll.direct=oldOffset;
    const list=h.listViewport(body,'direct',area,total);
    messages.forEach((m,i)=>{
      const row=rows[i],y=area.y+row.y-list.offset;if(y+row.height<area.y||y>area.y+area.h)return;
      const own=m.playerId===o.authenticatedId,bx=own?area.x+area.w-row.bw-8:area.x+4,bw=row.bw,textH=row.height-38-(m.room?100:0);
      h.rect(list.g,bx,y,bw,row.height,own?'#3f7084ff':'#355c71ff',own?'#a2d5da':'#7baabd',8);
      h.label(list.n,(own?h.t('你','YOU'):m.nickname)+' · '+new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),bx+bw/2,y+16,11,bw-28,24,own?'#c0f0f3':'#d6e9ef').horizontalAlign=Label.HorizontalAlign.LEFT;
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
    if(!messages.length)h.label(body,o.conversationLoading?h.t('正在读取会话…','LOADING…'):h.t('发送第一条消息 · 离线好友也能收到','SEND A MESSAGE · OFFLINE FRIENDS CAN READ LATER'),x+w/2,area.y+area.h/2,13,w-48,60,'#d0e6ef');
    h.label(body,o.socialStatus||o.chatStatus||h.t('私信仅双方可见 · 离线也可留言','PRIVATE · LEAVE A MESSAGE ANYTIME'),x+w/2,inputY-14,11,w-12,24,'#d0e6ef');
    h.rect(g,x+12,inputY,w-104,44,'#091725','#345064',8);button('online:chatSend',h.t(o.chatSending?'发送中':o.chatRetryPending?'重试':'发送',o.chatSending?'SENDING':o.chatRetryPending?'RETRY':'SEND'),x+w-84,inputY,72,o.chatSending||!o.socialAvailable,true);
    if(this.composer&&this.composer.string!==o.chatDraft)this.composer.string=o.chatDraft;
  }
}
