import { _decorator, AudioClip, AudioSource, Component, EventKeyboard, EventMouse, EventTouch, Game, Input, KeyCode, Label, Material, game, input, resources, view } from 'cc';
import { activeGun, available, CAMPAIGN, createBrowserGameHost, createDuelSession, DUEL_RULES as R, selectable, transferSeconds } from './core/core.js';
import { CastleUI, W } from './CastleUI';
import { CastleWorld } from './CastleWorld';
const {ccclass,property}=_decorator;
const web=globalThis as typeof globalThis & {SmallGamesDev?:{isEnabled():boolean;registerSnapshot(fn:()=>unknown):()=>void;registerActions(actions:{id:string;label:string;run:()=>void}[]):()=>void};__castle?:{snapshot:()=>unknown}};
@ccclass('CastleCannon')
export class CastleCannon extends Component {
  @property(Material) surface:Material|null=null;
  ui!:CastleUI;world!:CastleWorld;session:Awaited<ReturnType<typeof createDuelSession>>|null=null;
  audio!:AudioSource;clips=new Map<string,AudioClip>();
  ready=false;error='';clock=0;touched=-10;selected=0;lastScreen='';lastResult='';lastDisplay='';
  pointers=new Map<number,{kind:string;hit:string|null}>();
  cleanups:(()=>void)[]=[];drawClock=0;
  onLoad(){
    this.ui=new CastleUI(this.node);this.world=new CastleWorld(this.node,this.surface!);this.audio=this.node.addComponent(AudioSource);
    for(const[event,handler]of this.handlers())input.on(event,handler as never,this);
    game.on(Game.EVENT_HIDE,this.hide,this);game.on(Game.EVENT_SHOW,this.show,this);view.on('canvas-resize',this.resize,this);
    web.addEventListener?.('blur',this.hide);web.addEventListener?.('focus',this.show);web.document?.addEventListener('visibilitychange',this.visibility);
    web.__castle=Object.freeze({snapshot:()=>this.snapshot()});
    void this.load();
  }
  handlers(){return [[Input.EventType.TOUCH_START,this.touchStart],[Input.EventType.TOUCH_MOVE,this.touchMove],[Input.EventType.TOUCH_END,this.touchEnd],[Input.EventType.TOUCH_CANCEL,this.touchCancel],[Input.EventType.MOUSE_DOWN,this.mouseDown],[Input.EventType.MOUSE_MOVE,this.mouseMove],[Input.EventType.MOUSE_UP,this.mouseUp],[Input.EventType.KEY_DOWN,this.keyDown],[Input.EventType.KEY_UP,this.keyUp]] as const;}
  async load(){
    try {
      await this.ui.load();
      const host=createBrowserGameHost({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)},session:{gameId:'castle-cannon',gameVersion:'1.0.0',adAuthority:'none',capabilities:['content','storage','advertising','telemetry']}});
      const session=await createDuelSession(host,name=>this.sound(name),!!web.SmallGamesDev?.isEnabled(),async current=>this.ui.server?.string??current);
      if(!this.isValid){await session.dispose();return;}this.session=session;this.selected=session.v.p.unlocked;
      await this.world.load();
      if(!this.isValid)return;
      for(const name of ['shot','impact','win','lose'])resources.load(name,AudioClip,(e,a)=>{if(!e&&this.isValid)this.clips.set(name,a);});
      this.cleanups.push(web.SmallGamesDev?.registerSnapshot(()=>this.snapshot())??(()=>{}));
      if(web.SmallGamesDev?.isEnabled())this.cleanups.push(web.SmallGamesDev.registerActions([{id:'castle-next',label:'试玩下一关（不计进度）',run:()=>{this.session?.previewCampaign(((this.session.v.campaignLevel??-1)+1)%120);}},{id:'castle-last',label:'试玩第120关（不计进度）',run:()=>this.session?.previewCampaign(119)}]));
      this.ready=true;this.resize();this.draw();
    }catch(e){this.error=e instanceof Error?e.message:String(e);console.error('Castle startup failed',e);this.draw();}
    web.document?.getElementById('castle-loading')?.remove();
  }
  sound(name:string){const clip=this.clips.get(name);if(clip&&this.ready&&this.session?.v.p.sound&&!web.document?.hidden){this.audio.stop();this.audio.clip=clip;this.audio.volume=0.45;this.audio.play();}}
  resize=()=>{this.cancel();this.ui.resize();this.world.resize(W,this.ui.H);this.draw();};
  hide=()=>{this.cancel();this.session?.pause();this.audio?.stop();this.draw();};
  show=()=>{if(!web.document?.hidden)this.session?.resume();this.draw();};
  visibility=()=>{if(web.document?.hidden)this.hide();else this.show();};
  cancel=()=>{this.pointers.clear();this.ui?.pressed.clear();this.session?.cancel();};
  action(id:string){
    if(!this.session)return;
    if(id.startsWith('select-level:')){this.selected=Number(id.slice(13));this.draw();return;}
    if(id==='selected-start'){if(this.selected>this.session.v.p.unlocked&&web.SmallGamesDev?.isEnabled())this.session.previewCampaign(this.selected);else this.session.action('campaign-level:'+this.selected);}
    else this.session.action(id);
    if(id==='campaign')this.selected=this.session.v.p.unlocked;
    if(id==='chapter-prev'||id==='chapter-next')this.selected=this.session.v.chapterPage*10;
    if(id==='sound'&&!this.session.v.p.sound)this.audio.stop();
    this.draw();
  }
  down(x:number,y:number,id:number){
    if(this.error){web.location?.reload();return;}if(!this.ready||!this.session)return;
    const c=this.ui.at(x,y),hit=c?.id??null;
    if(c?.disabled){this.pointers.set(id,{kind:'blocked',hit});return;}
    this.pointers.set(id,{kind:hit&&hit!=='fire'&&hit!=='crouch'?'button':'gesture',hit});
    if(hit)this.ui.pressed.add(hit);
    if(!hit||hit==='fire'||hit==='crouch')this.session.input('down',id,x,y,hit);
    this.draw();
  }
  move(x:number,y:number,id:number){const p=this.pointers.get(id);if(!p||!this.session)return;
    if(p.kind==='gesture'){
      if((p.hit==='fire'||p.hit==='crouch')&&this.ui.at(x,y)?.id!==p.hit){this.session.input('cancel',id,x,y,p.hit);this.ui.pressed.delete(p.hit);this.pointers.delete(id);}
      else this.session.input('move',id,x,y,this.ui.at(x,y)?.id??null);
    }
  }
  up(x:number,y:number,id:number,cancel=false){const p=this.pointers.get(id);if(!p||!this.session)return;this.pointers.delete(id);if(p.hit)this.ui.pressed.delete(p.hit);
    if(p.kind==='gesture')this.session.input(cancel?'cancel':'up',id,x,y,this.ui.at(x,y)?.id??null);
    else if(!cancel&&p.kind==='button'&&this.ui.at(x,y)?.id===p.hit)this.action(p.hit!);this.draw();
  }
  touchStart(e:EventTouch){this.touched=this.clock;const p=e.getUILocation();this.down(p.x,this.ui.H-p.y,e.getID()??0);}
  touchMove(e:EventTouch){const p=e.getUILocation();this.move(p.x,this.ui.H-p.y,e.getID()??0);}
  touchEnd(e:EventTouch){const p=e.getUILocation();this.up(p.x,this.ui.H-p.y,e.getID()??0);}
  touchCancel(e:EventTouch){const p=e.getUILocation();this.up(p.x,this.ui.H-p.y,e.getID()??0,true);}
  mouseDown(e:EventMouse){if(this.clock-this.touched<0.7||e.getButton()!==0)return;const p=e.getUILocation();this.down(p.x,this.ui.H-p.y,-2);}
  mouseMove(e:EventMouse){const p=e.getUILocation();this.move(p.x,this.ui.H-p.y,-2);}
  mouseUp(e:EventMouse){const p=e.getUILocation();this.up(p.x,this.ui.H-p.y,-2);}
  keyDown(e:EventKeyboard){if(!this.session)return;const s=this.session;
    if(e.keyCode===KeyCode.ESCAPE){if(s.v.screen==='playing')this.action('leave');else if(['confirm','paused'].includes(s.v.screen))this.action('resume');else this.action('home');return;}
    if(s.v.screen!=='playing')return;
    if(e.keyCode===KeyCode.SPACE||e.keyCode===KeyCode.KEY_C){const hit=e.keyCode===KeyCode.SPACE?'fire':'crouch',id=e.keyCode===KeyCode.SPACE?-3:-4;if(this.pointers.has(id))return;this.pointers.set(id,{kind:'gesture',hit});this.ui.pressed.add(hit);s.input('down',id,0,0,hit);}
    if([KeyCode.ARROW_UP,KeyCode.ARROW_DOWN,KeyCode.ARROW_LEFT,KeyCode.ARROW_RIGHT].includes(e.keyCode)){s.input('down',-5,0,0,null);s.input('move',-5,e.keyCode===KeyCode.ARROW_LEFT?-10:e.keyCode===KeyCode.ARROW_RIGHT?10:0,e.keyCode===KeyCode.ARROW_UP?-10:e.keyCode===KeyCode.ARROW_DOWN?10:0,null);s.input('up',-5,0,0,null);}
  }
  keyUp(e:EventKeyboard){if(e.keyCode===KeyCode.SPACE)this.up(0,0,-3);if(e.keyCode===KeyCode.KEY_C)this.up(0,0,-4);}
  update(dt:number){this.clock+=dt;if(!this.ready||!this.session)return;
    this.session.tick(dt);
    this.world.update(this.session.v);
    const v=this.session.v;
    if(v.screen!==this.lastScreen){this.lastScreen=v.screen;this.pointers.clear();this.ui.pressed.clear();}
    if(v.duel.result&&this.lastResult!==v.matchId){this.lastResult=v.matchId;this.sound(v.duel.result.winner===v.side?'win':'lose');}
    this.drawClock+=dt;if(this.drawClock>=1/20){this.drawClock=0;this.draw();}
  }
  draw(){
    const u=this.ui;if(!u)return;u.begin();const h=u.H,b=u.bottom,t=u.top;
    if(!this.ready||!this.session){u.text('loading',this.error?'装载失败':'一炮拆城',180,h/2-30,30);u.text('loading-detail',this.error?'点击重试 · '+this.error:'正在装载原城堡与炮手…',180,h/2+20,15,310,'#fff1cd',90);u.end();return;}
    const v=this.session.v,me=v.duel.fighters[v.side],enemy=v.duel.fighters[v.side===0?1:0],g=activeGun(me),row=Math.max(50,u.hitSize),mode=v.campaignLevel!==null?`战役 ${v.campaignLevel+1}/120`:v.mode==='human'?'真人对战':v.mode==='bot'?'在线练习':'本地练习';
    const title=(text:string)=>{u.button('home','‹',10,t,50,row);u.panel('heading',72,t,276,64);u.text('title',text,210,t+31,27,245);};
    if(v.screen==='home'){
      u.panel('hero-title',28,t+35,304,121);u.text('game-title','一炮拆城',180,t+85,46,284);u.text('tagline','隔城互轰 · 炮手生存',180,t+130,17);
      const y=h-b-236;u.rect('home-shade',0,y-18,W,h-y+18,'#142331c5');u.button('start','开始对战',18,y,324,76,true);
      u.button('campaign','战役选关',18,y+85,157,56);u.button('practice','机器人练习',185,y+85,157,56);
      ['外观','帮助','设置'].forEach((text,i)=>u.button(['skins','help','settings'][i],text,18+i*110,y+151,104,54));
      u.text('progress',`已通关 ${v.p.cleared.length}/120 · 材料 ${v.p.materials}`,180,h-b-11,12);
    }else if(v.screen==='campaign'){
      title('战役选关');u.button('chapter-prev','‹',16,t+76,50,row,false,v.chapterPage===0);u.text('chapter',`第 ${v.chapterPage+1} 章 / 12`,180,t+100,22,220);u.button('chapter-next','›',294,t+76,50,row,false,v.chapterPage===11);
      const start=t+138,cellH=Math.max(row,Math.min(57,(h-b-start-186)/5-6));
      for(let slot=0;slot<10;slot++){const i=v.chapterPage*10+slot,l=CAMPAIGN[i],locked=i>v.p.unlocked;u.button('select-level:'+i,`${i+1}  ${v.p.cleared.includes(l.id)?'已通过':locked?'未解锁':l.name}`,16+(slot%2)*169,start+Math.floor(slot/2)*(cellH+6),159,cellH,this.selected===i,locked&&!web.SmallGamesDev?.isEnabled());}
      const y=start+5*(cellH+6)+3,l=CAMPAIGN[this.selected];u.panel('level-detail',16,y,328,h-b-y-8);u.text('level-name',`${this.selected+1} · ${l.name}`,180,y+24,21,300);u.text('level-hint',l.hint,180,y+55,15,296);u.text('level-reward',`首次胜利 +${l.reward} 材料${this.selected>v.p.unlocked?' · 开发试玩':''}`,180,y+80,13);
      u.button('selected-start','开始战役',40,y+99,280,Math.max(52,row),true,this.selected>v.p.unlocked&&!web.SmallGamesDev?.isEnabled());
    }else if(v.screen==='maps'||v.screen==='matching'){
      title(v.screen==='maps'?'机器人练习':'寻找对手');const y=h*0.46;u.panel('mode-panel',22,y,316,206);u.text('mode-name',v.screen==='maps'?'双城峡谷':`等待匹配 · ${Math.ceil(v.waiting)}秒`,180,y+42,27,288);u.text('mode-info',v.screen==='maps'?'同样的弹道、装填与补给':'服务不可用时自动进入本地练习',180,y+85,15,288);u.button(v.screen==='maps'?'map-ravine':'cancel-match',v.screen==='maps'?'开始练习':'取消匹配',46,y+123,268,60,v.screen==='maps');
    }else if(['playing','paused','confirm','result'].includes(v.screen)){
      u.button('leave','‹',10,t,50,row,false,v.screen!=='playing');u.text('battle-mode',mode,207,t+22,19,250);
      for(const[p,i]of [[me,0],[enemy,1]] as const){const x=i?190:10;u.panel('hp-panel'+i,x,t+58,160,58);u.text('hp'+i,`${i?'对手':'我方'}  ${Math.ceil(p.hp)}`,x+80,t+79,18,140);u.bar('hp-bar'+i,p.hp/R.hp,x+12,t+99,136,i?'#dd6757':'#6ebef1');}
      const dockStep=row+8,dockHeight=2*dockStep+116,bottomY=h-b-dockHeight;
      if(v.screen==='playing'){
        u.button('scope',v.scope?'收镜':'望远镜',284,t+130,66,52,v.scope);
        u.panel('angle-panel',10,t+130,90,67);u.text('angle',g?`${g.pitch.toFixed(0)}°`:'转移中',55,t+154,25,76);u.text('angle-name','拖动抬角',55,t+180,12,76);
        if(v.scope)u.text('scope-help','望远镜 · 拖动观察',180,t+210,15);
        u.text('preview-label',g?`${g.charge===null?'预览蓄力':'蓄力'} ${Math.round(this.world.trajectory.power*100)}%`:'前往炮位后可瞄准',180,bottomY-31,15);
        const status=this.session.online&&v.message?v.message:me.route.length?`正在换位 · ${transferSeconds(me).toFixed(1)}秒`:me.healing!==null?`治疗中 ${Math.ceil(R.healSeconds-me.healing)}秒`:me.crouched?'趴下掩护 · 松手起身':me.node==='shelter'?`地堡医疗 · 剩余 ${me.medicines} 次`:g&&g.reload<1?`装填中 · ${Math.ceil((1-g.reload)*(g.bunker?R.bunkerReload:R.reload))}秒`:v.developer?'开发试玩 · 不保存进度':v.message;
        if(status)u.text('status',status,180,bottomY-57,14,330,'#fff1cd',40);
        u.panel('battle-dock',2,bottomY-8,356,dockHeight+8);
        const guns=me.guns.filter(g=>selectable(me,g));guns.forEach((gun,i)=>u.button('station:'+gun.id,gun.label,14+i*(332/guns.length),bottomY,332/guns.length-6,row,me.station===gun.id));
        u.button('solid','实心弹',14,bottomY+dockStep,160,row,g?.ammo==='solid',!g);u.button('blast','爆破弹',184,bottomY+dockStep,160,row,g?.ammo==='blast',!g);
        u.button('retreat',`回地堡\n医疗 ${me.medicines}`,14,bottomY+2*dockStep+6,86,86,false,!!me.route.length&&me.destination==='shelter');u.button('crouch','按住\n趴下',108,bottomY+2*dockStep+6,86,86,me.crouched,!g||!!me.route.length);
        const disabled=!g||!available(me,g)||g.reload<1||me.crouched||!!me.route.length||me.healing!==null;
        u.button('fire',g&&g.charge!==null?`松手发射\n${Math.round(this.world.trajectory.power*100)}%`:disabled?'装填 / 就位':'按住蓄力',224,bottomY+2*dockStep,100,100,true,disabled,true);u.charge(224,bottomY+2*dockStep,100,g?.charge!==null&&g?.charge!==undefined?this.world.trajectory.power:g?.reload??0);
      }
      if(v.screen==='confirm'||v.screen==='paused'){
        u.controls=[];u.rect('dim',0,0,W,h,'#0c1826b9');const y=(h-310)/2;u.panel('exit-panel',24,y,312,310);u.text('exit-title','离开战场？',180,y+62,33,280);u.text('exit-state',this.session.online?'对局仍继续，角色仍会受伤':`${v.campaignLevel===null?'本地练习':'战役'}已暂停`,180,y+108,15,278);
        u.button('resume','继续战斗',48,y+155,264,61,true);u.button('leave-confirm','返回首页',48,y+227,264,58);
      }else if(v.screen==='result'){
        u.controls=[];u.rect('dim',0,0,W,h,'#0c18268a');const y=(h-430)/2,result=v.duel.result!,won=result.winner===v.side;u.panel('result-panel',20,y,320,430);u.text('result-title',result.winner===null?'平局':won?'胜利':'战败',180,y+65,52);u.text('result-reason',result.reason==='death'?'炮手生命归零':result.reason==='inactive'?'长时间未操作':result.reason==='time'?'对局时间已到':result.reason==='disconnect'?'连接中断':'一方离开对局',180,y+115,18);
        u.text('result-time',`${mode} · 坚守 ${Math.floor(v.duel.time)} 秒`,180,y+154,17);u.text('result-reward',v.developer?'开发试玩 · 不结算奖励':v.message||`我方生命 ${Math.ceil(me.hp)}`,180,y+196,17,278,'#ffe0a0',56);
        const next=v.campaignLevel!==null&&won&&v.campaignLevel<119;
        u.button(next?'campaign-next':v.campaignLevel!==null?'campaign-retry':'rematch',next?'下一关':'再战',44,y+245,272,61,true);
        if(v.campaignLevel!==null){u.button('campaign','战役选关',44,y+317,132,54);u.button('home','返回首页',184,y+317,132,54);}else u.button('home','返回首页',44,y+317,272,54);
      }
    }else{
      title(v.screen==='settings'?'设置':v.screen==='skins'?'炮手外观':'炮手手册');const y=Math.max(t+100,h*0.22);u.panel('menu-panel',16,y,328,h-b-y-10);
      if(v.screen==='settings'){
        [['sound',`音效  ${v.p.sound?'开':'关'}`],['motion',`动作  ${v.p.motion?'开':'关'}`],['lowPower',`画质  ${v.p.lowPower?'省电':'标准'}`]].forEach(([id,text],i)=>u.button(id,text,36,y+24+i*(row+12),288,row,v.p[id as 'sound'|'motion'|'lowPower']));
        const sy=y+38+3*(row+12);u.text('server-title','对战服务地址（留空为当前站点）',180,sy,14,290);u.sprite('server-bg','blue',30,sy+18,300,row);u.serverField(v.address,sy+18);u.button('server','保存对战服务',36,sy+row+30,288,row);
        u.text('settings-message',v.message||'进度保存在本机，清理浏览器数据会丢失',180,h-b-38,13,288,'#ffe0a0',40);
      }else if(v.screen==='skins'){
        u.text('materials',`材料 ${v.p.materials} · 外观不影响能力`,180,y+38,17,290);
        ['蓝衣炮手','金色纹章','铜色纹章'].forEach((text,i)=>u.button('skin:'+i,`${text}\n${v.p.skin===i?'已装备':v.p.owned.includes(i)?'选择':'40 材料解锁'}`,38,y+80+i*92,284,78,v.p.skin===i,!v.p.owned.includes(i)&&v.p.materials<40));
      }else{
        const lines=['拖动画面：调整仰角与左右瞄准','按住蓄力，松手发射；金色虚线为预瞄','空闲按 65% 预览；蓄力时实时更新','望远镜内拖动只改变观察方向','点炮位换位，装填完成即可再次开火','按住趴下躲炮；回地堡可有限治疗','城毁后使用地堡炮，内部仍会受伤','键盘：方向键瞄准 / 空格蓄力 / C趴下','返回直接确认；联机对局不会暂停'];
        lines.forEach((text,i)=>u.text('help:'+i,text,180,y+36+i*37,14,296));
      }
    }
    u.end();const display=['playing','paused','confirm','result'].includes(v.screen)?'playing':'home';if(display!==this.lastDisplay){this.lastDisplay=display;if(web.parent!==web.window)web.parent.postMessage({type:'small-games:display-state',gameId:'castle-cannon',screen:display},web.location.origin);}
  }
  snapshot(){const v=this.session?.v;return JSON.parse(JSON.stringify({ready:this.ready,renderer:'cocos',engine:'Cocos Creator 3.8.8',screen:v?.screen??'loading',error:this.error,controls:this.ui?.controls??[],width:W,height:this.ui?.H,scale:this.ui?.scale,side:v?.side,fighters:v?.duel.fighters,scope:v?.scope,scopeX:v?.scopeX,scopeY:v?.scopeY,duelTime:v?.duel.time,trajectory:this.world?.trajectory,online:this.session?.online,mode:v?.mode,campaignLevel:v?.campaignLevel,chapterPage:v?.chapterPage,selected:this.selected,progress:v?.p,developer:v?.developer,structures:v?.duel.structures,result:v?.duel.result,shells:v?.duel.shells,impacts:v?.duel.impacts,assets:{meshes:this.world?.meshes.size,materials:this.world?.materials.size,textures:this.world?.textures.size},labels:Array.from(this.ui?.nodes??[]).filter(([,n])=>n.active&&n.getComponent(Label)).map(([id,n])=>({id,text:n.getComponent(Label)!.string})),pointerCount:this.pointers.size}));}
  onDestroy(){this.ready=false;this.cancel();for(const[event,handler]of this.handlers())input.off(event,handler as never,this);game.off(Game.EVENT_HIDE,this.hide,this);game.off(Game.EVENT_SHOW,this.show,this);view.off('canvas-resize',this.resize,this);web.removeEventListener?.('blur',this.hide);web.removeEventListener?.('focus',this.show);web.document?.removeEventListener('visibilitychange',this.visibility);this.cleanups.forEach(fn=>fn());void this.session?.dispose();this.audio?.stop();this.ui?.dispose();this.world?.dispose();delete web.__castle;}
}
