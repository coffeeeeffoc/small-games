import Phaser from 'phaser';
import './style.css';
import { Puzzle, FixedClock, type Mode } from './game';
import { WIDTH, type Fold } from './geometry';
import { levels } from './levels';
import { STEP } from './physics';
import { Paper } from './paper';
import { HintGuide, plans } from './hints';
import { freshProgress, readProgress, recordWin, saveProgress } from './progress';
import { tone } from './sound';
import { TEXT as T, creaseName } from './strings';
import { blankPaper, gestureTarget, swipeProgress } from './gestures';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <main class="workspace">
    <section class="paper-frame" aria-label="${T.subtitle}">
      <div class="play-hud"><div class="hud-state"><span id="page"></span><span id="key"></span><span id="status"></span></div><div class="hud-actions"><button id="help" aria-label="${T.help}" title="${T.help} (?)">?</button><button id="show-hint" aria-label="${T.hint}" title="${T.hint} (H)">${T.hint}<kbd>H</kbd></button><button id="restart" aria-label="${T.restart}" title="${T.restart} (R)">↻<kbd>R</kbd></button><button id="pause" aria-label="${T.pause}" title="${T.pause} (Esc)">Ⅱ</button></div></div>
      <div id="stage"></div><div id="hint" class="scene-note"></div>
    </section>
    <div class="controls"><div class="movement"><button data-control="left" aria-label="${T.moveLeft}">←<kbd>A</kbd></button><button data-control="right" aria-label="${T.moveRight}">→<kbd>D</kbd></button></div><div class="fold-controls"><div id="creases" aria-label="${T.select}"></div><button id="fold" class="primary"><span id="fold-label">${T.fold}</span><kbd>F</kbd></button></div><button class="jump" data-control="jump" aria-label="${T.jump}">↑ <span>${T.jump}</span><kbd>空格</kbd></button></div>
  </main><p class="rotate">↻ ${T.rotate}</p><div id="message" role="status" aria-live="polite"></div><div id="overlay"></div>`;
const el=<E extends HTMLElement=HTMLElement>(id:string):E=>document.getElementById(id) as E;
const button=(id:string):HTMLButtonElement=>el<HTMLButtonElement>(id);
let progress=freshProgress();try{progress=readProgress(localStorage);}catch{/* Storage itself may be unavailable. */}
let scene:FoldScene;
let index=0,game=new Puzzle(levels[0]),guide=new HintGuide(plans[0]);
let selected:Fold={crease:'A',direction:'right-to-left'};
type Menu='start'|'levels'|'hint'|'help'|null;
let menu:Menu='start',returnMenu:Menu=null,returnToPause=false,hintTier=0;
let lastMode:Mode='PAUSED',lastMessage='',messageUntil=0,overlayKey='';
let drag:{id:number;x:number;y:number;scale:number;sign:number;active:boolean}|null=null;
const clock=new FixedClock(),keys=new Set<string>(),touches=new Map<number,string>();
// Phaser may dispatch its pending queue again before the next frame.
const handledKeys=new WeakSet<KeyboardEvent>();
let jumpQueued=false;
const playable=():boolean=>!menu&&game.mode==='PLAYING';
function clearInput():void{keys.clear();touches.clear();jumpQueued=false;document.querySelectorAll('[data-control]').forEach(b=>b.removeAttribute('data-active'));clock.reset();}
function toast(message:string):void{el('message').textContent=message;messageUntil=performance.now()+3100;}
function save():void{try{if(!saveProgress(localStorage,progress))toast(T.savedError);}catch{toast(T.savedError);}}
function options():Fold[]{return game.level.creases.flatMap(c=>c.directions.map(direction=>({crease:c.id,direction})));}
function choose(option:Fold):void{if(game.fold||!playable())return;selected=option;renderCreases();}
function renderCreases():void{
  el('creases').replaceChildren(...options().map((option,i)=>{
    const b=document.createElement('button');
    b.textContent=`${creaseName(option.crease)} ${option.direction==='right-to-left'?'←':'→'}`;
    b.title=`${creaseName(option.crease)} · ${option.direction==='right-to-left'?T.right:T.left} (${i+1} / C)`;
    b.setAttribute('aria-label',`${creaseName(option.crease)}：${option.direction==='right-to-left'?T.right:T.left}`);
    b.setAttribute('aria-pressed',String(selected.crease===option.crease&&selected.direction===option.direction));
    b.dataset.crease=option.crease;b.onclick=()=>choose(option);return b;
  }));
}
function begin(i:number):void{
  if(i<0||i>=levels.length||i>=progress.unlocked)return;
  index=i;game=new Puzzle(levels[i]);guide=new HintGuide(plans[i]);selected=options()[0];menu=null;drag=null;hintTier=0;
  clearInput();lastMode='PLAYING';lastMessage='';el('message').textContent='';
  el('page').textContent=`${String(i+1).padStart(2,'0')} / ${levels.length}`;
  el('page').title=game.level.title;el('page').setAttribute('aria-label',`${T.page} ${i+1}: ${game.level.title}`);
  renderCreases();renderOverlay();scene?.sound.setMute(progress.muted);
}
function restart():void{game.restart();guide=new HintGuide(plans[index]);hintTier=0;drag=null;lastMessage='';el('message').textContent='';clearInput();renderOverlay();}
function requestFold(unfold=game.fold!==null):void{
  if(menu)return;
  if(game.request(unfold?null:selected)){clearInput();drag=null;scene?.playTone('fold');}else if(game.message)toast(game.message);
}
function closeMenu():void{menu=returnMenu;if(!menu&&!returnToPause)game.resume();clearInput();renderOverlay();}
function openMenu(value:Menu):void{
  if(value==='hint'&&game.mode==='FOLD_ANIMATING')return;
  returnMenu=menu==='start'?'start':null;returnToPause=game.mode==='PAUSED';game.pause();menu=value;drag=null;clearInput();
  if(value==='hint'){hintTier=0;guide.update(game);}renderOverlay();
}
function pause():void{
  if(menu&&menu!=='start'){closeMenu();return;}
  if(menu)return;
  if(game.mode==='FOLD_PREVIEW'){game.cancelPreview();drag=null;clearInput();return;}
  if(game.mode==='PAUSED')game.resume();else game.pause();clearInput();renderOverlay();
}
function revealHint():void{if(menu==='hint'){hintTier=Math.min(2,hintTier+1);renderOverlay();}else if(playable()||game.mode==='PAUSED')openMenu('hint');}
const timeLabel=():string=>`${Math.floor(game.elapsed/60)}:${String(Math.floor(game.elapsed)%60).padStart(2,'0')}`;
function renderOverlay():void{
  const key=`${menu}/${game.mode}/${index}/${progress.unlocked}/${hintTier}/${guide.stage}`;
  if(key===overlayKey)return;overlayKey=key;
  const overlay=el('overlay');let html='';
  if(menu==='start')html=`<div class="intro-card"><div class="eyebrow">${T.subtitle}</div><div class="title-art" aria-hidden="true"><span></span><span></span><i>· ·</i></div><h1>折叠<br><em>世界</em></h1><p>${T.intro}</p><button class="primary large" data-action="start">${T.start} ↗</button><p class="fine">${levels.length} ${T.pages} · ${T.introSmall}</p><button data-action="levels">${T.levels}</button><button data-action="help">${T.help}</button></div>`;
  else if(menu==='levels')html=`<div class="modal chapters"><div class="eyebrow">${T.title}</div><h2>${T.levels}</h2>${[0,10].map((start,part)=>`<h3>${part?T.advanced:T.basics}</h3><div class="level-grid">${levels.slice(start,part?levels.length:10).map((l,j)=>{const i=start+j;return `<button data-level="${i}" ${i>=progress.unlocked?'disabled':''}><span>${String(i+1).padStart(2,'0')}</span><strong>${l.title}</strong><small>${i>=progress.unlocked?T.locked:progress.best[String(i+1)]!==undefined?`${T.best}: ${progress.best[String(i+1)]}`:T.play+' ↗'}</small></button>`;}).join('')}</div>`).join('')}<button data-action="back">← ${T.back}</button></div>`;
  else if(menu==='hint'){
    const hint=guide.get(game,hintTier);
    html=`<div class="modal hint-card"><div class="eyebrow">${T.hintStage} ${hint.stage+1} / ${hint.stages} · ${T.hintLevel} ${hintTier+1} / 3</div><h2>${T.hintTitle}</h2><p id="hint-text">${hint.text}</p><p class="fine">${T.hintPaused}</p><div class="dialog-actions"><button data-action="hint-more" ${hintTier===2||hint.recovery?'disabled':''}>${hintTier===2?T.lastHint:T.moreHint}</button><button class="primary" data-action="back">${T.closeHint}</button></div>${hint.recovery?`<button data-action="replay">↻ ${T.restart}</button>`:''}</div>`;
  }else if(menu==='help')html=`<div class="modal compact help-card"><div class="eyebrow">${T.title}</div><h2>${T.help}</h2><dl>${[[T.movementHelp,'A / D · ← / →'],[T.jump,'空格'],[T.foldHelp,'F'],[T.creaseHelp,'1 / 2 / 3 · C'],[T.hintHelp,'H'],[T.restart,'R'],[T.pauseHelp,'Esc']].map(([label,key])=>`<div><dt>${label}</dt><dd>${key}</dd></div>`).join('')}</dl><p>${T.touchHelp}</p><p>${T.safetyHelp}</p><button class="primary" data-action="back">${T.back}</button></div>`;
  else if(game.mode==='PAUSED')html=`<div class="modal compact"><div class="eyebrow">${T.page} ${index+1} / ${levels.length} · ${game.level.title}</div><h2>${T.paused}</h2><p>${T.folds}: ${game.folds} · ${T.time}: ${timeLabel()}</p><button class="primary large" data-action="resume">${T.resume} →</button><div class="pause-grid"><button id="chapters" data-action="levels">${T.levels}</button><button data-action="hint">${T.hint} (H)</button><button data-action="help">${T.help}</button><button id="sound" data-action="sound" aria-pressed="${progress.muted}">${progress.muted?T.quiet:T.sound}</button><button id="fullscreen" data-action="fullscreen" ${!document.documentElement.requestFullscreen?'hidden':''}>⛶ ${T.fullscreen}</button><button data-action="replay">↻ ${T.restart}</button></div></div>`;
  else if(game.mode==='COMPLETED')html=`<div class="modal compact"><div class="eyebrow">${T.page} ${index+1} / ${levels.length} · ${game.level.title}</div><div class="finish-mark">✓</div><h2>${index===levels.length-1?T.finish:T.cleared}</h2><p>${T.folds}: ${game.folds} · ${T.unfoldCount}: ${game.unfolds} · ${T.time}: ${timeLabel()}</p><button class="primary large" data-action="next">${index===levels.length-1?T.levels:T.next} ↗</button><button data-action="replay">${T.replay}</button></div>`;
  overlay.className=html?`visible${menu==='hint'?' hint-overlay':''}`:'';overlay.innerHTML=html;
  overlay.dataset.side=menu==='hint'&&(guide.get(game,hintTier).marker?.x??0)>600?'left':'right';
  el('stage').setAttribute('aria-hidden',String(!!html&&menu!=='hint'));
  if(html){scene?.input.keyboard?.removeCapture([32,37,39]);overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',menu==='hint'?T.hintTitle:menu==='help'?T.help:menu==='start'?T.title:menu==='levels'?T.levels:T.paused);requestAnimationFrame(()=>overlay.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({preventScroll:true}));}
  else{overlay.removeAttribute('role');overlay.removeAttribute('aria-modal');scene?.input.keyboard?.addCapture([32,37,39]);}
  el('message').classList.toggle('behind-dialog',!!html);document.querySelector<HTMLElement>('.workspace')!.inert=!!html;
}
el('overlay').addEventListener('click',event=>{
  const target=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!target||target.disabled)return;
  if(target.dataset.level!==undefined){begin(Number(target.dataset.level));return;}
  switch(target.dataset.action){
    case 'start':begin(progress.unlocked-1);break;
    case 'levels':openMenu('levels');break;
    case 'help':openMenu('help');break;
    case 'hint':revealHint();break;
    case 'hint-more':revealHint();break;
    case 'resume':menu=null;game.resume();clearInput();renderOverlay();break;
    case 'back':closeMenu();break;
    case 'next':if(index<levels.length-1)begin(index+1);else openMenu('levels');break;
    case 'replay':begin(index);break;
    case 'sound':progress.muted=!progress.muted;scene?.sound.setMute(progress.muted);save();overlayKey='';renderOverlay();break;
    case 'fullscreen':{const op=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.();op?.catch(()=>toast(T.fullscreenError));break;}
  }
});
button('pause').onclick=pause;button('help').onclick=()=>openMenu('help');button('show-hint').onclick=revealHint;
button('restart').onclick=()=>{if(!menu)restart();};button('fold').onclick=()=>requestFold();
document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{e.preventDefault();if(!playable())return;drag=null;b.setPointerCapture(e.pointerId);touches.set(e.pointerId,b.dataset.control!);b.dataset.active='true';if(b.dataset.control==='jump')jumpQueued=true;});
  const release=(e:PointerEvent):void=>{touches.delete(e.pointerId);if(![...touches.values()].includes(b.dataset.control!))b.removeAttribute('data-active');};
  b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
});
function focusLost():void{if(drag){game.cancelPreview();drag=null;}game.pause();clearInput();renderOverlay();}
window.addEventListener('blur',focusLost);document.addEventListener('visibilitychange',()=>{if(document.hidden)focusLost();else clock.reset();});window.addEventListener('pagehide',focusLost);
document.addEventListener('keydown',e=>{
  // Synchronous Escape wins over a same-frame pointer release; Phaser queues keys.
  if(e.code==='Escape'&&!e.repeat){e.preventDefault();pause();return;}
  if(!el('overlay').classList.contains('visible')||e.key!=='Tab')return;
  const buttons=[...el('overlay').querySelectorAll<HTMLButtonElement>('button:not([disabled]):not([hidden])')],first=buttons[0],last=buttons.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
});
class FoldScene extends Phaser.Scene{
  private paper!:Paper;
  preload():void{for(const [name,freq,duration,end]of [['fold',260,.25,110],['jump',310,.1,460],['key',680,.18,1100],['win',520,.4,1040],['dead',180,.13,90]]as const)this.load.audio(name,tone(freq,duration,end));}
  create():void{
    scene=this;this.paper=new Paper(this);this.sound.setMute(progress.muted);this.cameras.main.setScroll(0,180);this.input.addPointer(3);
    this.input.keyboard?.on('keydown',(event:KeyboardEvent)=>{
      if(handledKeys.has(event))return;handledKeys.add(event);
      if(event.repeat)return;const code=event.code;
      if(code==='KeyH'&&(menu==='hint'||!menu)){revealHint();return;}
      if(menu)return;
      if(['Space','ArrowLeft','ArrowRight','Escape'].includes(code))event.preventDefault();if(code==='Escape')return;
      if(code==='KeyR'){restart();return;}if(code==='Slash'){openMenu('help');return;}if(!playable())return;
      if(code==='KeyF')requestFold();else if(code==='KeyU')requestFold(true);
      else if(/^Digit[1-3]$/.test(code)){const choice=options()[Number(code.slice(-1))-1];if(choice)choose(choice);}
      else if(code==='KeyC'){const opts=options();choose(opts[(opts.findIndex(o=>o.crease===selected.crease&&o.direction===selected.direction)+1)%opts.length]);}
      else if(code==='KeyQ'||code==='KeyE'){const wanted=options().find(o=>o.direction===(code==='KeyQ'?'right-to-left':'left-to-right'));if(wanted)choose(wanted);}
      else{keys.add(code);if(code==='Space')jumpQueued=true;}
    });
    this.input.keyboard?.on('keyup',(event:KeyboardEvent)=>{if(handledKeys.has(event))return;handledKeys.add(event);keys.delete(event.code);});
    this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{
      const y=p.y+this.cameras.main.scrollY;
      if(!playable()||drag||touches.size||keys.size||jumpQueued||p.x<0||p.x>WIDTH||p.y<0||p.y>380||!blankPaper(p.x,y,game.world,game.body))return;
      drag={id:p.id,x:p.x,y,scale:this.game.canvas.getBoundingClientRect().width/WIDTH,sign:0,active:false};
    });
    const movePaper=(p:Phaser.Input.Pointer):void=>{
      if(!drag||drag.id!==p.id)return;
      const dx=(p.x-drag.x)*drag.scale,dy=(p.y+this.cameras.main.scrollY-drag.y)*drag.scale;
      if(!drag.active){
        if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*1.5){drag=null;return;}
        const intent=gestureTarget(game.level,selected,game.fold,drag.x,dx,dy);if(!intent)return;
        if(!game.beginPreview(intent.target)){toast(game.message);drag=null;return;}
        if(intent.target){selected=intent.target;renderCreases();}
        clearInput();drag.sign=intent.sign;drag.active=true;
      }
      if(game.mode==='FOLD_PREVIEW')game.preview=swipeProgress(dx,drag.sign);
    };
    this.input.on('pointermove',movePaper);
    const release=(p:Phaser.Input.Pointer):void=>{if(drag?.id===p.id){movePaper(p);if(drag?.active&&game.mode==='FOLD_PREVIEW'){game.releasePreview();if(!game.returning)this.playTone('fold');clearInput();}drag=null;}};
    this.input.on('pointerup',release);this.input.on('pointerupoutside',release);
    this.game.canvas.addEventListener('pointercancel',()=>{if(drag){game.cancelPreview();drag=null;clearInput();}});
    this.scale.on('resize',()=>{if(drag){game.cancelPreview();drag=null;clearInput();}});
    this.game.canvas.setAttribute('aria-label',T.title);this.game.canvas.setAttribute('role','img');begin(0);menu='start';game.pause();renderOverlay();
  }
  playTone(name:string):void{if(!progress.muted&&this.cache.audio.exists(name))this.sound.play(name,{volume:.4});}
  update(time:number,delta:number):void{
    if(!this.paper)return;
    if(!document.hidden&&!menu)clock.advance(delta,()=>{
      const axis=Number(keys.has('KeyD')||keys.has('ArrowRight')||[...touches.values()].includes('right'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')||[...touches.values()].includes('left'));
      const jump=jumpQueued;jumpQueued=false;const beforeKeys=game.collected.size,beforeVy=game.body.vy,mode=game.mode;
      game.tick(STEP,{axis,jump});guide.update(game);
      if(game.collected.size>beforeKeys)this.playTone('key');if(beforeVy>=0&&game.body.vy<0)this.playTone('jump');
      if(game.mode!==mode){clearInput();if(game.mode==='COMPLETED'){recordWin(progress,index,game.folds);save();this.playTone('win');}if(game.mode==='DEAD')this.playTone('dead');}
    });
    // Input is cleared at each transition, not again on the next rendered frame.
    // Otherwise a fresh direction press immediately after closing a hint is lost.
    if(game.mode!==lastMode){lastMode=game.mode;renderOverlay();}
    if(game.message&&game.message!==lastMessage){toast(game.message);lastMessage=game.message;}if(performance.now()>messageUntil)el('message').textContent='';
    el('status').textContent=`${game.fold?`${creaseName(game.fold.crease)} ${game.fold.direction==='right-to-left'?'←':'→'}`:T.flat} · ${T.folds} ${game.folds} 次`;
    const count=game.level.entities.filter(e=>e.kind==='key').length;el('key').textContent=count?`⚿ ${game.collected.size} / ${count}`:'';
    el('key').setAttribute('aria-label',`${T.key}: ${game.collected.size} / ${count}`);
    el('hint').textContent=game.mode==='FOLD_PREVIEW'?(game.preview>=.5?T.preview:T.previewShort):game.fold?T.unfoldGesture:index===0?T.firstHint:'';
    const actionLabel=game.fold?T.unfold:T.fold;
    el('fold-label').textContent=actionLabel;button('fold').setAttribute('aria-label',actionLabel);button('fold').title=`${actionLabel} (F)`;
    button('fold').disabled=!playable();button('show-hint').disabled=game.mode==='FOLD_ANIMATING'||game.mode==='DEAD';
    el('creases').querySelectorAll('button').forEach(b=>b.disabled=!!game.fold||!playable());
    this.paper.draw(game,selected,time,menu==='hint'?guide.get(game,hintTier).marker:null);
  }
}
// CSS touch-action handles scrolling; Phaser 3.90 would preventDefault on non-cancelable touchcancel.
new Phaser.Game({type:Phaser.AUTO,parent:'stage',width:WIDTH,height:380,backgroundColor:'#f4eddc',antialias:true,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},scene:[FoldScene],input:{keyboard:true,touch:{capture:false},mouse:true},audio:{disableWebAudio:false},banner:false});
// Observations only; no teleport, unlock, or simulation-control hooks.
Object.defineProperty(window,'__foldSnapshot',{get:()=>JSON.parse(JSON.stringify({index,mode:game.mode,body:game.body,fold:game.fold,folds:game.folds,unfolds:game.unfolds,keys:[...game.collected],deaths:game.deaths,elapsed:game.elapsed,preview:game.preview,selected,world:game.world,objects:scene?.children.length,progress,hint:menu==='hint'?guide.get(game,hintTier):null,hintTier}))});
